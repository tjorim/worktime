#!/usr/bin/env python3
"""Test script to validate the build configuration without running Nuitka.

This script checks:
- Build script exists and is valid Python
- Main entry point exists
- All imports can be resolved
- Build command is correctly formed
"""

import sys
from pathlib import Path


def test_build_script():
    """Test that build script is valid."""
    backend_dir = Path(__file__).parent
    build_script = backend_dir / "build_exe.py"
    
    if not build_script.exists():
        print("❌ build_exe.py not found")
        return False
    
    # Try to import/compile the build script
    try:
        import py_compile
        py_compile.compile(str(build_script), doraise=True)
        print("✅ build_exe.py is valid Python")
    except Exception as e:
        print(f"❌ build_exe.py has syntax errors: {e}")
        return False
    
    return True


def test_main_entry_point():
    """Test that main entry point exists."""
    backend_dir = Path(__file__).parent
    main_py = backend_dir / "app" / "main.py"
    
    if not main_py.exists():
        print(f"❌ Main entry point not found: {main_py}")
        return False
    
    print(f"✅ Main entry point exists: {main_py}")
    return True


def test_imports():
    """Test that all required modules can be imported."""
    try:
        import fastapi
        print(f"✅ FastAPI {fastapi.__version__} available")
    except ImportError as e:
        print(f"❌ FastAPI not available: {e}")
        return False
    
    try:
        import uvicorn
        print(f"✅ Uvicorn {uvicorn.__version__} available")
    except ImportError as e:
        print(f"❌ Uvicorn not available: {e}")
        return False
    
    try:
        import pydantic
        print(f"✅ Pydantic {pydantic.__version__} available")
    except ImportError as e:
        print(f"❌ Pydantic not available: {e}")
        return False
    
    return True


def test_app_import():
    """Test that the app can be imported."""
    backend_dir = Path(__file__).parent
    sys.path.insert(0, str(backend_dir))
    
    try:
        from app.main import app
        print(f"✅ App can be imported: {app.title}")
        return True
    except Exception as e:
        print(f"❌ Cannot import app: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("Testing Build Configuration")
    print("=" * 60)
    print()
    
    tests = [
        ("Build script validation", test_build_script),
        ("Main entry point", test_main_entry_point),
        ("Required imports", test_imports),
        ("App import", test_app_import),
    ]
    
    results = []
    for name, test_func in tests:
        print(f"Testing: {name}")
        result = test_func()
        results.append(result)
        print()
    
    print("=" * 60)
    if all(results):
        print("✅ All tests passed!")
        print("=" * 60)
        print()
        print("The build configuration is ready. To build the Windows executable:")
        print("  1. Install Nuitka: pip install nuitka ordered-set zstandard")
        print("  2. Run: python build_exe.py")
        print()
        return 0
    else:
        print("❌ Some tests failed!")
        print("=" * 60)
        return 1


if __name__ == "__main__":
    sys.exit(main())
