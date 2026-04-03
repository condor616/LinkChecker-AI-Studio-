# Scaling & Migration Plan: Postgres + BullMQ Worker

This document outlines the incremental steps to migrate the Link Checker application from a local SQLite database with an in-memory worker to a robust, scalable architecture using PostgreSQL and an isolated BullMQ worker process. 

The primary goal is to **not break anything** during the transition. Therefore, we will approach this in two main phases: Database Migration, followed by Worker Extraction.

---

## Phase 1: Database Setup and Migration to PostgreSQL
*Goal: Switch the application's data layer to PostgreSQL safely while ensuring the current in-memory crawler still functions correctly.*

### Step 1.1: Stand up PostgreSQL locally via Docker
We will create a `docker-compose.yml` to run our database and message broker so we don't have to install them natively on the host machine.

- **Action:** Create a `docker-compose.yml` file (see the appendix below).
- **Action:** Run `docker-compose up -d db` to start the PostgreSQL instance locally on port 5432.

### Step 1.2: Update Database Client & Schema
We need to swap Drizzle ORM's SQLite adapter for its Postgres adapter.

- **Action:** Install dependencies: `npm install pg` and `npm install -D @types/pg`
- **Action:** Remove SQLite driver: `npm uninstall better-sqlite3` and `npm uninstall -D @types/better-sqlite3`
- **Action:** Update `lib/db/index.ts` to connect to Postgres instead of an SQLite file using `drizzle-orm/node-postgres`.
- **Action:** Update `lib/db/schema.ts` to convert SQLite specific column types (like `integer('id', { mode: 'boolean' })`) to Postgres equivalents (like `boolean('id')`, `uuid('id')`, etc.).
- **Action:** Update `drizzle.config.ts` to target PostgreSQL instead of SQLite.

### Step 1.3: Generate and Run Migrations
- **Action:** Generate new Drizzle SQL migration files: `npx drizzle-kit generate`
- **Action:** Apply the migrations to the local Postgres database: `npx drizzle-kit push` (or `migrate`).
- **Action:** Test the Next.js application UI (`npm run dev`) to ensure it can successfully write users and scans into Postgres.

### Step 1.4: Migrate Existing SQLite Data (Optional)
If you do not want to lose your current users, scans, and links, you will need a one-off script to port the data.
- **Action:** Create a script (e.g., `scripts/migrate-sqlite-to-pg.ts`) that opens a connection to `sqlite.db` using `better-sqlite3`, reads all tables, and `.insert()`s the records into the new Postgres database using the new Drizzle Postgres connection.
- **Action:** Run the script once via `npx tsx scripts/migrate-sqlite-to-pg.ts`. If you are okay with starting fresh, you can skip this step.

---

## Phase 2: Implementing the External Worker (BullMQ + Redis)
*Goal: Decouple the crawler logic from the Next.js API/UI and move it into an independent queue system.*

### Step 2.1: Start Redis
- **Action:** Start Redis via Docker: `docker-compose up -d redis`

### Step 2.2: Set Up BullMQ Queue in Next.js (The Producer)
*Note: BullMQ is an npm library, not a standalone application like Redis. Next.js needs to install it so it can push jobs into Redis.*
- **Action:** Install BullMQ: `npm install bullmq`
- **Action:** Create a queue configuration file (e.g., `lib/queue/index.ts`) that initializes a new BullMQ `Queue` connected to Redis.
- **Action:** Update the Next.js API route that starts a scan (e.g., `app/api/scan/start`) to push a "job" to the Queue (e.g., `{ scanId: '...', startUrl: '...' }`) instead of relying on the database polling loop to pick it up.

### Step 2.3: Extract Worker Logic
- **Action:** Stop the `startWorker()` `setInterval` from firing in the main Next.js entrypoint/API.
- **Action:** Create a dedicated worker script: `worker/index.ts`.
- **Action:** In `worker/index.ts`, initialize a BullMQ `Worker` instance to listen to the queue. 
- **Action:** Move the contents of `processLink` and recursive extraction logic from `lib/crawler/worker.ts` into the BullMQ job processor. BullMQ will now handle fetching and concurrency.

### Step 2.4: Build and Run the Worker Locally (The Consumer)
- **Action:** Add a script to `package.json` to run the worker separately: `"worker:dev": "npx tsx worker/index.ts"`.
- **Action:** Open a second terminal window and run `npm run worker:dev`. 
*Why this matters: Next.js only runs the Web UI and acts as the "Producer". The standalone terminal running your `worker.ts` acts as the "Consumer" and runs in a completely separate Node.js process. In Phase 3, we move this terminal process into its own dedicated Docker container.*

---

## Phase 3: Dockerizing the Architecture
*Goal: Allow the entire stack (UI, Worker, DB, Redis) to be spun up with one command for Homelab deployment.*

- **Action:** Update the `Dockerfile` to create an optimized production build of both Next.js and the Worker script.
- **Action:** Configure `docker-compose.yml` to build the app image, run one container for the web UI, and another container for the worker (overriding the command to run `worker.js`).
- **Action:** Run `docker-compose up -d` to launch the full, scalable homelab stack.

---

## Appendix: `docker-compose.yml`

Create this file in the root of the project to prepare for the migration.

```yaml
version: '3.8'

services:
  # The web application (will be built via Dockerfile in Phase 3)
  web:
    build: .
    ports:
      - "3000:3000"
    command: npm start
    depends_on:
      - db
      - redis
    environment:
      - NODE_ENV=production
      # Use internal Docker hostnames
      - POSTGRES_URL=postgres://linkchecker:localpass@db:5432/linkchecker
      - REDIS_URL=redis://redis:6379

  # The standalone queue processor (Phase 3)
  worker:
    build: .
    # Override start command to run the extracted worker
    command: node .next/standalone/worker.js 
    depends_on:
      - db
      - redis
    environment:
      - NODE_ENV=production
      - POSTGRES_URL=postgres://linkchecker:localpass@db:5432/linkchecker
      - REDIS_URL=redis://redis:6379

  # Persistent Postgres Database
  db:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: linkchecker
      POSTGRES_PASSWORD: localpass
      POSTGRES_DB: linkchecker
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U linkchecker"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis for BullMQ
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  postgres_data:
  redis_data:
```
