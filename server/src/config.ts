import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const racine = resolve(ici, '../..');

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  /** Où vivent la base et les fichiers déposés. */
  dossierDonnees: resolve(process.env.CADRAGE_DATA ?? join(racine, 'server/data')),
  /** Base de l'URL envoyée au client, pour construire ses liens. */
  baseUrl: process.env.CADRAGE_BASE_URL ?? 'http://localhost:5173',
  /** Sert `dist/` en plus de l'API : un seul processus en production. */
  servirDist: process.env.CADRAGE_SERVE_DIST === '1',
  dossierDist: join(racine, 'dist'),
  tailleMaxFichier: Number(process.env.CADRAGE_MAX_UPLOAD ?? 25 * 1024 * 1024),
};

export const cheminBase = join(config.dossierDonnees, 'cadrage.db');
export const dossierFichiers = join(config.dossierDonnees, 'fichiers');

/**
 * Le jeton d'administration. Fourni par l'environnement en production ; à
 * défaut on en fabrique un et on le garde sur disque, pour qu'un `npm run dev`
 * marche sans réglage préalable sans pour autant tourner sans protection.
 */
export function jetonAdmin(): { jeton: string; genere: boolean } {
  const fourni = process.env.CADRAGE_ADMIN_TOKEN;
  if (fourni) return { jeton: fourni, genere: false };

  mkdirSync(config.dossierDonnees, { recursive: true });
  const fichier = join(config.dossierDonnees, 'admin-token.txt');
  if (existsSync(fichier)) {
    return { jeton: readFileSync(fichier, 'utf8').trim(), genere: true };
  }

  const jeton = randomBytes(24).toString('base64url');
  writeFileSync(fichier, jeton + '\n', { mode: 0o600 });
  return { jeton, genere: true };
}
