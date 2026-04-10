#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.test.yml"

export DATABASE_URL="${DATABASE_URL:-postgresql://paymentflow:paymentflow@localhost:55432/paymentflow_test?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://localhost:56379}"
export RUN_INTEGRATION=true
export TEST_HOLDER_EMAIL="${TEST_HOLDER_EMAIL:-admin@paymentflow.com}"
export TEST_HOLDER_PASSWORD="${TEST_HOLDER_PASSWORD:-password123}"
export ALLOW_PUBLIC_REGISTRATION=true

cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" up -d --wait

cd "$ROOT_DIR"

npm run db:migrate:deploy --workspace=@paymentflow/database
npm run db:seed --workspace=@paymentflow/database
npm run --workspace=@paymentflow/api test:integration
