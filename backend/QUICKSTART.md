# Worktime Backend - Quick Start

This is the Python/FastAPI backend for Worktime, providing database-backed APIs for the web frontend
(users, time tracking, work locations, sync, and personal Gantt tasks). Local `.hday` file/team access
is handled separately by `hday-helper/`, not by this backend.

## Requirements

- Python 3.12+
- `uv`

## Installation

Install dependencies:

```bash
uv sync
```

## Configuration

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

### Environment Variables

| Variable        | Default                 | Description                                     |
| --------------- | ----------------------- | ----------------------------------------------- |
| `ENVIRONMENT`   | `development`           | Environment mode: `development` or `production` |
| `HOST`          | `0.0.0.0`               | Server bind address                             |
| `PORT`          | `8000`                  | Server port                                     |
| `CORS_ORIGINS`  | `http://localhost:5173` | Comma-separated list of allowed CORS origins    |
| `CACHE_ENABLED` | `true`                  | Enable/disable holiday-response caching         |
| `CACHE_TTL`     | `10`                    | Cache TTL in seconds                            |

## Running the Server

### Quick Start (with run script)

```bash
./run.sh
```

### Manual Start

```bash
# Development mode (with auto-reload)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Production mode
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Using Python directly

```bash
uv run python -m app.main
```

## API Endpoints

- **GET /api/health** - Health check endpoint
- **GET /** - API information (title and version)
- **GET /docs** - Interactive API documentation (Swagger UI)
- **GET /redoc** - Alternative API documentation (ReDoc)

## Development

The server automatically reloads on code changes in development mode.

### Directory Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # Application entry point
│   ├── config/              # Configuration module
│   │   ├── __init__.py
│   │   └── settings.py      # Environment settings
│   ├── routers/             # API route handlers
│   ├── services/            # Business logic
│   └── audit/               # Audit logging
├── pyproject.toml           # Python dependencies and tool configuration
├── .env.example             # Example environment file
└── run.sh                   # Quick start script
```

## Configuration Notes

### CORS Configuration

In **development**, you can use:

- `CORS_ORIGINS=http://localhost:5173` (default)
- `CORS_ORIGINS=*` (allow all origins - development only)

In **production**:

- Always use explicit origin list: `CORS_ORIGINS=https://example.com,https://app.example.com`
- Wildcard (`*`) is rejected for security

## Startup Logging

The server logs configuration at startup:

```
============================================================
Worktime Backend Configuration
============================================================
Environment:     development
Host:            0.0.0.0
Port:            8000
CORS Origins:    http://localhost:5173
Cache:           enabled (TTL: 10s)
============================================================
```

## Testing

Health check:

```bash
curl http://localhost:8000/api/health
```

API information:

```bash
curl http://localhost:8000/
```

Interactive docs:

```
Open http://localhost:8000/docs in your browser
```

## Archived Prototype

The original prototype is preserved at `hdayplanner.archived/` for reference.
