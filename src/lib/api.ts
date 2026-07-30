import type {
  AideGeneree,
  AnalyseGeneree,
  CadrageCree,
  CreationCadrage,
  Fichier,
  Inscription,
  OuvertureGeneree,
  PatchSession,
  PutReponse,
  Reponse,
  ReponseCadrages,
  SauvegardeUrgente,
  Session,
  SuiteReponse,
} from '../../shared/api';

export class ErreurApi extends Error {
  statut: number;

  constructor(statut: number, message: string) {
    super(message);
    this.statut = statut;
  }
}

async function requete<T>(chemin: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(`/api${chemin}`, init);

  if (!reponse.ok) {
    let message = `Erreur ${reponse.status}`;
    try {
      const corps = (await reponse.json()) as { erreur?: string };
      if (corps?.erreur) message = corps.erreur;
    } catch {
      // Réponse sans corps JSON : le code HTTP suffit.
    }
    throw new ErreurApi(reponse.status, message);
  }

  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}

const json = (methode: string, corps: unknown): RequestInit => ({
  method: methode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(corps),
});

// ------------------------------------------------------------- inscription --

/** Ouvre un cadrage depuis la page d'accueil, sans invitation ni compte. */
export const ouvrirCadrage = (entree: Inscription) =>
  requete<CadrageCree>('/cadrage', json('POST', entree));

// ------------------------------------------------------------------ client --

export const lireSession = (token: string) => requete<Session>(`/cadrage/${token}`);

export const patcher = (token: string, patch: PatchSession) =>
  requete<{ majLe: string; dureeMs: number }>(`/cadrage/${token}`, json('PATCH', patch));

/** Dernière chance d'écrire un brouillon quand le navigateur suspend l'onglet. */
export function sauvegarderAvantFermeture(token: string, entree: SauvegardeUrgente): void {
  const url = `/api/cadrage/${token}/sauvegarde`;
  const corps = JSON.stringify(entree);
  if (
    navigator.sendBeacon &&
    navigator.sendBeacon(url, new Blob([corps], { type: 'application/json' }))
  ) {
    return;
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: corps,
    keepalive: true,
  });
}

/**
 * Écrit la réponse et rend ce que le modèle en tire. C'est le seul appel qui
 * fait attendre le client : il porte la reformulation et la contradiction.
 */
export const ecrireReponse = (token: string, point: number, entree: PutReponse) =>
  requete<SuiteReponse>(`/cadrage/${token}/reponse/${point}`, json('PUT', entree));

/** Marque un point relu et accepté, ou son arbitrage rendu. N'écrit aucun texte. */
export const marquerReponse = (
  token: string,
  point: number,
  drapeaux: { confirme?: boolean; arbitre?: boolean; deductionConfirmee?: boolean },
) => requete<Reponse>(`/cadrage/${token}/reponse/${point}`, json('PATCH', drapeaux));

export const lireOuverture = (token: string, point: number, rang = 0) =>
  requete<OuvertureGeneree | undefined>(
    `/cadrage/${token}/point/${point}/ouverture?rang=${rang}`,
  );

export const lireAide = (token: string, point: number) =>
  requete<AideGeneree>(`/cadrage/${token}/point/${point}/aide`);

export const analyser = (token: string) =>
  requete<AnalyseGeneree>(`/cadrage/${token}/analyse`, { method: 'POST' });

/** Importe les synthèses que le client vient explicitement d'accepter. */
export const appliquerAnalyse = (token: string) =>
  requete<{ appliques: number[] }>(`/cadrage/${token}/analyse/appliquer`, {
    method: 'POST',
  });

export const validerDossier = (token: string) =>
  requete<{ statut: 'valide'; valideLe: string; dureeMs: number }>(
    `/cadrage/${token}/valider`,
    { method: 'POST' },
  );

export function deposerFichier(token: string, fichier: File): Promise<Fichier> {
  const corps = new FormData();
  corps.append('fichier', fichier);
  return requete<Fichier>(`/cadrage/${token}/fichier`, { method: 'POST', body: corps });
}

export const retirerFichier = (token: string, id: string) =>
  requete<void>(`/cadrage/${token}/fichier/${id}`, { method: 'DELETE' });

export const lienFichier = (token: string, id: string) => `/api/cadrage/${token}/fichier/${id}`;

// ------------------------------------------------------------- prestataire --

const entete = (jeton: string): RequestInit => ({ headers: { authorization: `Bearer ${jeton}` } });

export const listerCadrages = (jeton: string) =>
  requete<ReponseCadrages>('/admin/cadrages', entete(jeton));

export const creerCadrage = (jeton: string, entree: CreationCadrage) =>
  requete<CadrageCree>('/admin/cadrages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
    body: JSON.stringify(entree),
  });

export const supprimerCadrage = (jeton: string, id: string) =>
  requete<void>(`/admin/cadrage/${id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${jeton}` },
  });
