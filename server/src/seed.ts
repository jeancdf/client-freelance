/**
 * Remplit la base avec les cadrages qui servaient d'exemples dans la maquette,
 * pour que le tableau de bord ait quelque chose à montrer en développement.
 *
 *   npm run seed
 */
import { POINTS } from '../../shared/points.ts';
import { cheminBase, config } from './config.ts';
import { ouvrirBase } from './db.ts';
import { appliquerPatch, creer, ecrireReponse, parId, validerDossier } from './repo.ts';
import type { Base } from './db.ts';
import type { Voie } from '../../shared/api.ts';

interface Exemple {
  nom: string;
  metier: string;
  demande: string;
  voie: Voie;
  /** Nombre de points renseignés avec la réponse la plus probable. */
  repondus: number;
  valide: boolean;
  /** Retient la réponse qui contredit le point II, sans trancher. */
  tension?: boolean;
  /** Ancienneté du dernier signe de vie, en jours. */
  ilYaJours: number;
}

const EXEMPLES: Exemple[] = [
  {
    nom: 'Camille Dorval',
    metier: 'coach sportif · indép.',
    demande: "Application d'entraînement pour ses clients",
    voie: 'entretien',
    repondus: 5,
    valide: false,
    tension: true,
    ilYaJours: 0,
  },
  {
    nom: 'Sofia Renaudin',
    metier: 'Groupe Verdier · resp. digital',
    demande: 'Portail de commande pour 60 points de vente',
    voie: 'rapide',
    repondus: 8,
    valide: true,
    ilYaJours: 1,
  },
  {
    nom: 'Grégory Palun',
    metier: 'Ateliers Palun · menuiserie',
    demande: 'Suivi des devis et des poses, sur chantier',
    voie: 'entretien',
    repondus: 8,
    valide: true,
    ilYaJours: 3,
  },
  {
    nom: 'Marine Cottet',
    metier: 'Cottet & associés · notaires',
    demande: 'Collecte de pièces auprès des clients',
    voie: 'entretien',
    repondus: 6,
    valide: false,
    ilYaJours: 4,
  },
  {
    nom: 'Hakim Belaïd',
    metier: 'Belaïd Transports',
    demande: 'Automatisation des feuilles de route',
    voie: 'entretien',
    repondus: 2,
    valide: false,
    ilYaJours: 12,
  },
];

function planter(db: Base, exemple: Exemple): string {
  const ligne = creer(db, { nom: exemple.nom, metier: exemple.metier, demande: exemple.demande });

  for (let i = 0; i < exemple.repondus; i++) {
    const point = POINTS[i];
    // Le point V du cas Dorval retient la réponse contradictoire, non tranchée :
    // c'est ce qui alimente le compteur « tensions ouvertes ».
    const texte =
      exemple.tension && point.tensionOn !== undefined ? point.props[point.tensionOn] : point.props[0];
    ecrireReponse(db, parId(db, ligne.id)!, i, { texte, confirme: Boolean(point.reform) });
  }

  appliquerPatch(db, parId(db, ligne.id)!, {
    voie: exemple.voie,
    step: Math.min(exemple.repondus, POINTS.length - 1),
  });

  if (exemple.valide) validerDossier(db, parId(db, ligne.id)!);

  // La durée et l'horodatage ne passent pas par le dépôt : ils sont dérivés de
  // l'usage réel. On les force ici pour obtenir un tableau de bord crédible.
  const majLe = new Date(Date.now() - exemple.ilYaJours * 24 * 60 * 60 * 1000).toISOString();
  const duree = (12 + exemple.repondus * 90) * 1000;
  db.prepare('UPDATE cadrage SET maj_le = ?, duree_ms = ? WHERE id = ?').run(majLe, duree, ligne.id);

  return ligne.token;
}

const db = ouvrirBase(cheminBase);
const dejaLa = db.prepare('SELECT COUNT(*) AS n FROM cadrage').get() as { n: number };

if (dejaLa.n > 0) {
  console.log(`La base contient déjà ${dejaLa.n} cadrage(s) — rien n'a été ajouté.`);
  console.log(`Pour repartir de zéro : rm -rf ${config.dossierDonnees}`);
} else {
  for (const exemple of EXEMPLES) {
    const token = planter(db, exemple);
    console.log(`${exemple.nom.padEnd(18)} ${config.baseUrl}/?c=${token}`);
  }
  console.log(`\n${EXEMPLES.length} cadrages créés.`);
}

db.close();
