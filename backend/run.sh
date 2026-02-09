#!/bin/bash
# Quick start script for Worktime Backend

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "Loading environment from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Install dependencies if needed
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

# Run the server
echo "Starting Worktime Backend..."
python3 -m uvicorn app.main:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000} --reload
