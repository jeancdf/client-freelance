const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 21 h 48 » — l'heure à la française, séparateur compris. */
export function heure(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

/** « 12 mars 2026 », ou « 1er mars 2026 ». */
export function dateLongue(iso: string): string {
  const d = new Date(iso);
  const jour = d.getDate() === 1 ? '1er' : String(d.getDate());
  return `${jour} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** « 12 mars », sans l'année : pour les colonnes serrées. */
export function dateCourte(iso: string): string {
  const d = new Date(iso);
  const jour = d.getDate() === 1 ? '1er' : String(d.getDate());
  return `${jour} ${MOIS[d.getMonth()]}`;
}

function memeJour(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Le dernier signe de vie, dit comme on le dirait à l'oral : précis tant que
 * c'est récent, puis de plus en plus vague.
 */
export function depuis(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const minutes = Math.floor((maintenant.getTime() - d.getTime()) / 60000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  if (memeJour(d, maintenant)) return `aujourd'hui à ${heure(iso)}`;

  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (memeJour(d, hier)) return `hier à ${heure(iso)}`;

  return dateCourte(iso);
}

/** Le temps passé, arrondi à la minute, jamais « 0 minute ». */
export function minutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}

export function joursDepuis(iso: string, maintenant = new Date()): number {
  return Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 86400000);
}
