# ---------- deps (prod only) ----------
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile --production

# ---------- build (dev deps + tsc) ----------
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile
COPY . .
# Skip build, use TypeScript directly

# ---------- runtime ----------
FROM oven/bun:1-alpine AS runner
USER 1000:1000
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
EXPOSE 7777
CMD ["bun", "src/index.ts"]
