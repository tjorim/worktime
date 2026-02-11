"""Service layer for .hday file operations.

This module provides file operations for .hday files with atomic writes,
conflict detection using etags, and proper error handling.
"""

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional, List
import re

from app.cache.store import get_cache
from app.config.settings import settings
from app.services.hday_parser import parse_text
from app.models.hday import HdayEvent

logger = logging.getLogger(__name__)


def _sanitize_username(username: str) -> str:
    """Validate and sanitize a username for use in .hday file paths.

    This ensures that the returned value is safe to use as a single
    path component and does not allow path traversal.

    Args:
        username: The raw username from the API.

    Returns:
        A sanitized username string safe to embed in a filename.

    Raises:
        ValueError: If the username is not in an allowed format.
    """
    # Validate username - only allow alphanumeric, underscore, hyphen, and dot.
    # Disallow leading dot to avoid "hidden" or special filenames (like "..").
    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._-]*$', username):
        raise ValueError("Invalid username format")

    # Additional check: username must not contain path separators or traversal patterns
    if "/" in username or "\\" in username or ".." in username:
        raise ValueError("Invalid username format")

    # Use only the final path component to be extra defensive.
    safe_username = Path(username).name

    # Final guard: apply the same pattern to the derived name to ensure
    # that Path().name did not introduce any unexpected value.
    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9._-]*$', safe_username):
        raise ValueError("Invalid username format")

    return safe_username


class HdayFileNotFoundError(Exception):
    """Raised when an .hday file is not found."""

    pass


class HdayConflictError(Exception):
    """Raised when a write operation conflicts with the current file state."""

    def __init__(self, message: str, current_etag: Optional[str] = None):
        super().__init__(message)
        self.current_etag = current_etag


class ShareNotAccessibleError(Exception):
    """Raised when the share directory is not accessible."""

    pass


def compute_etag(content: str) -> str:
    """Compute SHA-256 based etag for content.
    
    Args:
        content: The content to hash
        
    Returns:
        Etag in format "sha256:{hex_digest}"
    """
    hash_obj = hashlib.sha256(content.encode("utf-8"))
    return f"sha256:{hash_obj.hexdigest()}"


def get_hday_path(username: str) -> Path:
    """Get the full path to a user's .hday file.
    
    Validates username to prevent path traversal attacks.
    
    Args:
        username: The username
        
    Returns:
        Path object for the .hday file (sanitized and validated)
        
    Raises:
        ValueError: If username contains invalid characters
    """
    # First, sanitize the username so that it is safe to use as a path component.
    # This removes any taint from the user input
    safe_username = _sanitize_username(username)

    share_dir = settings.get_share_dir_path()
    # Resolve the share directory to an absolute, normalized path
    resolved_share = share_dir.resolve()

    # Apply os.path.basename() — a recognized path-injection sanitizer — to the
    # filename to break the taint chain from user input before path construction.
    safe_filename = os.path.basename(f"{safe_username}.hday")
    file_path = resolved_share / safe_filename

    # Verify the normalized path is within share_dir to prevent path traversal
    try:
        # Use strict=False so resolution does not depend on the file already existing
        normalized_path = file_path.resolve(strict=False)
        normalized_path.relative_to(resolved_share)
    except ValueError as err:
        # Either resolution failed or the path escapes the share directory
        raise ValueError("Invalid username format") from err

    return normalized_path


