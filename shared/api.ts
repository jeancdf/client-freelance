/**
 * Le contrat entre le navigateur et le serveur. Importé des deux côtés : une
 * seule définition, donc pas de dérive silencieuse entre client et API.
 */

export type Mode = 'long' | 'court';

/** Nombre de réponses exigées avant que l'IA puisse clore un point seule. */
export const QUESTIONS_MIN_PAR_POINT = 2;

/** Par où le client est passé : l'entretien complet, ou le dépôt de document. */
export type Voie = 'entretien' | 'rapide';

/**
 * Où en est le client quand il ouvre son cadrage. Ce n'est pas une donnée
 * décorative : elle décide du ton des questions et de la profondeur des
 * relances. Quelqu'un qui a des specs et quelqu'un qui a une gêne quotidienne
 * n'ont pas le même entretien.
 */
export type Maturite = 'idee' | 'forme' | 'specs';

export type Statut = 'en_cours' | 'valide';

/**
 * Ce qu'une question attend. Le modèle le décide question par question : « qui
 * va s'en servir » appelle plusieurs réponses, « la seule chose sans laquelle
 * ça ne sert à rien » n'en appelle qu'une.
 */
export type Choix = 'unique' | 'multiple';

/**
 * Une question posée sur un point, et ce que le client y a répondu. Une réponse
 * vide veut dire que la question est posée mais pas encore répondue : c'est
 * ainsi qu'un fil interrompu se retrouve au rechargement.
 */
export interface Echange {
  question: string;
  reponse: string;
}

export interface Reponse {
  /** Les mots du client, jamais retouchés. */
  texte: string;
  /** La reformulation a été relue et acceptée. */
  confirme: boolean;
  /** L'arbitrage a été rendu : on ne le redemande pas. */
  arbitre: boolean;
  /** Le fil de questions sur ce point est terminé : il ne se rouvre pas seul. */
  clos: boolean;
  majLe: string;
}

export interface Fichier {
  id: string;
  nom: string;
  taille: number;
  typeMime: string;
  deposeLe: string;
}

export interface Client {
  nom: string;
  metier: string;
  demande: string;
}

/** L'état complet d'un cadrage, tel que le client le récupère à l'ouverture. */
export interface Session {
  client: Client;
  mode: Mode;
  voie: Voie;
  step: number;
  draft: string;
  brief: string;
  lien1: string;
  lien2: string;
  statut: Statut;
  /** Où en était le client à l'ouverture ; vide pour un cadrage créé à la main. */
  maturite: Maturite | '';
  /** Réponses par index de point (0 à 7), en clés de chaîne pour JSON. */
  reponses: Record<string, Reponse>;
  /** Le fil de chaque point : sans lui, un rechargement perdrait la question en cours. */
  echanges: Record<string, Echange[]>;
  fichiers: Fichier[];
  creeLe: string;
  majLe: string;
  valideLe: string | null;
  /**
   * Quand le client est entré dans l'entretien. Non nul, il ne repasse plus par
   * la page d'accueil : il a déjà lu de quoi il s'agit.
   */
  commenceLe: string | null;
  /** Temps passé sur l'entretien, pauses longues exclues. */
  dureeMs: number;
  /**
   * Ce que le modèle a produit et qui doit survivre au rechargement : le
   * récapitulatif est le document livré, il ne peut pas retomber sur les
   * textes de la maquette parce que le client a fermé son onglet.
   */
  reformulations: Record<string, string>;
  deductions: Record<string, string>;
  /** `null` tant que le périmètre n'a pas encore été évalué. */
  horsPerimetre: DecisionHorsPerimetre | null;
}

/** Champs modifiables au fil de la saisie. Tout est optionnel : on n'envoie
 *  que ce qui a bougé. */
export interface PatchSession {
  mode?: Mode;
  maturite?: Maturite;
  voie?: Voie;
  step?: number;
  draft?: string;
  brief?: string;
  lien1?: string;
  lien2?: string;
}

export interface PutReponse {
  texte: string;
  confirme?: boolean;
  arbitre?: boolean;
  /** Rang de la question à laquelle ce texte répond, dans le fil du point. */
  rang?: number;
  /** Le client déclare le point complet : pas de question de suite. */
  clore?: boolean;
}

