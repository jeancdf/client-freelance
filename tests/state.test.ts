import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Session } from '../shared/api.ts';
import {
  initialState,
  questionPrecedente,
  questionSuivante,
  reducer,
  type State,
} from '../src/state.ts';

function questionnaire(): State {
  return {
    ...initialState,
    screen: 'entretien',
    step: 1,
    rang: 0,
    draft: 'Brouillon de la question en cours',
    drafts: {},
    answers: {
      0: 'Première réponse\nDeuxième réponse',
    },
    clos: { 0: true },
    echanges: {
      0: [
        { question: 'Première question ?', reponse: 'Première réponse' },
        { question: 'Deuxième question ?', reponse: 'Deuxième réponse' },
      ],
      1: [{ question: 'Question du point suivant ?', reponse: '' }],
    },
  };
}

describe('navigation entre les questions', () => {
  it('traverse la limite entre deux points et préremplit la réponse exacte', () => {
    const state = questionnaire();
    const precedente = questionPrecedente(state);
    assert.deepEqual(precedente, { point: 0, rang: 1 });

    const retour = reducer(state, { type: 'goQuestion', ...precedente! });
    assert.equal(retour.step, 0);
    assert.equal(retour.rang, 1);
    assert.equal(retour.draft, 'Deuxième réponse');
    assert.deepEqual(questionSuivante(retour), { point: 1, rang: 0 });
  });

  it('conserve le brouillon courant pendant un aller-retour sans modification', () => {
    const state = questionnaire();
    const retour = reducer(state, {
      type: 'goQuestion',
      point: 0,
      rang: 1,
    });
    const avant = reducer(retour, {
      type: 'goQuestion',
      point: 1,
      rang: 0,
    });

    assert.equal(avant.draft, 'Brouillon de la question en cours');
  });

  it('nettoie les états dérivés quand une ancienne réponse change', () => {
    const state: State = {
      ...questionnaire(),
      step: 0,
      rang: 0,
      draft: 'Réponse corrigée',
      confirmed: { 0: true },
      tensionResolved: { 0: true },
      arbitrages: {
        0: { choix: 'option_a', libelle: 'Ancien arbitrage' },
      },
      deductions: { 0: 'Ancienne déduction' },
      reformulations: { 0: 'Ancienne reformulation' },
    };

    const corrige = reducer(state, {
      type: 'suite',
      point: 0,
      texte: 'Réponse corrigée',
      source: 'client',
      question: {
        question: 'Nouvelle deuxième question ?',
        relance: 'Une précision adaptée.',
        propositions: ['Nouvelle piste'],
        choix: 'unique',
      },
      rang: 1,
      echanges: [
        { question: 'Première question ?', reponse: 'Réponse corrigée' },
      ],
      reformulation: null,
      tension: null,
      deduction: null,
      horsPerimetre: null,
    });

    assert.equal(corrige.rang, 1);
    assert.equal(corrige.clos[0], undefined);
    assert.equal(corrige.confirmed[0], undefined);
    assert.equal(corrige.tensionResolved[0], undefined);
    assert.equal(corrige.arbitrages[0], undefined);
    assert.equal(corrige.deductions[0], undefined);
    assert.equal(corrige.reformulations[0], undefined);
    assert.equal(corrige.echanges[0].length, 2);
    assert.equal(corrige.echanges[0][1].question, 'Nouvelle deuxième question ?');
  });
});

describe('reprise d’une correction', () => {
  it('restaure le rang explicite et son brouillon', () => {
    const session: Session = {
      client: { nom: 'Camille', metier: 'coach', demande: 'une application' },
      mode: 'long',
      voie: 'entretien',
      step: 0,
      rang: 1,
      draft: 'Deuxième réponse en cours de correction',
      brief: '',
      lien1: '',
      lien2: '',
      statut: 'en_cours',
      maturite: 'forme',
      reponses: {
        '0': {
          texte: 'Première réponse\nDeuxième réponse',
          source: 'client',
          confirme: true,
          arbitre: false,
          arbitrage: null,
          deductionConfirmee: false,
          clos: true,
          majLe: '2026-07-29T10:00:00.000Z',
        },
      },
      echanges: {
        '0': [
          { question: 'Première question ?', reponse: 'Première réponse' },
          { question: 'Deuxième question ?', reponse: 'Deuxième réponse' },
        ],
      },
      fichiers: [],
      creeLe: '2026-07-29T09:00:00.000Z',
      majLe: '2026-07-29T10:00:00.000Z',
      valideLe: null,
      commenceLe: '2026-07-29T09:05:00.000Z',
      dureeMs: 60_000,
      reformulations: {},
      deductions: {},
      tensions: {},
      compteRenduLu: false,
      horsPerimetre: null,
    };

    const state = reducer(initialState, {
      type: 'hydrate',
      token: 'token',
      session,
    });

    assert.equal(state.rang, 1);
    assert.equal(state.draft, 'Deuxième réponse en cours de correction');

    const repris = reducer(state, { type: 'resumeAt3' });
    assert.equal(repris.screen, 'entretien');
    assert.equal(repris.step, 0);
    assert.equal(repris.rang, 1);
    assert.equal(repris.draft, 'Deuxième réponse en cours de correction');
  });

  it('rouvre un arbitrage généré avant de poursuivre le questionnaire', () => {
    const tension = {
      explication: 'Le délai contredit le périmètre.',
      optionA: 'Réduire le périmètre.',
      optionB: 'Décaler la date.',
    };
    const state: State = {
      ...initialState,
      screen: 'reprise',
      step: 6,
      answers: { 6: 'Livraison immédiate.' },
      clos: { 6: true },
      tensions: { 6: tension },
      session: {
        token: 'token',
        client: { nom: 'Camille', metier: 'coach', demande: 'une application' },
        statut: 'en_cours',
        rang: null,
        maturite: 'forme',
        creeLe: '2026-07-29T09:00:00.000Z',
        majLe: '2026-07-29T10:00:00.000Z',
        valideLe: null,
        dureeMs: 60_000,
        fichiers: [],
        compteRenduLu: true,
      },
    };

    const repris = reducer(state, { type: 'resumeAt3' });
    assert.equal(repris.screen, 'entretien');
    assert.equal(repris.step, 6);
    assert.equal(repris.tension, true);
    assert.deepEqual(repris.tensionCourante, tension);

    const tranche = reducer(repris, {
      type: 'resolveTension',
      arbitrage: { choix: 'option_b', libelle: tension.optionB },
    });
    assert.equal(tranche.tension, false);
    assert.equal(tranche.tensionResolved[6], true);
    assert.deepEqual(tranche.arbitrages[6], {
      choix: 'option_b',
      libelle: tension.optionB,
    });
    assert.equal(tranche.session?.compteRenduLu, false);
  });
});
