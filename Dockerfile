FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/*/package.json apps/
COPY packages/*/package.json packages/
RUN npm install

FROM base AS builder
WORKDIR /app
# URL pública de la API (con /api) inyectada en el bundle del front (obligatorio en producción).
ARG VITE_API_URL=http://localhost/api
ENV VITE_API_URL=$VITE_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@paymentflow/api
RUN npm run build --workspace=@paymentflow/web || true
RUN cd apps/web && npm run build || true

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
RUN npm install -g serve
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/telegram-bot/dist ./apps/telegram-bot/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/apps/web/vite.config.ts ./apps/web/vite.config.ts
COPY --from=builder /app/apps/web/index.html ./apps/web/index.html
COPY scripts/docker-api-entrypoint.sh ./scripts/docker-api-entrypoint.sh
COPY nginx.conf ./nginx.conf
USER root
RUN chmod +x ./scripts/docker-api-entrypoint.sh
USER nodejs
EXPOSE 3000
ENTRYPOINT ["./scripts/docker-api-entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
