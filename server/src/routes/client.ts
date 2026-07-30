import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import {
  INDEX_CONTRAINTES,
  INDEX_HORS_PERIMETRE,
  INDEX_PERIMETRE,
  lireContraintes,
  POINTS,
  questionsMinimales,
} from '../../../shared/points.ts';
import type {
  AideGeneree,
  AnalyseGeneree,
  CompteRenduGenere,
  MarquageReponse,
  OuvertureGeneree,
  PatchSession,
  PutReponse,
  SauvegardeUrgente,
  SuiteReponse,
} from '../../../shared/api.ts';
import { cleCompteRendu, compteRenduLu } from '../compte-rendu.ts';
import * as generation from '../generation.ts';
import { estActif as modeleActif } from '../llm.ts';
import { config, dossierFichiers } from '../config.ts';
import type { Base } from '../db.ts';
import {
  ErreurRequete,
  ajouterFichier,
  appliquerPatch,
  dansTransaction,
  echangesDe,
  ecrireEchange,
  ecrireReponse,
  fichierParId,
  fichiersDe,
  marquerReponse,
  parToken,
  poserQuestion,
  session,
  supprimerFichier,
  validerDossier,
  verifierDossierPret,
} from '../repo.ts';

/** Ce qu'on sait lire tel quel. Le reste est signalé au client, pas ignoré. */
const LISIBLES = /^text\/|^application\/(json|xml)/;
const EXTENSIONS_AUTORISEES = new Set([
  '.csv',
  '.docx',
  '.json',
  '.md',
  '.ods',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.txt',
  '.webp',
  '.xls',
  '.xlsx',
  '.xml',
]);
const MAX_TEXTE_DOCUMENTS = 40_000;
const HEURE_MS = 60 * 60 * 1000;
const consommations = new Map<string, { debut: number; total: number }>();

interface ParamsToken {
  token: string;
}

function exigerPoint(brut: string): number {
  const point = Number(brut);
  if (!Number.isInteger(point) || point < 0 || point >= POINTS.length) {
    throw new ErreurRequete(404, 'point inconnu');
  }
  return point;
}

function limiterGenerations(token: string, poids: number): void {
  if (!modeleActif()) return;
  const maintenant = Date.now();
  const precedent = consommations.get(token);
  const compteur =
    !precedent || maintenant - precedent.debut >= HEURE_MS
      ? { debut: maintenant, total: 0 }
      : precedent;

  if (compteur.total + poids > config.generationsMaxParHeure) {
    throw new ErreurRequete(
      429,
      "La limite d'analyse de ce dossier est atteinte. Réessayez dans une heure.",
    );
  }
  compteur.total += poids;
  consommations.set(token, compteur);

  if (consommations.size > 1_000) {
    for (const [cle, valeur] of consommations) {
      if (maintenant - valeur.debut >= HEURE_MS) consommations.delete(cle);
    }
  }
}

async function extraireTexte(
  fichier: ReturnType<typeof fichiersDe>[number],
): Promise<string | null> {
  const extension = extname(fichier.nom).toLowerCase();
  if (LISIBLES.test(fichier.type_mime) || ['.txt', '.md', '.csv', '.json', '.xml'].includes(extension)) {
    return readFile(fichier.chemin, 'utf8');
  }
  if (extension === '.docx') {
    const resultat = await mammoth.extractRawText({ path: fichier.chemin });
    return resultat.value;
  }
  if (extension === '.pdf') {
    const parseur = new PDFParse({ data: await readFile(fichier.chemin) });
    try {
      return (await parseur.getText()).text;
    } finally {
      await parseur.destroy();
    }
  }
  return null;
}

/**
 * Les routes ouvertes au client. La seule preuve d'identité est le jeton du
 * lien : c'est voulu — le cadrage promet « aucun compte à créer ». Le jeton
 * fait 192 bits, il n'est pas devinable, et il n'apparaît jamais dans une page
 * servie à quelqu'un d'autre.
 */
