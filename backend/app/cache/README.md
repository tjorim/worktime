# Cache Module Documentation

## Overview

The cache module provides in-memory caching infrastructure for .hday files and team configurations with TTL expiry and mtime validation support.

## Architecture

### Components

- **`app.cache.models`**: Pydantic models for cache entries
  - `HdayCacheEntry`: Caches .hday file data with raw content, parsed events, etag, mtime, and cached_at
  - `TeamConfigCacheEntry`: Caches team configuration with name, members, config_mtime, people_mtime, and cached_at

- **`app.cache.store`**: FileCache singleton implementation
  - Singleton pattern ensures single cache instance across application
  - Dictionary-based storage for fast in-memory access
  - Automatic TTL-based expiry with stale entry removal

### Configuration

Cache behavior is controlled by settings:

- `CACHE_ENABLED` (default: `True`): Enable/disable caching
  - When `False`, all operations become no-ops that return cache misses
- `CACHE_TTL` (default: `10`): Time-to-live in seconds for cache entries

## Usage

### Basic Usage

```python
from app.cache import get_cache

# Get the singleton cache instance
cache = get_cache()

# Cache .hday file data
cache.set_hday(
    username="alice",
    raw="2025/01/15-2025/01/17 # Vacation",
    events=parsed_events,
    etag="sha256:abc123",
    mtime=file_stat.st_mtime
)

# Retrieve cached entry (returns None if missing or stale)
entry = cache.get_hday("alice")
if entry:
    print(f"Raw content: {entry.raw}")
    print(f"Events: {entry.events}")
    print(f"ETag: {entry.etag}")

# Invalidate cache entry (e.g., after write operations)
cache.invalidate_hday("alice")
```

### Team Configuration Caching

```python
# Cache team configuration
cache.set_team_config(
    team_id="team1",
    name="Engineering Team",
    members=[{"username": "alice", "display_name": "Alice Johnson"}],
    config_mtime=config_stat.st_mtime,
    people_mtime=people_stat.st_mtime
)

# Retrieve cached team config
team_entry = cache.get_team_config("team1")
if team_entry:
    print(f"Team name: {team_entry.name}")
    print(f"Members: {team_entry.members}")

# Invalidate team config cache
cache.invalidate_team_config("team1")
```

### Mtime Validation Pattern

For entries beyond TTL but potentially still valid:

```python
# Check if entry needs mtime validation
if cache.needs_mtime_check(username):
    # Entry exists but is stale - check if file changed
    current_mtime = file_path.stat().st_mtime
    stale_entry = cache._hday_entries.get(username)
    
    if stale_entry and stale_entry.mtime == current_mtime:
        # File unchanged - refresh cache with existing data
        cache.set_hday(
            username=username,
            raw=stale_entry.raw,
            events=stale_entry.events,
            etag=stale_entry.etag,
            mtime=stale_entry.mtime
        )
    else:
        # File changed - re-read and parse
        # ... perform file read and parse operations
        pass
```

## Integration Guidelines for Phase 2

### Service Layer Integration

When integrating caching into service functions:

1. **Check cache first**: Before file operations, check cache with `get_hday()` or `get_team_config()`
2. **Return cached data**: If cache hit and fresh, return cached data immediately
3. **Populate cache**: After reading/parsing files, store in cache with `set_hday()` or `set_team_config()`
4. **Invalidate on writes**: After successful write operations, invalidate cache with `invalidate_hday()` or `invalidate_team_config()`
5. **Use mtime validation**: For stale entries, consider using `needs_mtime_check()` to avoid unnecessary re-parsing

### Example Integration Pattern

```python
def read_hday_file(username: str) -> HdayReadResponse:
    cache = get_cache()
    
    # Check cache first
    cached_entry = cache.get_hday(username)
    if cached_entry:
        # Cache hit - return cached data
        return HdayReadResponse(
            username=username,
            raw=cached_entry.raw,
            etag=cached_entry.etag,
            events=cached_entry.events
        )
    
    # Cache miss - read from file
    file_path = get_hday_path(username)
    raw_content = file_path.read_text()
    mtime = file_path.stat().st_mtime
    etag = compute_etag(raw_content)
    events = parse_text(raw_content)
    
    # Populate cache
    cache.set_hday(
        username=username,
        raw=raw_content,
        events=events,
        etag=etag,
        mtime=mtime
    )
    
    return HdayReadResponse(
        username=username,
        raw=raw_content,
        etag=etag,
        events=events
    )
```

## Test Coverage

The cache module includes comprehensive test coverage:

- Cache entry model tests (creation, default values)
- Singleton pattern verification
- Cache operations (get, set, invalidate)
- TTL expiry behavior
- CACHE_ENABLED=False no-op behavior
- Mtime validation support

Run tests:
```bash
pytest tests/test_cache.py -v
```

## Performance Considerations

- **In-memory storage**: Very fast access (dictionary lookup)
- **TTL-based expiry**: Automatic cleanup prevents memory growth
- **Lazy validation**: Stale entries removed on access, not background task
- **No-op mode**: Zero overhead when caching is disabled

## Future Enhancements (Post-Phase 1)

Potential improvements for future phases:

- LRU eviction policy for memory limits
- Cache statistics (hit rate, miss rate)
- Configurable cache size limits
- Cache warming strategies
- Background TTL cleanup task
