import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, it } from 'node:test';
import type { Base } from './db.ts';

let racine = '';
let db: Base;
let arreter = async () => {};

before(async () => {
  racine = mkdtempSync(join(tmpdir(), 'cadrage-backup-'));
  process.env.CADRAGE_DATA = join(racine, 'data');
  process.env.CADRAGE_BACKUP_DIR = join(racine, 'backups');

  const [{ ouvrirBase }, configModule] = await Promise.all([
    import('./db.ts'),
    import('./config.ts'),
  ]);
  db = ouvrirBase(configModule.cheminBase);
  mkdirSync(configModule.dossierFichiers, { recursive: true });
  writeFileSync(join(configModule.dossierFichiers, 'piece.txt'), 'contenu à sauvegarder');
});

after(async () => {
  await arreter();
  db.close();
  rmSync(racine, { recursive: true, force: true });
});

it('sauvegarde la base et les fichiers déposés dans un instantané séparé', async () => {
  const { demarrerSauvegardes } = await import('./maintenance.ts');
  const destination = await new Promise<string>((resolve, reject) => {
    const expiration = setTimeout(() => reject(new Error('sauvegarde trop lente')), 5_000);
    arreter = demarrerSauvegardes(db, {
      info: (contexte) => {
        clearTimeout(expiration);
        resolve(String((contexte as { destination: string }).destination));
      },
      error: (contexte) => {
        clearTimeout(expiration);
        reject((contexte as { cause: unknown }).cause);
      },
    });
  });

  assert.equal(existsSync(join(destination, 'cadrage.db')), true);
  assert.equal(existsSync(join(destination, 'fichiers', 'piece.txt')), true);
});
