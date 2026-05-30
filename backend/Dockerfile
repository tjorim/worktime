# ── build stage ──────────────────────────────────────────────────────────────
FROM python:3.14-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.10.12@sha256:72ab0aeb448090480ccabb99fb5f52b0dc3c71923bffb5e2e26517a1c27b7fec /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.14-slim

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY . .

ENV PATH="/app/.venv/bin:$PATH"

# Data directory — mount a named volume here on the VPS to persist the hday files.
RUN mkdir -p /var/data/worktime/hday_files

# Run as non-root user for security hardening.
# chown must happen BEFORE the VOLUME declaration so initial volume content
# inherits the correct ownership when Docker initialises a new named volume.
RUN groupadd --gid 1000 appgroup \
    && useradd --uid 1000 --gid appgroup --shell /bin/bash --no-create-home appuser \
    && chown -R appuser:appgroup /app /var/data/worktime

VOLUME ["/var/data/worktime"]

USER appuser

ENV ENVIRONMENT=production
ENV SHARE_DIR=/var/data/worktime/hday_files
# DATABASE_URL must be provided at runtime via environment variables or secrets.
# Example: postgresql+asyncpg://<user>:<password>@<host>/<database>

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
