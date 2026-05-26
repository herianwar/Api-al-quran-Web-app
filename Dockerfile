# ─── Build stage ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Needed by some native deps (bcrypt) at build time
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Production stage ─────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000

# Run pending migrations then boot
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
