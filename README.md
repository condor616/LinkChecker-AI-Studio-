# 🔗 LinkChecker Pro

![LinkChecker Pro Preview](public/preview.png)

**LinkChecker Pro** is a high-performance, professional-grade broken link checker built for reliability and speed. Designed with a premium dark aesthetic, it provides deep recursive crawling, real-time progress monitoring, and advanced report triage.

---

## ✨ Features

- 🏎️ **High-Performance Engine**: Optimized concurrent crawling for rapid link verification.
- 📂 **Hybrid Storage**: Local-first performance powered by SQLite and Drizzle ORM.
- 🔐 **Secure Auth**: Built-in multi-user support with JWT authentication and Admin approval workflow.
- 🛠️ **Powerful Dashboard**: Real-time scan progress, live debug console, and comprehensive link analysis.
- 📋 **Scan Presets**: Save and reuse configurations for frequent audits.
- 🔍 **Detail-Oriented**: Capture HTML snippets to quickly locate broken links in your source code.
- 🛡️ **Resource Control**: Per-user job limits to ensure system stability.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: 18.x or later
- **npm** or **yarn**

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd LinkChecker-Pro
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Launch the application**:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to see the application in action.

---

## 🛠️ Management & Maintenance

### Administrative Setup
The **first user** to register on a new installation is automatically granted the **ADMIN** role. Subsequent users are marked as **PENDING** and must be approved by an administrator via the **Users** management dashboard.

### Resetting the System
To wipe all data (scans, users, and templates) and start fresh:
```bash
npm run reset-db
```

### Development Commands
- `npm run dev`: Start Next.js in development mode.
- `npm run build`: Create a production-ready build.
- `npm start`: Run the production server.
- `npm run lint`: Run ESLint to check for code quality issues.

---

## 🏗️ Technical Stack

- **Framework**: [Next.js 15+](https://nextjs.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Database**: [SQLite](https://www.sqlite.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

---

Developed with ❤️ for the world to use.
