"""Service layer for .hday file operations.

This module provides file operations for .hday files with atomic writes,
conflict detection using etags, and proper error handling.
"""

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional
import re

from app.cache.store import get_cache
from app.config.settings import settings
from app.services.hday_parser import parse_text

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
    # First, sanitize the username so that it is safe to use as a single
    # path component. This ensures it cannot contain path separators or
    # traversal patterns.
    safe_username = _sanitize_username(username)

    share_dir = settings.get_share_dir_path()
    # Resolve the share directory to an absolute, normalized path
    resolved_share = share_dir.resolve()

    # Construct the filename in a deterministic way from the sanitized
    # username. Since safe_username is guaranteed to be a single, safe
    # path component, this filename cannot perform path traversal.
    safe_filename = f"{safe_username}.hday"
    file_path = resolved_share / safe_filename

    # Verify the normalized path is within the resolved_share directory
    # to prevent path traversal outside the configured share root.
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
    
    Integrates with cache layer using write-through pattern:
    - Checks cache first for fresh entry and returns immediately
    - If stale entry exists, validates file mtime before deciding to re-read
    - Parses and caches events even for raw format requests
    
    Args:
        username: The username whose file to read
        
    Returns:
        Tuple of (raw_content, etag)
        
    Raises:
        HdayFileNotFoundError: If the file doesn't exist
        ShareNotAccessibleError: If the share directory is not accessible
    """
    cache = get_cache()
    
    # Check cache first for fresh entry
    cached_entry = cache.get_hday(username)
    if cached_entry is not None:
        logger.debug("Cache hit: returning cached .hday data")
        return cached_entry.raw, cached_entry.etag
    
    # Check if we have a stale entry that might still be valid
    stale_entry = cache.get_hday_stale(username)
    
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

    # If we have a stale entry, check if file mtime has changed
    if stale_entry is not None:
        try:
            # Get current file mtime
            current_mtime = file_path.stat().st_mtime
            
            # If mtime unchanged, refresh TTL and return cached data
            if current_mtime == stale_entry.mtime:
                logger.debug("Cache refresh: file unchanged, extending TTL")
                cache.refresh_hday_ttl(username)
                return stale_entry.raw, stale_entry.etag
            else:
                logger.debug("File mtime changed, cache invalidated")
        except Exception:
            # If stat fails, proceed with normal file read
            logger.debug("Failed to check file mtime, proceeding with file read")

    try:
        # Read file content
        # file_path has been validated by get_hday_path() - safe to use
        content = file_path.read_text(encoding="utf-8")
        etag = compute_etag(content)
        
        # Parse events and update cache (even for format=raw requests)
        try:
            events = parse_text(content)
            # Get file mtime for cache entry
            mtime = file_path.stat().st_mtime
            cache.set_hday(username, content, events, etag, mtime)
            logger.debug("Cached .hday data with parsed events")
        except Exception as parse_error:
            # If parsing fails, still return the content but don't cache
            logger.warning(f"Failed to parse .hday content for caching: {parse_error}")
        
        logger.info("Successfully read .hday file")
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
    Integrates with cache layer using write-through pattern:
    - Checks cache first for fresh etag during conflict detection
    - Updates cache immediately after successful write
    - Returns cached data on conflict to avoid re-read
    
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

    # Conflict detection with cached etag optimization
    # file_path has been validated by get_hday_path() - safe to use
    file_exists = file_path.exists()
    if expected_etag is None:
        # Creating new file - must not exist
        if file_exists:
            # Check cache first for fresh etag
            cached_entry = cache.get_hday(username)
            if cached_entry is not None:
                logger.warning(
                    f"Conflict: File already exists for user {username}, "
                    f"expected new file (cached etag used)"
                )
                raise HdayConflictError(
                    f"File already exists for user: {username}", cached_entry.etag
                )
            
            # Cache miss or stale, fall back to file read
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
            raise HdayConflictError(
                f"File already exists for user: {username}", current_etag
            )
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

        # Check cache first for fresh etag
        cached_entry = cache.get_hday(username)
        if cached_entry is not None:
            current_etag = cached_entry.etag
            if current_etag != expected_etag:
                logger.warning(
                    f"Conflict: Etag mismatch for user {username}. "
                    f"Expected: {expected_etag}, Current: {current_etag} (cached)"
                )
                raise HdayConflictError(
                    f"Etag mismatch - file has been modified", current_etag
                )
            logger.debug("Etag check passed using cached data")
        else:
            # Cache miss or stale, fall back to file read
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
        
        # Write-through cache update: update cache after successful write
        new_etag = compute_etag(content)
        try:
            # Parse events for cache entry
            events = parse_text(content)
            # Get new file mtime
            new_mtime = file_path.stat().st_mtime
            # Update cache with new data
            cache.set_hday(username, content, events, new_etag, new_mtime)
            logger.debug("Updated cache with newly written data")
        except Exception as cache_error:
            # Cache update failure should not fail the write operation
            logger.warning(f"Failed to update cache after write: {cache_error}")
        
        logger.info("Successfully wrote .hday file")
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
