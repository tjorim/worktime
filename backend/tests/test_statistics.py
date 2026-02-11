"""Tests for statistical calculation utilities."""

import statistics

import pytest

from app.utils.statistics import (
    calculate_avg,
    calculate_percentile,
    calculate_stats,
)


class TestCalculateAvg:
    """Tests for calculate_avg function."""

    def test_basic_average(self):
        """Test calculating average of simple values."""
        measurements = [10.0, 20.0, 30.0]
        result = calculate_avg(measurements)
        assert result == 20.0

    def test_single_value(self):
        """Test average of a single value."""
        measurements = [42.0]
        result = calculate_avg(measurements)
        assert result == 42.0

    def test_float_precision(self):
        """Test average with floating point values."""
        measurements = [1.5, 2.5, 3.0]
        result = calculate_avg(measurements)
        assert result == pytest.approx(2.333333, rel=1e-5)

    def test_integer_values(self):
        """Test that integer values work correctly."""
        measurements = [1, 2, 3, 4, 5]
        result = calculate_avg(measurements)
        assert result == 3.0

    def test_large_dataset(self):
        """Test average with a large dataset."""
        measurements = list(range(1, 1001))  # 1 to 1000
        result = calculate_avg(measurements)
        assert result == 500.5

    def test_empty_list_raises_error(self):
        """Test that empty list raises StatisticsError."""
        with pytest.raises(statistics.StatisticsError):
            calculate_avg([])

    def test_mixed_values(self):
        """Test average with mixed positive and negative values."""
        measurements = [-10.0, 0.0, 10.0]
        result = calculate_avg(measurements)
        assert result == 0.0

    def test_all_same_values(self):
        """Test average when all values are the same."""
        measurements = [5.0, 5.0, 5.0, 5.0]
        result = calculate_avg(measurements)
        assert result == 5.0


class TestCalculatePercentile:
    """Tests for calculate_percentile function."""

    def test_95th_percentile(self):
        """Test calculating 95th percentile."""
        measurements = [float(i) for i in range(1, 101)]  # 1 to 100
        result = calculate_percentile(measurements, 95)
        # 95th percentile of 1-100 should be around 95
        assert result == pytest.approx(95.0, rel=0.01)

    def test_50th_percentile_median(self):
        """Test that 50th percentile is the median."""
        measurements = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = calculate_percentile(measurements, 50)
        assert result == pytest.approx(3.0, rel=0.01)

    def test_single_value(self):
        """Test that a single value raises StatisticsError."""
        measurements = [42.0]
        # quantiles requires at least 2 data points
        with pytest.raises(statistics.StatisticsError, match="must have at least two data points"):
            calculate_percentile(measurements, 95)

    def test_two_values(self):
        """Test percentile with exactly two values (minimum requirement)."""
        measurements = [10.0, 20.0]
        result = calculate_percentile(measurements, 95)
        # With only 2 values, 95th percentile should be close to the max
        assert result >= 19.0

    def test_small_dataset(self):
        """Test percentile with a small dataset."""
        measurements = [10.0, 20.0, 30.0, 40.0, 50.0]
        result = calculate_percentile(measurements, 95)
        # Should be close to the highest value
        assert result > 45.0

    def test_invalid_percentile_too_low(self):
        """Test that percentile below 0 raises ValueError."""
        measurements = [1.0, 2.0, 3.0]
        with pytest.raises(ValueError, match="must be between 0 and 100"):
            calculate_percentile(measurements, -1)

    def test_invalid_percentile_too_high(self):
        """Test that percentile above 100 raises ValueError."""
        measurements = [1.0, 2.0, 3.0]
        with pytest.raises(ValueError, match="must be between 0 and 100"):
            calculate_percentile(measurements, 101)

    def test_empty_list_raises_error(self):
        """Test that empty list raises StatisticsError."""
        with pytest.raises(statistics.StatisticsError):
            calculate_percentile([], 95)

    def test_boundary_percentiles(self):
        """Test boundary percentile values (0 and 100)."""
        measurements = [float(i) for i in range(1, 11)]  # 1 to 10
        
        # Note: For 0th percentile, we expect the minimum or close to it
        result_0 = calculate_percentile(measurements, 1)  # Use 1st percentile as proxy
        assert result_0 <= 2.0
        
        # 100th percentile should be close to maximum
        result_100 = calculate_percentile(measurements, 99)  # Use 99th percentile
        assert result_100 >= 9.0

    def test_realistic_timing_data(self):
        """Test with realistic benchmark timing data."""
        # Simulate API response times in milliseconds
        measurements = [
            5.2, 5.5, 5.8, 6.1, 6.3,
            6.5, 6.7, 7.0, 7.2, 7.5,
            8.0, 8.5, 9.0, 10.0, 12.0,
            15.0, 18.0, 20.0, 25.0, 30.0
        ]
        result = calculate_percentile(measurements, 95)
        # 95th percentile should be high (near the tail)
        assert result > 20.0


