#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting the Flask webserver"
python3 "${SCRIPT_DIR}/web_server.py" &
FLASK_PID=$!

trap "echo 'Cleaning up...'; kill $FLASK_PID" EXIT

echo "Waiting for Flask to start with PID ${FLASK_PID}"

until curl -s http://127.0.0.1:8876 > /dev/null;
do
    sleep 1
done

echo "Flask is up, opening the browser..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://127.0.0.1:8876 >/dev/null 2>&1 || true
fi

wait $FLASK_PID
