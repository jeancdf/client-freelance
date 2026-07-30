import { createRequire } from 'node:module';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { cheminBase, config, jetonAdmin } from './config.ts';
import { ouvrirBase } from './db.ts';
import { brancherErreurs } from './erreurs.ts';
import { routesClient } from './routes/client.ts';
import { routesAdmin } from './routes/admin.ts';
import { routesInscription } from './routes/inscription.ts';
import { demarrerSauvegardes } from './maintenance.ts';

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
  // Derrière le Caddy mutualisé : sans ceci toutes les requêtes portent
  // l'adresse du proxy, et la limite de créations vaudrait pour tout le monde
  // à la fois.
  trustProxy: true,
});

app.addHook('onSend', async (req, reply, payload) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'no-referrer');
  reply.header('x-frame-options', 'DENY');
  reply.header(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  return payload;
});

await app.register(multipart, { limits: { fileSize: config.tailleMaxFichier, files: 1 } });

brancherErreurs(app);

routesClient(app, db);
routesAdmin(app, db, jeton);
routesInscription(app, db, jeton);
const arreterSauvegardes = demarrerSauvegardes(db, app.log);

app.get('/api/sante', async (_req, reply) => {
  try {
    db.prepare('SELECT 1').get();
    return { ok: true, base: 'accessible' };
  } catch {
    reply.code(503);
    return { ok: false, base: 'indisponible' };
  }
});

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
    await arreterSauvegardes();
    await app.close();
    db.close();
    process.exit(0);
  });
}
