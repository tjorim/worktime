"""Timing utilities for measuring operation performance.

This module provides context managers for timing individual operations
and storing results for custom response headers.
"""

import time
from contextlib import contextmanager
from typing import Dict


@contextmanager
def time_operation(operation_name: str, timings: Dict[str, float]):
    """Context manager for timing an operation.
    
    Measures the elapsed time of a code block and stores the result
    in milliseconds in the provided timings dictionary.
    
    Args:
        operation_name: Name/key to use for storing the timing result
        timings: Dictionary to store the timing result in
        
    Example:
        timings = {}
        with time_operation("database_query", timings):
            # ... perform database query ...
            pass
        print(f"Query took {timings['database_query']:.2f} ms")
    """
    start_time = time.perf_counter()
    try:
        yield
    finally:
        elapsed_time = time.perf_counter() - start_time
        elapsed_ms = elapsed_time * 1000
        timings[operation_name] = elapsed_ms
