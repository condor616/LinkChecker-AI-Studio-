# syntax=docker/dockerfile:1
# Lynx GEO app image. Compose context is apps/lynxgeo; packages/ is an extra context.
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY --from=packages . ./packages
COPY . ./apps/lynxgeo

# Next resolves imports from packages/*/src, so each package needs its own node_modules.
WORKDIR /repo/packages/auth
RUN npm install --omit=dev
WORKDIR /repo/packages/backup
# Include @types/* so Next typechecking can resolve archiver/yauzl declarations.
RUN npm install
WORKDIR /repo/packages/crawler-core
RUN npm install --omit=dev
WORKDIR /repo/packages/db
RUN npm install --omit=dev

WORKDIR /repo/apps/lynxgeo
RUN npm install

# NEXT_PUBLIC_* values are inlined at build time.
ARG APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_GEO_URL=http://localhost:3010
ARG NEXT_PUBLIC_LYNXSCAN_URL=http://localhost:3000
ENV APP_URL=$APP_URL
ENV NEXT_PUBLIC_GEO_URL=$NEXT_PUBLIC_GEO_URL
ENV NEXT_PUBLIC_LYNXSCAN_URL=$NEXT_PUBLIC_LYNXSCAN_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /repo/apps/lynxgeo/.next ./.next
COPY --from=builder /repo/apps/lynxgeo/node_modules ./node_modules
COPY --from=builder /repo/apps/lynxgeo/package.json ./
COPY --from=builder /repo/packages /packages
EXPOSE 3010
CMD ["npx", "next", "start", "-p", "3010"]
