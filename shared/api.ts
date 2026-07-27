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

export interface CadrageCree {
  id: string;
  token: string;
  /** Le lien à envoyer au client. */
  lien: string;
}
