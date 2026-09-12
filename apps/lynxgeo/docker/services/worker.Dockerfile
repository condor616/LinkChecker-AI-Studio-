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
# Prefer npm ci when the lockfile is in sync; fall back to npm install for file: @lynx/*
# packages so a stale lock cannot block worker rebuilds on Proxmox/Linux.
RUN npm ci || npm install --no-fund --no-audit
ENV NODE_ENV=production
# Node block-buffers stdout when it is a pipe (`docker logs`). The worker
# writeSyncs each line; tty: true in compose is extra insurance.
ENV NODE_OPTIONS=--no-deprecation
CMD ["npx", "tsx", "worker/index.ts"]
