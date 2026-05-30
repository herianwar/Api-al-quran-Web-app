# ─── Build stage ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Native deps (bcrypt) need a C toolchain at install time.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Install only prod dependencies in a second pass so we can copy a clean
# node_modules into the slim runtime image.
RUN npm prune --omit=dev

# ─── Production stage ─────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Runtime needs:
# - openssl: Prisma engines link against it
# - wget: container healthcheck
# - postgresql16-client: pg_dump / psql for /seed/snapshot/* endpoints
# - gzip: snapshot export/restore pipe
# No compiler toolchain — bcrypt's native binding was built in the builder
# stage and is copied via node_modules.
RUN apk add --no-cache openssl wget postgresql16-client gzip

COPY package*.json ./
COPY prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# Static fallback content (e.g. doa-fallback.json) bundled with the image
# so the API has a usable dataset even when upstream sources are down.
COPY --from=builder /app/data ./data
# Convenience scripts (restore-snapshot.sh) — available inside the container
# so admins can run them via `docker compose exec app ./scripts/...`
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health > /dev/null || exit 1

# Run pending migrations then boot
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
