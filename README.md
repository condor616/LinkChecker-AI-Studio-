# Lynx Scan & Lynx GEO

**Lynx Scan** is a high-performance link monitoring platform with deep recursive crawling, real-time progress, and report triage.

**Lynx GEO** (AI Audit) is a sibling app in this repo that scores sites for AI discoverability. Both apps share PostgreSQL and Redis but use separate BullMQ queues.

| App | Purpose | Default URL (local dev) |
| --- | --- | --- |
| Lynx Scan | Broken-link and crawl audits | http://localhost:3000 |
| Lynx GEO | AI discoverability audits | http://localhost:3010 |

---

## Prerequisites

- **Node.js 20+** and **npm**
- **Docker Desktop** (or Docker Engine + Compose) for PostgreSQL, Redis, and background workers
- **Git**

---

## Install from scratch

1. **Clone the repository**
   ```bash
   git clone https://github.com/condor616/LinkChecker-AI-Studio-.git
   cd LinkChecker-AI-Studio-
   ```

2. **Install dependencies** (root workspace + Lynx GEO app)
   ```bash
   npm install
   npm install --prefix apps/lynxgeo
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at minimum:
   - `JWT_SECRET` — at least 32 characters (`openssl rand -hex 32`)
   - `POSTGRES_PASSWORD` — a secure database password

   Optional:
   - `NEXT_PUBLIC_GEO_URL` — link from Lynx Scan home to Lynx GEO (default `http://localhost:3010`)
   - `AUTH_COOKIE_DOMAIN` — share sessions across hostnames (e.g. `.example.com`)