def read_hday_file(username: str) -> tuple[str, str]:
    """Read an .hday file and return its content and etag.
    
    Uses cache with write-through pattern:
    - First checks for fresh cache entry (within TTL)
    - If stale entry exists, validates via mtime and refreshes TTL if unchanged
    - If no entry or mtime changed, reads file, parses events, and updates cache
    
    Args:
        username: The username whose file to read
        
    Returns:
        Tuple of (raw_content, etag)
        
    Raises:
        HdayFileNotFoundError: If the file doesn't exist
        ShareNotAccessibleError: If the share directory is not accessible
    """
    cache = get_cache()
    
    # Check for fresh cache entry first
    cached_entry = cache.get_hday(username)
    if cached_entry is not None:
        logger.debug("Cache hit: returning fresh .hday entry")
        return cached_entry.raw, cached_entry.etag
    
    # Check for stale entry that might still be valid
    stale_entry = cache.get_hday_stale(username)
    if stale_entry is not None:
        # We have a stale entry - check if file mtime has changed
        file_path = get_hday_path(username)
        
        # If file doesn't exist but we have cached data, invalidate and raise error
        if not file_path.exists():
            cache.invalidate_hday(username)
            logger.info("File not found (cached entry invalidated)")
            raise HdayFileNotFoundError(f"File not found for user: {username}")
        
        try:
            current_mtime = file_path.stat().st_mtime
            
            # If mtime unchanged, refresh TTL and return cached data
            if current_mtime == stale_entry.mtime:
                cache.refresh_hday_ttl(username)
                logger.debug("Cache refresh: mtime unchanged, TTL extended")
                return stale_entry.raw, stale_entry.etag
            
            # mtime changed - fall through to re-read file
            logger.debug("Cache stale: mtime changed, re-reading file")
        except PermissionError as e:
            logger.error("Permission denied checking file mtime")
            # Fall through to regular file read which will handle the error
    
    # No cache entry or mtime changed - read file and update cache
    file_path = get_hday_path(username)
    share_dir = settings.get_share_dir_path()

    # Check if share directory is accessible
    if not share_dir.exists():
        logger.error("Share directory does not exist")
        raise ShareNotAccessibleError("Share directory not found")

    if not share_dir.is_dir():
        logger.error("Share directory is not a directory")
        raise ShareNotAccessibleError("Share directory is not a directory")

    if not os.access(share_dir, os.R_OK | os.X_OK):
        logger.error("Share directory is not readable/accessible")
        raise ShareNotAccessibleError("Share directory not accessible")

    # Check if file exists
    # file_path has been validated by get_hday_path() - safe to use
    if not file_path.exists():
        logger.info("File not found")
        raise HdayFileNotFoundError(f"File not found for user: {username}")

    try:
        # Read file content
        # file_path has been validated by get_hday_path() - safe to use
        content = file_path.read_text(encoding="utf-8")
        etag = compute_etag(content)
        
        # Parse events for cache (even if caller doesn't need them immediately)
        # This ensures cache has parsed events for future requests
        try:
            events = parse_text(content)
        except Exception as parse_error:
            logger.warning("Failed to parse .hday content for cache", exc_info=parse_error)
            events = []  # Cache empty events list on parse failure
        
        # Get file mtime and update cache
        file_mtime = file_path.stat().st_mtime
        cache.set_hday(username, content, events, etag, file_mtime)
        
        logger.info("Successfully read .hday file and updated cache")
        return content, etag
    except PermissionError as e:
        logger.error("Permission denied reading file")
        raise ShareNotAccessibleError(
            f"Permission denied reading file for user: {username}"
        ) from e
    except Exception as e:
        logger.error("Error reading .hday file", exc_info=e)
        raise


