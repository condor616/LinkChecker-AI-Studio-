#!/usr/bin/env bash
# Idempotent dependency setup for the Lynx Cloud Agent environment.
#
# This repo is an npm-workspaces monorepo with two Next.js apps that share one
# PostgreSQL + Redis backend:
#   - LynxScan  (repo root)      -> app on :3000, worker/BullBoard on :3001
#   - Lynx GEO  (apps/lynxgeo)   -> app on :3010, shares Redis/Postgres
#
# Installs the system services both apps depend on and the Node dependencies for
# the root workspace and the Lynx GEO app. With environment builds this runs once
# to create the baseline snapshot; per-boot service startup lives in start.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing system packages (PostgreSQL, Redis)..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql postgresql-contrib redis-server

echo "==> Installing root workspace Node dependencies (LynxScan + packages/*)..."
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

echo "==> Installing Lynx GEO app Node dependencies (apps/lynxgeo)..."
if [ -f apps/lynxgeo/package-lock.json ]; then
  npm --prefix apps/lynxgeo ci || npm --prefix apps/lynxgeo install
else
  npm --prefix apps/lynxgeo install
fi

echo "==> install.sh complete."
