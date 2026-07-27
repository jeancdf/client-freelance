import { randomBytes, randomUUID } from 'node:crypto';
import { POINTS } from '../../shared/points.ts';
import type {
  CreationCadrage,
  Fichier,
  LigneCadrage,
  Mode,
  PatchSession,
  PutReponse,
  Reponse,
  Session,
  StatsCadrages,
  Statut,
  Voie,
} from '../../shared/api.ts';
import type { Base } from './db.ts';

/** Au-delà, on considère que le client a quitté : le temps ne compte plus. */
const PAUSE_MS = 5 * 60 * 1000;

/** Sans signe de vie depuis, un cadrage est « dormant » pour le prestataire. */
export const SEUIL_DORMANT_MS = 7 * 24 * 60 * 60 * 1000;

interface LigneBase {
  id: string;
  token: string;
  client_nom: string;
  client_metier: string;
  demande: string;
  mode: string;
  voie: string;
  step: number;
  draft: string;
  brief: string;
  lien1: string;
  lien2: string;
  statut: string;
  duree_ms: number;
  cree_le: string;
  maj_le: string;
  valide_le: string | null;
}

interface LigneReponse {
  point: number;
  texte: string;
  confirme: number;
  arbitre: number;
  maj_le: string;
}

interface LigneFichier {
  id: string;
  nom: string;
  taille: number;
  type_mime: string;
  chemin: string;
  depose_le: string;
}

const maintenant = () => new Date().toISOString();

export function nouveauJeton(): string {
  return randomBytes(24).toString('base64url');
}

/** Une erreur destinée au client, avec le code HTTP à renvoyer. */
export class ErreurRequete extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ------------------------------------------------------------------ lecture --

export function parToken(db: Base, token: string): LigneBase | undefined {
  return db.prepare('SELECT * FROM cadrage WHERE token = ?').get(token) as LigneBase | undefined;
}

export function parId(db: Base, id: string): LigneBase | undefined {
  return db.prepare('SELECT * FROM cadrage WHERE id = ?').get(id) as LigneBase | undefined;
}

function reponsesDe(db: Base, cadrageId: string): LigneReponse[] {
  return db
    .prepare('SELECT point, texte, confirme, arbitre, maj_le FROM reponse WHERE cadrage_id = ? ORDER BY point')
    .all(cadrageId) as unknown as LigneReponse[];
}

export function fichiersDe(db: Base, cadrageId: string): LigneFichier[] {
  return db
    .prepare(
      'SELECT id, nom, taille, type_mime, chemin, depose_le FROM fichier WHERE cadrage_id = ? ORDER BY depose_le',
    )
    .all(cadrageId) as unknown as LigneFichier[];
}

export function fichierParId(db: Base, cadrageId: string, fichierId: string): LigneFichier | undefined {
  return db
    .prepare('SELECT id, nom, taille, type_mime, chemin, depose_le FROM fichier WHERE cadrage_id = ? AND id = ?')
    .get(cadrageId, fichierId) as LigneFichier | undefined;
}

function versFichier(ligne: LigneFichier): Fichier {
  return {
    id: ligne.id,
    nom: ligne.nom,
    taille: ligne.taille,
    typeMime: ligne.type_mime,
    deposeLe: ligne.depose_le,
  };
}

/** Assemble l'état complet envoyé au navigateur à l'ouverture du lien. */
export function session(db: Base, ligne: LigneBase): Session {
  const reponses: Record<string, Reponse> = {};
  for (const r of reponsesDe(db, ligne.id)) {
    reponses[String(r.point)] = {
      texte: r.texte,
      confirme: r.confirme === 1,
      arbitre: r.arbitre === 1,
      majLe: r.maj_le,
    };
  }

  return {
    client: { nom: ligne.client_nom, metier: ligne.client_metier, demande: ligne.demande },
    mode: ligne.mode as Mode,
    voie: ligne.voie as Voie,
    step: ligne.step,
    draft: ligne.draft,
    brief: ligne.brief,
    lien1: ligne.lien1,
    lien2: ligne.lien2,
    statut: ligne.statut as Statut,
    reponses,
    fichiers: fichiersDe(db, ligne.id).map(versFichier),
    creeLe: ligne.cree_le,
    majLe: ligne.maj_le,
    valideLe: ligne.valide_le,
    dureeMs: ligne.duree_ms,
  };
}

// ----------------------------------------------------------------- écriture --

