"""Pydantic models for benchmark measurements.

This module defines data models for capturing and reporting benchmark
results including timing measurements, response sizes, and cache performance.
"""

from pydantic import BaseModel, Field


class BenchmarkModeResult(BaseModel):
    """Results for a single benchmark mode (raw or parsed).
    
    Attributes:
        avgMs: Average response time in milliseconds
        p95Ms: 95th percentile response time in milliseconds
        responseSizeBytes: Size of the response in bytes
    """
    
    avgMs: float = Field(..., description="Average response time in milliseconds")
    p95Ms: float = Field(..., description="95th percentile response time in milliseconds")
    responseSizeBytes: int = Field(..., description="Size of the response in bytes")


class TeamBulkResult(BaseModel):
    """Results for team bulk endpoint benchmark.
    
    Attributes:
        memberCount: Number of team members
        raw: Benchmark results for raw format mode
        parsed: Benchmark results for parsed format mode
    """
    
    memberCount: int = Field(..., description="Number of team members")
    raw: BenchmarkModeResult = Field(..., description="Raw format benchmark results")
    parsed: BenchmarkModeResult = Field(..., description="Parsed format benchmark results")


class CacheResult(BaseModel):
    """Results for cache performance benchmark.
    
    Attributes:
        warmCacheAvgMs: Average response time with warm cache in milliseconds
        coldCacheAvgMs: Average response time with cold cache in milliseconds
    """
    
    warmCacheAvgMs: float = Field(..., description="Average response time with warm cache in milliseconds")
    coldCacheAvgMs: float = Field(..., description="Average response time with cold cache in milliseconds")


class BenchmarkResponse(BaseModel):
    """Top-level response model for benchmark results.
    
    Combines all benchmark measurements with metadata about the test file
    and benchmark configuration.
    
    Attributes:
        file: Name of the benchmark test file
        fileSize: Size of the test file in bytes
        eventCount: Number of events in the test file
        iterations: Number of benchmark iterations performed
    """
    
    file: str = Field(..., description="Name of the benchmark test file")
    fileSize: int = Field(..., description="Size of the test file in bytes")
    eventCount: int = Field(..., description="Number of events in the test file")
    iterations: int = Field(..., description="Number of benchmark iterations performed")
