# ---------- playwright stage (chromiumのみ取得) ----------
FROM mcr.microsoft.com/playwright:v1.40.0-jammy AS pw
RUN npx playwright install --with-deps chromium \
    && rm -rf /ms-playwright/firefox* /ms-playwright/webkit* /ms-playwright/*ffmpeg* /root/.cache/* || true

# ---------- node deps ----------
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- runtime ----------
FROM node:22-slim AS runner
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
# chromium が必要とする最小限ライブラリ
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libnss3 libxkbcommon0 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libasound2 \
    && rm -rf /var/lib/apt/lists/*
RUN rm -rf /usr/share/man/* /usr/share/doc/* /usr/share/locale/* || true
COPY --from=pw /ms-playwright /ms-playwright
RUN set -eux; \
  dir=$(find /ms-playwright -maxdepth 1 -type d -name 'chromium-*' | head -n1); \
  if [ -n "$dir" ]; then \
    cd "$dir"; \
    if [ -d locales ]; then find locales -type f ! -name 'en-US.pak' ! -name 'ja.pak' -delete; fi; \
    rm -rf swiftshader *.bin *.symbols *.debug test* perf_tests || true; \
  fi
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY renderer.js ./
USER node
EXPOSE 3000
CMD ["node", "renderer.js"]
