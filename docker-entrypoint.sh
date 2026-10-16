#!/bin/sh
set -e

mkdir -p "${UPLOAD_DIR:-/data/uploads}" 2>/dev/null || true

echo "[halyard] applying database migrations"
attempt=1
until prisma migrate deploy --schema ./prisma/schema.prisma; do
  if [ "$attempt" -ge 10 ]; then
    echo "[halyard] migrations failed after $attempt attempts" >&2
    exit 1
  fi
  echo "[halyard] database not ready, retrying in 3s (attempt $attempt)" >&2
  attempt=$((attempt + 1))
  sleep 3
done

echo "[halyard] starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js
