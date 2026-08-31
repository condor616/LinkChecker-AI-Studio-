# Lynx GEO worker. Build from repository root (same pattern as LynxScan):
# docker build -f apps/lynxgeo/docker/services/worker.Dockerfile .
FROM node:20-alpine
RUN apk add --no-cache libc6-compat curl
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
COPY apps/lynxgeo ./apps/lynxgeo
WORKDIR /app/apps/lynxgeo
# Host node_modules are dockerignored. Install here so tsx/esbuild match Alpine.
RUN npm ci
ENV NODE_ENV=production
# Node block-buffers stdout when it is a pipe (`docker logs`). The worker
# writeSyncs each line; tty: true in compose is extra insurance.
ENV NODE_OPTIONS=--no-deprecation
CMD ["npx", "tsx", "worker/index.ts"]
