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
  ecrireEchange,
  ecrireReponse,
  marquerReponse,
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

describe('le fil d’un point', () => {
  it('rassemble les réponses du fil dans l’ordre, une par ligne', () => {
    const ligne = nouveau('Fil');
    ecrireEchange(db, ligne, 0, 0, 'Ce qui vous a décidé ?', { texte: 'Je perds des chantiers.' });
    ecrireEchange(db, ligne, 0, 1, 'Combien par mois ?', { texte: 'Deux ou trois.' });
    const r = ecrireEchange(db, ligne, 0, 2, 'Depuis quand ?', { texte: 'Depuis un an.' });

    assert.equal(r.texte, 'Je perds des chantiers.\nDeux ou trois.\nDepuis un an.');
    assert.deepEqual(
      session(db, ligne).echanges['0'].map((e) => e.question),
      ['Ce qui vous a décidé ?', 'Combien par mois ?', 'Depuis quand ?'],
    );
  });

  it('rend caduque la suite du fil quand une réponse est réécrite', () => {
    const ligne = nouveau('Fil réécrit');
    ecrireEchange(db, ligne, 1, 0, 'Qui va s’en servir ?', { texte: 'Mes clients.' });
    ecrireEchange(db, ligne, 1, 1, 'Combien sont-ils ?', { texte: 'Une quarantaine.' });
    ecrireReponse(db, ligne, 1, {
      texte: 'Mes clients.\nUne quarantaine.',
      confirme: true,
      arbitre: true,
      clore: true,
    });
    db.prepare(
      `INSERT INTO generation (cadrage_id, point, genre, cle, contenu, cree_le)
       VALUES (?, ?, 'reformulation', 'ancienne', ?, ?)`,
    ).run(ligne.id, 1, JSON.stringify('Ancienne reformulation'), new Date().toISOString());

    // La première réponse change : la question suivante avait été écrite à
    // partir d'un texte qui n'existe plus.
    const r = ecrireEchange(db, ligne, 1, 0, 'Qui va s’en servir ?', { texte: 'Moi seul.' });
    assert.equal(r.texte, 'Moi seul.');
    const apres = session(db, ligne);
    assert.equal(apres.echanges['1'].length, 1);
    assert.equal(apres.reponses['1'].confirme, false);
    assert.equal(apres.reponses['1'].arbitre, false);
    assert.equal(apres.reponses['1'].clos, false);
    assert.equal(apres.reformulations['1'], undefined);
  });

  it('redemande la validation quand le fil s’enrichit', () => {
    const ligne = nouveau('Fil confirmé');
    ecrireEchange(db, ligne, 2, 0, 'Comment ça se passe ?', { texte: 'À la main.' });
    ecrireReponse(db, ligne, 2, { texte: 'À la main.', confirme: true });
    assert.equal(session(db, ligne).reponses['2'].confirme, true);

    ecrireEchange(db, ligne, 2, 1, 'Avec quel outil ?', { texte: 'Word, puis WhatsApp.' });
    assert.equal(session(db, ligne).reponses['2'].confirme, false);
  });

  it('marque un point relu sans toucher au fil', () => {
    const ligne = nouveau('Drapeaux');
    ecrireEchange(db, ligne, 5, 0, 'Le hors-périmètre ?', { texte: 'Pas de paiement en ligne.' });
    ecrireEchange(db, ligne, 5, 1, 'Et la messagerie ?', { texte: 'Je garde WhatsApp.' });

    // C'est le geste que fait l'enregistrement de fond à chaque changement
    // d'état : il ne doit jamais réécrire un échange au passage.
    marquerReponse(db, ligne, 5, { confirme: true, arbitre: false });

    const s = session(db, ligne);
    assert.equal(s.reponses['5'].confirme, true);
    assert.equal(s.reponses['5'].texte, 'Pas de paiement en ligne.\nJe garde WhatsApp.');
    assert.equal(s.echanges['5'].length, 2);
  });

  it('refuse de marquer un point sans réponse', () => {
    const ligne = nouveau('Drapeaux sans réponse');
    assert.throws(
      () => marquerReponse(db, ligne, 6, { confirme: true }),
      (erreur: unknown) => erreur instanceof ErreurRequete && erreur.code === 404,
    );
  });

  it('accepte autant de questions que le point en demande', () => {
    const ligne = nouveau('Fil long');
    for (let rang = 0; rang < 7; rang++) {
      ecrireEchange(db, ligne, 3, rang, `Question ${rang + 1} ?`, {
        texte: `Réponse ${rang + 1}.`,
      });
    }

    assert.equal(session(db, ligne).echanges['3'].length, 7);
  });

  it('refuse seulement un rang invalide', () => {
    const ligne = nouveau('Rang invalide');
    assert.throws(
      () => ecrireEchange(db, ligne, 3, -1, 'Une question invalide ?', { texte: 'Non.' }),
      (erreur: unknown) => erreur instanceof ErreurRequete && erreur.code === 400,
    );
    assert.throws(
      () => ecrireEchange(db, ligne, 3, 1.5, 'Une question invalide ?', { texte: 'Non.' }),
      (erreur: unknown) => erreur instanceof ErreurRequete && erreur.code === 400,
    );
  });

  it('garde un point clos fermé', () => {
    const ligne = nouveau('Clos');
    ecrireEchange(db, ligne, 4, 0, 'Le cœur du projet ?', { texte: 'La prise de commande.' });
    assert.equal(session(db, ligne).reponses['4'].clos, false);

    ecrireEchange(db, ligne, 4, 0, 'Le cœur du projet ?', {
      texte: 'La prise de commande.',
      clore: true,
    });
    assert.equal(session(db, ligne).reponses['4'].clos, true);
  });
});

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
    appliquerPatch(db, ligne, { draft: 'mes mots', step: 3, rang: 2 });
    const apres = parId(db, ligne.id)!;

    assert.equal(apres.draft, 'mes mots');
    assert.equal(apres.step, 3);
    assert.equal(apres.rang, 2);
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

  it('considère le dossier complet sans réponse hors périmètre quand ce point est inutile', () => {
    const seule = baseIsolee();
    const ligne = creer(seule, { nom: 'Camille sans hors-périmètre' });
    for (const point of [0, 1, 2, 3, 4, 6, 7]) {
      ecrireReponse(seule, parId(seule, ligne.id)!, point, {
        texte: `réponse ${point}`,
      });
    }

    const [row] = lister(seule).cadrages;
    assert.equal(row.couverture, POINTS.length);
    assert.equal(row.enCours, null);
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
