"""Tests for timing utilities and middleware."""

import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.utils.timing import time_operation


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


class TestTimingContextManager:
    """Tests for the time_operation context manager utility."""
    
    def test_time_operation_basic(self):
        """Test that time_operation measures elapsed time correctly."""
        timings = {}
        
        with time_operation("test_op", timings):
            time.sleep(0.01)  # Sleep for 10ms
        
        # Check that timing was recorded
        assert "test_op" in timings
        # Should be at least 10ms (allowing for some variance)
        assert timings["test_op"] >= 9.0
    
    def test_time_operation_multiple(self):
        """Test multiple operations with different timings."""
        timings = {}
        
        with time_operation("fast", timings):
            time.sleep(0.005)  # 5ms
        
        with time_operation("slow", timings):
            time.sleep(0.02)  # 20ms
        
        # Both operations should be recorded
        assert "fast" in timings
        assert "slow" in timings
        
        # Slow should take longer than fast
        assert timings["slow"] > timings["fast"]
    
    def test_time_operation_exception_handling(self):
        """Test that timing is recorded even when exception occurs."""
        timings = {}
        
        try:
            with time_operation("error_op", timings):
                time.sleep(0.005)
                raise ValueError("Test error")
        except ValueError:
            pass
        
        # Timing should still be recorded despite exception
        assert "error_op" in timings
        assert timings["error_op"] >= 4.0
    
    def test_time_operation_overwrite(self):
        """Test that operations can overwrite previous timings."""
        timings = {}
        
        with time_operation("op", timings):
            time.sleep(0.005)
        
        first_timing = timings["op"]
        
        with time_operation("op", timings):
            time.sleep(0.01)
        
        # Second timing should be different
        assert timings["op"] != first_timing
        assert timings["op"] > first_timing


class TestTimingMiddleware:
    """Tests for the TimingMiddleware."""
    
    def test_timing_header_present(self, client):
        """Test that X-Total-Ms header is added to responses."""
        response = client.get("/")
        
        assert response.status_code == 200
        assert "X-Total-Ms" in response.headers
    
    def test_timing_header_format(self, client):
        """Test that X-Total-Ms header has correct format."""
        response = client.get("/")
        
        timing_header = response.headers["X-Total-Ms"]
        
        # Should be a valid float with 3 decimal places
        timing_value = float(timing_header)
        assert timing_value >= 0
        assert "." in timing_header
        # Check for 3 decimal places
        decimal_part = timing_header.split(".")[1]
        assert len(decimal_part) == 3
    
    def test_timing_header_on_healthz(self, client):
        """Test that timing header is added to healthz endpoint."""
        response = client.get("/healthz")
        
        assert "X-Total-Ms" in response.headers
        timing_value = float(response.headers["X-Total-Ms"])
        assert timing_value >= 0
    
    def test_timing_header_on_404(self, client):
        """Test that timing header is added even on 404 errors."""
        response = client.get("/nonexistent")
        
        assert response.status_code == 404
        assert "X-Total-Ms" in response.headers
        timing_value = float(response.headers["X-Total-Ms"])
        assert timing_value >= 0
    
    def test_timing_consistent_across_requests(self, client):
        """Test that each request gets its own timing."""
        response1 = client.get("/")
        response2 = client.get("/")
        
        timing1 = float(response1.headers["X-Total-Ms"])
        timing2 = float(response2.headers["X-Total-Ms"])
        
        # Both should be valid timings (but not necessarily equal)
        assert timing1 >= 0
        assert timing2 >= 0
