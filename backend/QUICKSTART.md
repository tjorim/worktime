# Worktime Backend - Quick Start

This is the Python/FastAPI backend for Worktime, serving as a bridge between the web frontend and .hday files on a shared network drive.

## Requirements

- Python 3.12+
- pip

## Installation

Install dependencies:

```bash
pip install -r requirements.txt
```

## Configuration

Copy the example environment file and adjust as needed:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `development` | Environment mode: `development` or `production` |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `SHARE_DIR` | `./data/hday_files` | Path to .hday files directory |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins |
| `CACHE_ENABLED` | `true` | Enable/disable caching |
| `CACHE_TTL` | `10` | Cache TTL in seconds |

## Running the Server

### Quick Start (with run script)

```bash
./run.sh
```

### Manual Start

```bash
# Development mode (with auto-reload)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Production mode
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Using Python directly

```bash
python3 -m app.main
```

## API Endpoints

- **GET /healthz** - Health check endpoint (returns "OK")
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
│   ├── api/                 # API route handlers
│   ├── services/            # Business logic
│   └── audit/               # Audit logging
├── data/
│   └── hday_files/          # .hday files (created automatically)
├── requirements.txt         # Python dependencies
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

### Share Directory

In **development**:
- Uses local directory `./data/hday_files`
- Created automatically if it doesn't exist

In **production**:
- Set `SHARE_DIR` to mounted network share path (NFS/SMB)
- Example: `SHARE_DIR=/mnt/worktime_share`

## Startup Logging

The server logs configuration at startup:

```
============================================================
Worktime Backend Configuration
============================================================
Environment:     development
Host:            0.0.0.0
Port:            8000
Share Directory: /path/to/data/hday_files
CORS Origins:    http://localhost:5173
Cache:           enabled (TTL: 10s)
============================================================
```

## Testing

Health check:
```bash
curl http://localhost:8000/healthz
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
