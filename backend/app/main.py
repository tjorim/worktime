"""Worktime Backend API - Main application entry point.

This FastAPI application serves as a bridge between the Worktime web frontend
and .hday files stored on a shared network drive.
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .api.health import router as health_router
from .api.hday import router as hday_router
from .api.team import router as team_router
from .cache.warm_cache import warm_cache
from .config import settings
from .config.cors import get_cors_origins
from .database import init_db
from .middleware.timing import TimingMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def _warm_cache_async():
    """Run cache warming in a background task without blocking startup.
    
    This function wraps the synchronous warm_cache() call to run it
    asynchronously using asyncio.to_thread(), allowing the server to
    start accepting requests immediately while cache warming proceeds
    in the background.
    """
    if not settings.CACHE_ENABLED:
        return
        
    try:
        start_time = time.perf_counter()
        # Run the synchronous warm_cache function in a thread pool
        await asyncio.to_thread(warm_cache)
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"✓ Background cache warming completed in {elapsed_ms:.3f}ms")
    except Exception as e:
        logger.error(f"⚠️  Background cache warming failed: {e}")
        logger.error("   Continuing with cold cache - first requests will be slower")


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
    
    # Initialize database before accepting connections
    if settings.DATABASE_ENABLED:
        try:
            init_db()
            logger.info("✓ Database initialized")
        except Exception as e:
            logger.error(f"❌ Database initialization failed: {e}")
            raise
    else:
        logger.info("Database initialization skipped (DATABASE_ENABLED=false)")

    # Warm cache in background if enabled
    if settings.CACHE_ENABLED:
        # Start cache warming in background - don't block startup
        asyncio.create_task(_warm_cache_async())
        logger.info("✓ Cache warming started in background")
    
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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Add timing middleware after CORS
app.add_middleware(TimingMiddleware)


# Register API routers
app.include_router(health_router)
app.include_router(hday_router)
app.include_router(team_router)

if settings.DATABASE_ENABLED:
    from .api.auth_router import router as auth_router
    from .api.db_gantt import router as db_gantt_router
    from .api.db_time_tracking import router as db_time_tracking_router
    from .api.db_users import router as db_users_router
    from .api.db_work_locations import router as db_work_locations_router

    app.include_router(auth_router)
    app.include_router(db_users_router)
    app.include_router(db_time_tracking_router)
    app.include_router(db_work_locations_router)
    app.include_router(db_gantt_router)
    logger.info("✓ Database API endpoints enabled")
else:
    logger.info("Database API endpoint registration skipped (DATABASE_ENABLED=false)")

# Register debug router only in non-production environments
if settings.ENVIRONMENT != "production":
    from .api.debug import router as debug_router
    app.include_router(debug_router)
    logger.info("✓ Debug endpoints enabled (development mode only)")


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
