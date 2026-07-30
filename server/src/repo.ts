import { randomBytes, randomUUID } from 'node:crypto';
import type {
  CreationCadrage,
  DecisionHorsPerimetre,
  Echange,
  Maturite,
  Fichier,
  LigneCadrage,
  Mode,
  PatchSession,
  PutReponse,
  Reponse,
  Session,
  SourceReponse,
  StatsCadrages,
  Statut,
  Tension,
  Voie,
} from '../../shared/api.ts';
import { INDEX_HORS_PERIMETRE, INDEX_PERIMETRE, POINTS } from '../../shared/points.ts';
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
  rang: number | null;
  draft: string;
  brief: string;
  lien1: string;
  lien2: string;
  statut: string;
  duree_ms: number;
  cree_le: string;
  maj_le: string;
  valide_le: string | null;
  commence_le: string | null;
  maturite: string;
  courriel: string;
}

interface LigneReponse {
  point: number;
  texte: string;
  source: string;
  confirme: number;
  arbitre: number;
  deduction_confirmee: number;
  clos: number;
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

/** Les écritures composées doivent être atomiques, y compris quand elles s'appellent entre elles. */
const transactionsActives = new WeakSet<Base>();

export function dansTransaction<T>(db: Base, action: () => T): T {
  if (transactionsActives.has(db)) return action();
  db.exec('BEGIN IMMEDIATE');
  transactionsActives.add(db);
  try {
    const resultat = action();
    db.exec('COMMIT');
    return resultat;
  } catch (cause) {
    db.exec('ROLLBACK');
    throw cause;
  } finally {
    transactionsActives.delete(db);
  }
}

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
    .prepare(
      'SELECT point, texte, source, confirme, arbitre, deduction_confirmee, clos, maj_le FROM reponse WHERE cadrage_id = ? ORDER BY point',
    )
    .all(cadrageId) as unknown as LigneReponse[];
}

