import { POINTS } from '../shared/points';
import type { Aide, Client, Fichier, Mode, Ouverture, Session, Statut, Tension, Voie } from '../shared/api';

export type { Mode, Voie };

export type Screen =
  | 'landing'
  | 'accueil'
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

  /**
   * La question, sa relance et les réponses probables, écrites pour ce client.
   * Absente tant que le serveur n'a pas répondu : l'écran affiche alors la
   * formulation de référence du point.
   */
  ouvertures: Record<number, Ouverture>;
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
  ouvertures: {},
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
  | { type: 'ouverture'; point: number; ouverture: Ouverture }
  | { type: 'aide'; point: number; aide: Aide }
  | { type: 'occupe'; valeur: boolean }
  | {
      type: 'suite';
      point: number;
      texte: string;
      reformulation: string | null;
      tension: Tension | null;
      deduction: string | null;
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

/**
 * Ce qui s'affiche pour un point. Tant que le serveur n'a rien rendu, c'est la
 * formulation de référence : l'entretien ne reste jamais muet en attendant le
 * modèle.
 */
export function ouvertureOf(state: State, index: number): Ouverture {
  const point = POINTS[index];
  return (
    state.ouvertures[index] ?? {
      question: point.q,
      relance: point.hint,
      propositions: point.props,
    }
  );
}

/** La réponse retenue pour un point, ou la première proposition à défaut. */
export function answerOf(state: State, index: number): string {
  return state.answers[index] ?? ouvertureOf(state, index).propositions[0];
}

/** L'index du point en cours, borné au dernier point. */
export function currentIndex(state: State): number {
  return Math.min(state.step, LAST);
}

/** Les points effectivement écrits, dans l'ordre. */
export function pointsEcrits(state: State): number[] {
  return POINTS.map((_, k) => k).filter((k) => state.answers[k] !== undefined);
}

/**
 * Le premier point encore vide : celui sur lequel on reprend l'entretien.
 * L'écran de reprise annonce ce point et le bouton doit y mener — d'où un
 * seul calcul, partagé.
 */
export function pointDeReprise(state: State): number {
  const manquant = POINTS.findIndex((_, k) => state.answers[k] === undefined);
  return manquant === -1 ? LAST : manquant;
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
    answers[i] = POINTS[i].props[0];
    if (POINTS[i].reform) confirmed[i] = true;
  }
  return { answers, confirmed };
}

function goStep(state: State, step: number, extra: Partial<State> = {}): State {
  return {
    ...state,
    screen: 'entretien',
    step,
    help: false,
    tension: false,
    tensionCourante: null,
    reformulation: null,
    occupe: false,
    dossierOpen: false,
    draft: state.answers[step] ?? '',
    scrollTick: state.scrollTick + 1,
    ...extra,
  };
}

function advance(state: State, from: number): State {
  if (from >= LAST) {
    return {
      ...state,
      screen: 'recap',
      help: false,
      tension: false,
      scrollTick: state.scrollTick + 1,
    };
  }
  return goStep(state, from + 1);
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
  // Celui qui est passé par la page publique a déjà lu de quoi il s'agit : le
  // renvoyer sur l'accueil lui redemanderait de cliquer pour rien.
  return session.commenceLe ? 'entretien' : 'accueil';
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

      for (const [cle, reponse] of Object.entries(s.reponses)) {
        const index = Number(cle);
        answers[index] = reponse.texte;
        if (reponse.confirme) confirmed[index] = true;
        if (reponse.arbitre) tensionResolved[index] = true;
      }

      return {
        ...initialState,
        session: {
          token: action.token,
          client: s.client,
          statut: s.statut,
          creeLe: s.creeLe,
          majLe: s.majLe,
          valideLe: s.valideLe,
          dureeMs: s.dureeMs,
          fichiers: s.fichiers,
        },
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
      return { ...state, ouvertures: { ...state.ouvertures, [action.point]: action.ouverture } };

    case 'aide':
      return { ...state, aide: { ...state.aide, [action.point]: action.aide } };

    case 'occupe':
      return { ...state, occupe: action.valeur };

    /**
     * Ce que le serveur a tiré de la réponse. C'est lui qui décide de la
     * suite : arbitrage d'abord s'il y a contradiction, sinon reformulation
     * à valider, sinon on avance.
     */
    case 'suite': {
      const point = action.point;
      const base: State = {
        ...state,
        answers: { ...state.answers, [point]: action.texte },
        deductions: action.deduction
          ? { ...state.deductions, [point]: action.deduction }
          : state.deductions,
        // Conservée dès qu'elle arrive, pas seulement à la validation : le
        // client peut rouvrir le récapitulatif sans être passé par l'écran de
        // reformulation, et le serveur l'a déjà en cache de toute façon.
        reformulations: action.reformulation
          ? { ...state.reformulations, [point]: action.reformulation }
          : state.reformulations,
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
        draft: '',
        answers: {},
        confirmed: {},
        tensionResolved: {},
        dossierOpen: false,
      });

    case 'replay':
      return goScreen(state, 'accueil', {
        mode: 'long',
        voie: 'entretien',
        step: 0,
        draft: '',
        answers: {},
        confirmed: {},
        tensionResolved: {},
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
      const answers = { ...state.answers, [i]: text };

      // La réponse contredit un point déjà noté : on demande l'arbitrage avant
      // d'avancer, et une seule fois — une fois tranché, on n'y revient pas.
      const raisesTension =
        point.tensionOn !== undefined &&
        text === point.props[point.tensionOn] &&
        !state.tension &&
        !state.tensionResolved[i];

      if (raisesTension) {
        return { ...state, answers, tension: true, scrollTick: state.scrollTick + 1 };
      }

      const answered = { ...state, answers };
      if (point.reform && state.mode === 'long') {
        return goScreen(answered, 'reform');
      }
      return advance(answered, i);
    }

    case 'setDraft':
      return { ...state, draft: action.value };

    case 'pickProp':
      return { ...state, draft: action.text };

    case 'openHelp':
      return { ...state, help: true, scrollTick: state.scrollTick + 1 };

    case 'closeHelp':
      return { ...state, help: false };

    case 'pickHelp':
      return { ...state, help: false, draft: action.text };

    // « La simplicité passe d'abord » : la réponse bascule sur l'autre priorité.
    case 'tensionSimple': {
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
        step: 5,
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
