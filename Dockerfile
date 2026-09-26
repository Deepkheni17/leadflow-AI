# ---- 1. Build the React dashboard -------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# ---- 2. Python API (serves the built dashboard too) -------------------------
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app/apps/api

COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY apps/api/ ./
RUN uv sync --frozen --no-dev
COPY --from=web /web/dist /app/apps/web/dist

ENV PATH="/app/apps/api/.venv/bin:$PATH" \
    LEADFLOW_HOST=0.0.0.0 \
    LEADFLOW_PORT=8000 \
    LEADFLOW_DATABASE_URL=sqlite+aiosqlite:////data/leadflow.db
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["leadflow-api"]
