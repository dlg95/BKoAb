# Build frontend on the host platform (avoids QEMU node crashes on Apple Silicon).
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# Runtime: FastAPI + static SPA (linux/amd64 for Cloudflare Containers)
FROM python:3.12-slim-bookworm
WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src
# dxpdf provides DOCX→PDF (MIT, native wheel) — no LibreOffice in the image
RUN pip install --no-cache-dir .

COPY --from=frontend /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data/exports /app/data/letterheads /app/data/invoices

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "bkoab.main:app", "--host", "0.0.0.0", "--port", "8000"]
