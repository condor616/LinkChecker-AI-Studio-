# Broken Link Checker Pro

A professional-grade Broken Link Checker web application built with Next.js, SQLite, and Shadcn UI.

## Features
- **Hybrid Storage**: Local-first SQLite database.
- **Onboarding Wizard**: Step-by-step setup at `/setup`.
- **Multi-User & Auth**: Admin approval workflow, JWT authentication, and user blocking.
- **Resource Governance**: Per-user concurrent job limits (`maxJobs`).
- **Crawling Engine**: Recursive crawling with depth tracking, global rate limiting, and pause/resume.
- **Bidirectional Config**: Sync between UI form and JSON editor with Template support.
- **Advanced Dashboard**: Real-time progress, live debug console, and report triage with HTML snippets.

## Getting Started (Local / Self-Hosted)

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### First Run & Admin Setup
The first user to register will automatically be granted the **ADMIN** role. Subsequent users will be marked as **PENDING** and must be approved by an Admin via the "Users" dashboard.

### System Maintenance
To reset the database and start fresh:
```bash
npm run reset-db
```

## Cloud / Enterprise Deployment
For enterprise deployments, you can swap out the SQLite database for PostgreSQL or Supabase by updating the Drizzle ORM configuration in `lib/db/index.ts` and `drizzle.config.ts`.

### Vercel Deployment
Note: Vercel's serverless environment is not ideal for long-running background workers or local SQLite. For Vercel, you should:
1. Use a hosted PostgreSQL database (e.g., Supabase, Vercel Postgres).
2. Move the crawler worker to a dedicated background service (e.g., Inngest, Upstash QStash, or a separate Node.js worker dyno on Render/Heroku).

### Docker Deployment
A standard Node.js Dockerfile can be used to deploy this application to a VPS, keeping the SQLite database in a persistent volume.

## Usage
1. **New Scan**: Go to "New Scan".
2. **Configure**: Use the UI or the JSON editor to set the starting URL, max depth, rate limit, and exclusion regex.
3. **Monitor**: View the scan progress on the dashboard. You can pause and resume scans at any time.
4. **Triage**: Click on a scan to view detailed reports of broken links, including the parent page where the link was found.
