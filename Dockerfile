# Etapa 1: Construcción
FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY tsconfig.json ./
COPY src ./src/
RUN npx prisma generate && npm run build
RUN npm prune --omit=dev

# Etapa 2: Runtime de Producción
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Instalar libvips para sharp y curl para healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Preparar directorios con permisos para el usuario 'node' (UID 1000)
RUN mkdir -p /app/storage/images /app/storage/tables /app/storage/tmp \
    && chown -R node:node /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma

USER node
EXPOSE 8080

CMD ["node", "dist/main.js"]
