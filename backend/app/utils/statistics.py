"""Statistical calculation utilities for benchmark measurements.

This module provides functions for calculating statistical measures
(mean, percentiles) on benchmark timing data using Python's built-in
statistics module.
"""

import statistics


def calculate_avg(measurements: list[float]) -> float:
    """Calculate the mean (average) of a list of measurements.

    Args:
        measurements: List of numeric measurements

    Returns:
        The arithmetic mean of the measurements

    Raises:
        statistics.StatisticsError: If measurements list is empty

    Example:
        >>> calculate_avg([10.0, 20.0, 30.0])
        20.0
    """
    return statistics.mean(measurements)


def calculate_percentile(measurements: list[float], percentile: int) -> float:
    """Calculate the specified percentile of a list of measurements.

    Uses Python's quantiles function to calculate the percentile value.
    The percentile parameter should be an integer between 0 and 100.

    Args:
        measurements: List of numeric measurements (at least 2 required)
        percentile: The percentile to calculate (0-100)

    Returns:
        The value at the specified percentile

    Raises:
        statistics.StatisticsError: If measurements list has fewer than 2 elements
        ValueError: If percentile is not between 0 and 100

    Example:
        >>> calculate_percentile([10.0, 20.0, 30.0, 40.0, 50.0], 95)
        48.0
    """
    if not 0 <= percentile <= 100:
        raise ValueError(f"Percentile must be between 0 and 100, got {percentile}")

    if len(measurements) < 2:
        raise statistics.StatisticsError("must have at least two data points")

    # quantiles() returns n-1 cut points for n quantiles
    # For a percentile, we need to use method='inclusive' for accurate results
    # Convert percentile (0-100) to a fraction (0-1)
    return statistics.quantiles(measurements, n=100, method="inclusive")[percentile - 1]


def calculate_stats(measurements: list[float]) -> dict[str, float]:
    """Calculate both average and 95th percentile statistics.

    This is a convenience function that combines calculate_avg and
    calculate_percentile to return commonly used statistics in a single call.

    Args:
        measurements: List of numeric measurements (at least 2 required for percentile)

    Returns:
        Dictionary with 'avg' and 'p95' keys containing the respective values

    Raises:
        statistics.StatisticsError: If measurements list is empty or has fewer than 2 elements

    Example:
        >>> calculate_stats([10.0, 20.0, 30.0, 40.0, 50.0])
        {'avg': 30.0, 'p95': 48.0}
    """
    return {"avg": calculate_avg(measurements), "p95": calculate_percentile(measurements, 95)}
