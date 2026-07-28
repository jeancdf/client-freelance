/**
 * Ce que le modèle produit pour un cadrage donné, et son repli.
 *
 * Toute fonction d'ici suit la même règle : si le modèle est absent, lent ou
 * incohérent, on rend le contenu écrit de la maquette. L'entretien continue,
 * moins bien ajusté, jamais interrompu.
 */

import { createHash } from 'node:crypto';
import {
  INDEX_HORS_PERIMETRE,
  POINTS,
  relanceDePrecision,
} from '../../shared/points.ts';
import { QUESTIONS_MIN_PAR_POINT } from '../../shared/api.ts';
import type {
  Aide,
  Analyse,
  Choix,
  DecisionHorsPerimetre,
  Echange,
  Ouverture,
  PointAnalyse,
  Tension,
} from '../../shared/api.ts';
import type { Base } from './db.ts';
import * as llm from './llm.ts';
import {
  promptAide,
  promptAnalyse,
  promptDeduction,
  promptDecisionHorsPerimetre,
  promptOuverture,
  promptReformulation,
  promptSuite,
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
  maturite: string;
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
    maturite: ligne.maturite as Contexte['maturite'],
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

function decisionHorsPerimetreStockee(
  db: Base,
  cadrageId: string,
): DecisionHorsPerimetre | null {
  const ligne = db
    .prepare(
      'SELECT contenu FROM generation WHERE cadrage_id = ? AND point = ? AND genre = ?',
    )
    .get(cadrageId, INDEX_HORS_PERIMETRE, 'hors-perimetre') as
    | { contenu: string }
    | undefined;
  if (!ligne) return null;

  try {
    const valeur = JSON.parse(ligne.contenu) as Partial<DecisionHorsPerimetre>;
    const besoin = typeof valeur.besoin === 'string' ? valeur.besoin.trim() : '';
    return valeur.afficher === true && besoin
      ? { afficher: true, besoin }
      : { afficher: false, besoin: '' };
  } catch {
    return null;
  }
}

/**
 * Les générations en cours, par signature. Deux requêtes pour la même chose se
 * croisent facilement — le préchargement du point suivant et son ouverture
 * réelle, ou un simple double-clic — et chacune serait facturée. La seconde
 * attend la première au lieu de rappeler le modèle.
 */
const enVol = new Map<string, Promise<unknown>>();

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

  const signature = `${cadrageId}|${point}|${genre}|${cle}`;
  let course = enVol.get(signature) as Promise<T> | undefined;

  if (!course) {
    course = produire().then((valeur) => {
      ecrire(db, cadrageId, point, genre, cle, valeur);
      return valeur;
    });
    enVol.set(signature, course);
    void course.catch(() => undefined).then(() => enVol.delete(signature));
  }

  try {
    return { valeur: await course, origine: 'modele' };
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
  // Au premier tour il vaut toujours false ; il porte la décision de fermer le
  // fil sur les tours suivants.
  termine: { type: 'boolean' },
  question: llm.texte,
  relance: llm.texte,
  choix: { type: 'string', enum: ['unique', 'multiple'] },
  propositions: llm.liste(llm.texte, 2, 4),
});

interface OuvertureBrute extends Ouverture {
  termine: boolean;
}

/**
 * Ce qui s'affiche à l'ouverture d'un point. La question elle-même est écrite
 * pour ce client : les huit intentions possibles structurent le dossier, leur
 * formulation ne l'est pas.
 */
export function ouverture(db: Base, ligne: LigneCadrage, index: number) {
  const pointReference = POINTS[index];
  const contexte = contexteDe(db, ligne);
  if (pointReference.configurateur) {
    return Promise.resolve({
      valeur: {
        question: pointReference.q,
        relance: pointReference.hint,
        propositions: pointReference.props,
        choix: 'unique' as Choix,
      },
      // Il s'agit d'un écran de produit déterministe, pas d'un texte inventé
      // pour le client. `repli` indique simplement qu'aucun modèle n'a tourné.
      origine: 'repli' as const,
    });
  }
  const decision =
    index === INDEX_HORS_PERIMETRE
      ? decisionHorsPerimetreStockee(db, ligne.id)
      : null;
  const point =
    decision?.afficher && decision.besoin
      ? {
          ...pointReference,
          intention: `${pointReference.intention} Le besoin relevé est : « ${decision.besoin} ».`,
          q: `Vous avez évoqué « ${decision.besoin} » en plus de vos trois priorités. Pour la première version, faut-il l'intégrer, le reporter ou l'écarter ?`,
        }
      : pointReference;

  return obtenir<Ouverture>(
    db,
    ligne.id,
    index,
    'ouverture',
    // Une fois écrite pour ce client, l'ouverture ne bouge plus : il doit
    // retrouver la même question en revenant sur le point. Le point de départ
    // entre dans la clé : il change la question, il doit la faire regénérer.
    empreinte(
      `${ligne.client_metier}|${ligne.demande}|${ligne.maturite}|${decision?.besoin ?? ''}`,
    ),
    async () => {
      const combien = point.props.length > 3 ? 4 : 3;
      const { valeur } = await llm.generer<OuvertureBrute>(
        promptOuverture(contexte, point, combien),
        'ouverture',
        SCHEMA_OUVERTURE,
      );
      // Une question vide passerait le schéma : on préfère la référence.
      return {
        question: valeur.question.trim() || point.q,
        relance: valeur.relance.trim() || point.hint,
        propositions: valeur.propositions,
        choix: point.selection
          ? ('multiple' as Choix)
          : point.conditionnel
            ? ('unique' as Choix)
            : valeur.choix === 'multiple'
              ? ('multiple' as Choix)
              : ('unique' as Choix),
      };
    },
    () => ({
      question: point.q,
      relance: point.hint,
      propositions: point.props,
      choix: point.selection ? ('multiple' as Choix) : ('unique' as Choix),
    }),
  );
}

