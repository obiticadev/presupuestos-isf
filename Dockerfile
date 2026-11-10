# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Dependencias completas (también las de desarrollo: hacen falta para compilar y para migrar).
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# Migraciones: prisma CLI + migraciones. Lo usa el servicio `migrate` de compose.
FROM deps AS migrate
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM deps AS build
COPY . .
RUN pnpm build && pnpm build:admin

# Imagen final: solo la salida standalone de Next y el CLI de administración empaquetado.
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Navegador del PDF y sus bibliotecas del sistema, como root; la misma versión que playwright-core de package.json.
RUN npx -y playwright-core@1.64.1 install --with-deps chromium-headless-shell   && chmod -R a+rX /ms-playwright && rm -rf /root/.npm
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
