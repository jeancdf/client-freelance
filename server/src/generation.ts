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
  questionsMinimales,
  relanceDePrecision,
  type Point,
} from '../../shared/points.ts';
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

/** Invalide les anciens textes quand leur règle de rédaction évolue. */
const VERSION_PROMPTS_NEUTRES = 'contrats-sections-atomiques-v5';

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
  propositions: llm.liste(llm.texte, 2, 8),
});

export interface OuvertureBrute extends Ouverture {
  termine: boolean;
}

const mots = (texte: string) =>
  texte.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

const normaliser = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Une chaîne respecte facilement le schéma JSON tout en ne contenant aucune
 * réponse (« : », « … », tirets, etc.). On exige donc ici un vrai fragment de
 * texte, indépendamment des consignes données au modèle.
 */
function propositionLisible(texte: string): boolean {
  const proposition = texte.trim();
  return proposition.length >= 2 && /\p{L}/u.test(proposition);
}

function tropProches(a: string, b: string): boolean {
  const motsA = new Set(normaliser(a).split(' ').filter((mot) => mot.length > 2));
  const motsB = new Set(normaliser(b).split(' ').filter((mot) => mot.length > 2));
  if (!motsA.size || !motsB.size) return false;
  let communs = 0;
  for (const mot of motsA) if (motsB.has(mot)) communs++;
  return communs / Math.min(motsA.size, motsB.size) >= 0.8;
}

function sourceDuContexte(contexte: Contexte, fil: Echange[] = []): string {
  return [
    contexte.nom,
    contexte.metier,
    contexte.demande,
    contexte.brief ?? '',
    ...Object.values(contexte.reponses),
    ...fil.map((echange) => echange.reponse),
  ].join(' ');
}

function contientPersonneInventee(propositions: string[], source: string): boolean {
  const sortie = normaliser(propositions.join(' '));
  const entree = normaliser(source);
  const familles = [
    /\b(femme|mari|epouse|epoux|conjoint|conjointe|compagne|compagnon|copine|copain|partenaire|proche|enfant|fille|fils|frere|soeur|mere|pere|parent)\b/,
    /\b(associe|associee|salarie|salariee|assistant|assistante|secretaire|collaborateur|collaboratrice|collegue|equipe)\b/,
  ];
  return familles.some((famille) => famille.test(sortie) && !famille.test(entree));
}

function contientDesignationFamilialeGenree(sortieBrute: string): boolean {
  return /\b(femme|mari|epouse|epoux|compagne|compagnon|copine|copain)\b/.test(
    normaliser(sortieBrute),
  );
}

function contientPrecisionInventee(sortieBrute: string, sourceBrute: string): boolean {
  const sortie = normaliser(sortieBrute);
  const source = normaliser(sourceBrute);
  const nombresSortie = sortie.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
  const nombresSource = new Set(source.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []);
  if (nombresSortie.some((nombre) => !nombresSource.has(nombre))) return true;

  const marques =
    /\b(whatsapp|excel|word|google|notion|trello|slack|teams|zoom|stripe|paypal|wordpress|shopify|youtube)\b/g;
  const marquesSortie = sortie.match(marques) ?? [];
  return marquesSortie.some((marque) => !source.includes(marque));
}

/**
 * Le schéma JSON contrôle la forme technique ; ce contrôle porte sur la
 * qualité éditoriale qui causait les cartes fourre-tout et les faits inventés.
 */
