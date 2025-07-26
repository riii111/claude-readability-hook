FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
RUN find /app/.venv -type d -name __pycache__ -prune -exec rm -rf {} + \
    && find /app/.venv -type d -name "*.dist-info" -prune -exec rm -rf {} +

FROM gcr.io/distroless/python3-debian12 AS runtime
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app app
COPY server.py .
ENV PATH="/app/.venv/bin"
USER 1000:1000
EXPOSE 8000
CMD ["/app/.venv/bin/python", "/app/server.py"]