class TestCalculateStats:
    """Tests for calculate_stats function."""

    def test_basic_stats(self):
        """Test calculating both avg and p95."""
        measurements = [float(i) for i in range(1, 101)]  # 1 to 100
        result = calculate_stats(measurements)
        
        assert 'avg' in result
        assert 'p95' in result
        assert result['avg'] == 50.5
        assert result['p95'] == pytest.approx(95.0, rel=0.01)

    def test_returns_dict(self):
        """Test that function returns a dictionary."""
        measurements = [10.0, 20.0, 30.0]
        result = calculate_stats(measurements)
        
        assert isinstance(result, dict)
        assert len(result) == 2

    def test_single_value(self):
        """Test that a single value raises StatisticsError for p95."""
        measurements = [42.0]
        # quantiles requires at least 2 data points for percentile calculation
        with pytest.raises(statistics.StatisticsError, match="must have at least two data points"):
            calculate_stats(measurements)

    def test_two_values(self):
        """Test stats with exactly two values (minimum requirement)."""
        measurements = [10.0, 20.0]
        result = calculate_stats(measurements)
        
        assert result['avg'] == 15.0
        assert result['p95'] >= 19.0

    def test_empty_list_raises_error(self):
        """Test that empty list raises StatisticsError."""
        with pytest.raises(statistics.StatisticsError):
            calculate_stats([])

    def test_realistic_benchmark_data(self):
        """Test with realistic benchmark measurements."""
        # Simulate 100 API calls with varying response times
        measurements = [
            5.0 + (i * 0.1) for i in range(90)  # Most calls are fast (5-14ms)
        ] + [
            20.0, 22.0, 25.0, 28.0, 30.0,  # Some slower outliers
            35.0, 40.0, 45.0, 50.0, 60.0   # Rare very slow calls
        ]
        
        result = calculate_stats(measurements)
        
        # Average should be pulled down by the many fast calls
        assert result['avg'] < 15.0
        # p95 should catch the slower outliers
        assert result['p95'] > 30.0

    def test_all_same_values(self):
        """Test stats when all values are identical."""
        measurements = [10.0] * 100
        result = calculate_stats(measurements)
        
        assert result['avg'] == 10.0
        assert result['p95'] == 10.0

    def test_values_match_individual_functions(self):
        """Test that results match calling individual functions."""
        measurements = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
        
        stats = calculate_stats(measurements)
        avg = calculate_avg(measurements)
        p95 = calculate_percentile(measurements, 95)
        
        assert stats['avg'] == avg
        assert stats['p95'] == p95

    def test_mixed_positive_negative_values(self):
        """Test stats with mixed positive and negative values."""
        measurements = [-10.0, -5.0, 0.0, 5.0, 10.0, 15.0, 20.0]
        result = calculate_stats(measurements)
        
        assert result['avg'] == 5.0
        assert result['p95'] > 15.0
