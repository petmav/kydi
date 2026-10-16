# syntax=docker/dockerfile:1

# ---- base -------------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

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

# ---- runner: minimal runtime image -----------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

# Prisma CLI is needed at runtime for `prisma migrate deploy`.
RUN npm install -g prisma@6.19.3 --no-audit --no-fund && npm cache clean --force

COPY --from=builder --chown=1001:1001 /app/public ./public
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --chown=1001:1001 /app/prisma ./prisma
COPY --from=builder --chown=1001:1001 /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=1001:1001 /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=1001:1001 docker-entrypoint.sh ./docker-entrypoint.sh

RUN sed -i 's/\r$//' ./docker-entrypoint.sh \
 && chmod +x ./docker-entrypoint.sh \
 && mkdir -p /data/uploads \
 && chown -R 1001:1001 /data /app

USER 1001:1001
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
