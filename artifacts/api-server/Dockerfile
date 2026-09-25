# ── Stage 1: build ───────────────────────────────────────────────────────────
# esbuild bundles the entire monorepo into a single dist/index.mjs — no need
# to copy lib/* separately; they are resolved and inlined at build time.
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# .npmrc must be present before pnpm install so settings match pnpm-lock.yaml
COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/

RUN pnpm install --frozen-lockfile

# Copy all source needed by esbuild
COPY tsconfig.base.json ./
COPY artifacts/api-server/ ./artifacts/api-server/
COPY lib/db/ ./lib/db/
COPY lib/api-zod/ ./lib/api-zod/

RUN pnpm --filter @workspace/api-server build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
# esbuild externalises jsdom and dompurify (used by sanitise.ts at module load).
# Those packages must be present in node_modules at runtime even though the rest
# of the app is bundled into dist/index.mjs.
FROM node:20-alpine AS runtime
WORKDIR /app

RUN npm install -g pnpm@9

# .npmrc + all workspace manifests needed to resolve workspace:* links at install
COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/

RUN pnpm install --frozen-lockfile --filter @workspace/api-server --prod

COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/healthz || exit 1

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
