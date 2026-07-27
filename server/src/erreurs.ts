import type { FastifyInstance } from 'fastify';
import { ErreurRequete } from './repo.ts';

/**
 * La traduction des erreurs en réponses. Posée à part pour que les tests
 * montent une application qui répond exactement comme la production : un test
 * qui vérifie un code 400 sur un gestionnaire différent ne vérifie rien.
 */
export function brancherErreurs(app: FastifyInstance): void {
  app.setErrorHandler((erreur: unknown, _req, reply) => {
    if (erreur instanceof ErreurRequete) {
      return reply.code(erreur.code).send({ erreur: erreur.message });
    }

    app.log.error(erreur);
    const brut = erreur as { statusCode?: number; message?: string };
    const code =
      typeof brut.statusCode === 'number' && brut.statusCode >= 400 ? brut.statusCode : 500;
    // Une erreur interne ne dit rien de plus au client : le détail est au journal.
    return reply.code(code).send({
      erreur: code === 500 ? 'Erreur interne.' : (brut.message ?? 'Requête invalide.'),
    });
  });
}
