"""Tests for benchmark Pydantic models."""

import pytest
from pydantic import ValidationError

from app.models.benchmark import (
    BenchmarkModeResult,
    BenchmarkResponse,
    CacheResult,
    TeamBulkResult,
)


class TestBenchmarkModeResult:
    """Tests for BenchmarkModeResult model."""

    def test_creation(self):
        """Test creating a benchmark mode result."""
        result = BenchmarkModeResult(
            avgMs=15.5,
            p95Ms=25.0,
            responseSizeBytes=1024
        )

        assert result.avgMs == 15.5
        assert result.p95Ms == 25.0
        assert result.responseSizeBytes == 1024

    def test_required_fields(self):
        """Test that all fields are required."""
        with pytest.raises(ValidationError):
            BenchmarkModeResult(avgMs=15.5, p95Ms=25.0)

        with pytest.raises(ValidationError):
            BenchmarkModeResult(avgMs=15.5, responseSizeBytes=1024)

        with pytest.raises(ValidationError):
            BenchmarkModeResult(p95Ms=25.0, responseSizeBytes=1024)

    def test_type_validation(self):
        """Test type validation for fields."""
        # avgMs and p95Ms should accept floats
        result = BenchmarkModeResult(
            avgMs=15.5,
            p95Ms=25.0,
            responseSizeBytes=1024
        )
        assert isinstance(result.avgMs, float)
        assert isinstance(result.p95Ms, float)

        # responseSizeBytes should accept ints
        assert isinstance(result.responseSizeBytes, int)

        # Should coerce int to float for timing fields
        result2 = BenchmarkModeResult(
            avgMs=15,
            p95Ms=25,
            responseSizeBytes=1024
        )
        assert result2.avgMs == 15.0
        assert result2.p95Ms == 25.0

    def test_zero_values(self):
        """Test that zero values are allowed."""
        result = BenchmarkModeResult(
            avgMs=0.0,
            p95Ms=0.0,
            responseSizeBytes=0
        )
        assert result.avgMs == 0.0
        assert result.p95Ms == 0.0
        assert result.responseSizeBytes == 0


class TestTeamBulkResult:
    """Tests for TeamBulkResult model."""

    def test_creation(self):
        """Test creating a team bulk result."""
        raw_result = BenchmarkModeResult(
            avgMs=10.0,
            p95Ms=15.0,
            responseSizeBytes=500
        )
        parsed_result = BenchmarkModeResult(
            avgMs=20.0,
            p95Ms=30.0,
            responseSizeBytes=800
        )

        result = TeamBulkResult(
            memberCount=5,
            raw=raw_result,
            parsed=parsed_result
        )

        assert result.memberCount == 5
        assert result.raw.avgMs == 10.0
        assert result.parsed.avgMs == 20.0

    def test_nested_model_validation(self):
        """Test that nested models are validated."""
        with pytest.raises(ValidationError):
            TeamBulkResult(
                memberCount=5,
                raw={"avgMs": 10.0, "p95Ms": 15.0},  # Missing responseSizeBytes
                parsed=BenchmarkModeResult(avgMs=20.0, p95Ms=30.0, responseSizeBytes=800)
            )

    def test_required_fields(self):
        """Test that all fields are required."""
        raw_result = BenchmarkModeResult(
            avgMs=10.0,
            p95Ms=15.0,
            responseSizeBytes=500
        )
        parsed_result = BenchmarkModeResult(
            avgMs=20.0,
            p95Ms=30.0,
            responseSizeBytes=800
        )

        with pytest.raises(ValidationError):
            TeamBulkResult(raw=raw_result, parsed=parsed_result)

        with pytest.raises(ValidationError):
            TeamBulkResult(memberCount=5, parsed=parsed_result)

        with pytest.raises(ValidationError):
            TeamBulkResult(memberCount=5, raw=raw_result)

    def test_dict_to_model_conversion(self):
        """Test that dictionaries are converted to nested models."""
        result = TeamBulkResult(
            memberCount=5,
            raw={"avgMs": 10.0, "p95Ms": 15.0, "responseSizeBytes": 500},
            parsed={"avgMs": 20.0, "p95Ms": 30.0, "responseSizeBytes": 800}
        )

        assert isinstance(result.raw, BenchmarkModeResult)
        assert isinstance(result.parsed, BenchmarkModeResult)
        assert result.raw.avgMs == 10.0
        assert result.parsed.avgMs == 20.0


class TestCacheResult:
    """Tests for CacheResult model."""

    def test_creation(self):
        """Test creating a cache result."""
        result = CacheResult(
            warmCacheAvgMs=5.5,
            coldCacheAvgMs=25.0
        )

        assert result.warmCacheAvgMs == 5.5
        assert result.coldCacheAvgMs == 25.0

    def test_required_fields(self):
        """Test that all fields are required."""
        with pytest.raises(ValidationError):
            CacheResult(warmCacheAvgMs=5.5)

        with pytest.raises(ValidationError):
            CacheResult(coldCacheAvgMs=25.0)

    def test_type_validation(self):
        """Test type validation for fields."""
        result = CacheResult(
            warmCacheAvgMs=5.5,
            coldCacheAvgMs=25.0
        )
        assert isinstance(result.warmCacheAvgMs, float)
        assert isinstance(result.coldCacheAvgMs, float)

        # Should coerce int to float
        result2 = CacheResult(
            warmCacheAvgMs=5,
            coldCacheAvgMs=25
        )
        assert result2.warmCacheAvgMs == 5.0
        assert result2.coldCacheAvgMs == 25.0

    def test_realistic_values(self):
        """Test with realistic cache timing values."""
        result = CacheResult(
            warmCacheAvgMs=1.2,
            coldCacheAvgMs=15.8
        )
        # Warm cache should typically be faster than cold cache
        assert result.warmCacheAvgMs < result.coldCacheAvgMs


class TestBenchmarkResponse:
    """Tests for BenchmarkResponse model."""

    def test_creation(self):
        """Test creating a benchmark response."""
        response = BenchmarkResponse(
            file="test.hday",
            fileSize=2048,
            eventCount=10,
            iterations=100
        )

        assert response.file == "test.hday"
        assert response.fileSize == 2048
        assert response.eventCount == 10
        assert response.iterations == 100

    def test_required_fields(self):
        """Test that all fields are required."""
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                fileSize=2048,
                eventCount=10,
                iterations=100
            )

        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                eventCount=10,
                iterations=100
            )

        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                iterations=100
            )

        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                eventCount=10
            )

    def test_type_validation(self):
        """Test type validation for fields."""
        response = BenchmarkResponse(
            file="test.hday",
            fileSize=2048,
            eventCount=10,
            iterations=100
        )

        assert isinstance(response.file, str)
        assert isinstance(response.fileSize, int)
        assert isinstance(response.eventCount, int)
        assert isinstance(response.iterations, int)

    def test_empty_filename(self):
        """Test that empty filename is allowed."""
        response = BenchmarkResponse(
            file="",
            fileSize=0,
            eventCount=0,
            iterations=1
        )
        assert response.file == ""

    def test_realistic_metadata(self):
        """Test with realistic benchmark metadata."""
        response = BenchmarkResponse(
            file="large_events.hday",
            fileSize=1048576,  # 1MB
            eventCount=500,
            iterations=1000
        )

        assert response.file == "large_events.hday"
        assert response.fileSize == 1048576
        assert response.eventCount == 500
        assert response.iterations == 1000
