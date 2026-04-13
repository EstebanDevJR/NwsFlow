#!/bin/sh
set -e
cd /app

# Workaround for images built without generated shared/src/secrets.js.
# Node resolves @paymentflow/shared to src/index.ts, which imports ./secrets.js.
if [ ! -f "packages/shared/src/secrets.js" ] && [ -f "packages/shared/src/secrets.ts" ]; then
  cat > "packages/shared/src/secrets.js" <<'EOF'
export * from './secrets.ts';
EOF
fi

if [ -n "${DATABASE_URL}" ] && [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  if [ -d "packages/database/prisma/migrations" ] && [ -n "$(ls -A packages/database/prisma/migrations 2>/dev/null)" ]; then
    npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
  fi
fi

exec "$@"
