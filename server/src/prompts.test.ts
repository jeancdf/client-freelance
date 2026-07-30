import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  POINTS,
  questionsMinimales,
  type Point,
} from '../../shared/points.ts';
import {
  erreursOuverture,
  type OuvertureBrute,
} from './generation.ts';
import {
  promptOuverture,
  promptSuite,
  type Contexte,
} from './prompts.ts';

const contexte: Contexte = {
  nom: 'Camille',
  metier: 'plombier',
  demande: 'Ne plus perdre les demandes reçues pendant les chantiers',
  reponses: {},
  maturite: 'idee',
};

const contenu = (messages: ReturnType<typeof promptOuverture>) =>
  messages.map((message) => String(message.content)).join('\n');

describe('les contrats de génération par section', () => {
  it('réserve le classement du périmètre au second tour', () => {
    const point = POINTS[4];
    const prompt = contenu(promptOuverture(contexte, point));

    assert.equal(point.entretien.propositions.min, 6);
    assert.equal(point.entretien.propositions.max, 6);
    assert.equal(point.entretien.propositions.choix, 'multiple');
    assert.equal(questionsMinimales(point), 2);
    assert.match(prompt, /sans les classer à ce tour/i);
    assert.match(prompt, /une seule action observable/i);
    assert.match(prompt, /Axes réservés à une éventuelle question suivante/i);
    assert.match(prompt, /votre conjoint\(e\)/i);
    assert.match(prompt, /N'écris jamais « votre femme »/i);
  });

  it('autorise les autres sections à se terminer après une réponse suffisante', () => {
    const point = POINTS[0];
    const messages = promptSuite(
      contexte,
      point,
      [
        {
          question: point.q,
          reponse:
            'Vendredi, un appel urgent est resté sans réponse pendant mon chantier.',
        },
      ],
      1,
      false,
    );
    const prompt = messages.map((message) => String(message.content)).join('\n');

    assert.equal(questionsMinimales(point), 1);
    assert.match(prompt, /Une réponse courte peut suffire/i);
    assert.doesNotMatch(prompt, /au moins deux réponses/i);
  });
});

describe('la validation éditoriale des réponses probables', () => {
  it('refuse les propositions vides ou composées uniquement de ponctuation', () => {
    const point = POINTS[0] as Point;
    const valeur: OuvertureBrute = {
      termine: false,
      question: 'Quel incident a déclenché votre démarche ?',
      relance:
        'Décrivez un cas concret vécu récemment dans votre activité. Cette réponse permettra de distinguer le problème principal des conséquences secondaires avant de définir précisément le travail.',
      choix: 'unique',
      propositions: [':', '…', '---'],
    };

    const erreurs = erreursOuverture(
      point,
      valeur,
      contexte,
      'ouverture',
    );

    assert.ok(erreurs.some((erreur) => /texte exploitable/i.test(erreur)));
  });

  it('refuse une carte fourre-tout et une personne inventée', () => {
    const point = POINTS[4] as Point;
    const valeur: OuvertureBrute = {
      termine: false,
      question: 'Quelles actions doivent être assurées en priorité ?',
      relance:
        'Choisissez uniquement les actions indispensables dans votre quotidien. Elles fixeront le cœur du premier devis, sans présumer des personnes qui travaillent avec vous.',
      choix: 'multiple',
      propositions: [
        'Rappeler les appels ; gérer les urgences et trier les messages.',
        'Prévenir ma femme quand une demande arrive.',
        'Consulter une demande reçue.',
        'Identifier un appel manqué.',
        'Marquer une demande comme traitée.',
        'Exporter les demandes dans Excel.',
      ],
    };

    const erreurs = erreursOuverture(
      point,
      valeur,
      contexte,
      'ouverture',
    );

    assert.ok(erreurs.some((erreur) => /plusieurs idées/i.test(erreur)));
    assert.ok(erreurs.some((erreur) => /invente un proche/i.test(erreur)));
    assert.ok(erreurs.some((erreur) => /désignation familiale genrée/i.test(erreur)));
    assert.ok(erreurs.some((erreur) => /invente un chiffre ou un logiciel/i.test(erreur)));
  });
});
