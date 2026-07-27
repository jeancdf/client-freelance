import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { POINTS } from '../../../shared/points.ts';
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
  ecrireReponse,
  fichierParId,
  fichiersDe,
  parToken,
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
      const point = Number(req.params.point);
      const reponse = ecrireReponse(db, ligne, point, req.body);

      // Relu après écriture : le contexte doit inclure la réponse qu'on vient
      // de recevoir, sinon la tension ne peut pas la confronter aux autres.
      const apres = parToken(db, req.params.token)!;

      const [reformulation, tension, deduction] = await Promise.all([
        generation.reformulation(db, apres, point, reponse.texte),
        generation.tension(db, apres, point, reponse.texte),
        generation.deduction(db, apres, point, reponse.texte),
      ]);

      return {
        reponse,
        reformulation: reformulation.valeur,
        tension: tension.valeur,
        deduction: deduction.valeur,
      };
    },
  );

  /** La question, sa relance et les réponses probables, écrites pour ce client. */
  app.get<{ Params: ParamsToken & { point: string } }>(
    '/api/cadrage/:token/point/:point/ouverture',
    async (req): Promise<OuvertureGeneree> => {
      const ligne = charger(req.params.token);
      const point = exigerPoint(req.params.point);
      const { valeur, origine } = await generation.ouverture(db, ligne, point);
      return { ...valeur, origine };
    },
  );

  /** Les trois pistes de « Je ne sais pas, aidez-moi ». */
  app.get<{ Params: ParamsToken & { point: string } }>(
    '/api/cadrage/:token/point/:point/aide',
    async (req): Promise<AideGeneree> => {
      const ligne = charger(req.params.token);
      const point = exigerPoint(req.params.point);
      const { valeur, origine } = await generation.aide(db, ligne, point);
      return { ...valeur, origine };
    },
  );

  /**
   * Lit le document déposé et dit lesquels des huit points il couvre.
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

    const { valeur, origine } = await generation.analyse(db, ligne, morceaux.join('\n\n'));
    return { ...valeur, origine, fichiersIllisibles: illisibles };
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