4. **Start Docker Desktop**, then launch the apps (see [Running the apps](#running-the-apps) below).

On first start, `predev` / `prestart` scripts automatically bring up Docker services and run `drizzle-kit push` to create the database schema.

---

## Running the apps

### Local development (recommended)

These modes run Next.js on your host. Docker provides **PostgreSQL**, **Redis**, and the **workers**.

| Command | What starts |
| --- | --- |
| `npm run dev` | Lynx Scan only (:3000) + LynxScan worker |
| `npm run dev:lynxgeo` | Lynx GEO only (:3010) + GEO worker |
| `npm run dev:all` | **Both apps** + both workers |

Each `dev*` command cleans up stale processes, starts the shared `db`/`redis` stack (`docker/services/docker-compose.yml`), starts the relevant worker(s), and launches Next.js.

### Local production

Build before starting. Production mode uses the Lynx Scan standalone server and `next start` for GEO.

| Command | What starts |
| --- | --- |
| `npm run build && npm run start` | Lynx Scan only |
| `npm run build:lynxgeo && npm run start:lynxgeo` | Lynx GEO only |
| `npm run build:all && npm run start:all` | **Both apps** + both workers |

### Full Docker stack (deployment)

Runs the Lynx Scan **app**, **worker**, **PostgreSQL**, **Redis**, and **pgAdmin** entirely in containers via the root `docker-compose.yml`.

```bash
cp .env.example .env   # if you have not already
docker compose up -d
```

- **Lynx Scan UI**: http://localhost:3001
- **pgAdmin**: http://localhost:5051 (`admin@lynxscan.com` / `admin` by default)

> Do not run the full Docker stack and local `npm run dev` at the same time — they compete for host ports. Stop one before starting the other (`docker compose down` or `npm run stop-docker`).

Lynx GEO is not included in the root production compose file. Run it locally with `npm run dev:lynxgeo` or `npm run start:lynxgeo`, or use `apps/lynxgeo/docker-compose.yml` for a containerized GEO stack.

---

## Managing the apps

### Start / stop (quick reference)

| Action | Lynx Scan | Lynx GEO | Both |
| --- | --- | --- | --- |
| **Dev start** | `npm run dev` | `npm run dev:lynxgeo` | `npm run dev:all` |
| **Prod start** | `npm run build && npm run start` | `npm run build:lynxgeo && npm run start:lynxgeo` | `npm run build:all && npm run start:all` |
| **Stop app processes + Docker** | `npm run stop-docker` | `npm run stop-docker:lynxgeo` | `npm run stop:all` |
| **Stop Docker only (keep volumes)** | `npm run stop-docker` | `npm run stop-docker:lynxgeo` | `npm run docker-clean:all` |

`npm run stop:all` stops both Next.js apps **and** tears down both Docker stacks (LynxScan + GEO workers, db, redis).

To stop only the Node processes while leaving Docker running, press **Ctrl+C** in the terminal where `dev:all` / `start:all` is running.

### Rebuild workers

Use this after changing worker code or Dockerfiles.

| Stack | Lynx Scan worker | Lynx GEO worker |
| --- | --- | --- |
| **Local dev** (`docker/services/…`) | `npm run rebuild-worker:dev` | `npm run rebuild-worker:lynxgeo:dev` |
| **Root production compose** | `npm run rebuild-worker` | — |

### Port reference

| Service | Local dev (`docker/services`) | Root prod (`docker-compose.yml`) |
| --- | --- | --- |
| Lynx Scan (Next.js) | 3000 (host) | 3001 |
| Lynx GEO (Next.js) | 3010 (host) | — |
| PostgreSQL | 5432 | 5433 |
| Redis | 6379 | 6380 |
| Bull Board (worker UI) | 3002 | — |
| pgAdmin | 5050 | 5051 |

---

## Administrative setup

The **first registered user** is automatically granted **ADMIN**. Later users are **PENDING** until approved in the **Users** admin dashboard.

Admins can grant per-product access (Lynx Scan and Lynx GEO) from the same user management UI.

---

## Background jobs (BullMQ)

Lynx Scan and Lynx GEO share one Redis instance but use **separate queues**:

| Queue | App | Purpose |
| --- | --- | --- |
| `scan-jobs` | Lynx Scan | Link crawls |
| `lynxgeo-jobs` | Lynx GEO | GEO audits |

- **Bull Board**: http://localhost:3002/admin/queues (when the dev Docker worker is running)
- **Scale Lynx Scan workers** (root compose): `docker compose up -d --scale worker=4`

`npm run dev:lynxgeo` starts the GEO worker in Docker by default. To run a host worker instead, stop the GEO Docker stack first (`npm run stop-docker:lynxgeo`), then run `npm run worker:lynxgeo`.

---

## Resetting data

**Soft reset** — wipe scans, users, templates, and backups; keep `.env` and Docker volumes:
```bash
npm run reset-all
```

**Hard reset** — destroy `.env`, all databases, Docker volumes, and local caches:
```bash
npm run nuke
```
Then repeat the [install from scratch](#install-from-scratch) steps.

---

## Database management

**pgAdmin** is included in the Docker stacks:

| Stack | URL | Default login |
| --- | --- | --- |
| Local dev | http://localhost:5050 | `admin@lynxscan.com` / `admin` |
| Root prod compose | http://localhost:5051 | `admin@lynxscan.com` / `admin` |

---

## Tech stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL / Drizzle ORM
- **Queue**: BullMQ / Redis
- **Shared packages**: `@lynx/auth`, `@lynx/crawler-core`, `@lynx/db` under `packages/`

---

## Docker image publishing

To build and push Lynx Scan images for remote deployment:

```bash
# Build and tag (replace angilma1 with your Docker Hub username)
DOCKER_IMAGE_APP=angilma1/lynxscan DOCKER_IMAGE_WORKER=angilma1/lynxscan-worker docker compose build

docker login
docker push angilma1/lynxscan
docker push angilma1/lynxscan-worker
```

On the remote host, copy `docker-compose.yml` and `.env`, set `DOCKER_IMAGE_APP` / `DOCKER_IMAGE_WORKER`, then:

```bash
docker compose pull
docker compose up -d
```

The app will be available at **http://localhost:3001** (root compose maps host port 3001 → container 3000).

### Deployment notes

- The production `app` container does not auto-push schema changes. After schema updates, run `npx drizzle-kit push` locally or against the deployment database.
- UI controls that start/stop Docker will not work when the app itself runs inside a container.
- Inside Docker Compose, `DATABASE_URL` and `REDIS_URL` use service hostnames (`db`, `redis`), not `localhost`.

---

## Testing

```bash
npm run test          # Lynx Scan unit/integration (Vitest)
npm run test:lynxgeo  # Lynx GEO unit tests
npm run test:e2e      # Playwright E2E (Lynx Scan)
```

---

Developed with care for reliable link and AI-discoverability auditing.
