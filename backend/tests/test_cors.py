"""Tests for CORS configuration module."""

import pytest

from app.config.cors import get_cors_origins


def test_cors_wildcard_development():
    """Test wildcard CORS in development mode."""
    origins = get_cors_origins("*", "development")
    assert origins == ["*"]


def test_cors_wildcard_production():
    """Test wildcard CORS is rejected in production mode."""
    origins = get_cors_origins("*", "production")
    assert origins == []


def test_cors_wildcard_prod():
    """Test wildcard CORS is rejected in 'prod' environment."""
    origins = get_cors_origins("*", "prod")
    assert origins == []


def test_cors_single_origin():
    """Test parsing single CORS origin."""
    origins = get_cors_origins("http://localhost:3000", "development")
    assert origins == ["http://localhost:3000"]


def test_cors_multiple_origins():
    """Test parsing multiple CORS origins."""
    origins = get_cors_origins(
        "http://localhost:5173,http://localhost:3000,https://example.com",
        "development"
    )
    assert origins == [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://example.com"
    ]


def test_cors_origins_with_spaces():
    """Test parsing CORS origins with extra spaces."""
    origins = get_cors_origins(
        "http://localhost:5173 , http://localhost:3000 , https://example.com",
        "production"
    )
    assert origins == [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://example.com"
    ]


def test_cors_empty_string_fallback():
    """Test fallback to localhost when empty string provided."""
    origins = get_cors_origins("", "development")
    assert origins == ["http://localhost:5173"]


def test_cors_whitespace_only_fallback():
    """Test fallback to localhost when only whitespace provided."""
    origins = get_cors_origins("   ", "development")
    assert origins == ["http://localhost:5173"]


def test_cors_production_with_valid_origins():
    """Test production with valid explicit origins."""
    origins = get_cors_origins("https://app.example.com", "production")
    assert origins == ["https://app.example.com"]


def test_cors_case_insensitive_environment():
    """Test environment checking is case-insensitive."""
    # Test uppercase PRODUCTION
    origins = get_cors_origins("*", "PRODUCTION")
    assert origins == []
    
    # Test mixed case Production
    origins = get_cors_origins("*", "Production")
    assert origins == []
    
    # Test uppercase DEVELOPMENT
    origins = get_cors_origins("*", "DEVELOPMENT")
    assert origins == ["*"]
