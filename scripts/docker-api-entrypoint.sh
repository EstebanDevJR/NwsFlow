#!/bin/sh
set -e
cd /app

if [ -n "${DATABASE_URL}" ] && [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  if [ -d "packages/database/prisma/migrations" ] && [ -n "$(ls -A packages/database/prisma/migrations 2>/dev/null)" ]; then
    npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
  fi
fi

exec "$@"
