#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -e ".[dev]"

cleanup() {
  trap - EXIT INT TERM
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

mkdir -p data/exports data/letterheads data/invoices

uvicorn bkoab.main:app --reload --host 127.0.0.1 --port 8000 &
API_PID=$!

if [[ -d frontend ]]; then
  cd frontend
  if [[ ! -d node_modules ]]; then
    pnpm install
  fi
  pnpm dev --host 127.0.0.1 --port 5173 &
  WEB_PID=$!
  cd ..
  echo "API:      http://127.0.0.1:8000"
  echo "Frontend: http://127.0.0.1:5173"
else
  echo "API: http://127.0.0.1:8000 (frontend not scaffolded yet)"
fi

wait
