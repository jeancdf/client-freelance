import {
  INDEX_HORS_PERIMETRE,
  INDEX_PERIMETRE,
  POINTS,
  questionsMinimales,
  relanceDePrecision,
} from '../shared/points';
import type {
  Aide,
  Choix,
  Client,
  DecisionHorsPerimetre,
  Echange,
  Fichier,
  Maturite,
  Mode,
  Ouverture,
  Session,
  Statut,
  Tension,
  Voie,
} from '../shared/api';

export type { Mode, Voie };

export type Screen =
  | 'landing'
  | 'inscription'
  | 'accueil'
  | 'depart'
  | 'entretien'
  | 'reform'
  | 'rapide'
  | 'recap'
  | 'fin'
  | 'reprise'
  | 'dash'
  | 'deroule';

const LAST = POINTS.length - 1;

/**
 * Ce que le serveur sait du cadrage, en dehors des réponses elles-mêmes.
 * `null` quand l'application tourne sans lien : c'est le mode démonstration,
 * où rien n'est enregistré.
 */
export interface SessionMeta {
  token: string;
  client: Client;
  statut: Statut;
  /** Position explicite restaurée par le serveur, absente sur une ancienne session. */
  rang: number | null;
  /** Où le client a dit en être ; vide tant qu'il n'a pas répondu. */
  maturite: Maturite | '';
  creeLe: string;
  majLe: string;
  valideLe: string | null;
  dureeMs: number;
  fichiers: Fichier[];
}

export interface State {
  screen: Screen;
  step: number;
  mode: Mode;
  /** Par où le client est passé : entretien complet, ou dépôt de document. */
  voie: Voie;
  /** Les mots du client, par index de point. Rien n'est écrit ici sans lui. */
  answers: Record<number, string>;
  /** Reformulations validées par le client — la trace de ce qu'il a accepté. */
  confirmed: Record<number, boolean>;
  /** Points dont l'arbitrage a déjà été rendu : on ne le redemande pas. */
  tensionResolved: Record<number, boolean>;
  /** Points dont le fil est terminé. Un fil ouvert se reprend là où il en est. */
  clos: Record<number, boolean>;
  help: boolean;
  tension: boolean;
  planOpen: boolean;
  /** Réponse en cours de saisie, avant validation du point. */
  draft: string;
  /** Brouillons conservés pendant une navigation entre plusieurs questions. */
  drafts: Record<string, string>;
  brief: string;
  lien1: string;
  lien2: string;
  session: SessionMeta | null;
  /** Décision qui fait exister, ou non, le point VI dans ce dossier. */
  horsPerimetre: DecisionHorsPerimetre | null;

  /**
   * Les questions écrites pour ce client, par « point:rang » — chaque nouvelle
   * question est tirée de la réponse précédente, sans plafond arbitraire.
   * Absente tant que le serveur n'a pas répondu : l'écran attend plutôt que
   * d'afficher la formulation de référence.
   */
  ouvertures: Record<string, Ouverture>;
  /** Le fil déjà échangé sur chaque point : ce que le client voit au-dessus. */
  echanges: Record<number, Echange[]>;
  /** Rang de la question en cours sur le point affiché. */
  rang: number;
  /** Pistes d'aide générées, par point. */
  aide: Record<number, Aide>;
  /** Ce qui a été déduit de chaque réponse, pour le récapitulatif. */
  deductions: Record<number, string>;
  /**
   * Les reformulations acceptées, par point. Le récapitulatif est le document
   * livré : il cite la reformulation du client, pas celle de la maquette, et
   * doit la retrouver après un rechargement — d'où un enregistrement par point
   * et non la seule reformulation en cours.
   */
  reformulations: Record<number, string>;
  /** La reformulation à faire valider, quand on est sur l'écran dédié. */
  reformulation: string | null;
  /** La contradiction relevée sur le point en cours, s'il y en a une. */
  tensionCourante: Tension | null;
  /** Vrai pendant que le modèle travaille : les boutons attendent. */
  occupe: boolean;

  /** Incrémenté à chaque transition qui doit ramener en haut de page. */
  scrollTick: number;
}

