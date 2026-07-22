"""Tests for configuration settings."""

import logging
import os
import tempfile
from pathlib import Path

import pytest

from app.config.settings import Settings


def test_default_settings():
    """Test that default settings are loaded correctly."""
    settings = Settings(_env_file=None)
    
    assert settings.ENVIRONMENT == "development"
    assert settings.HOST == "0.0.0.0"
    assert settings.PORT == 8000
    assert settings.SHARE_DIR == "./data/hday_files"
    assert settings.CORS_ORIGINS == "http://localhost:5173"
    assert settings.CACHE_ENABLED is True
    assert settings.CACHE_TTL == 10
    assert settings.DATABASE_ENABLED is True
    assert settings.DATABASE_URL == ""
    assert settings.resolved_database_url().startswith("postgresql+asyncpg://")
    assert settings.DATABASE_ECHO is False
    assert settings.OIDC_ISSUER_URL == "http://localhost:9000/application/o/worktime"
    assert settings.OIDC_AUDIENCE == ""
    assert settings.OIDC_ALGORITHMS == "RS256"
    assert settings.RATE_LIMIT_ENABLED is True
    assert settings.RATE_LIMIT_DEFAULT == "200/minute"
    assert settings.TRUSTED_HOSTS == "*"


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
        os.environ["OIDC_ISSUER_URL"] = "https://auth.example.com/application/o/worktime"
        os.environ["TRUSTED_HOSTS"] = "worktime.tjor.im"

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
        assert settings.OIDC_ISSUER_URL == "https://auth.example.com/application/o/worktime"
        assert settings.TRUSTED_HOSTS == "worktime.tjor.im"
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
    settings = Settings(
        ENVIRONMENT="production",
        CORS_ORIGINS="*",
        TRUSTED_HOSTS="worktime.tjor.im",
    )
    origins = settings.get_cors_origins_list()

    # Wildcard should be rejected in production
    assert origins == []


def test_environment_validation():
    """Test environment variable validation."""
    # Valid environments
    settings_dev = Settings(ENVIRONMENT="development")
    assert settings_dev.ENVIRONMENT == "development"

    settings_prod = Settings(ENVIRONMENT="production", TRUSTED_HOSTS="worktime.tjor.im")
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


def test_oidc_defaults() -> None:
    """Test default OIDC configuration values."""
    settings = Settings(_env_file=None)
    assert settings.OIDC_ISSUER_URL == "http://localhost:9000/application/o/worktime"
    assert settings.OIDC_AUDIENCE == ""
    assert settings.OIDC_ALGORITHMS == "RS256"


def test_oidc_custom_values() -> None:
    """Test overriding OIDC configuration."""
    settings = Settings(
        OIDC_ISSUER_URL="https://auth.example.com/application/o/worktime",
        OIDC_AUDIENCE="worktime",
        OIDC_ALGORITHMS="RS256,RS512",
    )
    assert settings.OIDC_ISSUER_URL == "https://auth.example.com/application/o/worktime"
    assert settings.OIDC_AUDIENCE == "worktime"
    assert settings.OIDC_ALGORITHMS == "RS256,RS512"


def test_resolved_database_url_uses_database_url_override_when_set():
    """DATABASE_URL, when set, takes precedence over the DB_* fields."""
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql+asyncpg://user:pass@dbhost/mydb",
        DB_HOST="ignored-host",
    )
    assert settings.resolved_database_url() == "postgresql+asyncpg://user:pass@dbhost/mydb"


def test_resolved_database_url_builds_from_db_fields_when_unset():
    """Without DATABASE_URL, the URL is built from DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD."""
    settings = Settings(
        _env_file=None,
        DATABASE_URL="",
        DB_HOST="dbhost",
        DB_PORT=5433,
        DB_NAME="mydb",
        DB_USER="user",
        DB_PASSWORD="pass",
    )
    assert settings.resolved_database_url() == "postgresql+asyncpg://user:pass@dbhost:5433/mydb"


def test_resolved_database_url_reads_db_password_file(tmp_path):
    """DB_PASSWORD_FILE takes precedence over DB_PASSWORD when both are set."""
    password_file = tmp_path / "db_password"
    password_file.write_text("secret-from-file\n")

    settings = Settings(
        _env_file=None,
        DATABASE_URL="",
        DB_HOST="dbhost",
        DB_NAME="mydb",
        DB_USER="user",
        DB_PASSWORD="unused",
        DB_PASSWORD_FILE=str(password_file),
    )
    assert settings.resolved_db_password() == "secret-from-file"
    assert settings.resolved_database_url() == "postgresql+asyncpg://user:secret-from-file@dbhost:5432/mydb"


