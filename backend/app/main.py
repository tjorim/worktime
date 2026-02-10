"""Worktime Backend API - Main application entry point.

This FastAPI application serves as a bridge between the Worktime web frontend
and .hday files stored on a shared network drive.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .api.health import router as health_router
from .config import settings
from .config.cors import get_cors_origins

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup and shutdown events."""
    # Startup
    logger.info("=" * 60)
    logger.info("Worktime Backend API - Starting up")
    logger.info("=" * 60)
    
    # Log configuration
    settings.log_configuration()
    
    # Verify share directory accessibility
    share_path = settings.get_share_dir_path()
    try:
        if not share_path.exists():
            logger.warning(
                f"⚠️  Share directory does not exist: {share_path}\n"
                f"   The health endpoint will report 'degraded' status until this is resolved.\n"
                f"   For Docker: Ensure volume is mounted correctly.\n"
                f"   For development: Directory will be created automatically."
            )
        elif not share_path.is_dir():
            logger.warning(
                f"⚠️  Share path exists but is not a directory: {share_path}\n"
                f"   The health endpoint will report 'degraded' status."
            )
        else:
            # Check read and execute permissions (execute needed to list directory)
            if os.access(share_path, os.R_OK | os.X_OK):
                logger.info(f"✓ Share directory is accessible: {share_path}")
            else:
                logger.warning(
                    f"⚠️  Share directory exists but is not accessible: {share_path}\n"
                    f"   Check file permissions (read+execute required). The health endpoint will report 'degraded' status."
                )
    except Exception as e:
        logger.warning(
            f"⚠️  Could not verify share directory status: {e}\n"
            f"   The health endpoint will report current status."
        )
    
    logger.info("=" * 60)
    logger.info("Startup complete - Server ready to accept connections")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("Worktime Backend API shutting down...")


# Create FastAPI application
app = FastAPI(
    title="Worktime Backend API",
    description="API server for Worktime shift tracker and time-off management",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS middleware with production safety
cors_origins = get_cors_origins(settings.CORS_ORIGINS, settings.ENVIRONMENT)

if not cors_origins:
    logger.error(
        "⚠️  No CORS origins configured - all cross-origin requests will be blocked! "
        "Set CORS_ORIGINS environment variable."
    )
else:
    logger.info(f"CORS middleware configured with origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False if "*" in cors_origins else True,
    allow_methods=["GET", "PUT", "OPTIONS"],
    allow_headers=["Content-Type"],
)


# Register API routers
app.include_router(health_router)


@app.get("/", response_class=PlainTextResponse, tags=["Info"])
async def root():
    """Root endpoint with basic API information.
    
    Returns:
        Plain text message with API title and version.
    """
    return f"{app.title} v{app.version}"


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
        log_level="info"
    )