/** L'état hors ligne : les textes de démonstration de la maquette. */
export const initialState: State = {
  screen: 'accueil',
  step: 2,
  mode: 'long',
  voie: 'entretien',
  answers: {},
  confirmed: {},
  tensionResolved: {},
  clos: {},
  help: false,
  tension: false,
  planOpen: false,
  draft: '',
  drafts: {},
  brief:
    'Nous cherchons un prestataire pour développer un portail de commande à destination de nos 60 points de vente. Le contexte, les volumes et les contraintes techniques sont détaillés dans le document joint (v3, validé en comité le 4 mars).',
  lien1: 'https://camilledorval.fr',
  lien2: '',
  session: null,
  horsPerimetre: null,
  ouvertures: {},
  echanges: {},
  rang: 0,
  aide: {},
  deductions: {},
  reformulations: {},
  reformulation: null,
  tensionCourante: null,
  occupe: false,
  scrollTick: 0,
};

export type Action =
  | { type: 'hydrate'; token: string; session: Session }
  | { type: 'ouverture'; point: number; rang: number; ouverture: Ouverture }
  | { type: 'depart'; maturite: Maturite }
  | { type: 'aide'; point: number; aide: Aide }
  | { type: 'horsPerimetre'; decision: DecisionHorsPerimetre }
  | { type: 'occupe'; valeur: boolean }
  | {
      type: 'suite';
      point: number;
      texte: string;
      /** La question suivante sur ce point, ou `null` s'il est clos. */
      question: Ouverture | null;
      rang: number;
      /** Le fil du point, tel qu'il est après cette réponse. */
      echanges: Echange[];
      reformulation: string | null;
      tension: Tension | null;
      deduction: string | null;
      horsPerimetre: DecisionHorsPerimetre | null;
    }
  | { type: 'fichiers'; fichiers: Fichier[] }
  | { type: 'dossierValide'; valideLe: string; dureeMs: number }
  | { type: 'start'; mode: Mode }
  | { type: 'replay' }
  | { type: 'goStep'; step: number }
  | { type: 'goQuestion'; point: number; rang: number }
  | { type: 'goAide' }
  | { type: 'goTension' }
  | { type: 'submit' }
  | { type: 'setDraft'; value: string }
  | { type: 'pickProp'; text: string }
  | { type: 'openHelp' }
  | { type: 'closeHelp' }
  | { type: 'pickHelp'; text: string }
  | { type: 'tensionSimple' }
  | { type: 'tensionKeep' }
  | { type: 'confirmReform' }
  | { type: 'rejectReform' }
  | { type: 'togglePlan' }
  | { type: 'switchCourt' }
  | { type: 'goScreen'; screen: Screen }
  | { type: 'goRecap' }
  | { type: 'goDeroule' }
  | { type: 'resumeAt3' }
  | { type: 'completeRapide' }
  | { type: 'setBrief'; value: string }
  | { type: 'setLien1'; value: string }
  | { type: 'setLien2'; value: string };

/** La clé d'une question dans `ouvertures` : un point, un rang. */
export const cleOuverture = (point: number, rang: number) => `${point}:${rang}`;

export interface PositionQuestion {
  point: number;
  rang: number;
}

/**
 * Ce qui s'affiche pour la question en cours. Tant que le serveur n'a rien
 * rendu, c'est la formulation de référence : l'entretien ne reste jamais muet
 * en attendant le modèle.
 */
export function ouvertureOf(state: State, index: number, rang = state.rang): Ouverture {
  const point = POINTS[index];
  const connue = state.ouvertures[cleOuverture(index, rang)];
  const echange = state.echanges[index]?.[rang];
  if (echange) {
    return {
      question: echange.question,
      relance: connue?.relance ?? '',
      propositions: connue?.propositions ?? [],
      choix: connue?.choix ?? 'unique',
    };
  }
  return (
    connue ?? {
      question: point.q,
      relance: point.hint,
      propositions: point.props,
      choix: point.selection ? ('multiple' as Choix) : ('unique' as Choix),
    }
  );
}