export function creer(db: Base, entree: CreationCadrage): LigneBase {
  const nom = entree.nom.trim();
  if (!nom) throw new ErreurRequete(400, 'Le nom du client est obligatoire.');

  const id = randomUUID();
  const token = nouveauJeton();
  const now = maintenant();

  db.prepare(
    `INSERT INTO cadrage (id, token, client_nom, client_metier, demande, cree_le, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, token, nom, entree.metier?.trim() ?? '', entree.demande?.trim() ?? '', now, now);

  return parId(db, id)!;
}

const CHAMPS_PATCH = {
  mode: 'mode',
  voie: 'voie',
  step: 'step',
  draft: 'draft',
  brief: 'brief',
  lien1: 'lien1',
  lien2: 'lien2',
} as const;

function valider(patch: PatchSession): void {
  if (patch.mode !== undefined && patch.mode !== 'long' && patch.mode !== 'court') {
    throw new ErreurRequete(400, 'mode inconnu');
  }
  if (patch.voie !== undefined && patch.voie !== 'entretien' && patch.voie !== 'rapide') {
    throw new ErreurRequete(400, 'voie inconnue');
  }
  if (patch.step !== undefined && (!Number.isInteger(patch.step) || patch.step < 0 || patch.step >= POINTS.length)) {
    throw new ErreurRequete(400, `step doit être un entier entre 0 et ${POINTS.length - 1}`);
  }
}

/**
 * Applique la saisie en cours et fait avancer le compteur de durée. Une pause
 * de plus de cinq minutes n'est pas comptée : la « durée médiane » du tableau
 * de bord doit refléter le temps passé à répondre, pas l'onglet resté ouvert.
 */
export function appliquerPatch(db: Base, ligne: LigneBase, patch: PatchSession): LigneBase {
  valider(patch);

  const colonnes: string[] = [];
  const valeurs: Array<string | number> = [];
  for (const [cle, colonne] of Object.entries(CHAMPS_PATCH)) {
    const valeur = patch[cle as keyof PatchSession];
    if (valeur === undefined) continue;
    colonnes.push(`${colonne} = ?`);
    valeurs.push(valeur as string | number);
  }

  const now = maintenant();
  const ecoule = Date.parse(now) - Date.parse(ligne.maj_le);
  const duree = ligne.duree_ms + (ecoule > 0 && ecoule < PAUSE_MS ? ecoule : 0);

  colonnes.push('maj_le = ?', 'duree_ms = ?');
  valeurs.push(now, duree, ligne.id);

  db.prepare(`UPDATE cadrage SET ${colonnes.join(', ')} WHERE id = ?`).run(...valeurs);
  return parId(db, ligne.id)!;
}

export function ecrireReponse(db: Base, ligne: LigneBase, point: number, entree: PutReponse): Reponse {
  if (!Number.isInteger(point) || point < 0 || point >= POINTS.length) {
    throw new ErreurRequete(404, 'point inconnu');
  }
  if (typeof entree.texte !== 'string' || !entree.texte.trim()) {
    throw new ErreurRequete(400, 'La réponse ne peut pas être vide.');
  }

  const now = maintenant();
  // Le drapeau `confirme` ne retombe jamais tout seul : une reformulation
  // acceptée le reste tant que le client ne réécrit pas le point.
  db.prepare(
    `INSERT INTO reponse (cadrage_id, point, texte, confirme, arbitre, maj_le)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (cadrage_id, point) DO UPDATE SET
       texte    = excluded.texte,
       confirme = CASE WHEN reponse.texte = excluded.texte
                       THEN MAX(reponse.confirme, excluded.confirme)
                       ELSE excluded.confirme END,
       arbitre  = MAX(reponse.arbitre, excluded.arbitre),
       maj_le   = excluded.maj_le`,
  ).run(ligne.id, point, entree.texte, entree.confirme ? 1 : 0, entree.arbitre ? 1 : 0, now);

  db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(now, ligne.id);

  const r = db
    .prepare('SELECT point, texte, confirme, arbitre, maj_le FROM reponse WHERE cadrage_id = ? AND point = ?')
    .get(ligne.id, point) as unknown as LigneReponse;

  return { texte: r.texte, confirme: r.confirme === 1, arbitre: r.arbitre === 1, majLe: r.maj_le };
}

export function validerDossier(db: Base, ligne: LigneBase): LigneBase {
  const now = maintenant();
  db.prepare('UPDATE cadrage SET statut = ?, valide_le = ?, maj_le = ? WHERE id = ?').run(
    'valide',
    ligne.valide_le ?? now,
    now,
    ligne.id,
  );
  return parId(db, ligne.id)!;
}

export function ajouterFichier(
  db: Base,
  cadrageId: string,
  entree: { nom: string; taille: number; typeMime: string; chemin: string },
): Fichier {
  const id = randomUUID();
  const now = maintenant();
  db.prepare(
    `INSERT INTO fichier (id, cadrage_id, nom, taille, type_mime, chemin, depose_le)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, cadrageId, entree.nom, entree.taille, entree.typeMime, entree.chemin, now);
  db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(now, cadrageId);

  return { id, nom: entree.nom, taille: entree.taille, typeMime: entree.typeMime, deposeLe: now };
}