/** Une ligne du tableau des cadrages, côté prestataire. */
export interface LigneCadrage {
  id: string;
  token: string;
  client: Client;
  voie: Voie;
  mode: Mode;
  statut: Statut;
  /** Nombre de points renseignés, sur `POINTS.length`. */
  couverture: number;
  /** Le point en cours, ou `null` si le dossier est complet. */
  enCours: number | null;
  /** Une contradiction a été relevée et n'a pas encore été tranchée. */
  tensionOuverte: boolean;
  maturite: Maturite | '';
  dureeMs: number;
  majLe: string;
  valideLe: string | null;
}

export interface StatsCadrages {
  total: number;
  /** Part moyenne des huit points possibles couverts, point ignoré compris. */
  tauxAchevement: number;
  /** Médiane des durées des cadrages validés, en millisecondes. */
  dureeMedianeMs: number;
  parVoieRapide: number;
  tensionsOuvertes: number;
  enCours: number;
  aChiffrer: number;
  dormants: number;
}

export interface ReponseCadrages {
  stats: StatsCadrages;
  cadrages: LigneCadrage[];
}

export interface CreationCadrage {
  nom: string;
  metier?: string;
  demande?: string;
}

/**
 * Ce qu'un visiteur remplit lui-même sur la page d'accueil. Mêmes champs que
 * la création côté prestataire, mais l'activité et la demande sont exigées :
 * sans elles le modèle n'a rien pour écrire les questions.
 */
export interface Inscription {
  nom: string;
  metier: string;
  demande: string;
  courriel: string;
}

// --------------------------------------------------- contenu généré ------ //

/** D'où vient le contenu affiché : utile en développement, jamais montré au client. */
export type Origine = 'cache' | 'modele' | 'repli';

export interface Piste {
  texte: string;
  /** La conséquence sur le projet, dite tout de suite. */
  effet: string;
}

export interface Aide {
  titre: string;
  pistes: Piste[];
}

/** Une contradiction relevée entre deux réponses, et l'arbitrage proposé. */
export interface Tension {
  explication: string;
  optionA: string;
  optionB: string;
}

/** Décision ciblée qui rend le point « Hors périmètre » conditionnel. */
export interface DecisionHorsPerimetre {
  /** Vrai uniquement si le client a explicitement évoqué un besoin supplémentaire. */
  afficher: boolean;
  /** Le besoin relevé dans ses mots ; vide quand le point doit être ignoré. */
  besoin: string;
}

/**
 * L'ouverture d'un point : la question telle qu'elle est posée à CE client, sa
 * relance, et les réponses probables. Les trois sortent du même appel — la
 * question et les réponses doivent se répondre l'une l'autre.
 */
export interface Ouverture {
  question: string;
  relance: string;
  propositions: string[];
  choix: Choix;
}

export interface OuvertureGeneree extends Ouverture {
  origine: Origine;
}

export interface AideGeneree extends Aide {
  origine: Origine;
}

/** Ce que le serveur rend après l'écriture d'une réponse. */
export interface SuiteReponse {
  reponse: Reponse;
  /**
   * La question suivante sur ce même point, ou `null` quand il est clos. Tant
   * qu'il y a une suite, la reformulation et le reste ne sont pas calculés :
   * ils porteraient sur une réponse encore en cours d'écriture.
   */
  suite: Ouverture | null;
  /** Rang de `suite` dans le fil, `-1` quand le point est clos. */
  rang: number;
  /** `null` si le point n'appelle pas de reformulation, ou n'est pas clos. */
  reformulation: string | null;
  /** `null` s'il n'y a pas de contradiction. */
  tension: Tension | null;
  /** Ce qui a été déduit sans le demander, s'il y a lieu. */
  deduction: string | null;
  /** Décision prise à la clôture du périmètre ; `null` sur les autres points. */
  horsPerimetre: DecisionHorsPerimetre | null;
}

export interface PointAnalyse {
  index: number;
  couvert: boolean;
  /** Recopié du document, jamais reformulé. */
  extrait: string;
  /** Le point rédigé comme une réponse du client, à partir du document seul. */
  reponse: string;
  /** Ce qui manque, quand le point n'est pas couvert. */
  manque: string;
}

export interface Analyse {
  points: PointAnalyse[];
  couverts: number;
}

export interface AnalyseGeneree extends Analyse {
  origine: Origine;
  /** Vrai si des fichiers n'ont pas pu être lus (PDF, Word). */
  fichiersIllisibles: string[];
  /** Même décision conditionnelle que dans l'entretien guidé. */
  horsPerimetre: DecisionHorsPerimetre;
}

export interface CadrageCree {
  id: string;
  token: string;
  /** Le lien à envoyer au client. */
  lien: string;
}
