import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { POINTS } from '../../shared/points.ts';
import { ouvrirBase, type Base } from './db.ts';
import {
  ErreurRequete,
  appliquerPatch,
  creer,
  ecrireReponse,
  lister,
  parId,
  parToken,
  session,
  validerDossier,
} from './repo.ts';

/** Le point qui porte l'arbitrage, et la réponse qui le déclenche. */
const POINT_TENSION = POINTS.findIndex((p) => p.tensionOn !== undefined);
const REPONSE_TENSION = POINTS[POINT_TENSION].props[POINTS[POINT_TENSION].tensionOn!];

let dossier: string;
let db: Base;

before(() => {
  dossier = mkdtempSync(join(tmpdir(), 'cadrage-test-'));
  db = ouvrirBase(join(dossier, 'test.db'));
});

after(() => {
  db.close();
  rmSync(dossier, { recursive: true, force: true });
});

const nouveau = (nom = 'Camille Dorval') => creer(db, { nom, metier: 'coach', demande: 'une appli' });

describe('point de départ', () => {
  it('s’enregistre par le patch, puisqu’il est demandé pendant l’entretien', () => {
    const ligne = nouveau('Départ');
    assert.equal(session(db, ligne).maturite, '');

    const apres = appliquerPatch(db, ligne, { maturite: 'forme' });
    assert.equal(session(db, apres).maturite, 'forme');
  });

  it('refuse un point de départ inventé', () => {
    const ligne = nouveau('Départ refusé');
    assert.throws(
      () => appliquerPatch(db, ligne, { maturite: 'expert' as 'idee' }),
      (erreur: unknown) => erreur instanceof ErreurRequete && erreur.code === 400,
    );
  });
});

describe('création', () => {
  it('rend un cadrage lisible par son jeton', () => {
    const ligne = nouveau();
    const relu = parToken(db, ligne.token);

    assert.equal(relu?.id, ligne.id);
    assert.equal(session(db, relu!).client.nom, 'Camille Dorval');
    assert.equal(session(db, relu!).statut, 'en_cours');
  });

  it('refuse un nom vide', () => {
    assert.throws(() => creer(db, { nom: '   ' }), ErreurRequete);
  });

  it('donne des jetons distincts', () => {
    assert.notEqual(nouveau().token, nouveau().token);
  });
});

describe('saisie en cours', () => {
  it('enregistre les champs et laisse les autres intacts', () => {
    const ligne = nouveau();
    appliquerPatch(db, ligne, { draft: 'mes mots', step: 3 });
    const apres = parId(db, ligne.id)!;

    assert.equal(apres.draft, 'mes mots');
    assert.equal(apres.step, 3);
    assert.equal(apres.mode, 'long', 'le mode ne devait pas bouger');
  });

  it('refuse un mode ou un point hors des valeurs prévues', () => {
    const ligne = nouveau();
    assert.throws(() => appliquerPatch(db, ligne, { mode: 'rapide' as 'long' }), ErreurRequete);
    assert.throws(() => appliquerPatch(db, ligne, { step: POINTS.length }), ErreurRequete);
    assert.throws(() => appliquerPatch(db, ligne, { step: -1 }), ErreurRequete);
  });

  it('cumule le temps passé, mais pas les longues absences', () => {
    const ligne = nouveau();
    appliquerPatch(db, parId(db, ligne.id)!, { draft: 'a' });
    const court = parId(db, ligne.id)!.duree_ms;

    // Dernier signe de vie il y a une heure : la reprise ne doit rien ajouter.
    const vieux = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(vieux, ligne.id);
    appliquerPatch(db, parId(db, ligne.id)!, { draft: 'b' });

    assert.equal(parId(db, ligne.id)!.duree_ms, court);
  });
});

