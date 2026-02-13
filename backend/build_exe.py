#!/usr/bin/env python3
"""Build script for creating Windows executable with Nuitka.

This script compiles the Worktime backend into a standalone Windows executable
that users can run on their laptops without needing Python installed.

Usage:
    python build_exe.py
"""

import subprocess
import sys
from pathlib import Path


def get_app_version():
    """Extract version from the FastAPI app."""
    backend_dir = Path(__file__).parent.resolve()
    sys.path.insert(0, str(backend_dir))
    
    try:
        from app.main import app
        return app.version
    except Exception as e:
        print(f"Warning: Could not extract version from app: {e}")
        return "1.0.0"


def main():
    """Build the Windows executable using Nuitka."""
    # Get the backend directory
    backend_dir = Path(__file__).parent.resolve()
    app_dir = backend_dir / "app"
    main_py = app_dir / "main.py"
    
    if not main_py.exists():
        print(f"Error: Could not find {main_py}")
        sys.exit(1)
    
    # Get version from app
    version = get_app_version()
    # Extract numeric version parts for Windows (needs X.X.X.X format)
    version_parts = version.split('.')
    numeric_parts = []
    for part in version_parts:
        # Extract only numeric part (handles cases like "1.0.0-beta")
        numeric = ''.join(c for c in part if c.isdigit())
        if numeric:
            numeric_parts.append(numeric)
        if len(numeric_parts) >= 3:
            break
    # Ensure we have at least 3 parts
    while len(numeric_parts) < 3:
        numeric_parts.append('0')
    # Windows needs 4 parts
    file_version = '.'.join(numeric_parts[:3]) + '.0'
    
    print("=" * 60)
    print("Building Worktime Backend as Windows Executable")
    print("=" * 60)
    print(f"Backend directory: {backend_dir}")
    print(f"Main module: {main_py}")
    print(f"Version: {version}")
    print()
    
    # Nuitka build command
    # Note: We're building for Windows, creating a standalone executable
    cmd = [
        sys.executable,
        "-m",
        "nuitka",
        # Main entry point
        str(main_py),
        # Standalone mode - bundle everything
        "--standalone",
        # Single file distribution (onefile mode)
        "--onefile",
        # Output directory
        f"--output-dir={backend_dir / 'dist'}",
        # Output filename
        "--output-filename=worktime-backend.exe",
        # Follow all imports
        "--follow-imports",
        # Include the entire app package
        f"--include-package=app",
        # Windows-specific options - keep console for server logs
        "--windows-console-mode=force",
        # Add company and product metadata
        "--company-name=Worktime",
        "--product-name=Worktime Backend",
        f"--file-version={file_version}",
        f"--product-version={version}",
        "--file-description=Worktime Backend API Server",
        # Optimize for size
        "--lto=yes",
        # Show progress
        "--show-progress",
        "--show-memory",
        # Assume yes to prompts (for CI)
        "--assume-yes-for-downloads",
    ]
    
    print("Running Nuitka compilation...")
    print("Command:", " ".join(cmd))
    print()
    
    try:
        # Run Nuitka
        subprocess.run(cmd, cwd=backend_dir, check=True)
        
        print()
        print("=" * 60)
        print("[SUCCESS] Build completed successfully!")
        print("=" * 60)
        
        # Check output
        exe_path = backend_dir / "dist" / "worktime-backend.exe"
        if exe_path.exists():
            size_mb = exe_path.stat().st_size / (1024 * 1024)
            print(f"Executable: {exe_path}")
            print(f"Size: {size_mb:.2f} MB")
        else:
            print("[WARNING] Expected executable not found at", exe_path)
        
        return 0
        
    except subprocess.CalledProcessError as e:
        print()
        print("=" * 60)
        print("[ERROR] Build failed!")
        print("=" * 60)
        print(f"Error: {e}")
        return 1
    except Exception as e:
        print()
        print("=" * 60)
        print("[ERROR] Unexpected error!")
        print("=" * 60)
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
