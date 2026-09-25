# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# Copy all workspace manifests so pnpm builds the full workspace graph
# and shamefully-hoists devDeps (like vite) to the root node_modules correctly.
COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/crm/package.json ./artifacts/crm/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/lms/package.json ./artifacts/lms/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/db/package.json ./lib/db/

RUN pnpm install --frozen-lockfile

# Copy source for all workspace deps the CRM build needs
COPY tsconfig.base.json ./
COPY artifacts/crm/ ./artifacts/crm/
COPY lib/api-client-react/ ./lib/api-client-react/
COPY lib/api-zod/ ./lib/api-zod/
COPY lib/api-spec/ ./lib/api-spec/

# VITE_API_URL and VITE_LMS_URL must be passed as build args so Vite bakes them in
ARG VITE_API_URL=http://localhost:3000
ARG VITE_LMS_URL=http://localhost:5174
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LMS_URL=$VITE_LMS_URL

# Use PATH-resolved vite binary (shamefully-hoisted to /app/node_modules/.bin)
RUN cd artifacts/crm && PATH="/app/node_modules/.bin:$PATH" vite build --config vite.config.ts

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=builder /app/artifacts/crm/dist /usr/share/nginx/html

# SPA routing: all paths fall back to index.html
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
