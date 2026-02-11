"""Pytest configuration and global fixtures for backend tests."""

import pytest

from app.cache.store import get_cache


@pytest.fixture(autouse=True)
def reset_cache():
    """Clear cache before each test to ensure test isolation.
    
    This prevents cached data from one test affecting another test.
    """
    cache = get_cache()
    cache._hday_entries.clear()
    cache._team_entries.clear()
    yield
