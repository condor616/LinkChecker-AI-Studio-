# Developer Documentation

## Architecture Overview

LynxScan is the root Next.js app in this repository (port 3000). Lynx GEO lives in `apps/lynxgeo` and is a sibling product. Both share PostgreSQL and Redis but use separate BullMQ queues.

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL via Drizzle ORM (central auth DB plus per-user Scan databases)
- **Task Queue**: BullMQ on Redis (`scan-jobs`)
- **Worker**: Standalone Node.js worker (`worker/index.ts`), typically Docker-based
- **Styling**: Tailwind CSS v4 + shadcn-style UI
- **Authentication**: JWT (`jose`) in an HTTP-only `session` cookie

### Database Schema
The schema is defined in `lib/db/schema.ts`:
- `users` (central DB): accounts, roles (`ADMIN`, `PENDING`, `USER`, `BLOCKED`), product access, resource limits
- `scans` (per-user Scan DB): crawl job config and status
- `links` (per-user Scan DB): discovered URLs, status (`PENDING`, `PROCESSING`, `SUCCESS`, `BROKEN`, `SKIPPED`), parent/source
- `templates` (per-user Scan DB): saved crawl configs

Each approved LynxScan user gets an isolated Postgres database named `lynx_scan_<userId>`, provisioned in `lib/db/provisioning.ts`.

### Crawler Engine (BullMQ Worker)

LynxScan and Lynx GEO share one Redis instance but **two BullMQ queue names**:

| Queue | App | Enqueued by | Processed by |
| --- | --- | --- | --- |
| `scan-jobs` | LynxScan | LynxScan Next (`lib/bullmq.ts`) | LynxScan worker (`worker/index.ts`) |
| `lynxgeo-jobs` | Lynx GEO (AI Audit) | GEO Next (`apps/lynxgeo/lib/geo/queue.ts`) | GEO worker (`apps/lynxgeo/worker/index.ts`) |

Do not merge these queues. GEO must never enqueue or process `scan-jobs`.

`npm run dev:lynxgeo` matches LynxScan: cleanup leftover host Next/tsx processes, then Docker `lynxgeo-worker` listens and processes immediately. Use `npm run worker:lynxgeo` only when you are not using the Docker worker (`npm run stop-docker:lynxgeo` first).

Bull **Waiting = 0** with **Active = 1** means a worker is processing; the queue is not empty.

- **Queue Management**: The Next.js app enqueues scan tasks into `scan-jobs`.
- **Worker Service**: `worker/index.ts` processes jobs, containerized and scalable independently.
- **Concurrency**: `BULLMQ_CONCURRENCY`.
- **Extraction**: `@lynx/crawler-core` (cheerio) plus LynxScan-specific persistence in `lib/crawler/processor.ts`.
- **Monitoring**: Bull Board lists both queues. Local worker: `http://localhost:3001/admin/queues`. Docker `lynxscan-dev` stack maps that to `http://localhost:3002/admin/queues`.

### Production deployment
Use root [`docker-compose.prod.yml`](docker-compose.prod.yml) for Proxmox / reverse-proxy installs (Lynx Scan + Lynx GEO + both workers). See the root README for Nginx Proxy Manager, firewall, and env URL guidance. Keep local `docker/services` stacks for development only.


### Authentication Flow
- JWT stored in an HTTP-only cookie.
- First registered user is `ADMIN`. Later users are `PENDING` until approved.
- Middleware and `requireApprovedUser` protect Scan routes. Admins grant per-product access (LynxScan / Lynx GEO).

### Bidirectional JSON Sync
The "New Scan" page keeps a visual form and a JSON editor in sync on a single `config` object.
