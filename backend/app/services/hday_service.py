"""Service layer for .hday file operations.

This module provides file operations for .hday files with atomic writes,
conflict detection using etags, and proper error handling.
"""

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional

from app.config.settings import settings

logger = logging.getLogger(__name__)


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
        Path object for the .hday file
        
    Raises:
        ValueError: If username contains invalid characters
    """
    # Validate username - only allow alphanumeric, underscore, hyphen, and dot
    import re
    if not re.match(r'^[a-zA-Z0-9._-]+$', username):
        raise ValueError("Invalid username format")
    
    # Additional check: username must not contain path separators or traversal patterns
    if "/" in username or "\\" in username or ".." in username:
        raise ValueError("Invalid username format")
    
    share_dir = settings.get_share_dir_path()
    # Resolve the share directory to an absolute, normalized path
    resolved_share = share_dir.resolve()
    
    # Sanitize: use only the filename part of username to prevent path traversal
    safe_filename = Path(username).name
    file_path = resolved_share / f"{safe_filename}.hday"
    
    # Verify the resolved path is within share_dir to prevent path traversal
    try:
        # Use strict=False so resolution does not depend on the file already existing
        resolved_path = file_path.resolve(strict=False)
        resolved_path.relative_to(resolved_share)
    except ValueError:
        # Either resolution failed or the path escapes the share directory
        raise ValueError("Invalid username format")
    
    return resolved_path


def read_hday_file(username: str) -> tuple[str, str]:
    """Read an .hday file and return its content and etag.
    
    Args:
        username: The username whose file to read
        
    Returns:
        Tuple of (raw_content, etag)
        
    Raises:
        HdayFileNotFoundError: If the file doesn't exist
        ShareNotAccessibleError: If the share directory is not accessible
    """
    file_path = get_hday_path(username)
    share_dir = settings.get_share_dir_path()

    # Check if share directory is accessible
    if not share_dir.exists():
        logger.error(f"Share directory does not exist: {share_dir}")
        raise ShareNotAccessibleError(f"Share directory not found: {share_dir}")

    if not share_dir.is_dir():
        logger.error(f"Share directory is not a directory: {share_dir}")
        raise ShareNotAccessibleError(f"Share directory is not a directory: {share_dir}")

    if not os.access(share_dir, os.R_OK | os.X_OK):
        logger.error(f"Share directory is not readable/accessible: {share_dir}")
        raise ShareNotAccessibleError(f"Share directory not accessible: {share_dir}")

    # Check if file exists
    if not file_path.exists():
        logger.info(f"File not found: {file_path}")
        raise HdayFileNotFoundError(f"File not found for user: {username}")

    try:
        # Read file content
        content = file_path.read_text(encoding="utf-8")
        etag = compute_etag(content)
        logger.info(f"Successfully read file for user: {username}")
        return content, etag
    except PermissionError as e:
        logger.error(f"Permission denied reading file: {file_path}")
        raise ShareNotAccessibleError(
            f"Permission denied reading file for user: {username}"
        ) from e
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        raise


def write_hday_file(
    username: str, content: str, expected_etag: Optional[str]
) -> str:
    """Write content to an .hday file with atomic write and conflict detection.
    
    Uses atomic write pattern: write to temporary file, then replace.
    
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
    file_path = get_hday_path(username)
    temp_path = file_path.with_suffix(".hday.tmp")
    share_dir = settings.get_share_dir_path()

    # Check if share directory is accessible
    if not share_dir.exists():
        logger.error(f"Share directory does not exist: {share_dir}")
        raise ShareNotAccessibleError(f"Share directory not found: {share_dir}")

    if not share_dir.is_dir():
        logger.error(f"Share directory is not a directory: {share_dir}")
        raise ShareNotAccessibleError(f"Share directory is not a directory: {share_dir}")

    if not os.access(share_dir, os.W_OK | os.X_OK):
        logger.error(f"Share directory is not writable/accessible: {share_dir}")
        raise ShareNotAccessibleError(f"Share directory not writable: {share_dir}")

    # Conflict detection
    file_exists = file_path.exists()

    if expected_etag is None:
        # Creating new file - must not exist
        if file_exists:
            try:
                current_content = file_path.read_text(encoding="utf-8")
                current_etag = compute_etag(current_content)
            except PermissionError as e:
                logger.error(f"Permission denied reading existing file: {file_path}")
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

        try:
            current_content = file_path.read_text(encoding="utf-8")
            current_etag = compute_etag(current_content)
        except PermissionError as e:
            logger.error(f"Permission denied reading file for etag check: {file_path}")
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
        temp_path.write_text(content, encoding="utf-8")

        # Atomic replace
        os.replace(temp_path, file_path)

        # Compute and return new etag
        new_etag = compute_etag(content)
        logger.info(f"Successfully wrote file for user: {username}")
        return new_etag

    except Exception as e:
        # Clean up temp file on failure
        if temp_path.exists():
            try:
                temp_path.unlink()
                logger.info(f"Cleaned up temporary file: {temp_path}")
            except Exception as cleanup_error:
                logger.warning(
                    f"Failed to clean up temporary file {temp_path}: {cleanup_error}"
                )
        logger.error(f"Error writing file for user {username}: {e}")
        raise