/**
 * La question suivante sur un point, ou `null` quand il est établi.
 *
 * Même sans modèle, une relance de précision garantit les deux questions
 * minimales. Au-delà, le repli ferme le point plutôt que d'inventer.
 */
export function suite(db: Base, ligne: LigneCadrage, index: number, fil: Echange[], rang: number) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);
  const doitContinuer =
    fil.filter((echange) => echange.reponse.trim()).length < QUESTIONS_MIN_PAR_POINT;

  return obtenir<Ouverture | null>(
    db,
    ligne.id,
    index,
    `ouverture:${rang}`,
    // Sur l'empreinte du fil : réécrire une réponse regénère la suite.
    empreinte(fil.map((e) => `${e.question}|${e.reponse}`).join('||')),
    async () => {
      const { valeur } = await llm.generer<OuvertureBrute>(
        promptSuite(contexte, point, fil, rang, doitContinuer),
        'suite',
        SCHEMA_OUVERTURE,
        { temperature: 0.3 },
      );

      if (!valeur.question.trim()) {
        return doitContinuer
          ? relanceDePrecision(point, fil.map((echange) => echange.reponse))
          : null;
      }
      if (valeur.termine && !doitContinuer) return null;
      return {
        question: valeur.question,
        relance: valeur.relance,
        propositions: valeur.propositions,
        choix: valeur.choix === 'multiple' ? ('multiple' as Choix) : ('unique' as Choix),
      };
    },
    () =>
      doitContinuer
        ? relanceDePrecision(point, fil.map((echange) => echange.reponse))
        : null,
  );
}

// ---------------------------------------------------- hors périmètre ---- //

const SCHEMA_HORS_PERIMETRE = llm.objet({
  afficher: { type: 'boolean' },
  besoin: llm.texte,
});

/**
 * Le point VI n'existe que si un besoin supplémentaire a réellement été
 * écrit. La décision est mise en cache, y compris sans modèle, car elle change
 * la navigation et doit rester identique après un rechargement.
 */
export async function horsPerimetre(
  db: Base,
  ligne: LigneCadrage,
  texteSupplementaire = '',
) {
  const base = contexteDe(db, ligne);
  const ajout = texteSupplementaire.trim();
  const briefDeBase = base.brief?.trim() ?? '';
  const contexte: Contexte = ajout
    ? {
        ...base,
        brief:
          briefDeBase && ajout.includes(briefDeBase)
            ? ajout
            : [briefDeBase, ajout].filter(Boolean).join('\n\n'),
      }
    : base;
  const cle = empreinte(
    [
      contexte.demande,
      contexte.brief ?? '',
      ...Object.entries(contexte.reponses)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([point, texte]) => `${point}:${texte}`),
    ].join('||'),
  );

  const resultat = await obtenir<DecisionHorsPerimetre>(
    db,
    ligne.id,
    INDEX_HORS_PERIMETRE,
    'hors-perimetre',
    cle,
    async () => {
      const { valeur } = await llm.generer<DecisionHorsPerimetre>(
        promptDecisionHorsPerimetre(contexte),
        'hors-perimetre',
        SCHEMA_HORS_PERIMETRE,
        { temperature: 0.1 },
      );
      const besoin = valeur.besoin.trim();
      return valeur.afficher && besoin
        ? { afficher: true, besoin }
        : { afficher: false, besoin: '' };
    },
    () => ({ afficher: false, besoin: '' }),
  );

  if (resultat.origine === 'repli') {
    ecrire(
      db,
      ligne.id,
      INDEX_HORS_PERIMETRE,
      'hors-perimetre',
      cle,
      resultat.valeur,
    );
  }
  return resultat;
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
    empreinte(`${ligne.client_metier}|${ligne.demande}|${ligne.maturite}`),
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
    // Repli : la règle en dur de la maquette, recherchée dans chaque ligne du
    // fil puisque certaines réponses, comme le périmètre, sont multiples.
    () =>
      point.tensionOn !== undefined &&
      reponse
        .split('\n')
        .some((ligne) => ligne.trim() === point.props[point.tensionOn!])
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