/** L'échange affiché, s'il a déjà été enregistré dans le fil. */
export function echangeCourant(state: State, index = currentIndex(state)): Echange | undefined {
  return state.echanges[index]?.[state.rang];
}

/** Vrai quand la question affichée est déjà connue, même sans ses suggestions. */
export function questionConnue(state: State, index = currentIndex(state)): boolean {
  return Boolean(
    state.ouvertures[cleOuverture(index, state.rang)] ??
      state.echanges[index]?.[state.rang]?.question,
  );
}

/** La réponse retenue pour un point, ou la première proposition à défaut. */
export function answerOf(state: State, index: number): string {
  return state.answers[index] ?? ouvertureOf(state, index).propositions[0];
}

/** L'index du point en cours, borné au dernier point. */
export function currentIndex(state: State): number {
  const index = Math.min(state.step, LAST);
  if (
    index === INDEX_HORS_PERIMETRE &&
    state.horsPerimetre?.afficher !== true &&
    (state.horsPerimetre !== null ||
      state.answers[INDEX_HORS_PERIMETRE] === undefined)
  ) {
    return Math.min(INDEX_HORS_PERIMETRE + 1, LAST);
  }
  return index;
}

/** Les points qui existent dans ce dossier, hors point conditionnel inutile. */
export function indicesPointsVisibles(state: State): number[] {
  const afficherHorsPerimetre =
    state.horsPerimetre?.afficher ??
    state.answers[INDEX_HORS_PERIMETRE] !== undefined;
  return POINTS.map((_, index) => index).filter(
    (index) => index !== INDEX_HORS_PERIMETRE || afficherHorsPerimetre,
  );
}

function dernierRangRepondu(state: State, point: number): number | null {
  const fil = state.echanges[point] ?? [];
  for (let rang = fil.length - 1; rang >= 0; rang--) {
    if (fil[rang].reponse.trim()) return rang;
  }
  return state.answers[point] !== undefined ? 0 : null;
}

/** La vraie question précédente, y compris dans le point visible précédent. */
export function questionPrecedente(state: State): PositionQuestion | null {
  const point = currentIndex(state);
  if (state.rang > 0) {
    const precedent = state.echanges[point]?.[state.rang - 1];
    if (precedent?.reponse.trim()) return { point, rang: state.rang - 1 };
  }

  const visibles = indicesPointsVisibles(state);
  const position = visibles.indexOf(point);
  for (let k = position - 1; k >= 0; k--) {
    const precedent = visibles[k];
    const rang = dernierRangRepondu(state, precedent);
    if (rang !== null) return { point: precedent, rang };
  }
  return null;
}

/** La question existante qui suit celle relue, dans le fil puis dans le dossier. */
export function questionSuivante(state: State): PositionQuestion | null {
  const point = currentIndex(state);
  const fil = state.echanges[point] ?? [];
  if (fil[state.rang + 1]) return { point, rang: state.rang + 1 };

  const visibles = indicesPointsVisibles(state);
  const position = visibles.indexOf(point);
  const suivant = visibles[position + 1];
  return suivant === undefined ? null : { point: suivant, rang: 0 };
}

/** Les points effectivement écrits, dans l'ordre. */
export function pointsEcrits(state: State): number[] {
  return indicesPointsVisibles(state).filter((k) => state.answers[k] !== undefined);
}

/**
 * Le point sur lequel on reprend l'entretien : un fil laissé ouvert d'abord,
 * le premier point vide ensuite. L'écran de reprise annonce ce point et le
 * bouton doit y mener — d'où un seul calcul, partagé.
 */
export function pointDeReprise(state: State): number {
  if (state.session?.rang !== null && state.session?.rang !== undefined) {
    return currentIndex(state);
  }
  const visibles = indicesPointsVisibles(state);
  const ouvert = visibles.find(
    (k) => state.answers[k] !== undefined && !state.clos[k],
  );
  if (ouvert !== undefined) return ouvert;

  const manquant = visibles.find((k) => state.answers[k] === undefined);
  return manquant ?? visibles[visibles.length - 1] ?? LAST;
}

/**
 * Le rang de la question en attente dans un fil : celle qui est posée et pas
 * encore répondue. Un point clos, ou jamais ouvert, repart de sa première.
 */