export function erreursOuverture(
  point: Point,
  valeur: OuvertureBrute,
  contexte: Contexte,
  phase: 'ouverture' | 'suite',
  fil: Echange[] = [],
): string[] {
  const erreurs: string[] = [];
  const question = valeur.question.trim();
  const relance = valeur.relance.trim();
  const propositions = valeur.propositions.map((proposition) => proposition.trim());
  const priorisation = phase === 'suite' && point.priorisation && fil.length === 1;

  if (!question.endsWith('?')) erreurs.push('la question doit se terminer par ?');
  if (mots(question).length > 18) erreurs.push('la question dépasse 18 mots');
  if (mots(relance).length < 25 || mots(relance).length > 65) {
    erreurs.push('la relance doit contenir entre 25 et 65 mots');
  }
  for (const proposition of propositions) {
    if (!propositionLisible(proposition)) {
      erreurs.push('une proposition est vide ou ne contient pas de texte exploitable');
    }
  }

  if (phase === 'ouverture') {
    const contrat = point.entretien.propositions;
    if (propositions.length < contrat.min || propositions.length > contrat.max) {
      erreurs.push(
        `il faut entre ${contrat.min} et ${contrat.max} propositions`,
      );
    }
    if (valeur.choix !== contrat.choix) {
      erreurs.push(`choix doit valoir "${contrat.choix}"`);
    }
    for (const proposition of propositions) {
      if (mots(proposition).length > contrat.maxMots) {
        erreurs.push(`une proposition dépasse ${contrat.maxMots} mots`);
      }
      if (
        contrat.atomiques &&
        (proposition.includes('\n') ||
          proposition.includes(';') ||
          (proposition.match(/[.!?](?:\s|$)/g)?.length ?? 0) > 1)
      ) {
        erreurs.push('une proposition regroupe plusieurs idées');
      }
      if (
        point.priorisation &&
        (proposition.includes(',') || /\bet\b/i.test(proposition))
      ) {
        erreurs.push('une proposition de périmètre regroupe plusieurs actions');
      }
    }
  } else if (priorisation) {
    if (propositions.length !== 3) {
      erreurs.push('la priorisation doit proposer trois classements complets');
    }
    for (const proposition of propositions) {
      if (
        !proposition.includes('Priorité 1 — à traiter en premier') ||
        !proposition.includes('Priorité 2 — à traiter ensuite') ||
        !proposition.includes('Priorité 3 — cruciale pour le projet')
      ) {
        erreurs.push('chaque classement doit contenir les trois labels imposés');
      }
    }
    if (valeur.choix !== 'unique') {
      erreurs.push('la priorisation doit être à choix unique');
    }
  } else {
    if (propositions.length < 3 || propositions.length > 4) {
      erreurs.push('une suite doit proposer trois ou quatre réponses');
    }
    if (valeur.choix !== 'unique') {
      erreurs.push('une question de suite doit être à choix unique');
    }
    for (const proposition of propositions) {
      if (mots(proposition).length > 22) {
        erreurs.push('une proposition de suite dépasse 22 mots');
      }
      if (
        proposition.includes('\n') ||
        proposition.includes(';') ||
        (proposition.match(/[.!?](?:\s|$)/g)?.length ?? 0) > 1
      ) {
        erreurs.push('une proposition de suite regroupe plusieurs idées');
      }
    }
  }

  for (let i = 0; i < propositions.length; i++) {
    for (let j = i + 1; j < propositions.length; j++) {
      if (tropProches(propositions[i], propositions[j])) {
        erreurs.push('deux propositions sont presque identiques');
      }
    }
  }
  if (
    contientPersonneInventee(
      [question, relance, ...propositions],
      sourceDuContexte(contexte, fil),
    )
  ) {
    erreurs.push('la sortie invente un proche ou un collaborateur');
  }
  if (
    contientDesignationFamilialeGenree(
      [question, relance, ...propositions].join(' '),
    )
  ) {
    erreurs.push('la sortie utilise une désignation familiale genrée');
  }
  if (
    contientPrecisionInventee(
      propositions.join(' '),
      sourceDuContexte(contexte, fil),
    )
  ) {
    erreurs.push('une proposition invente un chiffre ou un logiciel');
  }

  return [...new Set(erreurs)];
}

