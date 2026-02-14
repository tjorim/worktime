"""Benchmark service for measuring API performance.

This module provides benchmark functions to measure the performance of
.hday file operations including individual file reads, team bulk operations,
and cache performance.
"""

import json
import logging
import time
from pathlib import Path

from app.cache.store import get_cache
from app.config.settings import settings
from app.services import hday_parser, hday_service, team_service
from app.utils.statistics import calculate_stats

logger = logging.getLogger(__name__)


def discover_benchmark_targets() -> tuple[str, str]:
    """Find and return the first available user and team from share directory.
    
    Scans the share directory to find:
    1. First .hday file (user file) for individual benchmarking
    2. First team configuration in config/ subdirectory for team benchmarking
    
    Returns:
        Tuple of (username, team_id) where username is from first .hday file
        and team_id is from first valid team configuration
        
    Raises:
        FileNotFoundError: If no suitable test data is found
    """
    share_dir = settings.get_share_dir_path()
    
    if not share_dir.exists():
        raise FileNotFoundError("Share directory does not exist")
    
    # Find first .hday file in share root
    username: str | None = None
    for item in share_dir.iterdir():
        if item.is_file() and item.suffix == ".hday":
            username = item.stem
            break
    
    # Find first team configuration (has both .conf and .people files in config/)
    team_id: str | None = None
    config_dir = share_dir / "config"
    if config_dir.exists() and config_dir.is_dir():
        for conf_file in config_dir.glob("*.conf"):
            # Check if corresponding .people file exists
            team_id_candidate = conf_file.stem
            people_file = config_dir / f"{team_id_candidate}.people"
            if people_file.exists():
                team_id = team_id_candidate
                break
    
    if username is None or team_id is None:
        raise FileNotFoundError(
            "No suitable test data found. Need at least one .hday file "
            "and one team configuration (with both .conf and .people files in config/)."
        )
    
    return username, team_id


def benchmark_individual_file(username: str, iterations: int) -> tuple[dict, dict]:
    """Run benchmarks for individual file operations in both raw and parsed modes.
    
    Measures the performance of reading and processing a single .hday file
    across multiple iterations to get reliable statistics.
    
    Args:
        username: Username whose .hday file to benchmark
        iterations: Number of iterations to run (typically 100)
        
    Returns:
        Tuple of (raw_stats, parsed_stats) where each dict contains:
        - avgMs: Average response time in milliseconds
        - p95Ms: 95th percentile response time in milliseconds
        - responseSizeBytes: Size of the response in bytes
        
    Raises:
        hday_service.HdayFileNotFoundError: If user file doesn't exist
    """
    raw_timings = []
    parsed_timings = []
    
    # Run benchmarks
    for _ in range(iterations):
        # Benchmark raw mode (read only, no parsing)
        start = time.perf_counter()
        raw_content, etag = hday_service.read_hday_file(username)
        elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
        raw_timings.append(elapsed)
        
        # Benchmark parsed mode (read + parse)
        start = time.perf_counter()
        raw_content_parsed, etag_parsed = hday_service.read_hday_file(username)
        events = hday_parser.parse_text(raw_content_parsed)
        elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
        parsed_timings.append(elapsed)
    
    # Calculate statistics
    raw_stats_calc = calculate_stats(raw_timings)
    parsed_stats_calc = calculate_stats(parsed_timings)
    
    # Calculate response sizes by serializing to JSON
    raw_response = {
        "username": username,
        "raw": raw_content,
        "etag": etag,
        "events": None
    }
    raw_size = len(json.dumps(raw_response).encode('utf-8'))
    
    parsed_response = {
        "username": username,
        "raw": raw_content_parsed,
        "etag": etag_parsed,
        "events": [e.model_dump(mode="json") for e in events]
    }
    parsed_size = len(json.dumps(parsed_response).encode('utf-8'))
    
    # Format results
    raw_result = {
        "avgMs": raw_stats_calc["avg"],
        "p95Ms": raw_stats_calc["p95"],
        "responseSizeBytes": raw_size
    }
    
    parsed_result = {
        "avgMs": parsed_stats_calc["avg"],
        "p95Ms": parsed_stats_calc["p95"],
        "responseSizeBytes": parsed_size
    }
    
    return raw_result, parsed_result


