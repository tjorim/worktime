"""Launcher entry point for Nuitka-compiled executable.

Nuitka compiles this file as the main script. It uses absolute imports
so that the ``app`` package (bundled via --include-package=app) is
resolved correctly at runtime, avoiding the "attempted relative import
with no known parent package" error that occurs when app/main.py is
used directly as the entry point.
"""

import uvicorn

from app.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        log_level="info",
    )