async function genererOuvertureValidee(
  messages: llm.Message[],
  point: Point,
  contexte: Contexte,
  phase: 'ouverture' | 'suite',
  fil: Echange[] = [],
  autoriserTermine = false,
): Promise<OuvertureBrute> {
  let corrections: string[] = [];

  for (let essai = 0; essai < 2; essai++) {
    const demande =
      essai === 0
        ? messages
        : [
            ...messages,
            {
              role: 'user' as const,
              content: `La sortie précédente ne respecte pas le contrat : ${corrections.join(
                ' ; ',
              )}. Réécris entièrement le JSON, sans commenter les corrections.`,
            },
          ];
    const { valeur } = await llm.generer<OuvertureBrute>(
      demande,
      phase,
      SCHEMA_OUVERTURE,
      { temperature: phase === 'ouverture' ? 0.5 : 0.3 },
    );

    if (phase === 'suite' && valeur.termine) {
      if (autoriserTermine) return valeur;
      corrections = ['"termine" doit valoir false pour ce tour obligatoire'];
      continue;
    }
    corrections = erreursOuverture(point, valeur, contexte, phase, fil);
    if (!corrections.length) return valeur;
  }

  throw new llm.ErreurLlm(
    `Sortie invalide après correction : ${corrections.join(' ; ')}`,
  );
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
          q: `Que faut-il faire de « ${decision.besoin} » dans la première version ?`,
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
      `${VERSION_PROMPTS_NEUTRES}|${ligne.client_metier}|${ligne.demande}|${ligne.maturite}|${decision?.besoin ?? ''}`,
    ),
    async () => {
      const valeur = await genererOuvertureValidee(
        promptOuverture(contexte, point),
        point,
        contexte,
        'ouverture',
      );
      // Une question vide passerait le schéma : on préfère la référence.
      return {
        question: valeur.question.trim() || point.q,
        relance: valeur.relance.trim() || point.hint,
        propositions: valeur.propositions.map((proposition) => proposition.trim()),
        choix: point.entretien.propositions.choix as Choix,
      };
    },
    () => ({
      question: point.q,
      relance: point.hint,
      // Les références sont écrites pour le coach de la démonstration. Les
      // afficher à un plombier pendant une panne du modèle inventerait son
      // métier à sa place : le champ libre reste disponible sans ces cartes.
      propositions: [],
      choix: point.entretien.propositions.choix as Choix,
    }),
  );
}

/**
 * La question suivante sur un point, ou `null` quand il est établi.
 *
 * Même sans modèle, les sections qui portent une vraie seconde décision
 * (classement du périmètre, contrainte atypique) gardent cette étape. Les
 * autres se ferment après une réponse au lieu d'inventer une question.
 */
export function suite(db: Base, ligne: LigneCadrage, index: number, fil: Echange[], rang: number) {
  const point = POINTS[index];
  const contexte = contexteDe(db, ligne);
  const doitContinuer =
    fil.filter((echange) => echange.reponse.trim()).length < questionsMinimales(point);

  return obtenir<Ouverture | null>(
    db,
    ligne.id,
    index,
    `ouverture:${rang}`,
    // Sur l'empreinte du fil : réécrire une réponse regénère la suite.
    empreinte(
      `${VERSION_PROMPTS_NEUTRES}|${fil
        .map((e) => `${e.question}|${e.reponse}`)
        .join('||')}`,
    ),
    async () => {
      const valeur = await genererOuvertureValidee(
        promptSuite(contexte, point, fil, rang, doitContinuer),
        point,
        contexte,
        'suite',
        fil,
        !doitContinuer,
      );

      if (!valeur.question.trim()) {
        return doitContinuer
          ? relanceDePrecision(point, fil.map((echange) => echange.reponse))
          : null;
      }
      if (valeur.termine && !doitContinuer) return null;
      return {
        question: valeur.question.trim(),
        relance: valeur.relance.trim(),
        propositions: valeur.propositions.map((proposition) => proposition.trim()),
        choix: 'unique' as Choix,
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
    empreinte(
      `${VERSION_PROMPTS_NEUTRES}|${ligne.client_metier}|${ligne.demande}|${ligne.maturite}`,
    ),
    async () => {
      const { valeur } = await llm.generer<Aide>(
        promptAide(contexte, point),
        'aide',
        SCHEMA_AIDE,
      );
      return valeur;
    },
    () => ({
      titre: 'Partez de ce que vous savez déjà, sans chercher la réponse parfaite.',
      pistes: [
        {
          texte: 'Je peux raconter un exemple récent avec mes propres mots.',
          effet:
            'Conséquence : un cas réel permet de distinguer ce qui doit être prévu de ce qui reste exceptionnel.',
        },
        {
          texte: 'Je peux décrire ce qui arrive le plus souvent.',
          effet:
            'Conséquence : le projet se concentre d’abord sur la situation habituelle.',
        },
        {
          texte: 'Je préfère indiquer ce qui reste encore à définir.',
          effet:
            'Conséquence : cette incertitude sera visible dans le dossier et devra être levée avant le devis final.',
        },
      ],
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
    // Les reformulations de référence appartiennent au cas de démonstration.
    // Sans modèle, mieux vaut ne rien soumettre que prêter ses faits au client.
    () => null,
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
    // Une contradiction dépend de tout le dossier. Le cas écrit pour la
    // démonstration ne doit jamais être appliqué à un vrai client.
    () => null,
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
    // Même principe que pour la reformulation : aucune hypothèse de la
    // démonstration n'est réutilisée dans un dossier réel.
    () => null,
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
