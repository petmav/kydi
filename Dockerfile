# syntax=docker/dockerfile:1

# ---- base -------------------------------------------------------------------
# Node.js 24 LTS, pinned by version and multi-arch index digest. Update both together:
#   docker buildx imagetools inspect node:24-alpine
FROM node:24.22.0-alpine3.24@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1

# ---- deps: install all dependencies (incl. dev, needed for the build) ------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- builder: generate Prisma client and build the standalone server -------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- prisma-cli: the migration CLI only (no application dev dependencies) ---
FROM base AS prisma-cli
WORKDIR /opt/prisma-cli
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev prisma@6.19.3 \
 && npm cache clean --force

# ---- runner: minimal runtime image -----------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    PATH=/opt/prisma-cli/node_modules/.bin:$PATH

# Prisma CLI for `prisma migrate deploy` at start-up (pinned to the client version).
COPY --from=prisma-cli /opt/prisma-cli /opt/prisma-cli

# Next.js standalone output contains only the traced production dependencies. Application files stay
# root-owned and read-only for the runtime user; only /data and the Next.js cache are writable.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN sed -i 's/\r$//' ./docker-entrypoint.sh \
 && chmod 0555 ./docker-entrypoint.sh \
 && mkdir -p /data/uploads /app/.next/cache \
 && chown -R 1001:1001 /data /app/.next/cache

USER 1001:1001
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD wget -q -T 4 -O /dev/null http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
