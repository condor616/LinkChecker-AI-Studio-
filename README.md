# Lynx Scan & Lynx GEO

**Lynx Scan** is a high-performance link monitoring platform with deep recursive crawling, real-time progress, and report triage.

**Lynx GEO** (AI Audit) is a sibling app in this repository that scores sites for AI discoverability (structured data, crawlability signals, content freshness, and related checks).

Both apps share PostgreSQL and Redis, use separate BullMQ queues, and can share a login session across public hostnames when configured.

| App | Purpose | Local URL | Production example |
| --- | --- | --- | --- |
| Lynx Scan | Broken-link and crawl audits | http://localhost:3000 | https://lynxscan.condor616.com |
| Lynx GEO | AI discoverability audits | http://localhost:3010 | https://lynxgeo.condor616.com |

This README is the canonical guide for local development, Proxmox / Docker production, reverse-proxy setup, security, operations, and contributing.

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Repository layout](#repository-layout)
4. [Prerequisites](#prerequisites)
5. [Install from scratch](#install-from-scratch)
6. [Environment variables](#environment-variables)
7. [Authentication model](#authentication-model)
8. [Running locally](#running-locally)
9. [Production deployment (Proxmox + Nginx Proxy Manager)](#production-deployment-proxmox--nginx-proxy-manager)
10. [Operations](#operations)
11. [Security](#security)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)
14. [Contributing](#contributing)
15. [License](#license)

---

## Features

### Lynx Scan

- Recursive crawling with depth, path scope, exclude rules, and target-URL modes
- Real-time scan progress and link triage (broken, skipped, challenged, auth-gated)
- Optional HTTP Basic auth and cookie headers for gated sites
- Cloudflare challenge assistance via FlareSolverr
- Per-user isolated Postgres databases for scan data
- Templates, backups/restores, and admin user management

### Lynx GEO

- AI-discoverability oriented audits with scored checks and actionable findings
- Shared auth with Lynx Scan (same users table / JWT secret)
- Separate worker queue (`lynxgeo-jobs`) so Scan and GEO scale independently
- Public methodology docs page (`/docs`)

---

## Architecture

```text
Browser
  ├─ https://lynxscan…  → Lynx Scan (Next.js)
  └─ https://lynxgeo…   → Lynx GEO (Next.js)
           │
           ├─ Central Postgres (users, settings)
           ├─ Per-user DBs (lynx_scan_<id>, lynx_geo_<id>)
           ├─ Redis + BullMQ
           │     ├─ scan-jobs      → Lynx Scan worker
           │     └─ lynxgeo-jobs   → Lynx GEO worker
           └─ FlareSolverr (optional CF bypass)
```

**Important:** local development runs Next.js on the host and Docker for Postgres/Redis/workers. Production (`docker-compose.prod.yml`) runs **both apps and both workers** in containers on one private Docker network, publishing only the two HTTP ports to the host (for Nginx Proxy Manager).

---

## Repository layout

```text
.
├── app/                      # Lynx Scan Next.js App Router
├── apps/lynxgeo/              # Lynx GEO Next.js app + worker
├── packages/
│   ├── auth/                 # JWT + product access helpers
│   ├── backup/               # Backup/restore utilities
│   ├── crawler-core/         # Fetch, SSRF, discovery shared by both apps
│   └── db/                   # Per-user DB naming helpers
├── docker/services/          # Local-dev Compose (db/redis/worker/pgAdmin)
├── docker-compose.yml        # Legacy Lynx Scan-only full Docker stack
├── docker-compose.prod.yml   # Recommended production stack (Scan + GEO)
├── worker/                   # Lynx Scan BullMQ worker
├── SECURITY.md
└── docs/SECURITY_REVIEW.md
```

---

## Prerequisites

### Local development

- **Node.js 20+** and **npm**
- **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose** (Linux)
- **Git**

### Production (Proxmox)

- A dedicated **Linux VM** (recommended) with Docker Engine + Compose plugin
- Outbound internet access (image pulls, FlareSolverr, crawl targets)
- A reverse proxy with TLS — this guide assumes **Nginx Proxy Manager**
- DNS A/AAAA records for your public hostnames pointing at NPM (or your edge)

**Suggested VM size (starting point):** 4 vCPU, 8 GB RAM, 40+ GB disk. FlareSolverr (Chromium) and concurrent crawls are memory-heavy; scale up if you run many parallel jobs.

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
   - `POSTGRES_PASSWORD` — a strong database password

4. **Start Docker Desktop / Docker Engine**, then launch apps (see [Running locally](#running-locally)).

On first local start, `predev` / `prestart` scripts bring up Docker services and run `drizzle-kit push` to create the schema.

---

## Environment variables

All apps read the **repository-root** `.env`. Never commit real secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_URL` | Yes (prod) | Canonical Lynx Scan public URL (emails, self links) |
| `NEXTAUTH_URL` | Recommended | Same as `APP_URL` in production |
| `NEXT_PUBLIC_GEO_URL` | Yes | Browser link from Scan → GEO (**baked at image build time**) |
| `NEXT_PUBLIC_LYNXSCAN_URL` | Yes | Browser link from GEO → Scan (**baked at image build time**) |
| `AUTH_COOKIE_DOMAIN` | Optional | e.g. `.condor616.com` to share login across both apps |
| `JWT_SECRET` | Yes | Session signing + backup SMTP encryption key (≥ 32 chars) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Yes | Central database credentials |
| `DATABASE_URL` | Auto in Compose | Full Postgres URL; production Compose forces host `db` |
| `REDIS_URL` | Local: yes | Local host Redis; production Compose forces `redis://redis:6379` |
| `FLARESOLVERR_URL` | Optional | Challenge solver endpoint |
| `TRUST_PROXY` | Prod: `true` | Trust `X-Forwarded-For` / `X-Real-IP` behind NPM |
| `ENABLE_BULL_BOARD` | Prod: `false` | Queue UI on the Scan worker (dev-only by default) |
| `SMTP_*` / `MAIL_ADMIN` | Optional | Pending-user + password-reset email |

### Local vs production URL examples

**Local `.env`**

```env
APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_GEO_URL=http://localhost:3010
NEXT_PUBLIC_LYNXSCAN_URL=http://localhost:3000
TRUST_PROXY=false
# AUTH_COOKIE_DOMAIN=   # leave unset for localhost
```

**Production `.env` (example)**

```env
APP_URL=https://lynxscan.condor616.com
NEXTAUTH_URL=https://lynxscan.condor616.com
NEXT_PUBLIC_GEO_URL=https://lynxgeo.condor616.com
NEXT_PUBLIC_LYNXSCAN_URL=https://lynxscan.condor616.com
AUTH_COOKIE_DOMAIN=.condor616.com
TRUST_PROXY=true
ENABLE_BULL_BOARD=false
JWT_SECRET=<openssl rand -hex 32>
POSTGRES_PASSWORD=<strong unique password>
```

> **Build-time note:** `NEXT_PUBLIC_*` values are compiled into Next.js client bundles. Changing them in `.env` after images are built has **no effect** until you rebuild (`npm run prod:build` / `prod:up --build`).

---

## Authentication model

1. Anyone can open `/login?register=true` and create an account.
2. The **first** registered user becomes **ADMIN** (bootstrap).
3. Every later user is created as **PENDING**.
4. PENDING users cannot use Scan or GEO APIs/UI until an admin approves them (**Users** admin screen → role `USER` or `ADMIN`).
5. Admins also grant **per-product access** (`lynxscan`, `lynxgeo`).
6. With `AUTH_COOKIE_DOMAIN=.yourdomain.com` and HTTPS, a single login works on both public hostnames.

Pending signups can optionally notify admins when SMTP is configured.

---

## Running locally

Do **not** mix local `npm run dev` with `docker-compose.prod.yml` on the same host ports.

### Development (recommended)

Next.js runs on the host; Docker provides Postgres, Redis, workers, FlareSolverr, and (local only) pgAdmin.

| Command | What starts |
| --- | --- |
| `npm run dev` | Lynx Scan (:3000) + Scan worker |
| `npm run dev:lynxgeo` | Lynx GEO (:3010) + GEO worker |
| `npm run dev:all` | Both apps + both workers |

### Local production-mode (host Next.js)

| Command | What starts |
| --- | --- |
| `npm run build && npm run start` | Lynx Scan only |
| `npm run build:lynxgeo && npm run start:lynxgeo` | Lynx GEO only |
| `npm run build:all && npm run start:all` | Both apps + Docker workers |

### Stop / cleanup

| Action | Command |
| --- | --- |
| Stop Scan Docker stack | `npm run stop-docker` |
| Stop GEO Docker worker | `npm run stop-docker:lynxgeo` |
| Stop everything | `npm run stop:all` |

### Rebuild workers after code changes

Worker images bake source at build time (no live bind-mount).

| Stack | Lynx Scan | Lynx GEO |
| --- | --- | --- |
| Local dev | `npm run rebuild-worker:dev` | `npm run rebuild-worker:lynxgeo:dev` |
| Legacy root compose | `npm run rebuild-worker` | `npm run rebuild-worker:lynxgeo` |

### Local port reference

| Service | Local `docker/services` | Legacy `docker-compose.yml` | Production `docker-compose.prod.yml` |
| --- | --- | --- | --- |
| Lynx Scan | 3000 (host Next) | 3001 | **3001** (published) |
| Lynx GEO | 3010 (host Next) | — | **3010** (published) |
| PostgreSQL | 5432 | 5433 | **not published** |
| Redis | 6379 | 6380 | **not published** |
| FlareSolverr | 8191 | 8191 | **not published** |
| Bull Board | 3002 | — | **disabled** |
| pgAdmin | 5050 | 5051 | **omitted** |

---

## Production deployment (Proxmox + Nginx Proxy Manager)

### 1. Create a Linux VM

1. Create a VM on Proxmox (Debian 12 / Ubuntu 22.04+ recommended).
2. Assign a static LAN IP (example: `192.168.1.50`).
3. Install Docker Engine and the Compose plugin ([Docker docs](https://docs.docker.com/engine/install/)).
4. Clone this repository onto the VM (or copy a release tarball).

### 2. Configure production `.env`

```bash
cp .env.example .env
# edit .env with HTTPS public URLs, JWT_SECRET, POSTGRES_PASSWORD, AUTH_COOKIE_DOMAIN, TRUST_PROXY=true
```

Use the production URL block from [Environment variables](#environment-variables).

### 3. Build and start the production stack

```bash
npm run prod:config   # validates compose + env interpolation
npm run prod:up       # build images + start detached
npm run prod:ps
npm run prod:logs
```

Equivalent raw Compose:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Services started: `app`, `lynxgeo`, `worker`, `lynxgeo-worker`, `db`, `redis`, `flaresolverr`.

**Only** host ports `3001` (Scan) and `3010` (GEO) are published. Postgres, Redis, and FlareSolverr stay on the private Compose network. pgAdmin is not included.

### 4. DNS

Create records:

- `lynxscan.condor616.com` → your Nginx Proxy Manager public IP
- `lynxgeo.condor616.com` → same

### 5. Nginx Proxy Manager

Create two Proxy Hosts:

| Domain | Forward hostname / IP | Forward port | TLS |
| --- | --- | --- | --- |
| `lynxscan.condor616.com` | VM LAN IP (e.g. `192.168.1.50`) | `3001` | Request Let's Encrypt certificate, Force SSL |
| `lynxgeo.condor616.com` | same VM | `3010` | same |

Recommended NPM options:

- **Websockets Support**: on
- **Block Common Exploits**: on
- Forward headers enabled (NPM default `X-Forwarded-For` / `X-Real-IP` / `X-Forwarded-Proto`)

### 6. VM firewall

Allow inbound **only** from the NPM host (or LAN management jump host) to TCP `3001` and `3010`. Do **not** expose `5432`, `6379`, `8191`, Bull Board, or pgAdmin publicly.

Example (`ufw`):

```bash
sudo ufw default deny incoming
sudo ufw allow OpenSSH
sudo ufw allow from <NPM_LAN_IP> to any port 3001 proto tcp
sudo ufw allow from <NPM_LAN_IP> to any port 3010 proto tcp
sudo ufw enable
```

### 7. First-login bootstrap

1. Open `https://lynxscan.condor616.com`
2. Register the first account → becomes ADMIN
3. Register a second test user → stays PENDING until approved
4. Approve the user and grant product access
5. Confirm shared login on `https://lynxgeo.condor616.com` when `AUTH_COOKIE_DOMAIN` is set

### 8. Schema / migrations

The production `app` container sets `RUN_MIGRATIONS=true` so schema push runs on boot. After pulling schema changes, rebuild/restart the app container and confirm logs show a successful migration.

### 9. Upgrades

```bash
git pull
npm run prod:up          # rebuild + recreate
# or stepwise:
npm run prod:build
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

If you change `NEXT_PUBLIC_*` URLs, you **must** rebuild app images.

### 10. Rollback

1. `git checkout <previous-commit>`
2. `npm run prod:up`
3. Restore a Postgres volume backup if the schema is incompatible (see [Operations](#operations))

### 11. Legacy Compose notes

- Root `docker-compose.yml` is a Lynx Scan-oriented stack that still publishes Postgres/Redis/pgAdmin — **prefer `docker-compose.prod.yml` for public deployments**.
- `apps/lynxgeo/docker-compose.yml` expects the local-dev Docker network and is not the production path.

---

## Operations

### Logs & health

```bash
npm run prod:logs
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env exec db pg_isready -U lynx_scan
docker compose -f docker-compose.prod.yml --env-file .env exec redis redis-cli ping
```

### Scaling workers

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --scale worker=3
```

Tune `BULLMQ_CONCURRENCY` / `BULLMQ_CONCURRENCY_GEO` in `.env`.

### Backups

**Application backups** (per-user zip via the UI/API) encrypt SMTP secrets with a key derived from `JWT_SECRET`. Keep that secret in a password manager; rotating it breaks restore of older encrypted settings.

**Infrastructure backups** (recommended for Proxmox):

```bash
# Stop writes briefly for a consistent snapshot, or use Postgres dump:
docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
  pg_dumpall -U lynx_scan > lynx-backup-$(date +%F).sql

# Docker volumes (postgres_data, redis_data) can also be snapshotted at the VM/ZFS layer.
```

Store dumps **off-box**. Test restore on a staging VM before you need it.

### Soft / hard data reset (local only)

```bash
npm run reset-all   # wipe app data; keep .env + volumes
npm run nuke        # destroy .env, volumes, caches — then reinstall
```

Do not run `nuke` against a production host unless you intend to destroy everything.

---

## Security

See [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities and [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) for the production-readiness triage.

### Built-in controls

- JWT session cookie: `httpOnly`, `sameSite=strict`, `secure` in production
- Registration rate limits; pending-admin approval before product use
- Concurrent job limits via per-user `maxJobs`
- SSRF guards on crawler fetches, redirect hops, FlareSolverr, and auth validation
- Backup zip-slip protection and restore file allowlisting
- Security headers (CSP, HSTS on HTTPS, frame denial, nosniff, referrer policy)
- Production Compose: no public Postgres/Redis/FlareSolverr/pgAdmin; Bull Board off by default

### Production checklist

- [ ] Strong unique `JWT_SECRET` and `POSTGRES_PASSWORD`
- [ ] HTTPS via NPM; Force SSL enabled
- [ ] `TRUST_PROXY=true` only behind NPM
- [ ] Firewall limits app ports to the proxy host
- [ ] `ENABLE_BULL_BOARD=false`
- [ ] Images rebuilt after setting public `NEXT_PUBLIC_*` URLs
- [ ] First admin created; subsequent users require approval
- [ ] Off-box database backups scheduled and tested
- [ ] Host packages / Docker images kept updated

---

## Testing

```bash
npm run test          # Lynx Scan unit/integration (Vitest)
npm run test:lynxgeo  # Lynx GEO unit tests
npm run test:e2e      # Playwright E2E (Lynx Scan)
npm run lint          # ESLint
```

Security-focused unit coverage includes SSRF policy and zip-slip path checks under `tests/unit/`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Cross-app links still point at localhost | `NEXT_PUBLIC_*` baked at build | Rebuild with correct build args / `prod:up` |
| Login on GEO does not carry to Scan | Cookie domain / HTTPS | Set `AUTH_COOKIE_DOMAIN=.example.com`, use HTTPS, matching secret |
| Jobs stuck in Waiting | Worker not running / wrong Redis | Check `prod:ps`, ensure Compose overrides Redis to `redis://redis:6379` |
| CF bypass never runs | FlareSolverr down or URL blocked | Check `flaresolverr` logs; confirm target passes SSRF policy |
| Pending user cannot start audits | Role still PENDING / missing product access | Approve in Admin → Users |
| Port conflicts with local `dev` | Two stacks sharing ports | `npm run stop:all` before `prod:up` (or vice versa) |
| Compose config fails on `JWT_SECRET` | Missing required env | Copy `.env.example` and set required values |

---

## Contributing

1. Fork / branch from the default branch
2. Use focused PRs (Scan crawler, GEO scoring, infra, docs)
3. Keep local and production paths working (`npm run dev:all` and `docker-compose.prod.yml`)
4. Add/adjust tests for crawler, auth, and security-sensitive changes
5. Do not commit `.env`, backups, or secrets
6. For security bugs, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue

Deeper architecture notes live in [`DEVELOPER.md`](DEVELOPER.md).

### Release checklist (maintainers)

- [ ] Tests green (`npm run test`, `npm run test:lynxgeo`)
- [ ] `npm run prod:config` succeeds with a production-like `.env`
- [ ] Document any new env vars in `.env.example` and this README
- [ ] Note breaking migration / backup-secret implications in the release notes

---

## License

No open-source license file is published in this repository yet. Clarify licensing before redistributing or inviting external contributions at scale. Until a license is added, treat the code as all rights reserved by the repository owner.

---

Developed for reliable link monitoring and AI-discoverability auditing.