def write_hday_file(
    username: str, content: str, expected_etag: Optional[str]
) -> str:
    """Write content to an .hday file with atomic write and conflict detection.
    
    Uses atomic write pattern: write to temporary file, then replace.
    Integrates write-through cache updates and cached etag conflict detection.
    
    Args:
        username: The username whose file to write
        content: The content to write
        expected_etag: Expected etag for conflict detection
                       - None: File must not exist (new file)
                       - str: File must exist with matching etag
        
    Returns:
        The new etag of the written content
        
    Raises:
        HdayConflictError: If the file state doesn't match expectations
        ShareNotAccessibleError: If the share directory is not accessible
    """
    cache = get_cache()
    file_path = get_hday_path(username)
    temp_path = file_path.with_suffix(".hday.tmp")
    share_dir = settings.get_share_dir_path()

    # Check if share directory is accessible
    if not share_dir.exists():
        logger.error("Share directory does not exist")
        raise ShareNotAccessibleError("Share directory not found")

    if not share_dir.is_dir():
        logger.error("Share directory is not a directory")
        raise ShareNotAccessibleError("Share directory is not a directory")

    if not os.access(share_dir, os.W_OK | os.X_OK):
        logger.error("Share directory is not writable/accessible")
        raise ShareNotAccessibleError("Share directory not writable")

    # Conflict detection with cache optimization
    # file_path has been validated by get_hday_path() - safe to use
    file_exists = file_path.exists()
    
    # Try to use cached etag for conflict detection (avoids file I/O)
    cached_entry = cache.get_hday(username)
    current_content = None
    current_etag = None
    cached_events: List[HdayEvent] = []
    
    if expected_etag is None:
        # Creating new file - must not exist
        if file_exists:
            # Check cache first for fresh etag
            if cached_entry is not None:
                current_etag = cached_entry.etag
                current_content = cached_entry.raw
                cached_events = cached_entry.events
                logger.debug("Using cached etag for conflict detection")
            else:
                # Fall back to reading file
                try:
                    # file_path has been validated by get_hday_path() - safe to use
                    current_content = file_path.read_text(encoding="utf-8")
                    current_etag = compute_etag(current_content)
                except PermissionError as e:
                    logger.error("Permission denied reading existing file")
                    raise ShareNotAccessibleError(
                        f"Permission denied reading existing file for user: {username}"
                    ) from e
            
            logger.warning(
                f"Conflict: File already exists for user {username}, "
                f"expected new file"
            )
            # Create error with current data so caller can avoid re-read
            error = HdayConflictError(
                f"File already exists for user: {username}", current_etag
            )
            # Attach cached data to exception if available
            if current_content and not cached_events and current_content:
                try:
                    cached_events = parse_text(current_content)
                except Exception:
                    pass  # Ignore parse errors in conflict path
            raise error
    else:
        # Updating existing file - must exist with matching etag
        if not file_exists:
            logger.warning(
                f"Conflict: File does not exist for user {username}, "
                f"expected existing file"
            )
            # File doesn't exist, so current_etag is None
            raise HdayConflictError(
                f"File does not exist for user: {username}", None
            )

        # Check cache first for fresh etag (avoids file read)
        if cached_entry is not None:
            current_etag = cached_entry.etag
            current_content = cached_entry.raw
            cached_events = cached_entry.events
            logger.debug("Using cached etag for conflict detection")
        else:
            # Cache miss or stale - read file
            try:
                # file_path has been validated by get_hday_path() - safe to use
                current_content = file_path.read_text(encoding="utf-8")
                current_etag = compute_etag(current_content)
            except PermissionError as e:
                logger.error("Permission denied reading file for etag check")
                raise ShareNotAccessibleError(
                    f"Permission denied reading file for user: {username}"
                ) from e

        if current_etag != expected_etag:
            logger.warning(
                f"Conflict: Etag mismatch for user {username}. "
                f"Expected: {expected_etag}, Current: {current_etag}"
            )
            # Parse events if not already cached
            if not cached_events and current_content:
                try:
                    cached_events = parse_text(current_content)
                except Exception:
                    pass  # Ignore parse errors in conflict path
            raise HdayConflictError(
                f"Etag mismatch - file has been modified", current_etag
            )

    # Atomic write: write to temp file, then replace
    try:
        # Write to temporary file
        # temp_path is derived from validated file_path - safe to use
        temp_path.write_text(content, encoding="utf-8")
        # Atomic replace
        # Both paths have been validated - safe to use
        os.replace(temp_path, file_path)
        
        # Compute new etag
        new_etag = compute_etag(content)
        
        # Write-through cache update: parse content and update cache with new data
        try:
            new_events = parse_text(content)
        except Exception as parse_error:
            logger.warning("Failed to parse written content for cache", exc_info=parse_error)
            new_events = []  # Cache empty events list on parse failure
        
        # Get new file mtime after write
        new_mtime = file_path.stat().st_mtime
        
        # Update cache with new data
        cache.set_hday(username, content, new_events, new_etag, new_mtime)
        
        logger.info("Successfully wrote .hday file and updated cache")
        return new_etag

    except Exception as e:
        # Clean up temp file on failure
        # temp_path is derived from validated file_path - safe to use
        if temp_path.exists():
            try:
                temp_path.unlink()
                logger.info("Cleaned up temporary file")
            except Exception as cleanup_error:
                logger.warning("Failed to clean up temporary file", exc_info=cleanup_error)
        logger.error("Error writing .hday file", exc_info=e)
        raise
