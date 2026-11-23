#!/usr/bin/env bash
# One-command deploy/update for deploy/cloud.
set -euo pipefail
cd "$(dirname "$0")/../deploy/cloud"

if [ ! -f .env ]; then
  echo "Missing deploy/cloud/.env — copy .env.example to .env and set FREEFHANDS_DOMAIN." >&2
  exit 1
fi

docker compose pull
docker compose up -d
docker compose ps
