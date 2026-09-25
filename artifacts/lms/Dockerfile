# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# Copy all workspace manifests so pnpm can build the full workspace graph
# and shamefully-hoist devDeps (like vite) to the root node_modules correctly.
COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/lms/package.json ./artifacts/lms/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/crm/package.json ./artifacts/crm/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/

RUN pnpm install --frozen-lockfile

COPY artifacts/lms/ ./artifacts/lms/
COPY tsconfig.base.json ./

ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN cd artifacts/lms && PATH="/app/node_modules/.bin:$PATH" vite build --config vite.config.ts

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/artifacts/lms/dist /usr/share/nginx/html

RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /health {\n\
        return 200 "ok";\n\
        add_header Content-Type text/plain;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
