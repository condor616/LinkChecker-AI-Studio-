# syntax=docker/dockerfile:1
# Lynx GEO app image. Compose context is apps/lynxgeo; packages/ is an extra context.
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY --from=packages . ./packages
COPY . ./apps/lynxgeo
WORKDIR /repo/apps/lynxgeo
RUN npm install
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
COPY --from=builder /repo/apps/lynxgeo/.next ./.next
COPY --from=builder /repo/apps/lynxgeo/node_modules ./node_modules
COPY --from=builder /repo/apps/lynxgeo/package.json ./
COPY --from=builder /repo/packages /packages
EXPOSE 3010
CMD ["npx", "next", "start", "-p", "3010"]