export function supprimerFichier(db: Base, cadrageId: string, fichierId: string): void {
  db.prepare('DELETE FROM fichier WHERE cadrage_id = ? AND id = ?').run(cadrageId, fichierId);
  db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(maintenant(), cadrageId);
}

export function supprimerCadrage(db: Base, id: string): void {
  db.prepare('DELETE FROM cadrage WHERE id = ?').run(id);
}

// -------------------------------------------------------- côté prestataire --

/**
 * Une tension est ouverte quand la réponse retenue est celle qui contredit un
 * point déjà noté, et que le client n'a pas encore tranché.
 */
function tensionOuverte(reponses: LigneReponse[]): boolean {
  return reponses.some((r) => {
    const point = POINTS[r.point];
    if (point?.tensionOn === undefined) return false;
    return r.texte === point.props[point.tensionOn] && r.arbitre === 0;
  });
}

export function lister(db: Base): { stats: StatsCadrages; cadrages: LigneCadrage[] } {
  const lignes = db.prepare('SELECT * FROM cadrage ORDER BY maj_le DESC').all() as unknown as LigneBase[];

  const cadrages: LigneCadrage[] = lignes.map((ligne) => {
    const reponses = reponsesDe(db, ligne.id);
    const repondus = new Set(reponses.map((r) => r.point));
    // Le point en cours est le premier trou dans la suite des huit points.
    let enCours: number | null = null;
    for (let i = 0; i < POINTS.length; i++) {
      if (!repondus.has(i)) {
        enCours = i;
        break;
      }
    }

    return {
      id: ligne.id,
      token: ligne.token,
      client: { nom: ligne.client_nom, metier: ligne.client_metier, demande: ligne.demande },
      voie: ligne.voie as Voie,
      mode: ligne.mode as Mode,
      statut: ligne.statut as Statut,
      couverture: repondus.size,
      enCours: ligne.statut === 'valide' ? null : enCours,
      tensionOuverte: tensionOuverte(reponses),
      dureeMs: ligne.duree_ms,
      majLe: ligne.maj_le,
      valideLe: ligne.valide_le,
    };
  });

  return { stats: calculerStats(cadrages), cadrages };
}

function mediane(valeurs: number[]): number {
  if (!valeurs.length) return 0;
  const tri = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(tri.length / 2);
  return tri.length % 2 ? tri[milieu] : Math.round((tri[milieu - 1] + tri[milieu]) / 2);
}

function calculerStats(cadrages: LigneCadrage[]): StatsCadrages {
  const total = cadrages.length;
  const limite = Date.now() - SEUIL_DORMANT_MS;

  const couvertureTotale = cadrages.reduce((somme, c) => somme + c.couverture, 0);
  const dureesValidees = cadrages.filter((c) => c.statut === 'valide').map((c) => c.dureeMs);

  return {
    total,
    tauxAchevement: total ? Math.round((couvertureTotale / (total * POINTS.length)) * 100) : 0,
    dureeMedianeMs: mediane(dureesValidees),
    parVoieRapide: cadrages.filter((c) => c.voie === 'rapide').length,
    tensionsOuvertes: cadrages.filter((c) => c.tensionOuverte).length,
    enCours: cadrages.filter((c) => c.statut === 'en_cours' && Date.parse(c.majLe) >= limite).length,
    aChiffrer: cadrages.filter((c) => c.statut === 'valide').length,
    dormants: cadrages.filter((c) => c.statut === 'en_cours' && Date.parse(c.majLe) < limite).length,
  };
}
