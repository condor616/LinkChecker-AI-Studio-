#!/usr/bin/env bash
# Per-boot startup for the Lynx Scan Cloud Agent environment.
#
# Starts PostgreSQL and Redis, ensures the application role/database exist,
# generates a local .env if one is missing, and pushes the Drizzle schema.
# The Next.js app and the BullMQ worker themselves run as long-lived terminals
# (see .cursor/environment.json), not here. This script must be idempotent and
# must return once the backing services are ready.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_USER="lynx_scan"
PG_PASS="localpass"
PG_DB="lynx_scan"

echo "==> Starting PostgreSQL..."
PG_VER="$(ls /etc/postgresql | sort -V | tail -1)"
sudo pg_ctlcluster "$PG_VER" main start 2>/dev/null || true

echo "==> Waiting for PostgreSQL to accept connections..."
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring role and database exist..."
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${PG_USER} WITH LOGIN PASSWORD '${PG_PASS}' SUPERUSER CREATEDB;"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
  || sudo -u postgres createdb -O "${PG_USER}" "${PG_DB}"

echo "==> Starting Redis..."
mkdir -p "$HOME/.lynxscan-redis"
if ! redis-cli ping >/dev/null 2>&1; then
  redis-server --daemonize yes --dir "$HOME/.lynxscan-redis" --appendonly yes
fi

echo "==> Ensuring .env exists..."
if [ ! -f .env ]; then
  cat > .env <<EOF
APP_URL=http://localhost:3000
POSTGRES_USER=${PG_USER}
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=${PG_DB}
DATABASE_URL=postgres://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}
REDIS_URL=redis://localhost:6379
PGADMIN_EMAIL=admin@lynxscan.com
PGADMIN_PASSWORD=admin
JWT_SECRET=$(openssl rand -hex 32)
EOF
  echo "    Generated a fresh .env with a random JWT_SECRET."
fi

echo "==> Pushing database schema (Drizzle)..."
npx drizzle-kit push

echo "==> start.sh complete."
echo "    App    -> http://localhost:3000        (terminal: app)"
echo "    Worker -> http://localhost:3001/admin/queues (terminal: worker)"
