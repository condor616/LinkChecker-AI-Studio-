#!/usr/bin/env bash
# Idempotent dependency setup for the Lynx Scan Cloud Agent environment.
#
# Runs after the repository is checked out. Installs the system services the app
# depends on (PostgreSQL + Redis) and the Node dependencies. With environment
# builds this runs once to create the baseline snapshot; per-boot service startup
# lives in start.sh instead.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing system packages (PostgreSQL, Redis)..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql postgresql-contrib redis-server

echo "==> Installing Node dependencies..."
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> install.sh complete."
