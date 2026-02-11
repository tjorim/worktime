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
    
    @staticmethod
    def _create_sample_mode_result():
        """Helper to create a sample BenchmarkModeResult."""
        return BenchmarkModeResult(
            avgMs=10.0,
            p95Ms=15.0,
            responseSizeBytes=1024
        )
    
    @staticmethod
    def _create_sample_team_result():
        """Helper to create a sample TeamBulkResult."""
        return TeamBulkResult(
            memberCount=3,
            raw=BenchmarkModeResult(avgMs=10.0, p95Ms=15.0, responseSizeBytes=1024),
            parsed=BenchmarkModeResult(avgMs=20.0, p95Ms=30.0, responseSizeBytes=2048)
        )
    
    @staticmethod
    def _create_sample_cache_result():
        """Helper to create a sample CacheResult."""
        return CacheResult(
            warmCacheAvgMs=5.0,
            coldCacheAvgMs=25.0
        )

    def test_creation(self):
        """Test creating a benchmark response."""
        response = BenchmarkResponse(
            file="test.hday",
            fileSize=2048,
            eventCount=10,
            iterations=100,
            raw=self._create_sample_mode_result(),
            parsed=self._create_sample_mode_result(),
            teamBulk=self._create_sample_team_result(),
            cache=self._create_sample_cache_result()
        )

        assert response.file == "test.hday"
        assert response.fileSize == 2048
        assert response.eventCount == 10
        assert response.iterations == 100
        assert response.raw.avgMs == 10.0
        assert response.parsed.avgMs == 10.0
        assert response.teamBulk.memberCount == 3
        assert response.cache.warmCacheAvgMs == 5.0

    def test_required_fields(self):
        """Test that all fields are required."""
        # Missing file
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                fileSize=2048,
                eventCount=10,
                iterations=100,
                raw=self._create_sample_mode_result(),
                parsed=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing fileSize
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                eventCount=10,
                iterations=100,
                raw=self._create_sample_mode_result(),
                parsed=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing eventCount
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                iterations=100,
                raw=self._create_sample_mode_result(),
                parsed=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing iterations
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                eventCount=10,
                raw=self._create_sample_mode_result(),
                parsed=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing raw
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                eventCount=10,
                iterations=100,
                parsed=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing parsed
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                eventCount=10,
                iterations=100,
                raw=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing teamBulk
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                eventCount=10,
                iterations=100,
                raw=self._create_sample_mode_result(),
                parsed=self._create_sample_mode_result(),
                cache=self._create_sample_cache_result()
            )
        
        # Missing cache
        with pytest.raises(ValidationError):
            BenchmarkResponse(
                file="test.hday",
                fileSize=2048,
                eventCount=10,
                iterations=100,
                raw=self._create_sample_mode_result(),
                parsed=self._create_sample_mode_result(),
                teamBulk=self._create_sample_team_result()
            )

    def test_type_validation(self):
        """Test type validation for fields."""
        response = BenchmarkResponse(
            file="test.hday",
            fileSize=2048,
            eventCount=10,
            iterations=100,
            raw=self._create_sample_mode_result(),
            parsed=self._create_sample_mode_result(),
            teamBulk=self._create_sample_team_result(),
            cache=self._create_sample_cache_result()
        )

        assert isinstance(response.file, str)
        assert isinstance(response.fileSize, int)
        assert isinstance(response.eventCount, int)
        assert isinstance(response.iterations, int)
        assert isinstance(response.raw, BenchmarkModeResult)
        assert isinstance(response.parsed, BenchmarkModeResult)
        assert isinstance(response.teamBulk, TeamBulkResult)
        assert isinstance(response.cache, CacheResult)

    def test_empty_filename(self):
        """Test that empty filename is allowed."""
        response = BenchmarkResponse(
            file="",
            fileSize=0,
            eventCount=0,
            iterations=1,
            raw=self._create_sample_mode_result(),
            parsed=self._create_sample_mode_result(),
            teamBulk=self._create_sample_team_result(),
            cache=self._create_sample_cache_result()
        )
        assert response.file == ""

    def test_realistic_metadata(self):
        """Test with realistic benchmark metadata."""
        response = BenchmarkResponse(
            file="large_events.hday",
            fileSize=1048576,  # 1MB
            eventCount=500,
            iterations=1000,
            raw=self._create_sample_mode_result(),
            parsed=self._create_sample_mode_result(),
            teamBulk=self._create_sample_team_result(),
            cache=self._create_sample_cache_result()
        )

        assert response.file == "large_events.hday"
        assert response.fileSize == 1048576
        assert response.eventCount == 500
        assert response.iterations == 1000
