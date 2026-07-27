import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Le schéma. Un cadrage porte l'état de l'entretien ; les réponses vivent à
 * part, une ligne par point, pour que l'écriture d'un point n'écrase jamais
 * celle d'un autre — c'est ce qui rend l'enregistrement au fil de l'eau sûr.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS cadrage (
  id            TEXT PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  client_nom    TEXT NOT NULL,
  client_metier TEXT NOT NULL DEFAULT '',
  demande       TEXT NOT NULL DEFAULT '',
  mode          TEXT NOT NULL DEFAULT 'long',
  voie          TEXT NOT NULL DEFAULT 'entretien',
  step          INTEGER NOT NULL DEFAULT 0,
  draft         TEXT NOT NULL DEFAULT '',
  brief         TEXT NOT NULL DEFAULT '',
  lien1         TEXT NOT NULL DEFAULT '',
  lien2         TEXT NOT NULL DEFAULT '',
  statut        TEXT NOT NULL DEFAULT 'en_cours',
  duree_ms      INTEGER NOT NULL DEFAULT 0,
  cree_le       TEXT NOT NULL,
  maj_le        TEXT NOT NULL,
  valide_le     TEXT
);

CREATE INDEX IF NOT EXISTS cadrage_maj_le ON cadrage (maj_le DESC);

CREATE TABLE IF NOT EXISTS reponse (
  cadrage_id TEXT NOT NULL REFERENCES cadrage(id) ON DELETE CASCADE,
  point      INTEGER NOT NULL,
  texte      TEXT NOT NULL,
  confirme   INTEGER NOT NULL DEFAULT 0,
  arbitre    INTEGER NOT NULL DEFAULT 0,
  maj_le     TEXT NOT NULL,
  PRIMARY KEY (cadrage_id, point)
);

-- Ce que le modèle a produit pour ce cadrage. Mis en cache pour deux raisons :
-- le client qui recharge sa page doit revoir exactement les mêmes propositions,
-- et chaque génération se paie. La colonne cle porte l'empreinte de l'entrée :
-- quand le client réécrit sa réponse, la reformulation se régénère d'elle-même.
CREATE TABLE IF NOT EXISTS generation (
  cadrage_id TEXT NOT NULL REFERENCES cadrage(id) ON DELETE CASCADE,
  point      INTEGER NOT NULL,
  genre      TEXT NOT NULL,
  cle        TEXT NOT NULL,
  contenu    TEXT NOT NULL,
  cree_le    TEXT NOT NULL,
  PRIMARY KEY (cadrage_id, point, genre)
);

CREATE TABLE IF NOT EXISTS fichier (
  id         TEXT PRIMARY KEY,
  cadrage_id TEXT NOT NULL REFERENCES cadrage(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  taille     INTEGER NOT NULL,
  type_mime  TEXT NOT NULL DEFAULT '',
  chemin     TEXT NOT NULL,
  depose_le  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS fichier_cadrage ON fichier (cadrage_id);
`;

export function ouvrirBase(fichier: string): DatabaseSync {
  mkdirSync(dirname(fichier), { recursive: true });
  const db = new DatabaseSync(fichier);
  // WAL : la lecture du tableau de bord ne bloque pas l'écriture d'un client
  // en train de répondre.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export type Base = DatabaseSync;
