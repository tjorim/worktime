"""Worktime Backend API - Main application entry point.

This FastAPI application serves as a bridge between the Worktime web frontend
and .hday files stored on a shared network drive.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from .config import settings

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
    settings.log_configuration()
    logger.info("Worktime Backend API starting up...")
    
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

# Configure CORS middleware
cors_origins = settings.get_cors_origins_list()

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
    allow_credentials="*" not in cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", response_class=PlainTextResponse, tags=["Health"])
async def health_check():
    """Health check endpoint.
    
    Returns:
        Plain text "OK" response indicating the service is running.
    """
    return "OK"


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
