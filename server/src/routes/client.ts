import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
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
  OuvertureGeneree,
  PatchSession,
  PutReponse,
  SuiteReponse,
} from '../../../shared/api.ts';
import * as generation from '../generation.ts';
import { config, dossierFichiers } from '../config.ts';
import type { Base } from '../db.ts';
import {
  ErreurRequete,
  ajouterFichier,
  appliquerPatch,
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
} from '../repo.ts';

/** Ce qu'on sait lire tel quel. Le reste est signalé au client, pas ignoré. */
const LISIBLES = /^text\/|^application\/(json|xml)/;

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

  /**
   * Écrit la réponse, puis rend ce que le modèle en tire : la reformulation à
   * faire valider, la contradiction éventuelle, la déduction. Les trois sont
   * demandées en parallèle — c'est le client qui attend devant son écran.
   */
  app.put<{ Params: ParamsToken & { point: string }; Body: PutReponse }>(
    '/api/cadrage/:token/reponse/:point',
    async (req): Promise<SuiteReponse> => {
      const ligne = charger(req.params.token);
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
  app.patch<{ Params: ParamsToken & { point: string }; Body: { confirme?: boolean; arbitre?: boolean } }>(
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

  /**
   * Lit le document déposé et dit quels points utiles il couvre.
   * Les fichiers texte sont joints au brief ; les binaires (PDF, Word) sont
   * signalés au client plutôt que passés sous silence.
   */
  app.post<{ Params: ParamsToken }>('/api/cadrage/:token/analyse', async (req): Promise<AnalyseGeneree> => {
    const ligne = charger(req.params.token);

    const morceaux: string[] = [];
    if (ligne.brief.trim()) morceaux.push(ligne.brief.trim());

    const illisibles: string[] = [];
    for (const fichier of fichiersDe(db, ligne.id)) {
      if (LISIBLES.test(fichier.type_mime) || /\.(txt|md|csv|json)$/i.test(fichier.nom)) {
        try {
          const contenu = await readFile(fichier.chemin, 'utf8');
          morceaux.push(`--- ${fichier.nom} ---\n${contenu.slice(0, 40_000)}`);
        } catch {
          illisibles.push(fichier.nom);
        }
      } else {
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
  });

  // Le dossier reste modifiable après validation : l'écran de fin le promet
  // explicitement (« le lien reste ouvert jusqu'au rendez-vous »).
  app.post<{ Params: ParamsToken }>('/api/cadrage/:token/valider', async (req) => {
    const ligne = validerDossier(db, charger(req.params.token));
    return { statut: ligne.statut, valideLe: ligne.valide_le, dureeMs: ligne.duree_ms };
  });

  app.post<{ Params: ParamsToken }>('/api/cadrage/:token/fichier', async (req, reply) => {
    const ligne = charger(req.params.token);
    const partie = await req.file();
    if (!partie) throw new ErreurRequete(400, 'Aucun fichier reçu.');

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

    reply.code(201);
    return ajouterFichier(db, ligne.id, {
      nom: partie.filename,
      taille,
      typeMime: partie.mimetype,
      chemin,
    });
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
      await unlink(fichier.chemin).catch(() => {});
      supprimerFichier(db, ligne.id, fichier.id);
    }
    reply.code(204);
    return null;
  });
}
