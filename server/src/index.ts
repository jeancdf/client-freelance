import { createRequire } from 'node:module';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { cheminBase, config, jetonAdmin } from './config.ts';
import { ouvrirBase } from './db.ts';
import { ErreurRequete } from './repo.ts';
import { routesClient } from './routes/client.ts';
import { routesAdmin } from './routes/admin.ts';

const db = ouvrirBase(cheminBase);
const { jeton, genere } = jetonAdmin();

/** Journal lisible en développement, JSON brut dès que la sortie est redirigée. */
function transportJournal(): { target: string } | undefined {
  if (!process.stdout.isTTY) return undefined;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return { target: 'pino-pretty' };
  } catch {
    return undefined;
  }
}

const app = Fastify({
  logger: { transport: transportJournal() },
  bodyLimit: 1024 * 1024,
});

await app.register(multipart, { limits: { fileSize: config.tailleMaxFichier, files: 1 } });

app.setErrorHandler((erreur: unknown, _req, reply) => {
  if (erreur instanceof ErreurRequete) {
    return reply.code(erreur.code).send({ erreur: erreur.message });
  }

  app.log.error(erreur);
  const brut = erreur as { statusCode?: number; message?: string };
  const code = typeof brut.statusCode === 'number' && brut.statusCode >= 400 ? brut.statusCode : 500;
  // Une erreur interne ne dit rien de plus au client : le détail est au journal.
  return reply.code(code).send({
    erreur: code === 500 ? 'Erreur interne.' : (brut.message ?? 'Requête invalide.'),
  });
});

routesClient(app, db);
routesAdmin(app, db, jeton);

app.get('/api/sante', async () => ({ ok: true }));

if (config.servirDist) {
  const { default: statique } = await import('@fastify/static');
  await app.register(statique, { root: config.dossierDist });
  // Une seule page : toute route inconnue rend l'application.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ erreur: 'Route inconnue.' });
    return reply.sendFile('index.html');
  });
}

await app.listen({ port: config.port, host: config.host });

if (genere) {
  app.log.warn(
    `Jeton d'administration généré dans ${config.dossierDonnees}/admin-token.txt — ` +
      `définissez CADRAGE_ADMIN_TOKEN en production.`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
