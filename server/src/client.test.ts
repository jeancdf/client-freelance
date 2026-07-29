import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import type { SuiteReponse } from '../../shared/api.ts';
import {
  INDEX_CONTRAINTES,
  INDEX_HORS_PERIMETRE,
  lireContraintes,
  POINTS,
  relanceDePrecision,
  serialiserContraintes,
} from '../../shared/points.ts';
import { ouvrirBase, type Base } from './db.ts';
import { brancherErreurs } from './erreurs.ts';
import { creer, session } from './repo.ts';
import { routesClient } from './routes/client.ts';

let app: FastifyInstance;
let db: Base;
let dossier: string;

const empreinte = (texte: string) =>
  createHash('sha256').update(texte).digest('hex').slice(0, 16);

before(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'cadrage-client-test-'));
  db = ouvrirBase(join(dossier, 'test.db'));
  app = Fastify({ logger: false });
  brancherErreurs(app);
  routesClient(app, db);
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  rmSync(dossier, { recursive: true, force: true });
});

describe('les questions successives d’un point', () => {
  it('clôt un point après une seule réponse précise quand aucun second tour n’est requis', async () => {
    const ligne = creer(db, {
      nom: 'Camille',
      metier: 'coach',
      demande: 'Mieux suivre les programmes de mes clients',
    });

    const premiere = await app.inject({
      method: 'PUT',
      url: `/api/cadrage/${ligne.token}/reponse/0`,
      payload: {
        rang: 0,
        texte: 'Je perds quatre heures chaque dimanche à refaire les programmes.',
      },
    });

    assert.equal(premiere.statusCode, 200);
    const apresPremiere = premiere.json<SuiteReponse>();
    assert.equal(apresPremiere.suite, null);
    assert.equal(apresPremiere.rang, -1);
    assert.equal(apresPremiere.reponse.clos, true);
    assert.equal(session(db, ligne).echanges['0'].length, 1);
  });

  it('régénère la suite après la correction d’une ancienne réponse', async () => {
    const ligne = creer(db, {
      nom: 'Camille correction',
      metier: 'coach',
      demande: 'Mieux suivre les programmes de mes clients',
    });
    const url = `/api/cadrage/${ligne.token}/reponse/${INDEX_CONTRAINTES}`;
    const configuration = {
      delai: 'Avant septembre',
      budget: 'Entre 8 000 et 12 000 €',
      technologies: 'Aucune technologie imposée',
    };

    const premiere = await app.inject({
      method: 'PUT',
      url,
      payload: { rang: 0, texte: serialiserContraintes(configuration) },
    });
    assert.equal(premiere.statusCode, 200);
    assert.ok(premiere.json<SuiteReponse>().suite);

    const deuxieme = await app.inject({
      method: 'PUT',
      url,
      payload: { rang: 1, texte: "Non, je ne vois pas d'autre contrainte." },
    });
    assert.equal(deuxieme.statusCode, 200);
    assert.equal(session(db, ligne).reponses[String(INDEX_CONTRAINTES)].clos, true);

    const correction = await app.inject({
      method: 'PUT',
      url,
      payload: {
        rang: 0,
        texte: serialiserContraintes({
          ...configuration,
          delai: 'Avant octobre',
        }),
      },
    });
    assert.equal(correction.statusCode, 200);
    const apresCorrection = correction.json<SuiteReponse>();
    assert.ok(apresCorrection.suite);
    assert.equal(apresCorrection.rang, 1);

    const relu = session(db, ligne);
    assert.equal(relu.reponses[String(INDEX_CONTRAINTES)].clos, false);
    assert.equal(relu.echanges[String(INDEX_CONTRAINTES)].length, 2);
    assert.match(
      relu.echanges[String(INDEX_CONTRAINTES)][0].reponse,
      /Avant octobre/,
    );
    assert.equal(relu.echanges[String(INDEX_CONTRAINTES)][1].reponse, '');
  });

  it('conserve la clôture quand seule la dernière réponse est corrigée', async () => {
    const ligne = creer(db, {
      nom: 'Camille dernière correction',
      metier: 'coach',
      demande: 'Mieux suivre les programmes de mes clients',
    });
    const url = `/api/cadrage/${ligne.token}/reponse/0`;

    const premiere = await app.inject({
      method: 'PUT',
      url,
      payload: { rang: 0, texte: 'Je prépare les programmes chaque dimanche.' },
    });
    assert.equal(premiere.json<SuiteReponse>().suite, null);

    const correction = await app.inject({
      method: 'PUT',
      url,
      payload: {
        rang: 0,
        texte: 'Cela me prend maintenant environ trois heures.',
        clore: true,
      },
    });
    assert.equal(correction.statusCode, 200);
    assert.equal(correction.json<SuiteReponse>().suite, null);
    assert.equal(session(db, ligne).reponses['0'].clos, true);
  });

  it('classe les trois éléments du périmètre sans rendre le troisième facultatif', () => {
    const point = POINTS[4];
    const elements = point.props.slice(0, 3);
    const relance = relanceDePrecision(point, [elements.join('\n')]);

    assert.match(relance.question, /label de priorité/i);
    for (const proposition of relance.propositions) {
      assert.match(proposition, /Priorité 1 — à traiter en premier/);
      assert.match(proposition, /Priorité 2 — à traiter ensuite/);
      assert.match(proposition, /Priorité 3 — cruciale pour le projet/);
      for (const element of elements) assert.ok(proposition.includes(element));
    }
  });

  it('configure les contraintes courantes avant de demander les contraintes atypiques', async () => {
    const ligne = creer(db, {
      nom: 'Camille contraintes',
      metier: 'coach',
      demande: 'Mieux suivre les programmes de mes clients',
    });
    const configuration = {
      delai: 'Avant septembre',
      budget: 'Entre 8 000 et 12 000 €',
      technologies: 'Compatible avec les téléphones anciens, sinon aucune',
    };
    const texte = serialiserContraintes(configuration);
    assert.deepEqual(lireContraintes(texte), configuration);

    const relance = relanceDePrecision(POINTS[INDEX_CONTRAINTES], [texte]);
    assert.match(relance.question, /autres contraintes non classiques/i);
    assert.doesNotMatch(relance.question, /budget|délai|technolog/i);

    const incomplete = await app.inject({
      method: 'PUT',
      url: `/api/cadrage/${ligne.token}/reponse/${INDEX_CONTRAINTES}`,
      payload: {
        rang: 0,
        texte: serialiserContraintes({ ...configuration, budget: '' }),
      },
    });
    assert.equal(incomplete.statusCode, 400);

    const premiere = await app.inject({
      method: 'PUT',
      url: `/api/cadrage/${ligne.token}/reponse/${INDEX_CONTRAINTES}`,
      payload: { rang: 0, texte },
    });

    assert.equal(premiere.statusCode, 200);
    const apresPremiere = premiere.json<SuiteReponse>();
    assert.ok(apresPremiere.suite);
    assert.equal(apresPremiere.rang, 1);
    assert.equal(
      session(db, ligne).echanges[String(INDEX_CONTRAINTES)][0].reponse,
      texte,
    );

    const deuxieme = await app.inject({
      method: 'PUT',
      url: `/api/cadrage/${ligne.token}/reponse/${INDEX_CONTRAINTES}`,
      payload: {
        rang: 1,
        texte: "Non, je ne vois pas d'autre contrainte à ajouter.",
      },
    });
    assert.equal(deuxieme.statusCode, 200);
    assert.equal(deuxieme.json<SuiteReponse>().suite, null);
  });

  it('masque le hors-périmètre quand aucun besoin supplémentaire n’a été exprimé', async () => {
    const ligne = creer(db, {
      nom: 'Camille sans extra',
      metier: 'coach',
      demande: 'Mieux suivre les programmes de mes clients',
    });
    const elements = POINTS[4].props.slice(0, 3);

    const premiere = await app.inject({
      method: 'PUT',
      url: `/api/cadrage/${ligne.token}/reponse/4`,
      payload: { rang: 0, texte: elements.join('\n') },
    });
    assert.equal(premiere.statusCode, 200);
    assert.ok(premiere.json<SuiteReponse>().suite);

    const classement = relanceDePrecision(POINTS[4], [elements.join('\n')])
      .propositions[0];
    const deuxieme = await app.inject({
      method: 'PUT',
      url: `/api/cadrage/${ligne.token}/reponse/4`,
      payload: { rang: 1, texte: classement },
    });

    assert.equal(deuxieme.statusCode, 200);
    assert.deepEqual(deuxieme.json<SuiteReponse>().horsPerimetre, {
      afficher: false,
      besoin: '',
    });
    assert.deepEqual(session(db, ligne).horsPerimetre, {
      afficher: false,
      besoin: '',
    });

    const ouvertureInutile = await app.inject({
      method: 'GET',
      url: `/api/cadrage/${ligne.token}/point/${INDEX_HORS_PERIMETRE}/ouverture`,
    });
    assert.equal(ouvertureInutile.statusCode, 204);
    const questionGeneree = db
      .prepare(
        'SELECT 1 FROM generation WHERE cadrage_id = ? AND point = ? AND genre = ?',
      )
      .get(ligne.id, INDEX_HORS_PERIMETRE, 'ouverture');
    assert.equal(questionGeneree, undefined);

    const contraintes = await app.inject({
      method: 'GET',
      url: `/api/cadrage/${ligne.token}/point/${INDEX_HORS_PERIMETRE + 1}/ouverture`,
    });
    assert.equal(contraintes.statusCode, 200);
  });

  it('ouvre une question ciblée quand un besoin hors périmètre a été relevé', async () => {
    const ligne = creer(db, {
      nom: 'Camille avec extra',
      metier: 'coach',
      demande: 'Mieux suivre les programmes de mes clients',
    });
    const besoin = 'un paiement en ligne';
    db.prepare(
      `INSERT INTO generation (cadrage_id, point, genre, cle, contenu, cree_le)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      ligne.id,
      INDEX_HORS_PERIMETRE,
      'hors-perimetre',
      'test',
      JSON.stringify({ afficher: true, besoin }),
      new Date().toISOString(),
    );

    const ouverture = await app.inject({
      method: 'GET',
      url: `/api/cadrage/${ligne.token}/point/${INDEX_HORS_PERIMETRE}/ouverture`,
    });

    assert.equal(ouverture.statusCode, 200);
    assert.match(ouverture.json<{ question: string }>().question, /paiement en ligne/i);
  });

  it('applique la même condition à un besoin exprimé dans un document', async () => {
    const demande = 'Mieux suivre les programmes de mes clients';
    const ligne = creer(db, {
      nom: 'Camille document',
      metier: 'coach',
      demande,
    });
    const brief =
      'Mes trois priorités sont les programmes, leur consultation et le suivi. Je pense aussi à un paiement en ligne, sans savoir s’il entre dans la première version.';
    const besoin = 'un paiement en ligne';
    await app.inject({
      method: 'PATCH',
      url: `/api/cadrage/${ligne.token}`,
      payload: { brief },
    });

    db.prepare(
      `INSERT INTO generation (cadrage_id, point, genre, cle, contenu, cree_le)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      ligne.id,
      INDEX_HORS_PERIMETRE,
      'hors-perimetre',
      empreinte(`${demande}||${brief}`),
      JSON.stringify({ afficher: true, besoin }),
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO generation (cadrage_id, point, genre, cle, contenu, cree_le)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      ligne.id,
      -1,
      'analyse',
      empreinte(brief),
      JSON.stringify({
        points: POINTS.map((_, index) => ({
          index,
          couvert: true,
          extrait: 'Extrait du document.',
          reponse: 'Réponse du document.',
          manque: '',
        })),
        couverts: POINTS.length,
      }),
      new Date().toISOString(),
    );

    const reponse = await app.inject({
      method: 'POST',
      url: `/api/cadrage/${ligne.token}/analyse`,
    });

    assert.equal(reponse.statusCode, 200);
    const analyse = reponse.json<{
      horsPerimetre: { afficher: boolean; besoin: string };
      points: Array<{ index: number; couvert: boolean; manque: string }>;
    }>();
    assert.deepEqual(analyse.horsPerimetre, { afficher: true, besoin });
    const point = analyse.points.find(
      (element) => element.index === INDEX_HORS_PERIMETRE,
    );
    assert.equal(point?.couvert, false);
    assert.match(point?.manque ?? '', /paiement en ligne/i);
  });
});
