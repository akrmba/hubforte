# Worker has no package.json — it runs as TypeScript source via tsx.
# tsx and its deps are installed globally; the worker source is copied directly.
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g tsx

COPY worker/run.ts ./worker/run.ts
COPY worker/poller.ts ./worker/poller.ts

ENV NODE_ENV=production

HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 \
  CMD pgrep -f "tsx worker/run.ts" || exit 1

CMD ["tsx", "worker/run.ts"]