/** Le fil de chaque point, dans l'ordre où les questions ont été posées. */
export function echangesDe(db: Base, cadrageId: string): Record<string, Echange[]> {
  const lignes = db
    .prepare('SELECT point, question, reponse FROM echange WHERE cadrage_id = ? ORDER BY point, rang')
    .all(cadrageId) as unknown as Array<{ point: number; question: string; reponse: string }>;

  const par: Record<string, Echange[]> = {};
  for (const ligne of lignes) {
    (par[String(ligne.point)] ??= []).push({ question: ligne.question, reponse: ligne.reponse });
  }
  return par;
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

/**
 * Les textes déjà produits par le modèle pour ce cadrage, par point. Le contenu
 * est stocké en JSON ; une valeur nulle veut dire « rien à dire sur ce point ».
 */
function generations(db: Base, cadrageId: string, genre: string): Record<string, string> {
  const lignes = db
    .prepare('SELECT point, contenu FROM generation WHERE cadrage_id = ? AND genre = ?')
    .all(cadrageId, genre) as unknown as Array<{ point: number; contenu: string }>;

  const par: Record<string, string> = {};
  for (const ligne of lignes) {
    try {
      const valeur = JSON.parse(ligne.contenu) as unknown;
      if (typeof valeur === 'string' && valeur.trim()) par[String(ligne.point)] = valeur;
    } catch {
      // Contenu illisible : on l'ignore plutôt que de casser la session.
    }
  }
  return par;
}

/** Contradictions structurées encore nécessaires à une reprise de session. */
function tensions(db: Base, cadrageId: string): Record<string, Tension> {
  const lignes = db
    .prepare("SELECT point, contenu FROM generation WHERE cadrage_id = ? AND genre = 'tension'")
    .all(cadrageId) as unknown as Array<{ point: number; contenu: string }>;
  const resultat: Record<string, Tension> = {};

  for (const ligne of lignes) {
    try {
      const valeur = JSON.parse(ligne.contenu) as Partial<Tension> | null;
      if (
        valeur &&
        typeof valeur.explication === 'string' &&
        valeur.explication.trim() &&
        typeof valeur.optionA === 'string' &&
        typeof valeur.optionB === 'string'
      ) {
        resultat[String(ligne.point)] = {
          explication: valeur.explication,
          optionA: valeur.optionA,
          optionB: valeur.optionB,
        };
      }
    } catch {
      // Une génération corrompue ne doit pas empêcher l'ouverture du dossier.
    }
  }
  return resultat;
}

/** La décision conditionnelle qui fait exister, ou non, le point VI. */
function decisionHorsPerimetre(
  db: Base,
  cadrageId: string,
): DecisionHorsPerimetre | null {
  const ligne = db
    .prepare(
      'SELECT contenu FROM generation WHERE cadrage_id = ? AND point = ? AND genre = ?',
    )
    .get(cadrageId, INDEX_HORS_PERIMETRE, 'hors-perimetre') as
    | { contenu: string }
    | undefined;
  if (!ligne) return null;

  try {
    const valeur = JSON.parse(ligne.contenu) as Partial<DecisionHorsPerimetre>;
    if (typeof valeur.afficher !== 'boolean') return null;
    return {
      afficher: valeur.afficher,
      besoin: typeof valeur.besoin === 'string' ? valeur.besoin : '',
    };
  } catch {
    return null;
  }
}

/** Assemble l'état complet envoyé au navigateur à l'ouverture du lien. */
export function session(db: Base, ligne: LigneBase): Session {
  const reponses: Record<string, Reponse> = {};
  for (const r of reponsesDe(db, ligne.id)) {
    reponses[String(r.point)] = {
      texte: r.texte,
      source: r.source === 'document' ? 'document' : 'client',
      confirme: r.confirme === 1,
      arbitre: r.arbitre === 1,
      deductionConfirmee: r.deduction_confirmee === 1,
      clos: r.clos === 1,
      majLe: r.maj_le,
    };
  }

  return {
    client: {
      nom: ligne.client_nom,
      metier: ligne.client_metier,
      demande: ligne.demande,
      courriel: ligne.courriel || undefined,
    },
    mode: ligne.mode as Mode,
    voie: ligne.voie as Voie,
    step: ligne.step,
    rang: ligne.rang,
    draft: ligne.draft,
    brief: ligne.brief,
    lien1: ligne.lien1,
    lien2: ligne.lien2,
    statut: ligne.statut as Statut,
    maturite: ligne.maturite as Maturite | '',
    reponses,
    echanges: echangesDe(db, ligne.id),
    fichiers: fichiersDe(db, ligne.id).map(versFichier),
    creeLe: ligne.cree_le,
    commenceLe: ligne.commence_le,
    majLe: ligne.maj_le,
    valideLe: ligne.valide_le,
    dureeMs: ligne.duree_ms,
    reformulations: generations(db, ligne.id, 'reformulation'),
    deductions: generations(db, ligne.id, 'deduction'),
    tensions: tensions(db, ligne.id),
    horsPerimetre: decisionHorsPerimetre(db, ligne.id),
  };
}

// ----------------------------------------------------------------- écriture --

/** Ce que le cadrage retient de son origine, quand le client l'ouvre lui-même. */
export interface Provenance {
  courriel: string;
  ipEmpreinte: string;
  /** Le client est entré dans l'entretien dès l'ouverture, sans page d'accueil. */
  dejaEntre?: boolean;
  /** Où il en est : le modèle s'en sert pour doser ses questions. */
  maturite?: Maturite;
}

export function creer(db: Base, entree: CreationCadrage, provenance?: Provenance): LigneBase {
  if (!entree || typeof entree.nom !== 'string') {
    throw new ErreurRequete(400, 'Le nom du client est obligatoire.');
  }
  if (entree.metier !== undefined && typeof entree.metier !== 'string') {
    throw new ErreurRequete(400, "L'activité doit être du texte.");
  }
  if (entree.demande !== undefined && typeof entree.demande !== 'string') {
    throw new ErreurRequete(400, 'La demande doit être du texte.');
  }

  const nom = entree.nom.trim().replace(/\s+/g, ' ');
  const metier = entree.metier?.trim().replace(/\s+/g, ' ') ?? '';
  const demande = entree.demande?.trim().replace(/\s+/g, ' ') ?? '';
  if (!nom) throw new ErreurRequete(400, 'Le nom du client est obligatoire.');
  if (nom.length > 80) throw new ErreurRequete(400, 'Le nom dépasse 80 caractères.');
  if (metier.length > 140) throw new ErreurRequete(400, "L'activité dépasse 140 caractères.");
  if (demande.length > 600) throw new ErreurRequete(400, 'La demande dépasse 600 caractères.');

  const id = randomUUID();
  const token = nouveauJeton();
  const now = maintenant();

  db.prepare(
    `INSERT INTO cadrage (id, token, client_nom, client_metier, demande, courriel, ip_empreinte, commence_le, maturite, cree_le, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    token,
    nom,
    metier,
    demande,
    provenance?.courriel ?? '',
    provenance?.ipEmpreinte ?? '',
    provenance?.dejaEntre ? now : null,
    provenance?.maturite ?? '',
    now,
    now,
  );

  return parId(db, id)!;
}

/**
 * Combien de cadrages cette empreinte a ouverts depuis `depuis`. Sert à borner
 * les créations en rafale : chacune ouvre un entretien que le modèle paie.
 */
export function creationsDepuis(db: Base, ipEmpreinte: string, depuis: string): number {
  const ligne = db
    .prepare('SELECT COUNT(*) AS n FROM cadrage WHERE ip_empreinte = ? AND cree_le >= ?')
    .get(ipEmpreinte, depuis) as { n: number } | undefined;
  return ligne?.n ?? 0;
}

const CHAMPS_PATCH = {
  mode: 'mode',
  maturite: 'maturite',
  voie: 'voie',
  step: 'step',
  rang: 'rang',
  draft: 'draft',
  brief: 'brief',
  lien1: 'lien1',
  lien2: 'lien2',
} as const;

const LIMITES_TEXTE: Partial<Record<keyof PatchSession, number>> = {
  draft: 20_000,
  brief: 120_000,
  lien1: 2_000,
  lien2: 2_000,
};

function valider(patch: PatchSession): void {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ErreurRequete(400, 'Modification de session invalide.');
  }
  if (patch.mode !== undefined && patch.mode !== 'long' && patch.mode !== 'court') {
    throw new ErreurRequete(400, 'mode inconnu');
  }
  if (patch.voie !== undefined && patch.voie !== 'entretien' && patch.voie !== 'rapide') {
    throw new ErreurRequete(400, 'voie inconnue');
  }
  if (patch.maturite !== undefined && !['idee', 'forme', 'specs'].includes(patch.maturite)) {
    throw new ErreurRequete(400, 'point de départ inconnu');
  }
  if (patch.step !== undefined && (!Number.isInteger(patch.step) || patch.step < 0 || patch.step >= POINTS.length)) {
    throw new ErreurRequete(400, `step doit être un entier entre 0 et ${POINTS.length - 1}`);
  }
  if (patch.rang !== undefined && (!Number.isSafeInteger(patch.rang) || patch.rang < 0)) {
    throw new ErreurRequete(400, 'rang doit être un entier positif');
  }
  for (const [champ, maximum] of Object.entries(LIMITES_TEXTE)) {
    const valeur = patch[champ as keyof PatchSession];
    if (valeur !== undefined && typeof valeur !== 'string') {
      throw new ErreurRequete(400, `${champ} doit être du texte`);
    }
    if (typeof valeur === 'string' && valeur.length > maximum) {
      throw new ErreurRequete(413, `${champ} dépasse ${maximum} caractères`);
    }
  }
  for (const champ of ['lien1', 'lien2'] as const) {
    const valeur = patch[champ]?.trim();
    if (!valeur) continue;
    try {
      const url = new URL(valeur);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new ErreurRequete(400, `${champ} doit être une adresse HTTP ou HTTPS valide.`);
    }
  }
}

/** Toute modification de fond après validation doit être relue et validée à nouveau. */
function invaliderValidation(db: Base, cadrageId: string): void {
  db.prepare(
    "UPDATE cadrage SET statut = 'en_cours', valide_le = NULL WHERE id = ? AND statut = 'valide'",
  ).run(cadrageId);
}

/**
 * Applique la saisie en cours et fait avancer le compteur de durée. Une pause
 * de plus de cinq minutes n'est pas comptée : la « durée médiane » du tableau
 * de bord doit refléter le temps passé à répondre, pas l'onglet resté ouvert.
 */
export function appliquerPatch(db: Base, ligne: LigneBase, patch: PatchSession): LigneBase {
  return dansTransaction(db, () => appliquerPatchInterne(db, ligne, patch));
}

function appliquerPatchInterne(db: Base, ligne: LigneBase, patch: PatchSession): LigneBase {
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
  const modifieLeFond = (['mode', 'maturite', 'voie', 'brief', 'lien1', 'lien2'] as const).some(
    (champ) => patch[champ] !== undefined && patch[champ] !== ligne[CHAMPS_PATCH[champ]],
  );
  if (modifieLeFond) invaliderValidation(db, ligne.id);
  return parId(db, ligne.id)!;
}

export function ecrireReponse(
  db: Base,
  ligne: LigneBase,
  point: number,
  entree: PutReponse,
  source: SourceReponse = 'client',
): Reponse {
  return dansTransaction(db, () => ecrireReponseInterne(db, ligne, point, entree, source));
}

function ecrireReponseInterne(
  db: Base,
  ligne: LigneBase,
  point: number,
  entree: PutReponse,
  source: SourceReponse,
): Reponse {
  if (!Number.isInteger(point) || point < 0 || point >= POINTS.length) {
    throw new ErreurRequete(404, 'point inconnu');
  }
  if (typeof entree.texte !== 'string' || !entree.texte.trim()) {
    throw new ErreurRequete(400, 'La réponse ne peut pas être vide.');
  }
  if (entree.texte.length > 20_000) {
    throw new ErreurRequete(413, 'La réponse dépasse 20 000 caractères.');
  }

  const precedente = db
    .prepare('SELECT texte, source FROM reponse WHERE cadrage_id = ? AND point = ?')
    .get(ligne.id, point) as { texte: string; source: string } | undefined;
  const texteChange =
    precedente === undefined || precedente.texte !== entree.texte || precedente.source !== source;
  const now = maintenant();
  // Une reformulation et un arbitrage ne restent acquis que si le texte est
  // identique. `clos` reflète toujours l'écriture courante : réécrire une
  // ancienne réponse sans `clore` rouvre le point.
  db.prepare(
    `INSERT INTO reponse (cadrage_id, point, texte, source, confirme, arbitre, deduction_confirmee, clos, maj_le)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (cadrage_id, point) DO UPDATE SET
       texte    = excluded.texte,
       source   = excluded.source,
       confirme = CASE WHEN reponse.texte = excluded.texte AND reponse.source = excluded.source
                       THEN MAX(reponse.confirme, excluded.confirme)
                       ELSE excluded.confirme END,
       arbitre  = CASE WHEN reponse.texte = excluded.texte AND reponse.source = excluded.source
                       THEN MAX(reponse.arbitre, excluded.arbitre)
                       ELSE excluded.arbitre END,
       deduction_confirmee = CASE WHEN reponse.texte = excluded.texte AND reponse.source = excluded.source
                                  THEN reponse.deduction_confirmee
                                  ELSE 0 END,
       clos     = excluded.clos,
       maj_le   = excluded.maj_le`,
  ).run(
    ligne.id,
    point,
    entree.texte,
    source,
    entree.confirme ? 1 : 0,
    entree.arbitre ? 1 : 0,
    entree.clore ? 1 : 0,
    now,
  );

  // Tant que la nouvelle version du fil n'est pas refermée et réanalysée, les
  // contenus calculés sur l'ancienne réponse ne doivent plus ressortir après
  // un rechargement.
  if (texteChange) {
    db.prepare(
      `DELETE FROM generation
       WHERE cadrage_id = ? AND point = ? AND genre IN ('reformulation', 'deduction', 'tension')`,
    ).run(ligne.id, point);
    if (point === INDEX_PERIMETRE) {
      db.prepare(
        `DELETE FROM generation
         WHERE cadrage_id = ? AND point = ? AND genre = 'hors-perimetre'`,
      ).run(ligne.id, INDEX_HORS_PERIMETRE);
    }
  }

  db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(now, ligne.id);
  if (texteChange) invaliderValidation(db, ligne.id);

  const r = db
    .prepare(
      'SELECT point, texte, source, confirme, arbitre, deduction_confirmee, clos, maj_le FROM reponse WHERE cadrage_id = ? AND point = ?',
    )
    .get(ligne.id, point) as unknown as LigneReponse;

  return {
    texte: r.texte,
    source: r.source === 'document' ? 'document' : 'client',
    confirme: r.confirme === 1,
    arbitre: r.arbitre === 1,
    deductionConfirmee: r.deduction_confirmee === 1,
    clos: r.clos === 1,
    majLe: r.maj_le,
  };
}

/**
 * Marque une réponse déjà écrite : relue et acceptée, ou arbitrage rendu. C'est
 * une route à part de l'écriture du fil — sans quoi l'enregistrement de fond,
 * qui repasse les drapeaux, réécrirait le premier échange du point.
 */
export function marquerReponse(
  db: Base,
  ligne: LigneBase,
  point: number,
  drapeaux: { confirme?: boolean; arbitre?: boolean; deductionConfirmee?: boolean },
): Reponse {
  return dansTransaction(db, () => marquerReponseInterne(db, ligne, point, drapeaux));
}

function marquerReponseInterne(
  db: Base,
  ligne: LigneBase,
  point: number,
  drapeaux: { confirme?: boolean; arbitre?: boolean; deductionConfirmee?: boolean },
): Reponse {
  for (const [nom, valeur] of Object.entries(drapeaux)) {
    if (valeur !== undefined && typeof valeur !== 'boolean') {
      throw new ErreurRequete(400, `${nom} doit être un booléen.`);
    }
  }
  const now = maintenant();
  // Monotone, comme à l'écriture : un accord ne se retire pas tout seul, il ne
  // retombe qu'avec une réécriture du texte.
  const res = db
    .prepare(
      `UPDATE reponse SET confirme = MAX(confirme, ?), arbitre = MAX(arbitre, ?),
                           deduction_confirmee = MAX(deduction_confirmee, ?), maj_le = ?
       WHERE cadrage_id = ? AND point = ?`,
    )
    .run(
      drapeaux.confirme ? 1 : 0,
      drapeaux.arbitre ? 1 : 0,
      drapeaux.deductionConfirmee ? 1 : 0,
      now,
      ligne.id,
      point,
    );

  if (res.changes === 0) throw new ErreurRequete(404, "Ce point n'a pas encore de réponse.");
  db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(now, ligne.id);

  const r = db
    .prepare(
      'SELECT point, texte, source, confirme, arbitre, deduction_confirmee, clos, maj_le FROM reponse WHERE cadrage_id = ? AND point = ?',
    )
    .get(ligne.id, point) as unknown as LigneReponse;

  return {
    texte: r.texte,
    source: r.source === 'document' ? 'document' : 'client',
    confirme: r.confirme === 1,
    arbitre: r.arbitre === 1,
    deductionConfirmee: r.deduction_confirmee === 1,
    clos: r.clos === 1,
    majLe: r.maj_le,
  };
}

/**
 * Écrit une réponse dans le fil d'un point, puis recompose la réponse retenue
 * au dossier : les réponses du fil, dans l'ordre, une par ligne. Tout ce qui
 * lit le dossier — récapitulatif, tableau de bord, analyse — continue de lire
 * `reponse.texte` sans rien savoir du fil.
 */
export function ecrireEchange(
  db: Base,
  ligne: LigneBase,
  point: number,
  rang: number,
  question: string,
  entree: PutReponse,
): Reponse {
  return dansTransaction(db, () =>
    ecrireEchangeInterne(db, ligne, point, rang, question, entree),
  );
}

function ecrireEchangeInterne(
  db: Base,
  ligne: LigneBase,
  point: number,
  rang: number,
  question: string,
  entree: PutReponse,
): Reponse {
  if (!Number.isInteger(point) || point < 0 || point >= POINTS.length) {
    throw new ErreurRequete(404, 'point inconnu');
  }
  if (!Number.isSafeInteger(rang) || rang < 0) {
    throw new ErreurRequete(400, 'rang doit être un entier positif');
  }
  if (typeof entree.texte !== 'string' || !entree.texte.trim()) {
    throw new ErreurRequete(400, 'La réponse ne peut pas être vide.');
  }

  const now = maintenant();
  db.prepare(
    `INSERT INTO echange (cadrage_id, point, rang, question, reponse, maj_le)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (cadrage_id, point, rang) DO UPDATE SET
       question = excluded.question, reponse = excluded.reponse, maj_le = excluded.maj_le`,
  ).run(ligne.id, point, rang, question, entree.texte.trim(), now);

  // Réécrire une question du fil rend caduc ce qui la suivait : les réponses
  // d'après portaient sur des questions posées à partir d'un texte qui n'existe
  // plus.
  db.prepare('DELETE FROM echange WHERE cadrage_id = ? AND point = ? AND rang > ?').run(
    ligne.id,
    point,
    rang,
  );

  const fil = db
    .prepare('SELECT reponse FROM echange WHERE cadrage_id = ? AND point = ? ORDER BY rang')
    .all(ligne.id, point) as unknown as Array<{ reponse: string }>;

  return ecrireReponse(db, ligne, point, {
    ...entree,
    // Les questions posées mais pas encore répondues ne comptent pas.
    texte: fil.map((e) => e.reponse).filter((r) => r.trim()).join('\n'),
  });
}

/**
 * Range une question de suite dès qu'elle est posée, sans réponse. Sans cela
 * elle ne vivrait qu'en mémoire du navigateur : un client qui recharge en plein
 * fil perdrait la question qu'il avait sous les yeux.
 */
export function poserQuestion(
  db: Base,
  ligne: LigneBase,
  point: number,
  rang: number,
  question: string,
): void {
  db.prepare(
    `INSERT INTO echange (cadrage_id, point, rang, question, reponse, maj_le)
     VALUES (?, ?, ?, ?, '', ?)
     ON CONFLICT (cadrage_id, point, rang) DO UPDATE SET
       question = excluded.question, maj_le = excluded.maj_le`,
  ).run(ligne.id, point, rang, question, maintenant());
}

export function validerDossier(db: Base, ligne: LigneBase): LigneBase {
  const reponses = reponsesDe(db, ligne.id);
  const parPoint = new Map(reponses.map((reponse) => [reponse.point, reponse]));
  const decision = decisionHorsPerimetre(db, ligne.id);
  const visibles = POINTS.map((_, index) => index).filter(
    (index) =>
      index !== INDEX_HORS_PERIMETRE ||
      decision?.afficher === true ||
      (decision === null && parPoint.has(INDEX_HORS_PERIMETRE)),
  );
  const incomplets = visibles.filter((point) => {
    const reponse = parPoint.get(point);
    return !reponse?.texte.trim() || reponse.clos !== 1;
  });
  if (incomplets.length) {
    throw new ErreurRequete(
      409,
      `Le dossier est incomplet : ${incomplets
        .map((point) => `${POINTS[point].num} — ${POINTS[point].label}`)
        .join(', ')}.`,
    );
  }

  const tensionsParPoint = tensions(db, ligne.id);
  const tensionNonTranchee = visibles.find(
    (point) => tensionsParPoint[String(point)] && parPoint.get(point)?.arbitre !== 1,
  );
  if (tensionNonTranchee !== undefined) {
    throw new ErreurRequete(
      409,
      `Une contradiction reste à trancher au point ${POINTS[tensionNonTranchee].num}.`,
    );
  }

  if (ligne.mode === 'long') {
    const reformulations = generations(db, ligne.id, 'reformulation');
    const nonConfirmee = visibles.find(
      (point) => reformulations[String(point)] && parPoint.get(point)?.confirme !== 1,
    );
    if (nonConfirmee !== undefined) {
      throw new ErreurRequete(
        409,
        `La reformulation du point ${POINTS[nonConfirmee].num} doit être confirmée.`,
      );
    }
  }

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
  return dansTransaction(db, () => ajouterFichierInterne(db, cadrageId, entree));
}

function ajouterFichierInterne(
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
  invaliderValidation(db, cadrageId);

  return { id, nom: entree.nom, taille: entree.taille, typeMime: entree.typeMime, deposeLe: now };
}

export function supprimerFichier(db: Base, cadrageId: string, fichierId: string): void {
  dansTransaction(db, () => {
    db.prepare('DELETE FROM fichier WHERE cadrage_id = ? AND id = ?').run(cadrageId, fichierId);
    db.prepare('UPDATE cadrage SET maj_le = ? WHERE id = ?').run(maintenant(), cadrageId);
    invaliderValidation(db, cadrageId);
  });
}

export function supprimerCadrage(db: Base, id: string): void {
  db.prepare('DELETE FROM cadrage WHERE id = ?').run(id);
}

// -------------------------------------------------------- côté prestataire --

/**
 * Une tension est ouverte quand la réponse retenue est celle qui contredit un
 * point déjà noté, et que le client n'a pas encore tranché.
 */
function tensionOuverte(db: Base, cadrageId: string, reponses: LigneReponse[]): boolean {
  const generees = tensions(db, cadrageId);
  return reponses.some((r) => {
    if (generees[String(r.point)] && r.arbitre === 0) return true;
    const point = POINTS[r.point];
    if (point?.tensionOn === undefined) return false;
    return (
      r.texte
        .split('\n')
        .some((ligne) => ligne.trim() === point.props[point.tensionOn!]) &&
      r.arbitre === 0
    );
  });
}

export function lister(db: Base): { stats: StatsCadrages; cadrages: LigneCadrage[] } {
  const lignes = db.prepare('SELECT * FROM cadrage ORDER BY maj_le DESC').all() as unknown as LigneBase[];

  const cadrages: LigneCadrage[] = lignes.map((ligne) => {
    const reponses = reponsesDe(db, ligne.id);
    const repondus = new Set(reponses.map((r) => r.point));
    const decision = decisionHorsPerimetre(db, ligne.id);
    const horsPerimetreIgnore =
      decision?.afficher === false ||
      (decision === null &&
        repondus.has(INDEX_PERIMETRE) &&
        !repondus.has(INDEX_HORS_PERIMETRE));
    const visibles = POINTS.map((_, index) => index).filter(
      (index) => index !== INDEX_HORS_PERIMETRE || !horsPerimetreIgnore,
    );

    // Le point en cours est le premier trou parmi les points réellement utiles.
    let enCours: number | null = null;
    for (const i of visibles) {
      if (!repondus.has(i)) {
        enCours = i;
        break;
      }
    }

    return {
      id: ligne.id,
      token: ligne.token,
      client: {
        nom: ligne.client_nom,
        metier: ligne.client_metier,
        demande: ligne.demande,
        courriel: ligne.courriel || undefined,
      },
      voie: ligne.voie as Voie,
      mode: ligne.mode as Mode,
      statut: ligne.statut as Statut,
      // Un point conditionnel ignoré est couvert sans réponse : il ne doit pas
      // empêcher un dossier complet d'atteindre 100 %.
      couverture:
        repondus.size -
        (horsPerimetreIgnore && repondus.has(INDEX_HORS_PERIMETRE) ? 1 : 0) +
        (horsPerimetreIgnore ? 1 : 0),
      pointsCouverts: POINTS.map((_, index) => index).filter(
        (index) => repondus.has(index) || (index === INDEX_HORS_PERIMETRE && horsPerimetreIgnore),
      ),
      enCours: ligne.statut === 'valide' ? null : enCours,
      tensionOuverte: tensionOuverte(db, ligne.id, reponses),
      maturite: ligne.maturite as Maturite | '',
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
