# 🔗 Lynx Scan

![Lynx Scan Preview](public/preview.png)

**Lynx Scan** is a high-performance, professional-grade digital integrity and link monitoring platform built for reliability and speed. Designed with a premium, multi-accented dark aesthetic, it provides deep recursive crawling, real-time progress monitoring, and advanced report triage.

## 🚀 Key Features

- **Blazing Fast Crawling**: Parallelized scanning engine designed for large-scale websites.
- **Deep Recursive Audits**: Analyzes every corner of your domain to find broken links, protocol errors, and redirect loops.
- **Targeted Monitoring**: Isolate specific assets (PDFs, landing pages, images) for high-precision audits without the noise of a full site crawl.
- **Multi-Accent Design System**: Modern, vibrant UI using Purple, Cyan, and Emerald for clear visual hierarchy and component differentiation.
- **Enterprise-Ready**: Support for custom user agents, advanced exclusion logic (regex), and subpath restriction.
- **Local-First Architecture**: Runs in your own infrastructure using SQLite for lightweight use or Docker/PostgreSQL for multi-user environments.

## 🛠 Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL / Drizzle ORM
- **Queue System**: BullMQ / Redis
- **Icons**: Lucide React
- **Animations**: Framer Motion / Motion (client-side)

## 📦 Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/lynx-scan.git
   cd lynx-scan
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Launch the application**:
   ```bash
   npm run dev
   ```
   *(Note: This command will automatically attempt to start the required PostgreSQL and Redis Docker containers via `docker-compose`.)*

Open [http://localhost:3000](http://localhost:3000) to see the application in action.

---

## 🛠️ Management & Maintenance

### Administrative Setup
The **first user** to register on a new installation is automatically granted the **ADMIN** role. Subsequent users are marked as **PENDING** and must be approved by an administrator via the **Users** management dashboard.

### Resetting the System

**Soft Reset (Keep config, wipe data)**
To wipe all data (scans, users, templates, and backups) but leave your `.env` and Docker container settings intact:
```bash
npm run reset-all
```

**Hard Reset (Nuke Everything)**
To restart completely from zero (destroys `.env`, drops all databases, destroys all Docker volumes and caches):
```bash
npm run nuke
```
*To restart after a nuke:*
1. Copy `.env.example` to `.env` and configure it.
2. Run `npm run dev` to boot the stack from a completely fresh slate.

### Database Management
To browse all user databases, use **pgAdmin 4**, which is included in the Docker stack:
- **URL**: `http://localhost:5050`
- **Default Credentials**: `admin@linkchecker.com` / `admin`
- **Setup**: Once logged in, add a new server connecting to host `db` with your database credentials.

### Development Commands
- `npm run test`: Run unit and integration tests (includes auto-setup and cleanup).
- `npm run test:e2e`: Run end-to-end tests with Playwright (includes auto-setup and cleanup).
- `npm run test:setup`: Manually prepare the test environment.
- `npm run test:teardown`: Manually cleanup all test databases.

---

## 🧪 Testing

Lynx Scan uses a robust testing suite combining **Vitest** for unit/integration logic and **Playwright** for end-to-end browser testing.

### ⚙️ Test Environment Setup
Tests run against an isolated database to ensure your development data remains untouched.

1. **Prerequisites**: Ensure Docker is running (PostgreSQL & Redis).
2. **Environment File**: The system uses `.env.test`. Ensure it contains:
   ```env
   DATABASE_URL=postgres://lynx_scan:localpass@localhost:5432/lynx_scan_test
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-test-secret
   NODE_ENV=test
   ```
3. **Database Initialization**: The test environment is automatically managed.
   - **Main Database**: `lynx_scan_test` is recreated at the start of each run.
   - **User Databases**: Any user-specific database will automatically append a `_test` suffix (e.g., `lynx_scan_user1_test`) to ensure full isolation from production data.
   - **Automatic Cleanup**: At the end of every test run (`npm run test` or `npm run test:e2e`), all `*_test` databases are automatically dropped.

You can manually trigger setup or teardown if needed:
```bash
npm run test:setup     # Prepare environment
npm run test:teardown  # Drop all test databases
```

### Unit & Integration Testing (Vitest)
Used for testing core logic, database operations, and crawler mechanics.
- **Run all tests**: `npm run test`
- **Watch mode**: `npm run test:watch`
- **UI Mode**: `npm run test:ui` (opens a beautiful interactive dashboard)

### End-to-End (E2E) Testing (Playwright)
Used for testing the full user journey in a real browser.
- **Run all E2E tests**: `npm run test:e2e`
- **UI Mode (Highly Recommended)**:
  ```bash
  npx playwright test --ui
  ```
  This opens the Playwright Test Runner, allowing you to step through tests, see snapshots, and debug in real-time.
- **Debug Mode**: `npx playwright test --debug`
- **Specific Test**: `npx playwright test tests/e2e/scan.spec.ts`

### 🗺️ Mock Testing Grounds
To verify advanced features like subpath traversal and CSS exclusions, Lynx Scan includes a multi-country mock site generator.

1. **Generate the site**:
   ```bash
   npx tsx scripts/generate-mock-site.ts
   ```
   This creates a persistent testing ground at `tests/mock-site/` with 500+ links across various regional subpaths (`/it-it/`, `/de-de/`, etc.).

2. **Serve the site**:
   The integration tests (`npm run test`) automatically start a server for this site, but you can also serve it manually for inspection:
   ```bash
   npx tsx scripts/serve-mock-site.ts
   ```
   It will be available at `http://localhost:3002`.

> [!TIP]

> When running E2E tests manually with `npx playwright test`, ensure the test database is ready by running `npm run test:setup` first if you haven't already. `npm run test:e2e` handles this automatically.

---

## 🏗️ Technical Stack

- **Framework**: [Next.js 15+](https://nextjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via Docker) with [Drizzle ORM](https://orm.drizzle.team/)
- **Message Queue**: [BullMQ](https://docs.bullmq.io/) & [Redis](https://redis.io/)

## Distributed Background Processing (BullMQ)

The application uses **BullMQ** with **Redis** to handle background link scanning. This architecture separates the heavy crawling logic from the Next.js process for better reliability and performance.

### Services
- **Web**: Next.js App (Producer).
- **Redis**: Message broker and job store.
- **Worker**: Standalone Node.js process (Consumer).

### Monitoring & UI (BullBoard)
You can monitor the worker queue in real-time by visiting the **BullBoard** dashboard:
- **URL**: `http://localhost:3001/admin/queues`
- **Features**: View active jobs, retry failed links, and monitor throughput.

### Scaling the Workers
If you have a large number of links to scan or multiple concurrent users, you can scale the worker service horizontally:

```bash
# Add 3 more workers
docker-compose -f docker/services/docker-compose.yml up -d --scale worker=4
```

**How do I know if I need more workers?**
1.  **Check BullBoard**: If the "Waiting" count is consistently growing or jobs are staying "Waiting" for more than 5-10 seconds.
2.  **Latency**: If scans are taking significantly longer than usual to complete.
3.  **Concurrency**: Each worker handles **10 concurrent links** by default (customizable via `BULLMQ_CONCURRENCY` env var).

- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

---

Developed with ❤️ for the world to use.
