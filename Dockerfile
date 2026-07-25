# Build frontend
FROM node:22-bookworm AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# Runtime: FastAPI + static SPA
FROM python:3.12-slim-bookworm
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

COPY --from=frontend /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data/exports /app/data/letterheads /app/data/invoices

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "bkoab.main:app", "--host", "0.0.0.0", "--port", "8000"]
