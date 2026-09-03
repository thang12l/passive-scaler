#!/bin/sh
set -e

echo "Applying database schema..."
for i in $(seq 1 30); do
  if npx prisma db push; then
    echo "Database ready."
    break
  fi
  echo "Database not ready, retrying ($i/30)..."
  sleep 2
done

exec npx next dev -H 0.0.0.0 -p "${PORT:-3001}"