def test_resolved_db_password_file_missing_raises(tmp_path):
    """A DB_PASSWORD_FILE pointing at a missing file raises instead of silently falling back."""
    settings = Settings(
        _env_file=None,
        DB_PASSWORD_FILE=str(tmp_path / "does-not-exist"),
    )
    with pytest.raises(ValueError, match="Could not read DB_PASSWORD_FILE"):
        settings.resolved_db_password()


def test_database_url_validation_allows_empty():
    """DATABASE_URL may be left empty (falls back to DB_* fields)."""
    settings = Settings(_env_file=None, DATABASE_URL="")
    assert settings.DATABASE_URL == ""


def test_database_url_validation_rejects_wrong_driver():
    """A non-empty DATABASE_URL must still use the asyncpg driver."""
    with pytest.raises(ValueError, match="must use the asyncpg driver"):
        Settings(_env_file=None, DATABASE_URL="postgresql://user:pass@host/db")


def test_trusted_hosts_default_wildcard():
    """TRUSTED_HOSTS defaults to '*' (no Host-header restriction)."""
    settings = Settings(_env_file=None)
    assert settings.get_trusted_hosts_list() == ["*"]


def test_trusted_hosts_parses_comma_separated_list():
    """TRUSTED_HOSTS parses a comma-separated hostname list."""
    settings = Settings(_env_file=None, TRUSTED_HOSTS="worktime.tjor.im, api.worktime.tjor.im")
    assert settings.get_trusted_hosts_list() == ["worktime.tjor.im", "api.worktime.tjor.im"]


def test_trusted_hosts_wildcard_in_production_raises():
    """A wildcard TRUSTED_HOSTS refuses to start in production rather than silently
    leaving Host-header validation disabled."""
    with pytest.raises(ValueError, match="TRUSTED_HOSTS must be set in production"):
        Settings(_env_file=None, ENVIRONMENT="production", TRUSTED_HOSTS="*")


def test_trusted_hosts_empty_in_production_raises():
    """An empty TRUSTED_HOSTS refuses to start in production, same as a wildcard."""
    with pytest.raises(ValueError, match="TRUSTED_HOSTS must be set in production"):
        Settings(_env_file=None, ENVIRONMENT="production", TRUSTED_HOSTS="")


def test_trusted_hosts_explicit_in_production_succeeds():
    """An explicit TRUSTED_HOSTS value starts normally in production."""
    settings = Settings(_env_file=None, ENVIRONMENT="production", TRUSTED_HOSTS="worktime.tjor.im")
    assert settings.get_trusted_hosts_list() == ["worktime.tjor.im"]


def test_log_configuration_never_logs_the_password(caplog):
    """log_configuration() must never emit DB_PASSWORD or a DATABASE_URL containing it.

    Matches daynest's approach: never log any form of the database URL, masked
    or otherwise — only the individual non-secret DB_HOST/DB_PORT/DB_NAME/DB_USER
    fields are logged.
    """
    settings = Settings(
        _env_file=None,
        DATABASE_URL="",
        DB_HOST="dbhost",
        DB_PORT=5433,
        DB_NAME="mydb",
        DB_USER="user",
        DB_PASSWORD="supersecret",
    )
    with caplog.at_level(logging.INFO):
        settings.log_configuration()
    assert "supersecret" not in caplog.text


def test_log_configuration_never_logs_password_from_database_url_override(caplog):
    """A DATABASE_URL override containing a password must not appear in the logs either."""
    settings = Settings(
        _env_file=None,
        DATABASE_URL="postgresql+asyncpg://user:supersecret@dbhost/mydb",
    )
    with caplog.at_level(logging.INFO):
        settings.log_configuration()
    assert "supersecret" not in caplog.text


def test_log_configuration_never_logs_configured_trusted_hosts(caplog):
    """log_configuration() must never emit the configured TRUSTED_HOSTS value itself.

    Only a status ("configured" / disabled) is logged — CodeQL's clear-text
    logging heuristic flags TRUSTED_HOSTS as sensitive-by-name even though a
    hostname allowlist is not a secret.
    """
    settings = Settings(_env_file=None, TRUSTED_HOSTS="worktime.tjor.im,internal.example.com")
    with caplog.at_level(logging.INFO):
        settings.log_configuration()
    assert "worktime.tjor.im" not in caplog.text
    assert "internal.example.com" not in caplog.text
    assert "Trusted Hosts:   configured (Host header validation enabled)" in caplog.text


def test_log_configuration_reports_disabled_trusted_hosts(caplog):
    """A wildcard TRUSTED_HOSTS is reported as disabled, not as a hostname list."""
    settings = Settings(_env_file=None, TRUSTED_HOSTS="*")
    with caplog.at_level(logging.INFO):
        settings.log_configuration()
    assert "Trusted Hosts:   * (Host header validation disabled)" in caplog.text
