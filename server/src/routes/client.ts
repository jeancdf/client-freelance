import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type { PatchSession, PutReponse } from '../../../shared/api.ts';
import { config, dossierFichiers } from '../config.ts';
import type { Base } from '../db.ts';
import {
  ErreurRequete,
  ajouterFichier,
  appliquerPatch,
  ecrireReponse,
  fichierParId,
  parToken,
  session,
  supprimerFichier,
  validerDossier,
} from '../repo.ts';

interface ParamsToken {
  token: string;
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

  app.put<{ Params: ParamsToken & { point: string }; Body: PutReponse }>(
    '/api/cadrage/:token/reponse/:point',
    async (req) => {
      const ligne = charger(req.params.token);
      return ecrireReponse(db, ligne, Number(req.params.point), req.body);
    },
  );

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