function rangEnCours(fil: Echange[], clos?: boolean, reponse?: string): number {
  if (clos || reponse === undefined) return 0;
  const attente = fil.findIndex((e) => !e.reponse.trim());
  return attente === -1 ? fil.length : attente;
}

/**
 * Où reprendre dans le fil d'un point. Un fil ouvert repart à sa question en
 * cours ; un point clos ouvert depuis le sommaire repart de sa première
 * question. La navigation question par question choisit son rang explicitement.
 */
export function rangDeReprise(state: State, step: number): number {
  return rangEnCours(state.echanges[step] ?? [], state.clos[step], state.answers[step]);
}

function reponseDeQuestion(state: State, point: number, rang: number): string {
  const echange = state.echanges[point]?.[rang];
  if (echange?.reponse.trim()) return echange.reponse;
  return rang === 0 ? (state.answers[point] ?? '') : '';
}

/** Le serveur indexe par chaîne, à cause de JSON ; l'état indexe par nombre. */
function parIndex(source: Record<string, string>): Record<number, string> {
  const par: Record<number, string> = {};
  for (const [cle, valeur] of Object.entries(source)) par[Number(cle)] = valeur;
  return par;
}

function sansPoint<T>(source: Record<number, T>, point: number): Record<number, T> {
  const copie = { ...source };
  delete copie[point];
  return copie;
}

function sansBrouillonsDepuis(
  source: Record<string, string>,
  point: number,
  rang: number,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(([cle]) => {
      const [pointCle, rangCle] = cle.split(':').map(Number);
      return pointCle !== point || rangCle < rang;
    }),
  );
}

function avecDraft(state: State, value: string): State {
  return {
    ...state,
    draft: value,
    drafts: {
      ...state.drafts,
      [cleOuverture(currentIndex(state), state.rang)]: value,
    },
  };
}

/**
 * Pré-remplit les `upTo` premiers points avec la réponse la plus probable.
 * Sert aux écrans de démonstration, qui doivent montrer un dossier déjà entamé.
 */
function demoAnswers(upTo: number): Pick<State, 'answers' | 'confirmed'> {
  const answers: Record<number, string> = {};
  const confirmed: Record<number, boolean> = {};
  for (let i = 0; i < upTo; i++) {
    if (i === INDEX_HORS_PERIMETRE) continue;
    answers[i] = POINTS[i].props[0];
    if (POINTS[i].reform) confirmed[i] = true;
  }
  return { answers, confirmed };
}

function goQuestion(
  state: State,
  point: number,
  rang: number,
  extra: Partial<State> = {},
): State {
  const visible = indicesPointsVisibles(state);
  const cible =
    point === INDEX_HORS_PERIMETRE && !visible.includes(point)
      ? (visible.find((index) => index > point) ?? visible[visible.length - 1] ?? LAST)
      : point;
  const rangCible = Math.max(0, rang);
  const drafts = {
    ...state.drafts,
    [cleOuverture(currentIndex(state), state.rang)]: state.draft,
  };
  const cleCible = cleOuverture(cible, rangCible);
  return {
    ...state,
    screen: 'entretien',
    step: cible,
    rang: rangCible,
    help: false,
    tension: false,
    tensionCourante: null,
    reformulation: null,
    occupe: false,
    drafts,
    draft: drafts[cleCible] ?? reponseDeQuestion(state, cible, rangCible),
    scrollTick: state.scrollTick + 1,
    ...extra,
  };
}

function goStep(state: State, step: number, extra: Partial<State> = {}): State {
  return goQuestion(state, step, rangDeReprise(state, step), extra);
}

function advance(state: State, from: number): State {
  const prochain = indicesPointsVisibles(state).find((index) => index > from);
  if (prochain === undefined) {
    return {
      ...state,
      screen: 'recap',
      help: false,
      tension: false,
      scrollTick: state.scrollTick + 1,
    };
  }
  return goStep(state, prochain);
}

