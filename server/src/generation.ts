/**
 * Ce que le modèle produit pour un cadrage donné, et son repli.
 *
 * Toute fonction d'ici suit la même règle : si le modèle est absent, lent ou
 * incohérent, on rend le contenu écrit de la maquette. L'entretien continue,
 * moins bien ajusté, jamais interrompu.
 */

import { createHash } from 'node:crypto';
import { POINTS } from '../../shared/points.ts';
import type { Aide, Analyse, Ouverture, PointAnalyse, Tension } from '../../shared/api.ts';
import type { Base } from './db.ts';
import * as llm from './llm.ts';
import {
  promptAide,
  promptAnalyse,
  promptDeduction,
  promptOuverture,
  promptReformulation,
  promptTension,
  type Contexte,
} from './prompts.ts';

const maintenant = () => new Date().toISOString();

const empreinte = (entree: string) => createHash('sha256').update(entree).digest('hex').slice(0, 16);

interface LigneCadrage {
  id: string;
  client_nom: string;
  client_metier: string;
  demande: string;
  brief: string;
}

export function contexteDe(db: Base, ligne: LigneCadrage): Contexte {
  const lignes = db
    .prepare('SELECT point, texte FROM reponse WHERE cadrage_id = ? ORDER BY point')
    .all(ligne.id) as unknown as Array<{ point: number; texte: string }>;

  const reponses: Record<number, string> = {};
  for (const r of lignes) reponses[r.point] = r.texte;

  return {
    nom: ligne.client_nom,
    metier: ligne.client_metier,
    demande: ligne.demande,
    reponses,
    brief: ligne.brief,
  };
}

// ------------------------------------------------------------------- cache --

function lire<T>(db: Base, cadrageId: string, point: number, genre: string, cle: string): T | null {
  const row = db
    .prepare('SELECT cle, contenu FROM generation WHERE cadrage_id = ? AND point = ? AND genre = ?')
    .get(cadrageId, point, genre) as { cle: string; contenu: string } | undefined;

  if (!row || row.cle !== cle) return null;
  try {
    return JSON.parse(row.contenu) as T;
  } catch {
    return null;
  }
}

function ecrire(db: Base, cadrageId: string, point: number, genre: string, cle: string, valeur: unknown): void {
  db.prepare(
    `INSERT INTO generation (cadrage_id, point, genre, cle, contenu, cree_le)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (cadrage_id, point, genre) DO UPDATE SET
       cle = excluded.cle, contenu = excluded.contenu, cree_le = excluded.cree_le`,
  ).run(cadrageId, point, genre, cle, JSON.stringify(valeur), maintenant());
}

/**
 * Rend la valeur en cache, sinon la génère, sinon le repli. Une panne du modèle
 * n'est jamais une erreur rendue au client : c'est une version moins ajustée.
 */
async function obtenir<T>(
  db: Base,
  cadrageId: string,
  point: number,
  genre: string,
  cle: string,
  produire: () => Promise<T>,
  repli: () => T,
): Promise<{ valeur: T; origine: 'cache' | 'modele' | 'repli' }> {
  const enCache = lire<T>(db, cadrageId, point, genre, cle);
  if (enCache !== null) return { valeur: enCache, origine: 'cache' };

  if (!llm.estActif()) return { valeur: repli(), origine: 'repli' };

  try {
    const valeur = await produire();
    ecrire(db, cadrageId, point, genre, cle, valeur);
    return { valeur, origine: 'modele' };
  } catch (cause) {
    // Le repli est silencieux pour le client, jamais pour l'exploitant : une
    // dégradation qui ne laisse pas de trace est une panne qu'on ne voit pas.
    console.warn(
      `[generation] repli sur « ${genre} » (point ${point}) : ${(cause as Error).message}`,
    );
    return { valeur: repli(), origine: 'repli' };
  }
}

// --------------------------------------------------------------- ouverture --

const SCHEMA_OUVERTURE = llm.objet({
  question: llm.texte,
  relance: llm.texte,
  propositions: llm.liste(llm.texte, 3, 4),
});

/**
 * Ce qui s'affiche à l'ouverture d'un point. La question elle-même est écrite
 * pour ce client : les huit intentions sont la structure du dossier, leur
 * formulation ne l'est pas.
 */
export function ouverture(db: Base, ligne: LigneCadrage, index: number) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);

  return obtenir<Ouverture>(
    db,
    ligne.id,
    index,
    'ouverture',
    // Une fois écrite pour ce client, l'ouverture ne bouge plus : il doit
    // retrouver la même question en revenant sur le point.
    empreinte(`${ligne.client_metier}|${ligne.demande}`),
    async () => {
      const combien = point.props.length > 3 ? 4 : 3;
      const { valeur } = await llm.generer<Ouverture>(
        promptOuverture(contexte, point, combien),
        'ouverture',
        SCHEMA_OUVERTURE,
      );
      // Une question vide passerait le schéma : on préfère la référence.
      return {
        question: valeur.question.trim() || point.q,
        relance: valeur.relance.trim() || point.hint,
        propositions: valeur.propositions,
      };
    },
    () => ({ question: point.q, relance: point.hint, propositions: point.props }),
  );
}