describe('réponses', () => {
  it('écrit puis relit les mots du client', () => {
    const ligne = nouveau();
    ecrireReponse(db, ligne, 0, { texte: 'Je perds mes dimanches.' });

    assert.equal(session(db, parId(db, ligne.id)!).reponses['0'].texte, 'Je perds mes dimanches.');
  });

  it('garde la confirmation quand le texte ne change pas', () => {
    const ligne = nouveau();
    ecrireReponse(db, ligne, 0, { texte: 'inchangé', confirme: true });
    ecrireReponse(db, ligne, 0, { texte: 'inchangé' });

    assert.equal(session(db, parId(db, ligne.id)!).reponses['0'].confirme, true);
  });

  it('retire la confirmation dès que le client réécrit le point', () => {
    const ligne = nouveau();
    ecrireReponse(db, ligne, 0, { texte: 'première version', confirme: true });
    ecrireReponse(db, ligne, 0, { texte: 'seconde version' });

    assert.equal(session(db, parId(db, ligne.id)!).reponses['0'].confirme, false);
  });

  it("ne redemande pas un arbitrage déjà rendu", () => {
    const ligne = nouveau();
    ecrireReponse(db, ligne, POINT_TENSION, { texte: REPONSE_TENSION, arbitre: true });
    ecrireReponse(db, ligne, POINT_TENSION, { texte: REPONSE_TENSION });

    assert.equal(session(db, parId(db, ligne.id)!).reponses[String(POINT_TENSION)].arbitre, true);
  });

  it('refuse un point inconnu ou une réponse vide', () => {
    const ligne = nouveau();
    assert.throws(() => ecrireReponse(db, ligne, POINTS.length, { texte: 'x' }), ErreurRequete);
    assert.throws(() => ecrireReponse(db, ligne, 0, { texte: '  ' }), ErreurRequete);
  });
});

describe('validation', () => {
  it('garde la première date de validation', () => {
    const ligne = nouveau();
    const premiere = validerDossier(db, ligne).valide_le;
    const seconde = validerDossier(db, parId(db, ligne.id)!).valide_le;

    assert.equal(seconde, premiere);
    assert.equal(parId(db, ligne.id)!.statut, 'valide');
  });
});

describe('tableau du prestataire', () => {
  /** Une base neuve : les statistiques portent sur l'ensemble des cadrages. */
  function baseIsolee(): Base {
    return ouvrirBase(join(mkdtempSync(join(tmpdir(), 'cadrage-stats-')), 'test.db'));
  }

  it('signale une tension tant que le client n’a pas tranché', () => {
    const seule = baseIsolee();
    const ligne = creer(seule, { nom: 'Camille' });
    ecrireReponse(seule, ligne, POINT_TENSION, { texte: REPONSE_TENSION });

    assert.equal(lister(seule).cadrages[0].tensionOuverte, true);
    assert.equal(lister(seule).stats.tensionsOuvertes, 1);

    ecrireReponse(seule, parId(seule, ligne.id)!, POINT_TENSION, {
      texte: REPONSE_TENSION,
      arbitre: true,
    });
    assert.equal(lister(seule).cadrages[0].tensionOuverte, false);
    seule.close();
  });

  it('compte la couverture et désigne le premier point manquant', () => {
    const seule = baseIsolee();
    const ligne = creer(seule, { nom: 'Camille' });
    ecrireReponse(seule, ligne, 0, { texte: 'a' });
    ecrireReponse(seule, parId(seule, ligne.id)!, 2, { texte: 'c' });

    const [row] = lister(seule).cadrages;
    assert.equal(row.couverture, 2);
    assert.equal(row.enCours, 1, 'le point I et le III sont écrits, le II manque');
    seule.close();
  });

  it('ne montre pas de point en cours sur un dossier validé', () => {
    const seule = baseIsolee();
    const ligne = creer(seule, { nom: 'Camille' });
    validerDossier(seule, ligne);

    assert.equal(lister(seule).cadrages[0].enCours, null);
    assert.equal(lister(seule).stats.aChiffrer, 1);
    seule.close();
  });

  it('calcule le taux d’achèvement sur les huit points', () => {
    const seule = baseIsolee();
    const ligne = creer(seule, { nom: 'Camille' });
    for (let i = 0; i < 4; i++) {
      ecrireReponse(seule, parId(seule, ligne.id)!, i, { texte: `réponse ${i}` });
    }

    assert.equal(lister(seule).stats.tauxAchevement, Math.round((4 / POINTS.length) * 100));
    seule.close();
  });

  it('classe en dormant après une longue absence', () => {
    const seule = baseIsolee();
    const ligne = creer(seule, { nom: 'Camille' });
    const vieux = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    seule.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(vieux, ligne.id);

    const stats = lister(seule).stats;
    assert.equal(stats.dormants, 1);
    assert.equal(stats.enCours, 0);
    seule.close();
  });
});
