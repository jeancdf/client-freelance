import { timingSafeEqual } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CreationCadrage } from '../../../shared/api.ts';
import { config } from '../config.ts';
import type { Base } from '../db.ts';
import {
  ErreurRequete,
  creer,
  fichiersDe,
  lister,
  parId,
  session,
  supprimerCadrage,
} from '../repo.ts';

function memeJeton(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  // timingSafeEqual exige des longueurs égales ; comparer d'abord fuiterait la
  // longueur, ce qui est sans intérêt pour l'attaquant mais autant l'éviter.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Les routes du prestataire, protégées par un jeton en en-tête. */
export function routesAdmin(app: FastifyInstance, db: Base, jeton: string): void {
  const exigerJeton = (req: FastifyRequest) => {
    const entete = req.headers.authorization ?? '';
    const recu = entete.startsWith('Bearer ') ? entete.slice(7) : '';
    if (!recu || !memeJeton(recu, jeton)) {
      throw new ErreurRequete(401, 'Jeton d’administration invalide.');
    }
  };

  app.get('/api/admin/cadrages', async (req) => {
    exigerJeton(req);
    return lister(db);
  });

  app.post<{ Body: CreationCadrage }>('/api/admin/cadrages', async (req, reply) => {
    exigerJeton(req);
    const ligne = creer(db, req.body ?? ({} as CreationCadrage));
    reply.code(201);
    return {
      id: ligne.id,
      token: ligne.token,
      lien: `${config.baseUrl}/?c=${ligne.token}`,
    };
  });

  app.get<{ Params: { id: string } }>('/api/admin/cadrage/:id', async (req) => {
    exigerJeton(req);
    const ligne = parId(db, req.params.id);
    if (!ligne) throw new ErreurRequete(404, 'Cadrage introuvable.');
    return { id: ligne.id, token: ligne.token, session: session(db, ligne) };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/cadrage/:id', async (req, reply) => {
    exigerJeton(req);
    const ligne = parId(db, req.params.id);
    if (ligne) {
      const fichiers = fichiersDe(db, ligne.id);
      supprimerCadrage(db, ligne.id);
      // Les lignes partent en cascade ; les fichiers sur disque, non.
      for (const fichier of fichiers) {
        await unlink(fichier.chemin).catch((cause) => {
          req.log.error({ cause, fichier: fichier.id }, 'fichier orphelin après suppression');
        });
      }
    }
    reply.code(204);
    return null;
  });
}
