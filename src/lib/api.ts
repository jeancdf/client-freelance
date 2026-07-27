import type {
  AideGeneree,
  AnalyseGeneree,
  CadrageCree,
  CreationCadrage,
  Fichier,
  PatchSession,
  Propositions,
  PutReponse,
  ReponseCadrages,
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

// ------------------------------------------------------------------ client --

export const lireSession = (token: string) => requete<Session>(`/cadrage/${token}`);

export const patcher = (token: string, patch: PatchSession) =>
  requete<{ majLe: string; dureeMs: number }>(`/cadrage/${token}`, json('PATCH', patch));

/**
 * Écrit la réponse et rend ce que le modèle en tire. C'est le seul appel qui
 * fait attendre le client : il porte la reformulation et la contradiction.
 */
export const ecrireReponse = (token: string, point: number, entree: PutReponse) =>
  requete<SuiteReponse>(`/cadrage/${token}/reponse/${point}`, json('PUT', entree));

export const lirePropositions = (token: string, point: number) =>
  requete<Propositions>(`/cadrage/${token}/point/${point}/propositions`);

export const lireAide = (token: string, point: number) =>
  requete<AideGeneree>(`/cadrage/${token}/point/${point}/aide`);

export const analyser = (token: string) =>
  requete<AnalyseGeneree>(`/cadrage/${token}/analyse`, { method: 'POST' });

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
