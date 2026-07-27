/**
 * Le contrat entre le navigateur et le serveur. Importé des deux côtés : une
 * seule définition, donc pas de dérive silencieuse entre client et API.
 */

export type Mode = 'long' | 'court';

/** Par où le client est passé : l'entretien complet, ou le dépôt de document. */
export type Voie = 'entretien' | 'rapide';

export type Statut = 'en_cours' | 'valide';

export interface Reponse {
  /** Les mots du client, jamais retouchés. */
  texte: string;
  /** La reformulation a été relue et acceptée. */
  confirme: boolean;
  /** L'arbitrage a été rendu : on ne le redemande pas. */
  arbitre: boolean;
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
  /** Réponses par index de point (0 à 7), en clés de chaîne pour JSON. */
  reponses: Record<string, Reponse>;
  fichiers: Fichier[];
  creeLe: string;
  majLe: string;
  valideLe: string | null;
  /** Temps passé sur l'entretien, pauses longues exclues. */
  dureeMs: number;
  /**
   * Ce que le modèle a produit et qui doit survivre au rechargement : le
   * récapitulatif est le document livré, il ne peut pas retomber sur les
   * textes de la maquette parce que le client a fermé son onglet.
   */
  reformulations: Record<string, string>;
  deductions: Record<string, string>;
}

/** Champs modifiables au fil de la saisie. Tout est optionnel : on n'envoie
 *  que ce qui a bougé. */
export interface PatchSession {
  mode?: Mode;
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
  dureeMs: number;
  majLe: string;
  valideLe: string | null;
}

export interface StatsCadrages {
  total: number;
  /** Part moyenne des huit points renseignés, en pourcentage. */
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

export interface Propositions {
  propositions: string[];
  origine: Origine;
}

export interface AideGeneree extends Aide {
  origine: Origine;
}

/** Ce que le serveur rend après l'écriture d'une réponse. */
export interface SuiteReponse {
  reponse: Reponse;
  /** `null` si le point n'appelle pas de reformulation. */
  reformulation: string | null;
  /** `null` s'il n'y a pas de contradiction. */
  tension: Tension | null;
  /** Ce qui a été déduit sans le demander, s'il y a lieu. */
  deduction: string | null;
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
}

export interface CadrageCree {
  id: string;
  token: string;
  /** Le lien à envoyer au client. */
  lien: string;
}
