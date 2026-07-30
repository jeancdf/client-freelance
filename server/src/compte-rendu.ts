import { createHash } from 'node:crypto';
import type {
  Arbitrage,
  ChoixArbitrage,
  SourceReponse,
  Tension,
} from '../../shared/api.ts';
import { POINTS } from '../../shared/points.ts';
import type { Base } from './db.ts';

export const VERSION_COMPTE_RENDU = 'compte-rendu-structure-v1';

export interface LignePourCompteRendu {
  id: string;
  client_metier: string;
  demande: string;
  mode: string;
  maturite: string;
  lien1: string;
  lien2: string;
  compte_rendu_lu_cle: string;
}

export interface PointSourceCompteRendu {
  index: number;
  numero: string;
  titre: string;
  reponse: string;
  source: SourceReponse;
  reformulation?: string;
  deduction?: string;
  tension?: Tension;
  arbitrage?: Arbitrage;
}

export interface SourceCompteRendu {
  activite: string;
  demande: string;
  maturite: string;
  mode: string;
  points: PointSourceCompteRendu[];
  references: {
    liens: string[];
    fichiers: Array<{ id: string; nom: string }>;
  };
}

export interface SourceModeleCompteRendu
  extends Omit<SourceCompteRendu, 'references'> {
  references: { nombreLiens: number; nombreFichiers: number };
}

interface LigneReponseCompteRendu {
  point: number;
  texte: string;
  source: string;
  confirme: number;
  arbitre: number;
  arbitrage_choix: string | null;
  arbitrage_texte: string;
  deduction_confirmee: number;
}

function contenuGeneration<T>(
  db: Base,
  cadrageId: string,
  point: number,
  genre: string,
): T | null {
  const ligne = db
    .prepare(
      'SELECT contenu FROM generation WHERE cadrage_id = ? AND point = ? AND genre = ?',
    )
    .get(cadrageId, point, genre) as { contenu: string } | undefined;
  if (!ligne) return null;
  try {
    return JSON.parse(ligne.contenu) as T;
  } catch {
    return null;
  }
}

function arbitrageDe(ligne: LigneReponseCompteRendu): Arbitrage | undefined {
  if (ligne.arbitre !== 1) return undefined;
  const choixValides: ChoixArbitrage[] = [
    'option_a',
    'option_b',
    'les_deux',
    'legacy_unknown',
  ];
  const choix = choixValides.includes(ligne.arbitrage_choix as ChoixArbitrage)
    ? (ligne.arbitrage_choix as ChoixArbitrage)
    : 'legacy_unknown';
  return {
    choix,
    libelle:
      ligne.arbitrage_texte.trim() ||
      (choix === 'legacy_unknown'
        ? 'Décision antérieure dont le choix exact n’a pas été historisé.'
        : 'Arbitrage effectué.'),
  };
}

/** Assemble uniquement les éléments acceptés qui peuvent fonder le document final. */
export function sourceCompteRendu(
  db: Base,
  ligne: LignePourCompteRendu,
): SourceCompteRendu {
  const reponses = db
    .prepare(
      `SELECT point, texte, source, confirme, arbitre, arbitrage_choix,
              arbitrage_texte, deduction_confirmee
       FROM reponse WHERE cadrage_id = ? AND clos = 1 ORDER BY point`,
    )
    .all(ligne.id) as unknown as LigneReponseCompteRendu[];

  const points = reponses.flatMap((reponse): PointSourceCompteRendu[] => {
    const point = POINTS[reponse.point];
    if (!point || !reponse.texte.trim()) return [];

    const reformulation =
      reponse.confirme === 1
        ? contenuGeneration<string>(db, ligne.id, reponse.point, 'reformulation')
        : null;
    const deduction =
      reponse.deduction_confirmee === 1
        ? contenuGeneration<string>(db, ligne.id, reponse.point, 'deduction')
        : null;
    const tension = contenuGeneration<Tension>(db, ligne.id, reponse.point, 'tension');

    return [
      {
        index: reponse.point,
        numero: point.num,
        titre: point.label,
        reponse: reponse.texte.trim(),
        source: reponse.source === 'document' ? 'document' : 'client',
        ...(reformulation?.trim() ? { reformulation: reformulation.trim() } : {}),
        ...(deduction?.trim() ? { deduction: deduction.trim() } : {}),
        ...(tension ? { tension } : {}),
        ...(reponse.arbitre === 1 ? { arbitrage: arbitrageDe(reponse) } : {}),
      },
    ];
  });

  const fichiers = db
    .prepare('SELECT id, nom FROM fichier WHERE cadrage_id = ? ORDER BY depose_le, id')
    .all(ligne.id) as unknown as Array<{ id: string; nom: string }>;

  return {
    activite: ligne.client_metier.trim(),
    demande: ligne.demande.trim(),
    maturite: ligne.maturite,
    mode: ligne.mode,
    points,
    references: {
      liens: [ligne.lien1, ligne.lien2].map((lien) => lien.trim()).filter(Boolean),
      fichiers,
    },
  };
}

/** Empreinte commune au cache, au témoin de lecture et à la validation finale. */
export function cleCompteRendu(db: Base, ligne: LignePourCompteRendu): string {
  return createHash('sha256')
    .update(`${VERSION_COMPTE_RENDU}|${JSON.stringify(sourceCompteRendu(db, ligne))}`)
    .digest('hex')
    .slice(0, 32);
}

export function compteRenduLu(db: Base, ligne: LignePourCompteRendu): boolean {
  const cle = cleCompteRendu(db, ligne);
  if (ligne.compte_rendu_lu_cle !== cle) return false;
  const cache = db
    .prepare(
      "SELECT 1 FROM generation WHERE cadrage_id = ? AND point = -1 AND genre = 'compte-rendu' AND cle = ?",
    )
    .get(ligne.id, cle);
  return Boolean(cache);
}

/** Le prompt ne reçoit jamais les noms de fichiers ni les URL, seulement leur présence. */
export function sourcePourModele(source: SourceCompteRendu): SourceModeleCompteRendu {
  return {
    activite: source.activite,
    demande: source.demande,
    maturite: source.maturite,
    mode: source.mode,
    points: source.points,
    references: {
      nombreLiens: source.references.liens.length,
      nombreFichiers: source.references.fichiers.length,
    },
  };
}
