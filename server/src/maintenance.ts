import { backup } from 'node:sqlite';
import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Base } from './db.ts';
import { config, dossierFichiers } from './config.ts';

const JOUR_MS = 24 * 60 * 60 * 1000;
const PREFIXE = 'cadrage-';

function nomSauvegarde(): string {
  return `${PREFIXE}${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

async function sauvegarder(db: Base): Promise<string | null> {
  if (!config.dossierSauvegardes) return null;
  const relatifAuxFichiers = relative(
    resolve(dossierFichiers),
    resolve(config.dossierSauvegardes),
  );
  if (
    !relatifAuxFichiers ||
    (!relatifAuxFichiers.startsWith(`..${sep}`) &&
      relatifAuxFichiers !== '..' &&
      !isAbsolute(relatifAuxFichiers))
  ) {
    throw new Error(
      'CADRAGE_BACKUP_DIR doit être placé hors du dossier des fichiers déposés.',
    );
  }
  await mkdir(config.dossierSauvegardes, { recursive: true });

  const nom = nomSauvegarde();
  const temporaire = join(config.dossierSauvegardes, `${nom}.tmp`);
  const destination = join(config.dossierSauvegardes, nom);
  await mkdir(temporaire);

  try {
    await backup(db, join(temporaire, 'cadrage.db'));
    if (existsSync(dossierFichiers)) {
      await cp(dossierFichiers, join(temporaire, 'fichiers'), {
        recursive: true,
        errorOnExist: true,
      });
    }
    await rename(temporaire, destination);
  } catch (cause) {
    await rm(temporaire, { recursive: true, force: true });
    throw cause;
  }

  const historiques = (await readdir(config.dossierSauvegardes, { withFileTypes: true }))
    .filter(
      (entree) =>
        entree.isDirectory() &&
        entree.name.startsWith(PREFIXE) &&
        !entree.name.endsWith('.tmp'),
    )
    .map((entree) => entree.name)
    .sort()
    .reverse();
  for (const ancien of historiques.slice(Math.max(1, config.sauvegardesMax))) {
    await rm(join(config.dossierSauvegardes, ancien), { recursive: true, force: true });
  }

  return destination;
}

/** Lance une copie au démarrage puis chaque jour ; rend la fonction d'arrêt. */
export function demarrerSauvegardes(
  db: Base,
  journal: {
    info: (contexte: object, message: string) => void;
    error: (contexte: object, message: string) => void;
  },
): () => Promise<void> {
  if (!config.dossierSauvegardes) return async () => {};

  let enCours = false;
  let courant: Promise<void> | null = null;
  const executer = () => {
    if (enCours) return;
    enCours = true;
    courant = sauvegarder(db)
      .then((destination) => journal.info({ destination }, 'sauvegarde terminée'))
      .catch((cause: unknown) => journal.error({ cause }, 'échec de la sauvegarde'))
      .finally(() => {
        enCours = false;
        courant = null;
      });
  };
  executer();
  const minuteur = setInterval(executer, JOUR_MS);
  minuteur.unref();
  return async () => {
    clearInterval(minuteur);
    await courant;
  };
}
