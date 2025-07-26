# ---------- deps ----------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-install-project
RUN find /app/.venv -type d -name __pycache__ -prune -exec rm -rf {} +

# ---------- runtime ----------
# distrolessは/usr/bin/pythonが無く、site-packagesのみコピーではimportエラーが多発
FROM python:3.13-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app app
COPY server.py .
ENV PATH="/app/.venv/bin:$PATH" PYTHONPATH="/app"
RUN groupadd --gid 1000 app && useradd --create-home --shell /bin/bash --uid 1000 --gid 1000 app
USER 1000:1000
EXPOSE 8000
CMD ["python", "/app/server.py"]
