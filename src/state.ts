import {
  INDEX_HORS_PERIMETRE,
  POINTS,
  relanceDePrecision,
} from '../shared/points';
import { QUESTIONS_MIN_PAR_POINT } from '../shared/api';
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
  dossierOpen: boolean;
  planOpen: boolean;
  /** Réponse en cours de saisie, avant validation du point. */
  draft: string;
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
  dossierOpen: false,
  planOpen: false,
  draft: '',
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
  | { type: 'toggleDossier' }
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

/**
 * Ce qui s'affiche pour la question en cours. Tant que le serveur n'a rien
 * rendu, c'est la formulation de référence : l'entretien ne reste jamais muet
 * en attendant le modèle.
 */
export function ouvertureOf(state: State, index: number, rang = state.rang): Ouverture {
  const point = POINTS[index];
  return (
    state.ouvertures[cleOuverture(index, rang)] ?? {
      question: point.q,
      relance: point.hint,
      propositions: point.props,
      choix: point.selection ? ('multiple' as Choix) : ('unique' as Choix),
    }
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
 * cours, brouillon vide ; un point clos qu'on rouvre pour le corriger repart de
 * sa première question, avec ce qui a été écrit.
 */
export function rangDeReprise(state: State, step: number): number {
  return rangEnCours(state.echanges[step] ?? [], state.clos[step], state.answers[step]);
}

/** Le serveur indexe par chaîne, à cause de JSON ; l'état indexe par nombre. */
function parIndex(source: Record<string, string>): Record<number, string> {
  const par: Record<number, string> = {};
  for (const [cle, valeur] of Object.entries(source)) par[Number(cle)] = valeur;
  return par;
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

function goStep(state: State, step: number, extra: Partial<State> = {}): State {
  const visible = indicesPointsVisibles(state);
  const cible =
    step === INDEX_HORS_PERIMETRE && !visible.includes(step)
      ? (visible.find((index) => index > step) ?? visible[visible.length - 1] ?? LAST)
      : step;
  const rang = rangDeReprise(state, cible);
  return {
    ...state,
    screen: 'entretien',
    step: cible,
    rang,
    help: false,
    tension: false,
    tensionCourante: null,
    reformulation: null,
    occupe: false,
    dossierOpen: false,
    // Un fil en cours attend une nouvelle réponse ; un point clos qu'on rouvre
    // rend ses mots au client pour qu'il les corrige.
    draft: rang > 0 ? '' : (state.answers[cible] ?? ''),
    scrollTick: state.scrollTick + 1,
    ...extra,
  };
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
        rang: rangEnCours(echanges[s.step] ?? [], clos[s.step], answers[s.step]),
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
          rang: action.rang,
          draft: '',
          occupe: false,
        };
      }

      const base: State = {
        ...state,
        answers: { ...state.answers, [point]: action.texte },
        echanges: { ...state.echanges, [point]: action.echanges },
        clos: { ...state.clos, [point]: true },
        deductions: action.deduction
          ? { ...state.deductions, [point]: action.deduction }
          : state.deductions,
        // Conservée dès qu'elle arrive, pas seulement à la validation : le
        // client peut rouvrir le récapitulatif sans être passé par l'écran de
        // reformulation, et le serveur l'a déjà en cache de toute façon.
        reformulations: action.reformulation
          ? { ...state.reformulations, [point]: action.reformulation }
          : state.reformulations,
        horsPerimetre: action.horsPerimetre ?? state.horsPerimetre,
        occupe: false,
      };

      if (action.tension && !state.tensionResolved[point]) {
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
        answers: {},
        confirmed: {},
        tensionResolved: {},
        clos: {},
        echanges: {},
        horsPerimetre: null,
        dossierOpen: false,
      });

    case 'replay':
      return goScreen(state, 'accueil', {
        mode: 'long',
        voie: 'entretien',
        step: 0,
        rang: 0,
        draft: '',
        answers: {},
        confirmed: {},
        tensionResolved: {},
        clos: {},
        echanges: {},
        horsPerimetre: null,
        dossierOpen: false,
      });

    case 'goStep':
      return goStep(state, action.step);

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

      // La démonstration suit le même rythme qu'un dossier réel : au moins
      // deux questions, puis elle ferme faute de modèle pour décider d'une
      // relance supplémentaire.
      if (state.rang + 1 < QUESTIONS_MIN_PAR_POINT) {
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
        !state.tensionResolved[i];

      if (raisesTension) {
        return {
          ...state,
          answers,
          echanges: { ...state.echanges, [i]: fil },
          clos: { ...state.clos, [i]: true },
          tension: true,
          scrollTick: state.scrollTick + 1,
        };
      }

      const answered = {
        ...state,
        answers,
        echanges: { ...state.echanges, [i]: fil },
        clos: { ...state.clos, [i]: true },
      };
      if (point.reform && state.mode === 'long') {
        return goScreen(answered, 'reform');
      }
      return advance(answered, i);
    }

    case 'setDraft':
      return { ...state, draft: action.value };

    /**
     * En choix unique, la suggestion remplace la réponse. En choix multiple,
     * elle s'ajoute sur sa propre ligne, et un second clic la retire : le
     * client dont la situation tient de deux propositions n'a pas à en
     * recopier une à la main.
     */
    case 'pickProp': {
      if (ouvertureOf(state, i).choix === 'unique') {
        return { ...state, draft: action.text };
      }

      const lignes = state.draft.split('\n').filter((l) => l.trim());
      const deja = lignes.indexOf(action.text);
      const selection = state.rang === 0 ? POINTS[i].selection : undefined;
      if (deja === -1 && selection && lignes.length >= selection.max) return state;
      const suivantes = deja === -1 ? [...lignes, action.text] : lignes.filter((_, k) => k !== deja);
      return { ...state, draft: suivantes.join('\n') };
    }

    case 'openHelp':
      return { ...state, help: true, scrollTick: state.scrollTick + 1 };

    case 'closeHelp':
      return { ...state, help: false };

    // Une piste d'aide s'ajoute comme une suggestion : même geste, même règle.
    case 'pickHelp': {
      if (ouvertureOf(state, i).choix === 'unique') {
        return { ...state, help: false, draft: action.text };
      }
      const lignes = state.draft.split('\n').filter((l) => l.trim());
      return {
        ...state,
        help: false,
        draft: lignes.includes(action.text)
          ? lignes.filter((l) => l !== action.text).join('\n')
          : [...lignes, action.text].join('\n'),
      };
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
      return goStep(state, i);

    case 'toggleDossier':
      return { ...state, dossierOpen: !state.dossierOpen };

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
      if (state.session) return goStep(state, pointDeReprise(state));
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
