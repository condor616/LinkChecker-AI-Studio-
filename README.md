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
To wipe all data (scans, users, templates, and backups) and start fresh:
```bash
npm run reset-all
```

### Database Management
To browse all user databases, use **pgAdmin 4**, which is included in the Docker stack:
- **URL**: `http://localhost:5050`
- **Default Credentials**: `admin@linkchecker.com` / `admin`
- **Setup**: Once logged in, add a new server connecting to host `db` with your database credentials.

### Development Commands
- `npm run dev`: Start Next.js in development mode.
- `npm run build`: Create a production-ready build.
- `npm start`: Run the production server.
- `npm run lint`: Run ESLint to check for code quality issues.

---

## 🏗️ Technical Stack

- **Framework**: [Next.js 15+](https://nextjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via Docker) with [Drizzle ORM](https://orm.drizzle.team/)
- **Message Queue**: [BullMQ](https://docs.bullmq.io/) & [Redis](https://redis.io/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

---

Developed with ❤️ for the world to use.
