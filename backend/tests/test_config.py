"""Tests for configuration settings."""

import os
import tempfile
from pathlib import Path

import pytest

from app.config.settings import Settings


def test_default_settings():
    """Test that default settings are loaded correctly."""
    settings = Settings()
    
    assert settings.ENVIRONMENT == "development"
    assert settings.HOST == "0.0.0.0"
    assert settings.PORT == 8000
    assert settings.SHARE_DIR == "./data/hday_files"
    assert settings.CORS_ORIGINS == "http://localhost:5173"
    assert settings.CACHE_ENABLED is True
    assert settings.CACHE_TTL == 10
    assert settings.DATABASE_ENABLED is True
    assert settings.DATABASE_URL.startswith("postgresql+asyncpg://")
    assert settings.DATABASE_ECHO is False
    assert settings.JWT_ACCESS_TOKEN_EXPIRE_SECONDS == 24 * 3600


def test_custom_settings():
    """Test that custom environment variables override defaults."""
    # Save original environment
    original_env = os.environ.copy()
    
    try:
        # Set custom environment variables
        os.environ["ENVIRONMENT"] = "production"
        os.environ["HOST"] = "127.0.0.1"
        os.environ["PORT"] = "9000"
        os.environ["SHARE_DIR"] = "/custom/share"
        os.environ["CORS_ORIGINS"] = "https://example.com"
        os.environ["CACHE_ENABLED"] = "false"
        os.environ["CACHE_TTL"] = "60"
        os.environ["DATABASE_ENABLED"] = "false"
        os.environ["DATABASE_URL"] = "postgresql+asyncpg://user:pass@dbhost/mydb"
        os.environ["DATABASE_ECHO"] = "true"
        os.environ["JWT_SECRET_KEY"] = "production-secret-key-that-is-very-long"
        os.environ["JWT_ACCESS_TOKEN_EXPIRE_SECONDS"] = "7200"
        
        # Create new settings instance
        settings = Settings()
        
        assert settings.ENVIRONMENT == "production"
        assert settings.HOST == "127.0.0.1"
        assert settings.PORT == 9000
        assert settings.SHARE_DIR == "/custom/share"
        assert settings.CORS_ORIGINS == "https://example.com"
        assert settings.CACHE_ENABLED is False
        assert settings.CACHE_TTL == 60
        assert settings.DATABASE_ENABLED is False
        assert settings.DATABASE_URL == "postgresql+asyncpg://user:pass@dbhost/mydb"
        assert settings.DATABASE_ECHO is True
        assert settings.JWT_ACCESS_TOKEN_EXPIRE_SECONDS == 7200
    finally:
        # Restore original environment
        os.environ.clear()
        os.environ.update(original_env)


def test_cors_origins_parsing_single():
    """Test parsing single CORS origin."""
    settings = Settings(CORS_ORIGINS="http://localhost:3000")
    origins = settings.get_cors_origins_list()
    
    assert origins == ["http://localhost:3000"]


def test_cors_origins_parsing_multiple():
    """Test parsing multiple CORS origins."""
    settings = Settings(
        CORS_ORIGINS="http://localhost:5173,http://localhost:3000,https://example.com"
    )
    origins = settings.get_cors_origins_list()
    
    assert origins == [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://example.com"
    ]


def test_cors_origins_wildcard_development():
    """Test wildcard CORS in development mode."""
    settings = Settings(ENVIRONMENT="development", CORS_ORIGINS="*")
    origins = settings.get_cors_origins_list()
    
    assert origins == ["*"]


def test_cors_origins_wildcard_production():
    """Test wildcard CORS is rejected in production mode."""
    settings = Settings(ENVIRONMENT="production", CORS_ORIGINS="*", JWT_SECRET_KEY="production-secret-key-that-is-very-long")
    origins = settings.get_cors_origins_list()
    
    # Wildcard should be rejected in production
    assert origins == []