// -------------------------------------------------------------------- aide --

const SCHEMA_AIDE = llm.objet({
  titre: llm.texte,
  pistes: llm.liste(llm.objet({ texte: llm.texte, effet: llm.texte }), 3, 3),
});

export function aide(db: Base, ligne: LigneCadrage, index: number) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);

  return obtenir<Aide>(
    db,
    ligne.id,
    index,
    'aide',
    empreinte(`${ligne.client_metier}|${ligne.demande}`),
    async () => {
      const { valeur } = await llm.generer<Aide>(
        promptAide(contexte, point),
        'aide',
        SCHEMA_AIDE,
      );
      return valeur;
    },
    () => ({
      titre: point.help.title,
      pistes: point.help.items.map((i) => ({ texte: i.text, effet: i.effect })),
    }),
  );
}

// ----------------------------------------------------------- reformulation --

const SCHEMA_REFORMULATION = llm.objet({ reformulation: llm.texte });

export function reformulation(db: Base, ligne: LigneCadrage, index: number, reponse: string) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);

  return obtenir<string | null>(
    db,
    ligne.id,
    index,
    'reformulation',
    empreinte(reponse),
    async () => {
      const { valeur } = await llm.generer<{ reformulation: string }>(
        promptReformulation(contexte, point, reponse),
        'reformulation',
        SCHEMA_REFORMULATION,
        { temperature: 0.4 },
      );
      return valeur.reformulation.trim() || null;
    },
    () => point.reform ?? null,
  );
}

// ----------------------------------------------------------------- tension --

const SCHEMA_TENSION = llm.objet({
  tension: { type: 'boolean' },
  explication: llm.texte,
  optionA: llm.texte,
  optionB: llm.texte,
});

export function tension(db: Base, ligne: LigneCadrage, index: number, reponse: string) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);

  return obtenir<Tension | null>(
    db,
    ligne.id,
    index,
    'tension',
    empreinte(reponse),
    async () => {
      const { valeur } = await llm.generer<{
        tension: boolean;
        explication: string;
        optionA: string;
        optionB: string;
      }>(promptTension(contexte, point, reponse), 'tension', SCHEMA_TENSION, { temperature: 0.2 });

      if (!valeur.tension || !valeur.explication.trim()) return null;
      return {
        explication: valeur.explication,
        optionA: valeur.optionA,
        optionB: valeur.optionB,
      };
    },
    // Repli : la règle en dur de la maquette, une égalité de chaîne.
    () =>
      point.tensionOn !== undefined && reponse === point.props[point.tensionOn]
        ? {
            explication:
              "Vous m'avez dit que vos clients ne sont pas à l'aise avec les applications. Là, vous mettez au cœur du projet la saisie des charges à chaque série, par eux. Les deux peuvent tenir, mais il faut savoir ce qui compte le plus — ça change ce qu'on construit.",
            optionA: "La simplicité passe d'abord",
            optionB: "Le suivi des charges passe d'abord",
          }
        : null,
  );
}

// --------------------------------------------------------------- déduction --

const SCHEMA_DEDUCTION = llm.objet({ deduction: { type: 'boolean' }, texte: llm.texte });

export function deduction(db: Base, ligne: LigneCadrage, index: number, reponse: string) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);

  return obtenir<string | null>(
    db,
    ligne.id,
    index,
    'deduction',
    empreinte(reponse),
    async () => {
      const { valeur } = await llm.generer<{ deduction: boolean; texte: string }>(
        promptDeduction(contexte, point, reponse),
        'deduction',
        SCHEMA_DEDUCTION,
        { temperature: 0.3 },
      );
      return valeur.deduction && valeur.texte.trim() ? valeur.texte : null;
    },
    () => point.deduit ?? null,
  );
}

// ----------------------------------------------------------------- analyse --

const SCHEMA_ANALYSE = llm.objet({
  points: llm.liste(
    llm.objet({
      index: { type: 'integer', minimum: 0, maximum: POINTS.length - 1 },
      couvert: { type: 'boolean' },
      extrait: llm.texte,
      reponse: llm.texte,
      manque: llm.texte,
    }),
    POINTS.length,
    POINTS.length,
  ),
});

export function analyse(db: Base, ligne: LigneCadrage, texteDocuments: string) {
  const contexte = { ...contexteDe(db, ligne), brief: texteDocuments };

  return obtenir<Analyse>(
    db,
    ligne.id,
    -1,
    'analyse',
    empreinte(texteDocuments),
    async () => {
      const { valeur } = await llm.generer<{ points: PointAnalyse[] }>(
        promptAnalyse(contexte),
        'analyse',
        SCHEMA_ANALYSE,
        { temperature: 0.2, maxTokens: 4000 },
      );
      const points = valeur.points.filter((p) => POINTS[p.index] !== undefined);
      return { points, couverts: points.filter((p) => p.couvert).length };
    },
    () => ({ points: [], couverts: 0 }),
  );
}
