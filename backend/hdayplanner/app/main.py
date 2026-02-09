from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pathlib import Path
import os
import logging
from .config import SHARE_DIR
from .hday.parser import parse_text, to_text
from .hday.models import HdayDocument, HdayEvent
from .audit import log

logger = logging.getLogger(__name__)

app = FastAPI(title="Holiday Planner API", version="0.1.0")

# CORS middleware - read allowed origins from environment
# In production, set CORS_ORIGINS env var (comma-separated list of allowed origins)
# In development, defaults to localhost:5173
# Set CORS_ORIGINS="*" only for local development if needed
def get_cors_origins():
    """
    Parse and validate CORS origins from environment variable.

    Returns:
        List of allowed origins. Returns empty list [] if wildcard is attempted
        in production, which will block all cross-origin requests (forcing
        explicit origin configuration for security).
    """
    cors_env = os.getenv('CORS_ORIGINS', '').strip()
    env_mode = os.getenv('ENVIRONMENT', 'development').lower()

    # Development mode: allow wildcard only if explicitly set
    if cors_env == '*':
        # Only allow wildcard in non-production environments
        if env_mode in ('production', 'prod'):
            # Fallback to empty list in production - will block all CORS requests
            # This forces explicit origin configuration for security
            logger.warning(
                "⚠️  CORS_ORIGINS='*' is not allowed in production. "
                "No origins will be allowed. Set CORS_ORIGINS to explicit origins."
            )
            return []
        logger.info("CORS: Allowing all origins (*) in development mode")
        return ['*']

    # Parse comma-separated origins
    if cors_env:
        origins = [origin.strip() for origin in cors_env.split(',') if origin.strip()]
        logger.info(f"CORS: Configured origins: {origins}")
        return origins

    # Default for development
    logger.info("CORS: Using default development origin: http://localhost:5173")
    return ['http://localhost:5173']

ALLOWED_ORIGINS = get_cors_origins()

# Log final CORS configuration
if not ALLOWED_ORIGINS:
    logger.error(
        "⚠️  No CORS origins configured - all cross-origin requests will be blocked! "
        "Set CORS_ORIGINS environment variable."
    )
else:
    logger.info(f"CORS middleware configured with origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials='*' not in ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def hday_path(user: str) -> Path:
    return SHARE_DIR / f"{user}.hday"

@app.get('/api/hday/{user}', response_model=HdayDocument)
async def get_hday(user: str):
    p = hday_path(user)
    text = p.read_text(encoding='utf-8') if p.exists() else ''
    events = parse_text(text)
    return HdayDocument(raw=text, events=events)

@app.put('/api/hday/{user}', response_class=PlainTextResponse)
async def put_hday(user: str, doc: HdayDocument):
    # Validate and write back as .hday
    text = to_text(doc.events)
    p = hday_path(user)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')
    log.append('backend', user, 'write_hday', f"{len(doc.events)} events")
    return 'OK'

@app.get('/healthz', response_class=PlainTextResponse)
async def health():
    return 'OK'
