#!/bin/sh
set -e

mkdir -p "${UPLOAD_DIR:-/data/uploads}" 2>/dev/null || true

echo "[kydi] applying database migrations"
attempt=1
until prisma migrate deploy --schema ./prisma/schema.prisma; do
  if [ "$attempt" -ge 10 ]; then
    echo "[kydi] migrations failed after $attempt attempts" >&2
    exit 1
  fi
  echo "[kydi] database not ready, retrying in 3s (attempt $attempt)" >&2
  attempt=$((attempt + 1))
  sleep 3
done

echo "[kydi] starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js
