FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
# Instalar devDependencies (types, prisma) para compilar; el stage runner solo copia artefactos.
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
COPY apps/*/package.json apps/
COPY packages/*/package.json packages/
RUN npm ci

FROM base AS builder
WORKDIR /app
# URL pública de la API (con /api) inyectada en el bundle del front (obligatorio en producción).
ARG VITE_API_URL=http://localhost/api
ENV VITE_API_URL=$VITE_API_URL
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Con el árbol de código completo, enlazar dependencias del workspace (npm ci en deps solo ve package.json).
RUN npm install --prefer-offline --no-audit
RUN npm run db:generate --workspace=@paymentflow/database
# tsc con paths monorepo emite bajo dist/apps/<app>/src/ (no dist/index.js).
RUN npm run build --workspace=@paymentflow/api && test -f apps/api/dist/apps/api/src/index.js
RUN npm run build --workspace=@paymentflow/telegram-bot && test -f apps/telegram-bot/dist/apps/telegram-bot/src/index.js
RUN npm run build --workspace=@paymentflow/web || true
RUN cd apps/web && npm run build || true

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
RUN npm install -g serve
COPY --from=builder /app/apps/api/dist ./apps/api/dist
RUN test -f apps/api/dist/apps/api/src/index.js || (echo "API dist missing in runner image" && find apps/api/dist -name index.js && exit 1)
COPY --from=builder /app/apps/telegram-bot/dist ./apps/telegram-bot/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
# Workspace links en node_modules/@paymentflow/* apuntan a packages/*; sin esto los symlinks quedan rotos.
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/vite.config.ts ./apps/web/vite.config.ts
COPY --from=builder /app/apps/web/index.html ./apps/web/index.html
COPY scripts/docker-api-entrypoint.sh ./scripts/docker-api-entrypoint.sh
COPY nginx.conf ./nginx.conf
USER root
RUN chmod +x ./scripts/docker-api-entrypoint.sh
USER nodejs
EXPOSE 3000
ENTRYPOINT ["./scripts/docker-api-entrypoint.sh"]
CMD ["node", "apps/api/dist/apps/api/src/index.js"]
