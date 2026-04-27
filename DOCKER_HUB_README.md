# 🔗 Lynx Scan

**Lynx Scan** is a high-performance, professional-grade digital integrity and link monitoring platform built for reliability and speed. Designed for deep recursive crawling and real-time monitoring, it provides enterprise-grade link auditing in a sleek, modern package.

## 🚀 Key Features

- **Blazing Fast Crawling**: Parallelized scanning engine designed for large-scale websites.
- **Deep Recursive Audits**: Analyzes every corner of your domain to find broken links, protocol errors, and redirect loops.
- **Targeted Monitoring**: Isolate specific assets (PDFs, landing pages, images) for high-precision audits.
- **Distributed Processing**: Powered by BullMQ and Redis for robust background task management.
- **Administrative Dashboard**: Manage users, monitor scan history, and triage broken links with ease.

---

## 🛠 Tech Stack

- **Frontend/API**: Next.js 15 (Standalone mode)
- **Background Worker**: Node.js (BullMQ)
- **Database**: PostgreSQL (via Drizzle ORM)
- **Queue System**: Redis
- **Styling**: Tailwind CSS v4

---

## 📦 Quick Start (Docker Compose)

The easiest way to run Lynx Scan is using the official images with Docker Compose.

### 1. Create a `docker-compose.yml`
Save the following configuration to a file on your server:

```yaml
services:
  app:
    image: angilma1/lynxscan:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://${POSTGRES_USER:-lynx_scan}:${POSTGRES_PASSWORD:-localpass}@db:5432/${POSTGRES_DB:-lynx_scan}
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-secure-secret-key
      - NEXTAUTH_URL=http://localhost:3000
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always

  worker:
    image: angilma1/lynxscan-worker:latest
    environment:
      - DATABASE_URL=postgres://${POSTGRES_USER:-lynx_scan}:${POSTGRES_PASSWORD:-localpass}@db:5432/${POSTGRES_DB:-lynx_scan}
      - REDIS_URL=redis://redis:6379
      - BULLMQ_CONCURRENCY=10
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-lynx_scan}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-localpass}
      POSTGRES_DB: ${POSTGRES_DB:-lynx_scan}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lynx_scan"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### 2. Configure Environment
Create a `.env` file in the same directory and configure your credentials. **The `DATABASE_URL` must point to the `db` service.**

```env
# Database Credentials
POSTGRES_USER=lynx_scan
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=lynx_scan

# Security (Minimum 32 characters)
JWT_SECRET=your_32_char_random_secret_key_here

# Optional: pgAdmin (for DB management)
PGADMIN_EMAIL=admin@lynxscan.com
PGADMIN_PASSWORD=admin
```

### 3. Launch
```bash
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) to access the UI.

---

## 🛠️ Management

- **First User**: The first person to register is automatically granted the **ADMIN** role.
- **Worker Monitoring**: Access the BullMQ dashboard at `http://your-server:3001/admin/queues` (if port 3001 is mapped).
- **Database Management**: You can optionally add **pgAdmin 4** to your compose file for direct database access.

---

Developed with ❤️ for the world to use.