export function routesClient(app: FastifyInstance, db: Base): void {
  const charger = (token: string) => {
    const ligne = parToken(db, token);
    if (!ligne) throw new ErreurRequete(404, 'Ce lien ne correspond à aucun cadrage.');
    return ligne;
  };

  /**
   * Le libellé de la question à laquelle le client vient de répondre. Il est
   * relu du cache plutôt que reçu du navigateur : c'est ce qui garantit que le
   * fil relu par le prestataire porte les questions réellement posées.
   */
  const questionDuRang = async (
    ligne: ReturnType<typeof charger>,
    point: number,
    rang: number,
  ): Promise<string> => {
    if (rang === 0) return (await generation.ouverture(db, ligne, point)).valeur.question;
    const fil = echangesDe(db, ligne.id)[String(point)] ?? [];
    const precedent = await generation.suite(db, ligne, point, fil.slice(0, rang), rang);
    return precedent.valeur?.question ?? POINTS[point].q;
  };

  app.get<{ Params: ParamsToken }>('/api/cadrage/:token', async (req) => {
    return session(db, charger(req.params.token));
  });

  app.patch<{ Params: ParamsToken; Body: PatchSession }>('/api/cadrage/:token', async (req) => {
    const ligne = appliquerPatch(db, charger(req.params.token), req.body ?? {});
    return { majLe: ligne.maj_le, dureeMs: ligne.duree_ms };
  });

  app.post<{ Params: ParamsToken; Body: SauvegardeUrgente }>(
    '/api/cadrage/:token/sauvegarde',
    async (req, reply) => {
      const ligne = charger(req.params.token);
      const patch = req.body?.patch ?? {};
      const reponses = req.body?.reponses ?? [];
      if (!Array.isArray(reponses) || reponses.length > POINTS.length) {
        throw new ErreurRequete(400, 'Sauvegarde de réponses invalide.');
      }

      dansTransaction(db, () => {
        if (Object.keys(patch).length) appliquerPatch(db, ligne, patch);
        for (const reponse of reponses) {
          if (
            typeof reponse?.confirme !== 'boolean' ||
            typeof reponse?.arbitre !== 'boolean' ||
            typeof reponse?.deductionConfirmee !== 'boolean'
          ) {
            throw new ErreurRequete(400, 'Drapeaux de réponse invalides.');
          }
          marquerReponse(db, ligne, exigerPoint(String(reponse.point)), {
            confirme: reponse.confirme,
            arbitre: reponse.arbitre,
            arbitrage: reponse.arbitrage ?? null,
            deductionConfirmee: reponse.deductionConfirmee,
          });
        }
      });

      reply.code(204);
      return null;
    },
  );

  /**
   * Écrit la réponse, puis rend ce que le modèle en tire : la reformulation à
   * faire valider, la contradiction éventuelle, la déduction. Les trois sont
   * demandées en parallèle — c'est le client qui attend devant son écran.
   */
  app.put<{ Params: ParamsToken & { point: string }; Body: PutReponse }>(
    '/api/cadrage/:token/reponse/:point',
    async (req): Promise<SuiteReponse> => {
      const ligne = charger(req.params.token);
      limiterGenerations(req.params.token, 6);
      const point = exigerPoint(req.params.point);
      const rang = Number(req.body?.rang ?? 0);
      if (point === INDEX_CONTRAINTES && rang === 0) {
        const configuration = lireContraintes(req.body?.texte ?? '');
        if (Object.values(configuration).some((valeur) => !valeur.trim())) {
          throw new ErreurRequete(
            400,
            'Le délai, le budget et les demandes technologiques doivent être renseignés.',
          );
        }
      }
      const etat = point === INDEX_HORS_PERIMETRE ? session(db, ligne) : null;
      if (
        point === INDEX_HORS_PERIMETRE &&
        etat?.horsPerimetre?.afficher !== true &&
        !(etat?.horsPerimetre === null && etat.reponses[String(point)])
      ) {
        throw new ErreurRequete(
          409,
          'Ce dossier ne contient aucun besoin hors périmètre à préciser.',
        );
      }

      // La question à laquelle ce texte répond, telle qu'elle a été posée : on
      // la garde avec la réponse, sinon le fil ne se relit pas.
      const posee = await questionDuRang(ligne, point, rang);
      const reponse = ecrireEchange(db, ligne, point, rang, posee, req.body);

      // Relu après écriture : le contexte doit inclure la réponse qu'on vient
      // de recevoir, sinon la tension ne peut pas la confronter aux autres.
      const apres = parToken(db, req.params.token)!;
      const fil = echangesDe(db, ligne.id)[String(point)] ?? [];

      // La plupart des sections peuvent être établies en une réponse précise.
      // Le périmètre et les contraintes gardent leur véritable second tour.
      const minimumAtteint = rang + 1 >= questionsMinimales(POINTS[point]);
      const finModeCourt = apres.mode === 'court' && minimumAtteint;
      const suite =
        req.body?.clore || finModeCourt
          ? null
          : (await generation.suite(db, apres, point, fil, rang + 1)).valeur;

      // Tant que le fil continue, la reformulation porterait sur une réponse
      // encore en cours d'écriture : on ne la calcule pas, et on économise
      // trois générations par échange intermédiaire.
      if (suite) {
        poserQuestion(db, ligne, point, rang + 1, suite.question);
        return {
          reponse,
          suite,
          rang: rang + 1,
          reformulation: null,
          tension: null,
          deduction: null,
          horsPerimetre: null,
        };
      }

      const close = ecrireReponse(db, apres, point, { texte: reponse.texte, clore: true });

      const decisionPrecedente =
        point === INDEX_PERIMETRE ? session(db, apres).horsPerimetre : null;
      const besoinDejaReleve =
        decisionPrecedente?.afficher && decisionPrecedente.besoin
          ? `Besoin supplémentaire précédemment relevé dans les mots du client : « ${decisionPrecedente.besoin} ».`
          : '';
      const [reformulation, tension, deduction, horsPerimetre] = await Promise.all([
        generation.reformulation(db, apres, point, close.texte),
        generation.tension(db, apres, point, close.texte),
        generation.deduction(db, apres, point, close.texte),
        point === INDEX_PERIMETRE
          ? generation
              .horsPerimetre(db, apres, besoinDejaReleve)
              .then((resultat) => resultat.valeur)
          : Promise.resolve(null),
      ]);

      // Le point conditionnel VI est préchargé seulement si un besoin hors des
      // trois priorités a réellement été relevé. Sinon on prépare directement
      // les contraintes, sans question de remplissage.
      const prochainPoint =
        point === INDEX_PERIMETRE && !horsPerimetre?.afficher
          ? INDEX_HORS_PERIMETRE + 1
          : point + 1;
      if (prochainPoint < POINTS.length) {
        void generation.ouverture(db, apres, prochainPoint).catch(() => undefined);
      }

      return {
        reponse: close,
        suite: null,
        rang: -1,
        reformulation: reformulation.valeur,
        tension: tension.valeur,
        deduction: deduction.valeur,
        horsPerimetre,
      };
    },
  );

  /**
   * Les drapeaux d'une réponse déjà écrite. Séparé du `PUT`, qui ajoute au fil :
   * l'enregistrement de fond repasse ces drapeaux à chaque changement d'état, il
   * ne doit surtout pas réécrire un échange au passage.
   */
  app.patch<{
    Params: ParamsToken & { point: string };
    Body: MarquageReponse;
  }>(
    '/api/cadrage/:token/reponse/:point',
    async (req) => {
      const ligne = charger(req.params.token);
      return marquerReponse(db, ligne, exigerPoint(req.params.point), req.body ?? {});
    },
  );

  /**
   * La question, sa relance et les réponses probables, écrites pour ce client.
   * Le rang permet de retrouver une question de suite après un rechargement :
   * elle est en cache, la relire ne relance pas le modèle. Sans contenu (204),
   * c'est que le point n'attend plus de question.
   */
  app.get<{ Params: ParamsToken & { point: string }; Querystring: { rang?: string } }>(
    '/api/cadrage/:token/point/:point/ouverture',
    async (req, reply): Promise<OuvertureGeneree | undefined> => {
      const ligne = charger(req.params.token);
      limiterGenerations(req.params.token, 1);
      const point = exigerPoint(req.params.point);
      const rang = Number(req.query.rang ?? 0);
      const etat = point === INDEX_HORS_PERIMETRE ? session(db, ligne) : null;
      if (
        point === INDEX_HORS_PERIMETRE &&
        etat?.horsPerimetre?.afficher !== true &&
        !(etat?.horsPerimetre === null && etat.reponses[String(point)])
      ) {
        reply.code(204);
        return undefined;
      }

      if (!rang) {
        const { valeur, origine } = await generation.ouverture(db, ligne, point);
        return { ...valeur, origine };
      }

      const fil = (echangesDe(db, ligne.id)[String(point)] ?? []).slice(0, rang);
      const { valeur, origine } = await generation.suite(db, ligne, point, fil, rang);
      if (!valeur) {
        reply.code(204);
        return undefined;
      }
      return { ...valeur, origine };
    },
  );

  /** Les trois pistes de « Je ne sais pas, aidez-moi ». */
  app.get<{ Params: ParamsToken & { point: string } }>(
    '/api/cadrage/:token/point/:point/aide',
    async (req): Promise<AideGeneree> => {
      const ligne = charger(req.params.token);
      limiterGenerations(req.params.token, 2);
      const point = exigerPoint(req.params.point);
      const etat = point === INDEX_HORS_PERIMETRE ? session(db, ligne) : null;
      if (
        point === INDEX_HORS_PERIMETRE &&
        etat?.horsPerimetre?.afficher !== true &&
        !(etat?.horsPerimetre === null && etat.reponses[String(point)])
      ) {
        throw new ErreurRequete(
          409,
          'Ce dossier ne contient aucun besoin hors périmètre à préciser.',
        );
      }
      const { valeur, origine } = await generation.aide(db, ligne, point);
      return { ...valeur, origine };
    },
  );

  /** Lit les formats textuels, PDF et Word, puis dit quels points ils couvrent. */
  const analyserDossier = async (
    ligne: ReturnType<typeof charger>,
  ): Promise<AnalyseGeneree> => {
    const morceaux: string[] = [];
    let caracteres = 0;
    const ajouter = (titre: string, texte: string) => {
      const propre = texte.trim();
      const disponibles = MAX_TEXTE_DOCUMENTS - caracteres;
      if (!propre || disponibles <= 0) return;
      const extrait = propre.slice(0, disponibles);
      morceaux.push(titre ? `--- ${titre} ---\n${extrait}` : extrait);
      caracteres += extrait.length;
    };

    ajouter('', ligne.brief);

    const illisibles: string[] = [];
    for (const fichier of fichiersDe(db, ligne.id)) {
      try {
        const contenu = await extraireTexte(fichier);
        if (contenu?.trim()) ajouter(fichier.nom, contenu);
        else illisibles.push(fichier.nom);
      } catch {
        illisibles.push(fichier.nom);
      }
    }

    if (!morceaux.length) {
      throw new ErreurRequete(400, 'Rien à lire : déposez un document ou décrivez le projet.');
    }

    const texteDocuments = morceaux.join('\n\n');
    const [analyse, decision] = await Promise.all([
      generation.analyse(db, ligne, texteDocuments),
      generation.horsPerimetre(db, ligne, texteDocuments),
    ]);
    const horsPerimetre = decision.valeur;
    const points = analyse.valeur.points.map((point) => {
      if (point.index !== INDEX_HORS_PERIMETRE) return point;
      if (!horsPerimetre.afficher) {
        return {
          ...point,
          couvert: true,
          extrait: '',
          reponse: '',
          manque: '',
        };
      }
      return {
        ...point,
        couvert: false,
        extrait: '',
        reponse: '',
        manque: `Vous avez évoqué « ${horsPerimetre.besoin} ». Il reste à décider s'il entre dans la première version, s'il est reporté ou s'il est écarté.`,
      };
    });
    const couverts = points.filter(
      (point) =>
        point.couvert &&
        (point.index !== INDEX_HORS_PERIMETRE ||
          Boolean(point.extrait.trim() || point.reponse.trim())),
    ).length;

    return {
      ...analyse.valeur,
      points,
      couverts,
      origine: analyse.origine,
      fichiersIllisibles: illisibles,
      horsPerimetre,
    };
  };

  app.post<{ Params: ParamsToken }>(
    '/api/cadrage/:token/analyse',
    async (req): Promise<AnalyseGeneree> => {
      const ligne = charger(req.params.token);
      limiterGenerations(req.params.token, 8);
      return analyserDossier(ligne);
    },
  );

  /**
   * Verse au dossier les seuls points réellement couverts, après le clic
   * explicite du client. Une synthèse de document reste identifiée comme telle :
   * elle ne sera jamais affichée comme une citation saisie dans l'entretien.
   */
  app.post<{ Params: ParamsToken }>(
    '/api/cadrage/:token/analyse/appliquer',
    async (req) => {
      const ligne = charger(req.params.token);
      limiterGenerations(req.params.token, 8);
      const resultat = await analyserDossier(ligne);
      if (resultat.origine === 'repli') {
        throw new ErreurRequete(
          503,
          "L'analyse automatique n'est pas disponible : aucun point n'a été importé.",
        );
      }

      const avant = session(db, ligne);
      const appliques: number[] = [];
      dansTransaction(db, () => {
        for (const point of resultat.points) {
          if (!point.couvert || !point.reponse.trim() || avant.reponses[String(point.index)]) {
            continue;
          }
          ecrireReponse(
            db,
            ligne,
            point.index,
            {
              texte: point.reponse,
              confirme: true,
              clore: true,
            },
            'document',
          );
          appliques.push(point.index);
        }
      });

      return { appliques };
    },
  );

  /**
   * Produit le document éditorial à partir des seules informations acceptées.
   * Le cache est lié à leur empreinte : une correction ne peut jamais afficher
   * silencieusement l'ancienne version.
   */
  app.post<{ Params: ParamsToken }>(
    '/api/cadrage/:token/compte-rendu',
    async (req): Promise<CompteRenduGenere> => {
      const ligne = charger(req.params.token);
      verifierDossierPret(db, ligne);
      const cleAvant = cleCompteRendu(db, ligne);
      const dejaGenere = db
        .prepare(
          "SELECT 1 FROM generation WHERE cadrage_id = ? AND point = -1 AND genre = 'compte-rendu' AND cle = ?",
        )
        .get(ligne.id, cleAvant);
      if (!dejaGenere) limiterGenerations(req.params.token, 12);

      let resultat: CompteRenduGenere;
      try {
        resultat = await generation.compteRendu(db, ligne);
      } catch (cause) {
        req.log.warn({ cause, cadrage: ligne.id }, 'compte rendu IA indisponible');
        throw new ErreurRequete(
          503,
          "Le compte rendu IA n'a pas pu être généré. Réessayez dans quelques instants.",
        );
      }

      const apres = charger(req.params.token);
      const cleApres = cleCompteRendu(db, apres);
      if (cleApres !== cleAvant) {
        throw new ErreurRequete(
          409,
          'Le dossier a changé pendant la rédaction. Relancez le compte rendu.',
        );
      }
      return resultat;
    },
  );

  /** Accusé distinct : recevoir les octets ne suffit pas à prouver l'ouverture de l'onglet. */
  app.post<{ Params: ParamsToken }>(
    '/api/cadrage/:token/compte-rendu/lu',
    async (req, reply) => {
      const ligne = charger(req.params.token);
      verifierDossierPret(db, ligne);
      const cle = cleCompteRendu(db, ligne);
      const existe = db
        .prepare(
          "SELECT 1 FROM generation WHERE cadrage_id = ? AND point = -1 AND genre = 'compte-rendu' AND cle = ?",
        )
        .get(ligne.id, cle);
      if (!existe) {
        throw new ErreurRequete(
          409,
          'Le compte rendu courant doit être généré avant de pouvoir être marqué comme lu.',
        );
      }
      db.prepare('UPDATE cadrage SET compte_rendu_lu_cle = ? WHERE id = ?').run(
        cle,
        ligne.id,
      );
      reply.code(204);
      return null;
    },
  );

  // Le dossier reste modifiable après validation : l'écran de fin le promet
  // explicitement (« le lien reste ouvert jusqu'au rendez-vous »).
  app.post<{ Params: ParamsToken }>('/api/cadrage/:token/valider', async (req) => {
    const courant = charger(req.params.token);
    if (!compteRenduLu(db, courant)) {
      throw new ErreurRequete(
        409,
        'Ouvrez le compte rendu IA correspondant aux réponses actuelles avant de valider.',
      );
    }
    const ligne = validerDossier(db, courant);
    return { statut: ligne.statut, valideLe: ligne.valide_le, dureeMs: ligne.duree_ms };
  });

  app.post<{ Params: ParamsToken }>('/api/cadrage/:token/fichier', async (req, reply) => {
    const ligne = charger(req.params.token);
    const existants = fichiersDe(db, ligne.id);
    if (existants.length >= config.fichiersMaxParDossier) {
      throw new ErreurRequete(
        413,
        `Ce dossier accepte au maximum ${config.fichiersMaxParDossier} fichiers.`,
      );
    }
    const partie = await req.file();
    if (!partie) throw new ErreurRequete(400, 'Aucun fichier reçu.');
    const nom = basename(partie.filename.replace(/\\/g, '/')).slice(0, 180);
    if (!nom || !EXTENSIONS_AUTORISEES.has(extname(nom).toLowerCase())) {
      partie.file.resume();
      throw new ErreurRequete(
        415,
        'Format non accepté. Utilisez du texte, PDF, Word (.docx), image ou tableur.',
      );
    }

    await mkdir(dossierFichiers, { recursive: true });
    const chemin = join(dossierFichiers, `${ligne.id}-${randomUUID()}`);

    let taille = 0;
    partie.file.on('data', (morceau: Buffer) => {
      taille += morceau.length;
    });

    await pipeline(partie.file, createWriteStream(chemin));

    // `truncated` est posé par @fastify/multipart quand la limite est atteinte :
    // le fichier partiel ne doit pas rester sur disque ni en base.
    if (partie.file.truncated) {
      await unlink(chemin).catch(() => {});
      throw new ErreurRequete(413, `Fichier trop volumineux (max ${Math.round(config.tailleMaxFichier / 1024 / 1024)} Mo).`);
    }
    const tailleExistante = existants.reduce((total, fichier) => total + fichier.taille, 0);
    if (tailleExistante + taille > config.stockageMaxParDossier) {
      await unlink(chemin).catch(() => {});
      throw new ErreurRequete(
        413,
        `Le dossier dépasse ${Math.round(config.stockageMaxParDossier / 1024 / 1024)} Mo de fichiers.`,
      );
    }

    reply.code(201);
    try {
      return ajouterFichier(db, ligne.id, {
        nom,
        taille,
        typeMime: partie.mimetype,
        chemin,
      });
    } catch (cause) {
      await unlink(chemin).catch(() => {});
      throw cause;
    }
  });

  app.get<{ Params: ParamsToken & { id: string } }>('/api/cadrage/:token/fichier/:id', async (req, reply) => {
    const ligne = charger(req.params.token);
    const fichier = fichierParId(db, ligne.id, req.params.id);
    if (!fichier) throw new ErreurRequete(404, 'Fichier introuvable.');

    // Nom entre guillemets et échappé : un nom de fichier vient du client et
    // ne doit pas pouvoir injecter d'en-tête.
    const nom = fichier.nom.replace(/["\\\r\n]/g, '_');
    reply.header('content-type', fichier.type_mime || 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename="${nom}"`);
    return reply.send(createReadStream(fichier.chemin));
  });

  app.delete<{ Params: ParamsToken & { id: string } }>('/api/cadrage/:token/fichier/:id', async (req, reply) => {
    const ligne = charger(req.params.token);
    const fichier = fichierParId(db, ligne.id, req.params.id);
    if (fichier) {
      supprimerFichier(db, ligne.id, fichier.id);
      await unlink(fichier.chemin).catch((cause) => {
        req.log.error({ cause, fichier: fichier.id }, 'fichier supprimé de la base mais pas du disque');
      });
    }
    reply.code(204);
    return null;
  });
}
