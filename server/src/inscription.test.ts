import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Fastify, { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { ouvrirBase, type Base } from './db.ts';
import { brancherErreurs } from './erreurs.ts';
import { routesInscription } from './routes/inscription.ts';
import { creationsDepuis, creer, parToken } from './repo.ts';

let dossier: string;
let db: Base;
let app: FastifyInstance;

const VALIDE = {
  nom: 'Camille Dorval',
  courriel: 'camille@atelier-dorval.fr',
  metier: 'Menuisier agenceur, six salariés',
  demande: "Je perds des chantiers parce que les clients ne voient jamais mon travail.",
  maturite: 'idee',
};

/** Une adresse par test : la limite se compte par empreinte d'adresse. */
const depuis = (ip: string, corps: object = VALIDE): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'POST', url: '/api/cadrage', payload: corps, remoteAddress: ip });

before(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'cadrage-inscription-'));
  db = ouvrirBase(join(dossier, 'test.db'));
  app = Fastify({ logger: false });
  brancherErreurs(app);
  routesInscription(app, db, 'sel-de-test');
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  rmSync(dossier, { recursive: true, force: true });
});

describe('ouverture en libre-service', () => {
  it('ouvre un cadrage lisible par le jeton rendu', async () => {
    const reponse = await depuis('203.0.113.10');
    assert.equal(reponse.statusCode, 201);

    const corps = reponse.json() as { token: string; lien: string };
    assert.match(corps.lien, new RegExp(`\\?c=${corps.token}$`));

    const ligne = parToken(db, corps.token);
    assert.ok(ligne);
    assert.equal(ligne.client_nom, VALIDE.nom);
    assert.equal(ligne.client_metier, VALIDE.metier);
    // Le formulaire entre directement dans la première question : le cadrage
    // est commencé, il ne repassera pas par la page d'accueil.
    assert.ok(ligne.commence_le);
  });

  it('laisse un cadrage ouvert par le prestataire non commencé', () => {
    const ligne = creer(db, { nom: 'Invité par Nicolas' });
    assert.equal(ligne.commence_le, null);
  });

  it('garde le courriel mais jamais l’adresse IP en clair', async () => {
    const corps = (await depuis('203.0.113.11')).json() as { id: string };
    const ligne = db
      .prepare('SELECT courriel, ip_empreinte FROM cadrage WHERE id = ?')
      .get(corps.id) as { courriel: string; ip_empreinte: string };

    assert.equal(ligne.courriel, VALIDE.courriel);
    assert.ok(ligne.ip_empreinte.length > 0);
    assert.doesNotMatch(ligne.ip_empreinte, /203\.0\.113/);
  });

  it('refuse une demande trop courte pour écrire quoi que ce soit', async () => {
    const reponse = await depuis('203.0.113.12', { ...VALIDE, demande: 'un site' });
    assert.equal(reponse.statusCode, 400);
    assert.match((reponse.json() as { erreur: string }).erreur, /un peu plus/);
  });

  it('refuse un point de départ absent ou inventé', async () => {
    const sans = await depuis('203.0.113.14', { ...VALIDE, maturite: undefined });
    assert.equal(sans.statusCode, 400);
    assert.match((sans.json() as { erreur: string }).erreur, /où vous en êtes/);

    const faux = await depuis('203.0.113.15', { ...VALIDE, maturite: 'expert' });
    assert.equal(faux.statusCode, 400);
  });

  it('garde le point de départ, qui décide du ton des questions', async () => {
    const corps = (await depuis('203.0.113.16', { ...VALIDE, maturite: 'specs' })).json() as {
      id: string;
    };
    const ligne = db.prepare('SELECT maturite FROM cadrage WHERE id = ?').get(corps.id) as {
      maturite: string;
    };
    assert.equal(ligne.maturite, 'specs');
  });

  it('refuse une adresse qui n’en est pas une', async () => {
    const reponse = await depuis('203.0.113.13', { ...VALIDE, courriel: 'camille chez moi' });
    assert.equal(reponse.statusCode, 400);
  });

  it('borne les ouvertures en rafale depuis la même connexion', async () => {
    for (let essai = 0; essai < 3; essai++) {
      assert.equal((await depuis('203.0.113.20')).statusCode, 201);
    }
    const quatrieme = await depuis('203.0.113.20');
    assert.equal(quatrieme.statusCode, 429);

    // Une autre connexion n'est pas pénalisée par la première.
    assert.equal((await depuis('203.0.113.21')).statusCode, 201);
  });

  it('ne compte que les ouvertures de la fenêtre demandée', () => {
    const ligne = creer(db, { nom: 'Ancien' }, { courriel: '', ipEmpreinte: 'empreinte-test' });
    assert.ok(ligne);

    const futur = new Date(Date.now() + 60_000).toISOString();
    assert.equal(creationsDepuis(db, 'empreinte-test', futur), 0);
    assert.equal(creationsDepuis(db, 'empreinte-test', '1970-01-01T00:00:00.000Z'), 1);
  });
});

describe('migration du schéma', () => {
  it('ajoute les colonnes manquantes à une base déjà en service', () => {
    const chemin = join(dossier, 'ancienne.db');

    // Le schéma du premier jour, tel qu'il tourne en production.
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec(`CREATE TABLE cadrage (
      id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, client_nom TEXT NOT NULL,
      client_metier TEXT NOT NULL DEFAULT '', demande TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'long', voie TEXT NOT NULL DEFAULT 'entretien',
      step INTEGER NOT NULL DEFAULT 0, draft TEXT NOT NULL DEFAULT '',
      brief TEXT NOT NULL DEFAULT '', lien1 TEXT NOT NULL DEFAULT '',
      lien2 TEXT NOT NULL DEFAULT '', statut TEXT NOT NULL DEFAULT 'en_cours',
      duree_ms INTEGER NOT NULL DEFAULT 0, cree_le TEXT NOT NULL,
      maj_le TEXT NOT NULL, valide_le TEXT
    )`);
    ancienne.prepare(
      `INSERT INTO cadrage (id, token, client_nom, cree_le, maj_le) VALUES (?, ?, ?, ?, ?)`,
    ).run('ancien', 'jeton-ancien', 'Client d’avant', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    ancienne.close();

    const migree = ouvrirBase(chemin);
    try {
      // Le cadrage d'avant survit, et la nouvelle écriture passe.
      assert.equal(parToken(migree, 'jeton-ancien')?.client_nom, 'Client d’avant');
      const neuf = creer(migree, { nom: 'Après' }, { courriel: 'a@b.fr', ipEmpreinte: 'x' });
      assert.equal(
        (
          migree.prepare('SELECT courriel FROM cadrage WHERE id = ?').get(neuf.id) as {
            courriel: string;
          }
        ).courriel,
        'a@b.fr',
      );
    } finally {
      migree.close();
    }
  });
});
