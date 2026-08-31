# Developer Documentation

## Architecture Overview

This application is built using a modern Next.js stack with a distributed task processing system.

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: SQLite (via `better-sqlite3`, multi-tenant)
- **ORM**: Drizzle ORM
- **Task Queue**: BullMQ (running on Redis)
- **Worker**: Standalone Node.js worker service (Docker-based)
- **Styling**: Vanilla CSS + Shadcn UI components
- **Authentication**: Custom JWT implementation using `jose`

### Database Schema
The schema is defined in `lib/db/schema.ts`:
- `users`: Stores user accounts, roles (ADMIN, PENDING, USER), and resource limits.
- `scans`: Represents a crawling job. Contains the configuration JSON and current status.
- `links`: Represents individual URLs found during a scan. Tracks status (PENDING, SUCCESS, BROKEN) and parent-child relationships.

> [!NOTE]
> Each user has their own isolated SQLite database file, managed via a tenant-based connection system in `lib/db/index.ts`.

### Crawler Engine (BullMQ Worker)
The crawler has been migrated from an internal interval to a robust, asynchronous queue-based system.

LynxScan and Lynx GEO share one Redis instance but **two BullMQ queue names**:

| Queue | App | Enqueued by | Processed by |
| --- | --- | --- | --- |
| `scan-jobs` | LynxScan | LynxScan Next (`lib/bullmq.ts`) | LynxScan worker (`worker/index.ts`) |
| `lynxgeo-jobs` | Lynx GEO (AI Audit) | GEO Next (`apps/lynxgeo/lib/geo/queue.ts`) | GEO worker (`apps/lynxgeo/worker/index.ts`) |

Do not merge these queues. GEO must never enqueue or process `scan-jobs`.

`npm run dev:lynxgeo` matches LynxScan: cleanup leftover host Next/tsx processes, then Docker `lynxgeo-worker` listens and processes immediately. `predev` kills leftover `npm run worker:lynxgeo` / host `tsx worker/index.ts` so they do not sit beside compose. Use `npm run worker:lynxgeo` only when you are not using the Docker worker (`npm run stop-docker:lynxgeo` first).

Bull **Waiting = 0** with **Active = 1** means a worker is processing; the queue is not empty.

- **Queue Management**: The Next.js app enqueues scan tasks into a `scan-jobs` queue managed by BullMQ and Redis.
- **Worker Service**: A separate worker service (`worker/index.ts`) processes these jobs. It is containerized and can be scaled independently.
- **Concurrency**: The worker supports configurable concurrency (via `BULLMQ_CONCURRENCY` env var).
- **Extensibility**: The worker uses `cheerio` for extraction and respects user-defined crawl depth and exclusion rules.
- **Monitoring**: Bull Board lists both queues. Local worker: `http://localhost:3001/admin/queues`. Docker `lynxscan-dev` stack maps that to `http://localhost:3002/admin/queues`.

### Local Development
To run the full stack locally (including Redis and the Worker):
```bash
# Using the provided docker-compose
cd docker/services
docker-compose up -d
```

### Authentication Flow
- Simple JWT-based auth.
- Tokens are stored in HTTP-only cookies.
- First user registration gets `ADMIN`. Others get `PENDING`.
- Middleware or layout checks protect routes.

### Bidirectional JSON Sync
The "New Scan" page features a bidirectional sync between a visual form and a JSON editor.
- State is held in a single `config` object.
- `useEffect` updates the JSON text when the UI changes.
- An `onChange` handler parses the JSON text and updates the UI state if valid.