def test_environment_validation():
    """Test environment variable validation."""
    # Valid environments
    settings_dev = Settings(ENVIRONMENT="development")
    assert settings_dev.ENVIRONMENT == "development"
    
    settings_prod = Settings(ENVIRONMENT="production", JWT_SECRET_KEY="production-secret-key-that-is-very-long")
    assert settings_prod.ENVIRONMENT == "production"
    
    # Invalid environment should raise error
    with pytest.raises(ValueError, match="must be 'development' or 'production'"):
        Settings(ENVIRONMENT="invalid")


def test_cache_ttl_validation():
    """Test cache TTL validation."""
    # Valid TTL
    settings = Settings(CACHE_TTL=30)
    assert settings.CACHE_TTL == 30
    
    # Zero is valid
    settings_zero = Settings(CACHE_TTL=0)
    assert settings_zero.CACHE_TTL == 0
    
    # Negative should raise error
    with pytest.raises(ValueError, match="must be non-negative"):
        Settings(CACHE_TTL=-1)


def test_cors_origins_validation():
    """Test CORS origins validation."""
    # Empty string should raise error
    with pytest.raises(ValueError, match="cannot be empty"):
        Settings(CORS_ORIGINS="")
    
    # Whitespace only should raise error
    with pytest.raises(ValueError, match="cannot be empty"):
        Settings(CORS_ORIGINS="   ")


def test_share_dir_path():
    """Test getting share directory as Path object."""
    settings = Settings(SHARE_DIR="./data/test")
    path = settings.get_share_dir_path()
    
    assert isinstance(path, Path)
    assert path.is_absolute()


def test_ensure_share_dir_exists():
    """Test share directory creation."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_dir = Path(tmpdir) / "test_share"
        settings = Settings(SHARE_DIR=str(test_dir))
        
        # Directory should not exist yet
        assert not test_dir.exists()
        
        # Create directory
        settings.ensure_share_dir_exists()
        
        # Directory should now exist
        assert test_dir.exists()
        assert test_dir.is_dir()


def test_ensure_share_dir_exists_already_exists():
    """Test share directory creation when it already exists."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_dir = Path(tmpdir)
        settings = Settings(SHARE_DIR=str(test_dir))
        
        # Directory already exists
        assert test_dir.exists()
        
        # Should not raise error
        settings.ensure_share_dir_exists()
        
        # Directory should still exist
        assert test_dir.exists()


def test_jwt_algorithm_validation_normalizes_case() -> None:
    """Test JWT algorithm normalization/whitelist."""
    settings = Settings(JWT_ALGORITHM=" hs512 ")
    assert settings.JWT_ALGORITHM == "HS512"



def test_jwt_algorithm_validation_rejects_unknown_algorithm() -> None:
    """Test JWT algorithm whitelist rejection."""
    with pytest.raises(ValueError, match="JWT_ALGORITHM must be one of"):
        Settings(JWT_ALGORITHM="none")



def test_production_rejects_default_jwt_secret() -> None:
    """Test production mode requires non-default JWT secret."""
    with pytest.raises(ValueError, match="JWT_SECRET_KEY must be overridden in production"):
        Settings(ENVIRONMENT="production")



def test_development_allows_default_jwt_secret() -> None:
    """Test development mode allows default JWT secret."""
    settings = Settings(ENVIRONMENT="development")
    assert settings.JWT_SECRET_KEY == "dev-only-change-me-at-least-32-bytes"


def test_jwt_access_token_expire_seconds_validation() -> None:
    """Test JWT access token lifetime validation."""
    settings = Settings(JWT_ACCESS_TOKEN_EXPIRE_SECONDS=3600)
    assert settings.JWT_ACCESS_TOKEN_EXPIRE_SECONDS == 3600

    with pytest.raises(ValueError, match="must be positive"):
        Settings(JWT_ACCESS_TOKEN_EXPIRE_SECONDS=0)
