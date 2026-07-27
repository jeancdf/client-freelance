import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CadrageCree, Inscription, Maturite } from '../../../shared/api.ts';
import { config } from '../config.ts';
import type { Base } from '../db.ts';
import { ErreurRequete, creationsDepuis, creer } from '../repo.ts';

/**
 * Ouvrir son cadrage soi-même, sans invitation. C'est la porte d'entrée depuis
 * le site de Nicolas : un visiteur qui n'a jamais parlé à personne doit pouvoir
 * commencer, sinon la page ne sert qu'à ceux qui ont déjà son adresse.
 *
 * La contrepartie est qu'elle est ouverte à tous : chaque cadrage créé ouvre un
 * entretien que le modèle facture, d'où les bornes ci-dessous.
 */

/** Par empreinte d'adresse, sur une heure glissante. */
const MAX_PAR_ADRESSE = 3;
/** Toutes adresses confondues, sur vingt-quatre heures. */
const MAX_PAR_JOUR = 60;

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;

/** Assez pour rejeter une adresse manifestement fausse, pas plus. */
const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MATURITES: Maturite[] = ['idee', 'forme', 'specs'];

interface Champ {
  cle: keyof Inscription;
  libelle: string;
  min: number;
  max: number;
}

const CHAMPS: Champ[] = [
  { cle: 'nom', libelle: 'Votre nom', min: 2, max: 80 },
  { cle: 'courriel', libelle: 'Votre adresse', min: 5, max: 160 },
  { cle: 'metier', libelle: 'Votre activité', min: 2, max: 140 },
  { cle: 'demande', libelle: 'Ce que vous cherchez à faire', min: 15, max: 600 },
];

function lire(corps: Partial<Inscription> | undefined): Inscription {
  const propre: Record<string, string> = {};

  for (const champ of CHAMPS) {
    const valeur = (corps?.[champ.cle] ?? '').toString().trim().replace(/\s+/g, ' ');
    if (valeur.length < champ.min) {
      throw new ErreurRequete(400, `${champ.libelle} : il en faut un peu plus.`);
    }
    if (valeur.length > champ.max) {
      throw new ErreurRequete(400, `${champ.libelle} : ${champ.max} caractères au maximum.`);
    }
    propre[champ.cle] = valeur;
  }

  if (!COURRIEL.test(propre.courriel)) {
    throw new ErreurRequete(400, "Cette adresse ne ressemble pas à une adresse électronique.");
  }

  const maturite = (corps?.maturite ?? '') as Maturite;
  if (!MATURITES.includes(maturite)) {
    throw new ErreurRequete(400, 'Dites-moi où vous en êtes : cochez une des trois réponses.');
  }

  return { ...propre, maturite } as unknown as Inscription;
}

export function routesInscription(app: FastifyInstance, db: Base, sel: string): void {
  // L'adresse n'est jamais écrite en base : seule son empreinte l'est, et elle
  // ne sert qu'à compter. Le sel la rend inutilisable ailleurs.
  const empreinteDe = (req: FastifyRequest) =>
    createHash('sha256').update(`${sel}|${req.ip}`).digest('hex').slice(0, 32);

  app.post<{ Body: Partial<Inscription> }>('/api/cadrage', async (req, reply): Promise<CadrageCree> => {
    const entree = lire(req.body);
    const empreinte = empreinteDe(req);
    const maintenant = Date.now();

    const recents = creationsDepuis(db, empreinte, new Date(maintenant - HEURE_MS).toISOString());
    if (recents >= MAX_PAR_ADRESSE) {
      throw new ErreurRequete(
        429,
        "Vous avez déjà ouvert plusieurs cadrages depuis cette connexion. Reprenez le lien reçu, ou réessayez dans une heure.",
      );
    }

    const duJour = db
      .prepare('SELECT COUNT(*) AS n FROM cadrage WHERE cree_le >= ?')
      .get(new Date(maintenant - JOUR_MS).toISOString()) as { n: number } | undefined;
    if ((duJour?.n ?? 0) >= MAX_PAR_JOUR) {
      throw new ErreurRequete(
        503,
        "Beaucoup de demandes aujourd'hui. Écrivez à nicolas@studiocazals.fr, il vous ouvre un lien à la main.",
      );
    }

    const ligne = creer(
      db,
      { nom: entree.nom, metier: entree.metier, demande: entree.demande },
      // Le formulaire enchaîne sur la première question : ce cadrage est
      // commencé dès sa création, il ne montrera pas la page d'accueil.
      {
        courriel: entree.courriel,
        ipEmpreinte: empreinte,
        dejaEntre: true,
        maturite: entree.maturite,
      },
    );

    app.log.info(
      { cadrage: ligne.id, metier: entree.metier, maturite: entree.maturite },
      'cadrage ouvert en libre-service',
    );

    reply.code(201);
    return {
      id: ligne.id,
      token: ligne.token,
      lien: `${config.baseUrl}/?c=${ligne.token}`,
    };
  });
}