function goScreen(state: State, screen: Screen, extra: Partial<State> = {}): State {
  return {
    ...state,
    screen,
    help: false,
    tension: false,
    scrollTick: state.scrollTick + 1,
    // Ouvrir le dépôt de document, c'est choisir cette voie : le prestataire
    // doit le voir dans son tableau, même si le client n'a encore rien déposé.
    ...(screen === 'rapide' ? { voie: 'rapide' as Voie } : {}),
    ...extra,
  };
}

/** L'écran sur lequel retombe un client qui rouvre son lien. */
function ecranDeReprise(session: Session, aDesReponses: boolean): Screen {
  if (session.statut === 'valide') return 'fin';
  if (aDesReponses || session.draft) return 'reprise';
  if (session.voie === 'rapide') return 'rapide';
  if (!session.commenceLe) return 'accueil';
  // Celui qui est passé par la page publique a déjà lu de quoi il s'agit. Reste
  // la question de départ, tant qu'il n'y a pas répondu : c'est elle qui règle
  // le ton de tout l'entretien, on ne la saute pas.
  return session.maturite ? 'entretien' : 'depart';
}

export function reducer(state: State, action: Action): State {
  const i = currentIndex(state);

  switch (action.type) {
    // L'état du serveur remplace l'état de démonstration, en bloc.
    case 'hydrate': {
      const s = action.session;
      const answers: Record<number, string> = {};
      const confirmed: Record<number, boolean> = {};
      const tensionResolved: Record<number, boolean> = {};
      const clos: Record<number, boolean> = {};
      const echanges: Record<number, Echange[]> = {};

      for (const [cle, reponse] of Object.entries(s.reponses)) {
        const index = Number(cle);
        answers[index] = reponse.texte;
        if (reponse.confirme) confirmed[index] = true;
        if (reponse.arbitre) tensionResolved[index] = true;
        if (reponse.clos) clos[index] = true;
      }
      // Une question posée sans réponse est celle que le client avait sous les
      // yeux : on la remet en place, avec son rang.
      const ouvertures: Record<string, Ouverture> = {};
      for (const [cle, fil] of Object.entries(s.echanges)) {
        const index = Number(cle);
        echanges[index] = fil;
        const attente = fil.findIndex((e) => !e.reponse.trim());
        if (attente !== -1) {
          ouvertures[cleOuverture(index, attente)] = {
            question: fil[attente].question,
            relance: '',
            propositions: [],
            choix: 'unique',
          };
        }
      }

      return {
        ...initialState,
        session: {
          token: action.token,
          client: s.client,
          statut: s.statut,
          rang: s.rang,
          maturite: s.maturite,
          creeLe: s.creeLe,
          majLe: s.majLe,
          valideLe: s.valideLe,
          dureeMs: s.dureeMs,
          fichiers: s.fichiers,
        },
        horsPerimetre: s.horsPerimetre,
        mode: s.mode,
        voie: s.voie,
        step: s.step,
        draft: s.draft,
        brief: s.brief,
        lien1: s.lien1,
        lien2: s.lien2,
        answers,
        confirmed,
        tensionResolved,
        clos,
        echanges,
        ouvertures,
        rang:
          s.rang ??
          rangEnCours(echanges[s.step] ?? [], clos[s.step], answers[s.step]),
        drafts: {
          [cleOuverture(
            s.step,
            s.rang ??
              rangEnCours(echanges[s.step] ?? [], clos[s.step], answers[s.step]),
          )]: s.draft,
        },
        // Ce que le modèle a écrit lors des sessions précédentes : sans cela,
        // un client qui recharge verrait le récapitulatif retomber sur les
        // textes de la maquette.
        reformulations: parIndex(s.reformulations),
        deductions: parIndex(s.deductions),
        screen: ecranDeReprise(s, Object.keys(answers).length > 0),
        scrollTick: state.scrollTick + 1,
      };
    }

    case 'ouverture':
      return {
        ...state,
        ouvertures: {
          ...state.ouvertures,
          [cleOuverture(action.point, action.rang)]: action.ouverture,
        },
      };

    case 'depart':
      if (!state.session) return state;
      return { ...state, session: { ...state.session, maturite: action.maturite } };

    case 'aide':
      return { ...state, aide: { ...state.aide, [action.point]: action.aide } };

    case 'horsPerimetre':
      return { ...state, horsPerimetre: action.decision };

    case 'occupe':
      return { ...state, occupe: action.valeur };

    /**
     * Ce que le serveur a tiré de la réponse. C'est lui qui décide de la
     * suite : arbitrage d'abord s'il y a contradiction, sinon reformulation
     * à valider, sinon on avance.
     */
    case 'suite': {
      const point = action.point;
      const texteChange = state.answers[point] !== action.texte;
      const drafts = sansBrouillonsDepuis(state.drafts, point, state.rang);
      const confirmed = texteChange
        ? sansPoint(state.confirmed, point)
        : state.confirmed;
      const tensionResolved = texteChange
        ? sansPoint(state.tensionResolved, point)
        : state.tensionResolved;

      // Le fil continue : on reste sur le même point, une question plus loin.
      // Le brouillon repart à vide — c'est une nouvelle question, pas une
      // correction de la précédente.
      if (action.question) {
        return {
          ...state,
          answers: { ...state.answers, [point]: action.texte },
          echanges: {
            ...state.echanges,
            [point]: [...action.echanges, { question: action.question.question, reponse: '' }],
          },
          ouvertures: {
            ...state.ouvertures,
            [cleOuverture(point, action.rang)]: action.question,
          },
          confirmed,
          tensionResolved,
          clos: sansPoint(state.clos, point),
          deductions: texteChange
            ? sansPoint(state.deductions, point)
            : state.deductions,
          reformulations: texteChange
            ? sansPoint(state.reformulations, point)
            : state.reformulations,
          horsPerimetre:
            point === INDEX_PERIMETRE ? null : state.horsPerimetre,
          drafts: {
            ...drafts,
            [cleOuverture(point, action.rang)]: '',
          },
          rang: action.rang,
          draft: '',
          occupe: false,
        };
      }

      const base: State = {
        ...state,
        answers: { ...state.answers, [point]: action.texte },
        echanges: { ...state.echanges, [point]: action.echanges },
        confirmed,
        tensionResolved,
        clos: { ...state.clos, [point]: true },
        deductions: action.deduction
          ? { ...state.deductions, [point]: action.deduction }
          : texteChange
            ? sansPoint(state.deductions, point)
            : state.deductions,
        // Conservée dès qu'elle arrive, pas seulement à la validation : le
        // client peut rouvrir le récapitulatif sans être passé par l'écran de
        // reformulation, et le serveur l'a déjà en cache de toute façon.
        reformulations: action.reformulation
          ? { ...state.reformulations, [point]: action.reformulation }
          : texteChange
            ? sansPoint(state.reformulations, point)
            : state.reformulations,
        horsPerimetre: action.horsPerimetre ?? state.horsPerimetre,
        drafts,
        draft: '',
        occupe: false,
      };

      if (action.tension && !tensionResolved[point]) {
        return {
          ...base,
          tension: true,
          tensionCourante: action.tension,
          scrollTick: base.scrollTick + 1,
        };
      }

      if (action.reformulation && state.mode === 'long') {
        return goScreen({ ...base, reformulation: action.reformulation }, 'reform');
      }

      return advance(base, point);
    }

    case 'fichiers':
      if (!state.session) return state;
      return { ...state, session: { ...state.session, fichiers: action.fichiers } };

    case 'dossierValide':
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          statut: 'valide',
          valideLe: action.valideLe,
          dureeMs: action.dureeMs,
        },
      };

    case 'start':
      return goScreen(state, 'entretien', {
        mode: action.mode,
        voie: 'entretien',
        step: 0,
        rang: 0,
        draft: '',
        drafts: {},
        answers: {},
        confirmed: {},
        tensionResolved: {},
        clos: {},
        echanges: {},
        horsPerimetre: null,
      });

    case 'replay':
      return goScreen(state, 'accueil', {
        mode: 'long',
        voie: 'entretien',
        step: 0,
        rang: 0,
        draft: '',
        drafts: {},
        answers: {},
        confirmed: {},
        tensionResolved: {},
        clos: {},
        echanges: {},
        horsPerimetre: null,
      });

    case 'goStep':
      return goStep(state, action.step);

    case 'goQuestion':
      return goQuestion(state, action.point, action.rang);

    case 'goAide':
      return goStep(state, i, { help: true });

    // Rejoue l'arbitrage du point V, pour la démonstration.
    case 'goTension':
      return goStep(state, 4, { tension: true, draft: POINTS[4].props[3] });

    case 'submit': {
      // Avec un dossier réel, la suite dépend du modèle : le composant lance
      // l'appel et le réducteur attend l'action « suite ».
      if (state.session) return { ...state, occupe: true };

      const point = POINTS[i];
      const text = state.draft.trim() || point.props[0];
      const posee = ouvertureOf(state, i).question;
      const fil = [
        ...(state.echanges[i] ?? []).slice(0, state.rang),
        { question: posee, reponse: text },
      ];
      const answers = {
        ...state.answers,
        [i]: fil.map((echange) => echange.reponse).join('\n'),
      };
      const texteChange = state.answers[i] !== answers[i];
      const confirmed = texteChange ? sansPoint(state.confirmed, i) : state.confirmed;
      const tensionResolved = texteChange
        ? sansPoint(state.tensionResolved, i)
        : state.tensionResolved;
      const drafts = sansBrouillonsDepuis(state.drafts, i, state.rang);

      // La démonstration suit le contrat du point. Seules les sections qui
      // comportent une vraie seconde décision imposent une relance.
      if (state.rang + 1 < questionsMinimales(point)) {
        const rang = state.rang + 1;
        const suivante = relanceDePrecision(
          point,
          fil.map((echange) => echange.reponse),
        );
        return {
          ...state,
          answers,
          echanges: {
            ...state.echanges,
            [i]: [...fil, { question: suivante.question, reponse: '' }],
          },
          ouvertures: {
            ...state.ouvertures,
            [cleOuverture(i, rang)]: suivante,
          },
          confirmed,
          tensionResolved,
          clos: sansPoint(state.clos, i),
          deductions: texteChange ? sansPoint(state.deductions, i) : state.deductions,
          reformulations: texteChange
            ? sansPoint(state.reformulations, i)
            : state.reformulations,
          drafts: { ...drafts, [cleOuverture(i, rang)]: '' },
          rang,
          draft: '',
        };
      }

      // La réponse contredit un point déjà noté : on demande l'arbitrage avant
      // d'avancer, et une seule fois — une fois tranché, on n'y revient pas.
      const raisesTension =
        point.tensionOn !== undefined &&
        fil.some((echange) =>
          echange.reponse
            .split('\n')
            .some((ligne) => ligne.trim() === point.props[point.tensionOn!]),
        ) &&
        !state.tension &&
        !tensionResolved[i];

      if (raisesTension) {
        return {
          ...state,
          answers,
          echanges: { ...state.echanges, [i]: fil },
          confirmed,
          tensionResolved,
          clos: { ...state.clos, [i]: true },
          drafts,
          draft: '',
          tension: true,
          scrollTick: state.scrollTick + 1,
        };
      }

      const answered = {
        ...state,
        answers,
        echanges: { ...state.echanges, [i]: fil },
        confirmed,
        tensionResolved,
        clos: { ...state.clos, [i]: true },
        deductions: texteChange ? sansPoint(state.deductions, i) : state.deductions,
        reformulations: texteChange
          ? sansPoint(state.reformulations, i)
          : state.reformulations,
        drafts,
        draft: '',
      };
      if (point.reform && state.mode === 'long') {
        return goScreen(answered, 'reform');
      }
      return advance(answered, i);
    }

    case 'setDraft':
      return avecDraft(state, action.value);

    /**
     * En choix unique, la suggestion remplace la réponse. En choix multiple,
     * elle s'ajoute sur sa propre ligne, et un second clic la retire : le
     * client dont la situation tient de deux propositions n'a pas à en
     * recopier une à la main.
     */
    case 'pickProp': {
      if (ouvertureOf(state, i).choix === 'unique') {
        return avecDraft(state, action.text);
      }

      const lignes = state.draft.split('\n').filter((l) => l.trim());
      const deja = lignes.indexOf(action.text);
      const selection = state.rang === 0 ? POINTS[i].selection : undefined;
      if (deja === -1 && selection && lignes.length >= selection.max) return state;
      const suivantes = deja === -1 ? [...lignes, action.text] : lignes.filter((_, k) => k !== deja);
      return avecDraft(state, suivantes.join('\n'));
    }

    case 'openHelp':
      return { ...state, help: true, scrollTick: state.scrollTick + 1 };

    case 'closeHelp':
      return { ...state, help: false };

    // Une piste d'aide s'ajoute comme une suggestion : même geste, même règle.
    case 'pickHelp': {
      if (ouvertureOf(state, i).choix === 'unique') {
        return avecDraft({ ...state, help: false }, action.text);
      }
      const lignes = state.draft.split('\n').filter((l) => l.trim());
      return avecDraft(
        { ...state, help: false },
        lignes.includes(action.text)
          ? lignes.filter((l) => l !== action.text).join('\n')
          : [...lignes, action.text].join('\n'),
      );
    }

    // « La simplicité passe d'abord » : la réponse bascule sur l'autre priorité.
    case 'tensionSimple': {
      // Sur un dossier réel, on ne substitue rien aux mots du client : la
      // proposition de repli est celle d'un autre métier. On note l'arbitrage,
      // le texte reste le sien.
      if (state.session) {
        return { ...state, tension: false, tensionResolved: { ...state.tensionResolved, [i]: true } };
      }

      const fallback = POINTS[i].props[1];
      return {
        ...state,
        answers: { ...state.answers, [i]: fallback },
        draft: fallback,
        tension: false,
        tensionResolved: { ...state.tensionResolved, [i]: true },
      };
    }

    // Le client maintient sa réponse, ou préfère s'expliquer de vive voix.
    case 'tensionKeep':
      return {
        ...state,
        tension: false,
        tensionResolved: { ...state.tensionResolved, [i]: true },
      };

    case 'confirmReform':
      return advance({ ...state, confirmed: { ...state.confirmed, [i]: true } }, i);

    case 'rejectReform':
      return goQuestion(state, i, dernierRangRepondu(state, i) ?? 0);

    case 'togglePlan':
      return { ...state, planOpen: !state.planOpen };

    case 'switchCourt':
      return { ...state, mode: 'court' };

    case 'goScreen':
      return goScreen(state, action.screen);

    // Hors session, le récapitulatif et le déroulé se lisent en entier : ce qui
    // n'a pas été demandé y prend la réponse la plus probable. Avec un vrai
    // dossier on n'invente rien — seul le client remplit son cadrage.
    case 'goRecap':
    case 'goDeroule': {
      const ecran: Screen = action.type === 'goRecap' ? 'recap' : 'deroule';
      if (state.session) return goScreen(state, ecran);

      const demo = demoAnswers(POINTS.length);
      return goScreen(state, ecran, {
        answers: { ...demo.answers, ...state.answers },
        confirmed: { ...demo.confirmed, ...state.confirmed },
      });
    }

    case 'resumeAt3': {
      if (state.session) {
        return state.session.rang === null
          ? goStep(state, pointDeReprise(state))
          : goQuestion(state, currentIndex(state), state.rang);
      }
      const demo = demoAnswers(2);
      return goScreen(state, 'entretien', {
        step: 2,
        draft: '',
        answers: demo.answers,
        confirmed: demo.confirmed,
      });
    }

    case 'completeRapide': {
      // On ne redemande pas ce qui est déjà écrit.
      if (state.session) {
        return goScreen(state, 'entretien', { step: pointDeReprise(state), draft: '' });
      }

      const demo = demoAnswers(5);
      return goScreen(state, 'entretien', {
        mode: 'court',
        step: INDEX_HORS_PERIMETRE + 1,
        draft: '',
        answers: demo.answers,
        confirmed: demo.confirmed,
      });
    }

    case 'setBrief':
      return { ...state, brief: action.value };

    case 'setLien1':
      return { ...state, lien1: action.value };

    case 'setLien2':
      return { ...state, lien2: action.value };
  }
}
