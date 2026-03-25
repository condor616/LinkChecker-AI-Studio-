# Developer Documentation

## Architecture Overview

This application is built using a modern Next.js stack with a focus on simplicity and performance.

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: SQLite (via `better-sqlite3`)
- **ORM**: Drizzle ORM
- **Styling**: Tailwind CSS + Shadcn UI components
- **Authentication**: Custom JWT implementation using `jose`
- **Crawler**: Custom background worker using `cheerio` and `p-limit`

### Database Schema
The schema is defined in `lib/db/schema.ts`:
- `users`: Stores user accounts, roles (ADMIN, PENDING, USER), and resource limits (`maxJobs`).
- `scans`: Represents a crawling job. Contains the configuration JSON and current status.
- `links`: Represents individual URLs found during a scan. Tracks status (PENDING, SUCCESS, BROKEN) and parent-child relationships.

### Crawler Engine
The crawler runs as a background interval within the Node.js process (`lib/crawler/worker.ts`).
- It polls the database for `RUNNING` scans.
- It respects the user's `maxJobs` setting using `p-limit` to control concurrency.
- It uses `AbortController` to handle timeouts.
- New links are extracted using `cheerio` and added to the database as `PENDING`.

*Note on Serverless*: This background worker approach works well in stateful environments (Local, VPS, Docker). In serverless environments (like Vercel), this worker will be suspended. For serverless, consider migrating the worker logic to a queue-based system like Inngest or a separate worker service.

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
