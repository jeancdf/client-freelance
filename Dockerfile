# syntax=docker/dockerfile:1

# Une seule image : Fastify sert l'API et le build Vite. Le serveur lit les
# fichiers TypeScript directement — Node ≥ 22.23 efface les types et fournit
# la sauvegarde SQLite utilisée au démarrage, donc pas de compilation serveur.

# --- Étape 1 : build du front -------------------------------------------- #
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY vite.config.ts index.html ./
COPY shared ./shared
COPY src ./src
COPY server ./server

# `npm run build` typecheck les trois projets avant de bundler : une erreur de
# types arrête l'image ici, pas en production.
RUN npm run build

# --- Étape 2 : image d'exécution ------------------------------------------ #
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY shared ./shared
COPY server ./server

# Créé avant le montage : Docker reprend ce propriétaire quand il initialise
# le volume nommé, sinon le conteneur non-root ne pourrait pas y écrire.
RUN mkdir -p /data /backups && chown -R node:node /data /backups

USER node

ENV CADRAGE_SERVE_DIST=1 \
    CADRAGE_DATA=/data \
    HOST=0.0.0.0 \
    PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8787/api/sante || exit 1

CMD ["node", "server/src/index.ts"]
