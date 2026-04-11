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

- **Queue Management**: The Next.js app enqueues scan tasks into a `scan-jobs` queue managed by BullMQ and Redis.
- **Worker Service**: A separate worker service (`worker/index.ts`) processes these jobs. It is containerized and can be scaled independently.
- **Concurrency**: The worker supports configurable concurrency (via `BULLMQ_CONCURRENCY` env var).
- **Extensibility**: The worker uses `cheerio` for extraction and respects user-defined crawl depth and exclusion rules.
- **Monitoring**: A BullBoard UI is available at `http://localhost:3001/admin/queues` (when running via Docker) to monitor job status, retries, and failures.

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
