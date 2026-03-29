#!/bin/bash
# Quick start script for Worktime Backend

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "Loading environment from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Sync dependencies if needed
if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required. Install it from https://docs.astral.sh/uv/."
    exit 1
fi

echo "Syncing dependencies..."
uv sync

# Run the server
echo "Starting Worktime Backend..."
uv run uvicorn app.main:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000} --reload
