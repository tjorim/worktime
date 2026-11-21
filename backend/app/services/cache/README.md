# Cache Module Documentation

## Overview

The cache module provides in-memory caching infrastructure for holiday API responses, with
TTL-based expiry.

## Architecture

### Components

- **`app.cache.models`**: Pydantic models for cache entries
  - `HolidayCacheEntry`: Caches a holiday API response (`data`) with `cached_at`

- **`app.cache.store`**: `FileCache` singleton implementation
  - Singleton pattern ensures single cache instance across application
  - Dictionary-based storage for fast in-memory access
  - Automatic TTL-based expiry with stale entry removal

### Configuration

Cache behavior is controlled by settings:

- `CACHE_ENABLED` (default: `True`): Enable/disable caching
  - When `False`, all operations become no-ops that return cache misses
- `HOLIDAY_CACHE_TTL`: Time-to-live in seconds for holiday cache entries

## Usage

```python
from app.cache import get_cache

# Get the singleton cache instance
cache = get_cache()

# Cache a holiday API response
cache.set_holiday(cache_key="public:NL:2026", data=holiday_data)

# Retrieve cached entry (returns None if missing or stale)
entry = cache.get_holiday("public:NL:2026")
if entry:
    print(f"Cached data: {entry.data}")
```

See `app/routers/holidays.py` for the actual integration.

## Test Coverage

Cache behavior (singleton, TTL, `CACHE_ENABLED=False`) is exercised through the holiday cache
path in `tests/test_holidays.py`.
