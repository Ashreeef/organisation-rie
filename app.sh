#!/usr/bin/env bash
# ==============================================================================
# app.sh — Domino Web Application Orchestration & Startup Script
#
# This script starts both the FastAPI backend and Next.js frontend within the
# Domino Data Lab container environment, binding to the port assigned by Domino
# (default 8888 or via $DOMINO_APP_PORT).
#
# Architecture in Domino:
#   User Browser -> Domino Gateway Proxy (HTTPS + SSO)
#                 -> Next.js Dashboard (Port $APP_PORT, e.g. 8888)
#                 -> FastAPI Ingestion & ML Cascade (Port 8000)
# ==============================================================================

set -euo pipefail

echo "=================================================================="
echo " Starting RIE Intelligence Web Application on Domino Data Lab"
echo " Timestamp: $(date -u +"%Y-%m-%d %H:%M:%SZ")"
echo "=================================================================="

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"

# 1. Configuration of Ports & Paths
export APP_PORT="${DOMINO_APP_PORT:-8888}"
export BACKEND_PORT="${API_PORT:-8000}"
export RIE_DATA_DIR="${RIE_DATA_DIR:-${REPO_ROOT}/data}"
export RIE_MODELS_DIR="${RIE_MODELS_DIR:-${REPO_ROOT}/models}"
export INTERNAL_API_URL="http://127.0.0.1:${BACKEND_PORT}"
export NEXT_PUBLIC_API_URL="" # Use relative URL for client requests via Next.js proxy
export CORS_ORIGINS="*"

echo "Configuration:"
echo "  - Repo Root:        ${REPO_ROOT}"
echo "  - Domino App Port:  ${APP_PORT} (Next.js frontend)"
echo "  - Backend Port:     ${BACKEND_PORT} (FastAPI internal)"
echo "  - Data Directory:   ${RIE_DATA_DIR}"
echo "  - Models Directory: ${RIE_MODELS_DIR}"

# 2. Ensure Persistent Data Directories Exist
mkdir -p "${RIE_DATA_DIR}/processed"
mkdir -p "${RIE_DATA_DIR}/operational"
mkdir -p "${RIE_DATA_DIR}/logs"

# Copy default initial settings if not present
if [ ! -f "${RIE_DATA_DIR}/settings.json" ] && [ -f "${REPO_ROOT}/data/settings.json" ]; then
    echo "Initializing default settings in ${RIE_DATA_DIR}/settings.json"
    cp "${REPO_ROOT}/data/settings.json" "${RIE_DATA_DIR}/settings.json" || true
fi

# 3. Clean Shutdown Handler (Trap SIGTERM/SIGINT)
cleanup() {
    echo ""
    echo "=================================================================="
    echo " Shutting down RIE services..."
    echo "=================================================================="
    if [ -n "${API_PID:-}" ] && kill -0 "${API_PID}" 2>/dev/null; then
        echo "Stopping FastAPI backend (PID: ${API_PID})..."
        kill -TERM "${API_PID}" 2>/dev/null || true
    fi
    if [ -n "${NEXT_PID:-}" ] && kill -0 "${NEXT_PID}" 2>/dev/null; then
        echo "Stopping Next.js frontend (PID: ${NEXT_PID})..."
        kill -TERM "${NEXT_PID}" 2>/dev/null || true
    fi
    wait
    echo "All processes stopped cleanly."
    exit 0
}
trap cleanup SIGTERM SIGINT EXIT

# 4. Start FastAPI Backend in Background
echo "------------------------------------------------------------------"
echo " [1/2] Starting FastAPI Backend on 127.0.0.1:${BACKEND_PORT}..."
echo "------------------------------------------------------------------"
uvicorn api.main:app \
    --host 127.0.0.1 \
    --port "${BACKEND_PORT}" \
    --log-level info &
API_PID=$!

# Wait for FastAPI health check
echo "Waiting for FastAPI backend to be ready..."
MAX_RETRIES=30
COUNT=0
until curl -s "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1 || [ $COUNT -eq $MAX_RETRIES ]; do
    sleep 1
    COUNT=$((COUNT + 1))
done

if [ $COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: FastAPI backend failed to start within 30 seconds."
    exit 1
fi
echo "✓ FastAPI backend is healthy and responding."

# 5. Build Next.js if Standalone is Missing
if [ ! -f "${REPO_ROOT}/dashboard/.next/standalone/server.js" ] && [ ! -d "${REPO_ROOT}/dashboard/.next" ]; then
    echo "Building Next.js for production..."
    (cd "${REPO_ROOT}/dashboard" && npm run build)
fi

# 6. Start Next.js Frontend
echo "------------------------------------------------------------------"
echo " [2/2] Starting Next.js Frontend on 0.0.0.0:${APP_PORT}..."
echo "------------------------------------------------------------------"

if [ -f "${REPO_ROOT}/dashboard/.next/standalone/server.js" ]; then
    echo "Running Next.js in Standalone Mode..."
    export PORT="${APP_PORT}"
    export HOSTNAME="0.0.0.0"
    node "${REPO_ROOT}/dashboard/.next/standalone/server.js" &
    NEXT_PID=$!
else
    echo "Running Next.js via npm start..."
    (cd "${REPO_ROOT}/dashboard" && PORT="${APP_PORT}" npm run start) &
    NEXT_PID=$!
fi

echo "=================================================================="
echo " RIE Intelligence is LIVE on Domino (Port: ${APP_PORT})"
echo "=================================================================="

# Wait for processes
wait "${NEXT_PID}" "${API_PID}"
