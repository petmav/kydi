#!/bin/sh
# Kydi container entrypoint. Idempotent: safe to run on every start and from several containers at once
# (`prisma migrate deploy` takes a Postgres advisory lock, so concurrent boots apply each migration once).
set -eu

UPLOAD_DIR="${UPLOAD_DIR:-/data/uploads}"
mkdir -p "$UPLOAD_DIR" 2>/dev/null || true
if [ ! -w "$UPLOAD_DIR" ]; then
  echo "[kydi] warning: upload directory $UPLOAD_DIR is not writable by uid $(id -u); uploads will fail" >&2
fi

if [ "${KYDI_SKIP_MIGRATIONS:-false}" = "true" ]; then
  echo "[kydi] KYDI_SKIP_MIGRATIONS=true: not applying database migrations"
else
  echo "[kydi] applying database migrations"
  attempt=1
  until prisma migrate deploy --schema ./prisma/schema.prisma; do
    if [ "$attempt" -ge 20 ]; then
      echo "[kydi] migrations failed after $attempt attempts" >&2
      exit 1
    fi
    echo "[kydi] database not ready or migration failed, retrying in 3s (attempt $attempt)" >&2
    attempt=$((attempt + 1))
    sleep 3
  done
fi

echo "[kydi] starting server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js
