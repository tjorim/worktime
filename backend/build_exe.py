#!/usr/bin/env python3
"""Build script for creating Windows executable with Nuitka.

This script compiles the Worktime backend into a standalone Windows executable
that users can run on their laptops without needing Python installed.

Usage:
    python build_exe.py
"""

import os
import subprocess
import sys
from pathlib import Path


def main():
    """Build the Windows executable using Nuitka."""
    # Get the backend directory
    backend_dir = Path(__file__).parent.resolve()
    app_dir = backend_dir / "app"
    main_py = app_dir / "main.py"
    
    if not main_py.exists():
        print(f"Error: Could not find {main_py}")
        sys.exit(1)
    
    print("=" * 60)
    print("Building Worktime Backend as Windows Executable")
    print("=" * 60)
    print(f"Backend directory: {backend_dir}")
    print(f"Main module: {main_py}")
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
        # Enable plugins for common packages
        "--enable-plugin=pydantic",
        # Windows-specific options - keep console for server logs
        "--windows-console-mode=force",
        # Add company and product metadata
        "--company-name=Worktime",
        "--product-name=Worktime Backend",
        "--file-version=1.0.0.0",
        "--product-version=1.0.0",
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
        result = subprocess.run(cmd, cwd=backend_dir, check=True)
        
        print()
        print("=" * 60)
        print("✅ Build completed successfully!")
        print("=" * 60)
        
        # Check output
        exe_path = backend_dir / "dist" / "worktime-backend.exe"
        if exe_path.exists():
            size_mb = exe_path.stat().st_size / (1024 * 1024)
            print(f"Executable: {exe_path}")
            print(f"Size: {size_mb:.2f} MB")
        else:
            print("⚠️  Warning: Expected executable not found at", exe_path)
        
        return 0
        
    except subprocess.CalledProcessError as e:
        print()
        print("=" * 60)
        print("❌ Build failed!")
        print("=" * 60)
        print(f"Error: {e}")
        return 1
    except Exception as e:
        print()
        print("=" * 60)
        print("❌ Unexpected error!")
        print("=" * 60)
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
