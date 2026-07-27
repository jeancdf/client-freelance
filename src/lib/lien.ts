const CLE_JETON_ADMIN = 'cadrage.jetonAdmin';

/**
 * Le jeton du client, lu dans son lien : `…/?c=<jeton>` ou `…/c/<jeton>`.
 * Absent, l'application tourne en démonstration et n'enregistre rien.
 */
export function jetonDuLien(url = window.location.href): string | null {
  const adresse = new URL(url);

  const requete = adresse.searchParams.get('c');
  if (requete) return requete;

  const chemin = /^\/c\/([A-Za-z0-9_-]+)\/?$/.exec(adresse.pathname);
  return chemin ? chemin[1] : null;
}

/** Le jeton du prestataire, gardé sur son poste — jamais dans une URL. */
export function jetonAdmin(): string | null {
  try {
    return window.localStorage.getItem(CLE_JETON_ADMIN);
  } catch {
    // Stockage refusé (navigation privée stricte) : on redemandera le jeton.
    return null;
  }
}

export function enregistrerJetonAdmin(jeton: string | null): void {
  try {
    if (jeton) window.localStorage.setItem(CLE_JETON_ADMIN, jeton);
    else window.localStorage.removeItem(CLE_JETON_ADMIN);
  } catch {
    // Sans stockage, le jeton vaut pour la session en cours seulement.
  }
}
