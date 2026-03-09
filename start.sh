#!/usr/bin/env bash
set -euo pipefail

export PORT="${PORT:-5000}"
PYTHON_API_PORT="${PYTHON_API_PORT:-8000}"
export PYTHON_API_BASE_URL="http://127.0.0.1:${PYTHON_API_PORT}"

python3 -m uvicorn api:app --app-dir pyth/driver-pulse --host 0.0.0.0 --port "${PYTHON_API_PORT}" &

exec node server/index.js
