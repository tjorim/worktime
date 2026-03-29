"""Debug API endpoints for development and testing.

This module provides debug endpoints that are only available in non-production
environments for benchmarking and diagnostic purposes.
"""

import logging

from fastapi import APIRouter, Response, status
from fastapi.responses import JSONResponse

from app.models.benchmark import (
    BenchmarkModeResult,
    BenchmarkResponse,
    CacheResult,
    TeamBulkResult,
)
from app.services import benchmark_service
from app.services.hday_service import HdayFileNotFoundError
from app.services.team_service import TeamNotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/debug", tags=["Debug"])


@router.get("/benchmark", response_model=BenchmarkResponse)
def get_benchmark() -> BenchmarkResponse | Response:
    """Run comprehensive benchmark suite and return performance metrics.
    
    Orchestrates all benchmark measurements including:
    - Individual file operations (raw and parsed modes)
    - Team bulk operations
    - Cache performance (cold vs warm cache)
    
    This endpoint automatically discovers test data from the share directory
    and runs 100 iterations of each benchmark for reliable statistics.
    
    Returns:
        BenchmarkResponse with complete benchmark results including:
        - File metadata (name, size, event count)
        - Individual file benchmarks (raw and parsed)
        - Team bulk benchmarks
        - Cache performance metrics
        
    Response Status:
        200: Benchmarks completed successfully
        503: No test data available for benchmarking
        
    Note:
        This endpoint is only available in non-production environments.
        Benchmark execution may take several seconds to complete.
    """
    try:
        # Discover benchmark targets
        username, team_id = benchmark_service.discover_benchmark_targets()
        logger.info(f"Discovered benchmark targets: user={username}, team={team_id}")
    except FileNotFoundError as e:
        logger.warning("No test data available for benchmarking: %s", e)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "no_test_data",
                "message": "No test data available for benchmarking",
                "details": "Share directory must contain at least one .hday file "
                          "and one team directory with config and people files"
            }
        )
    
    # Get file metadata for response
    from app.config.settings import settings
    from app.services import hday_parser, hday_service
    
    try:
        # Read file to get metadata
        raw_content, _ = hday_service.read_hday_file(username)
        events = hday_parser.parse_text(raw_content)
        
        file_path = settings.get_share_dir_path() / f"{username}.hday"
        file_size = file_path.stat().st_size
        event_count = len(events)
        
        # Run benchmarks with 100 iterations
        iterations = 100
        
        # Individual file benchmarks
        raw_result, parsed_result = benchmark_service.benchmark_individual_file(
            username, iterations
        )
        
        # Team bulk benchmarks
        team_result = benchmark_service.benchmark_team_bulk(team_id, iterations)
        
        # Cache performance benchmarks
        cache_result = benchmark_service.benchmark_cache_performance(
            username, iterations
        )
        
        # Build response
        response_data = BenchmarkResponse(
            file=f"{username}.hday",
            fileSize=file_size,
            eventCount=event_count,
            iterations=iterations,
            raw=BenchmarkModeResult(**raw_result),
            parsed=BenchmarkModeResult(**parsed_result),
            teamBulk=TeamBulkResult(**team_result),
            cache=CacheResult(**cache_result)
        )
        
        logger.info(
            f"Benchmark completed: {iterations} iterations, "
            f"file={username}.hday, events={event_count}"
        )
        
        # Return Pydantic model directly - FastAPI will serialize automatically
        return response_data
        
    except (HdayFileNotFoundError, TeamNotFoundError) as e:
        logger.error(f"Benchmark failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": "benchmark_failed",
                "message": "Required test data not found or inaccessible",
                "details": "Required benchmark test data was not found or could not be accessed."
            }
        )
    except Exception:
        logger.exception("Unexpected error during benchmark execution")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": "internal_error",
                "message": "An unexpected error occurred during benchmark execution",
                "details": "An unexpected internal error occurred during benchmark execution."
            }
        )
