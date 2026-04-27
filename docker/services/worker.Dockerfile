# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:worker

# Stage 2: Run
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install curl for healthchecks
RUN apk add --no-cache curl

COPY package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev

# Copy the built worker code
# Structure will be dist/worker/worker/index.js and dist/worker/lib/...
COPY --from=builder /app/dist/worker ./dist

# The worker needs to be started from the root of the dist folder to maintain relative paths if any
CMD ["node", "dist/worker/index.js"]