def benchmark_team_bulk(team_id: str, iterations: int) -> dict:
    """Run team bulk benchmarks for both raw and parsed modes.
    
    Measures the performance of reading all team member .hday files,
    including team configuration and member list retrieval.
    
    Args:
        team_id: Team identifier to benchmark
        iterations: Number of iterations to run
        
    Returns:
        Dictionary with:
        - memberCount: Number of team members
        - raw: BenchmarkModeResult for raw format
        - parsed: BenchmarkModeResult for parsed format
        
    Raises:
        team_service.TeamNotFoundError: If team doesn't exist
    """
    # Get team info once to get member count
    team_name, members = team_service.read_team_info(team_id)
    member_count = len(members)
    
    raw_timings = []
    parsed_timings = []
    
    # Run benchmarks
    for _ in range(iterations):
        # Benchmark raw mode (read without parsing)
        start = time.perf_counter()
        _ = team_service.read_team_info(team_id)
        hday_data_raw = team_service.read_team_hday_files(
            members, parse_events=False
        )
        elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
        raw_timings.append(elapsed)
        
        # Benchmark parsed mode (read with parsing)
        start = time.perf_counter()
        _ = team_service.read_team_info(team_id)
        hday_data_parsed = team_service.read_team_hday_files(
            members, parse_events=True
        )
        elapsed = (time.perf_counter() - start) * 1000  # Convert to ms
        parsed_timings.append(elapsed)
    
    # Calculate statistics
    raw_stats_calc = calculate_stats(raw_timings)
    parsed_stats_calc = calculate_stats(parsed_timings)
    
    # Calculate response sizes by serializing to JSON
    raw_response = {
        "teamId": team_id,
        "teamName": team_name,
        "members": [m.model_dump(mode="json") for m in hday_data_raw]
    }
    raw_size = len(json.dumps(raw_response).encode('utf-8'))
    
    parsed_response = {
        "teamId": team_id,
        "teamName": team_name,
        "members": [m.model_dump(mode="json") for m in hday_data_parsed]
    }
    parsed_size = len(json.dumps(parsed_response).encode('utf-8'))
    
    # Format results
    return {
        "memberCount": member_count,
        "raw": {
            "avgMs": raw_stats_calc["avg"],
            "p95Ms": raw_stats_calc["p95"],
            "responseSizeBytes": raw_size
        },
        "parsed": {
            "avgMs": parsed_stats_calc["avg"],
            "p95Ms": parsed_stats_calc["p95"],
            "responseSizeBytes": parsed_size
        }
    }


def benchmark_cache_performance(username: str, iterations: int) -> dict:
    """Benchmark cache performance by measuring cold and warm cache reads.
    
    Clears cache, measures one cold read, then measures multiple warm reads
    to demonstrate cache effectiveness.
    
    Args:
        username: Username whose .hday file to benchmark
        iterations: Number of warm cache iterations to run
        
    Returns:
        Dictionary with:
        - warmCacheAvgMs: Average response time with warm cache
        - coldCacheAvgMs: Response time with cold cache (single measurement)
        
    Raises:
        hday_service.HdayFileNotFoundError: If user file doesn't exist
    """
    cache = get_cache()
    
    # Clear cache for cold read
    # Note: Direct access to _hday_entries follows existing pattern throughout
    # codebase (see tests/conftest.py and test_cache_integration.py).
    # A public clear() method would be preferable but requires broader refactoring.
    cache._hday_entries.clear()
    
    # Measure cold cache (single read)
    start = time.perf_counter()
    _, _ = hday_service.read_hday_file(username)
    cold_time_ms = (time.perf_counter() - start) * 1000
    
    # Now cache is warm - measure multiple warm reads
    warm_timings = []
    for _ in range(iterations):
        start = time.perf_counter()
        _, _ = hday_service.read_hday_file(username)
        elapsed = (time.perf_counter() - start) * 1000
        warm_timings.append(elapsed)
    
    # Calculate warm cache average
    warm_stats = calculate_stats(warm_timings)
    
    return {
        "warmCacheAvgMs": warm_stats["avg"],
        "coldCacheAvgMs": cold_time_ms
    }
