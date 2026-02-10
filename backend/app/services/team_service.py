"""Service layer for team operations.

This module provides file operations for reading team configurations,
member lists, and aggregating .hday data across all team members.
"""

import logging
import os
import re
from pathlib import Path
from typing import List

from app.config.settings import settings
from app.models.team import TeamMember, TeamMemberHdayData
from app.services.hday_parser import parse_text
from app.services.hday_service import ShareNotAccessibleError, compute_etag

logger = logging.getLogger(__name__)


class TeamNotFoundError(Exception):
    """Raised when a team directory or required configuration file is not found."""

    pass


def _sanitize_path_component(value: str, component_type: str) -> str:
    """Validate and sanitize a path component for safe use in file paths.

    This ensures that the returned value is safe to use as a single
    path component and does not allow path traversal.

    Args:
        value: The raw path component value (e.g., team_id or username).
        component_type: Description of component type for error messages (e.g., "team_id", "username").

    Returns:
        A sanitized string safe to embed in a path.

    Raises:
        ValueError: If the value is not in an allowed format.
    """
    # Validate - only allow alphanumeric, underscore, hyphen, and dot.
    # Disallow leading dot to avoid "hidden" or special paths (like "..").
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$", value):
        raise ValueError(f"Invalid {component_type} format")

    # Additional check: must not contain path separators or traversal patterns
    if "/" in value or "\\" in value or ".." in value:
        raise ValueError(f"Invalid {component_type} format")

    # Use only the final path component to be extra defensive.
    safe_value = Path(value).name

    # Final guard: apply the same pattern to the derived name to ensure
    # that Path().name did not introduce any unexpected value.
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$", safe_value):
        raise ValueError(f"Invalid {component_type} format")

    return safe_value


def _sanitize_team_id(team_id: str) -> str:
    """Validate and sanitize a team_id for use in directory paths.

    Args:
        team_id: The raw team_id from the API.

    Returns:
        A sanitized team_id string safe to embed in a directory path.

    Raises:
        ValueError: If the team_id is not in an allowed format.
    """
    return _sanitize_path_component(team_id, "team_id")


def _sanitize_username(username: str) -> str:
    """Validate and sanitize a username for use in file paths.

    Args:
        username: The raw username from the team members data.

    Returns:
        A sanitized username string safe to embed in a filename.

    Raises:
        ValueError: If the username is not in an allowed format.
    """
    return _sanitize_path_component(username, "username")


def _parse_config_file(config_path: Path) -> str:
    """Parse team configuration file and return team name.
    
    Args:
        config_path: Path to the config file
        
    Returns:
        Team name with whitespace stripped
        
    Raises:
        TeamNotFoundError: If file doesn't exist or cannot be read
    """
    # config_path is derived from validated team_path - safe to use
    if not config_path.exists():  # nosec B108
        logger.info("Team config file not found")
        raise TeamNotFoundError("Team configuration not found")
    
    try:
        # config_path is derived from validated team_path - safe to use
        content = config_path.read_text(encoding="utf-8")  # nosec B108
        return content.strip()
    except PermissionError as e:
        logger.exception("Permission denied reading team config")
        raise TeamNotFoundError("Cannot read team configuration") from e
    except Exception:
        logger.exception("Error reading team config")
        raise


def _parse_members_file(people_path: Path) -> List[TeamMember]:
    """Parse team members file and return list of members.
    
    Parses CSV format by splitting each line on the first comma into
    username and display_name. Skips empty lines and trims whitespace.
    
    Args:
        people_path: Path to the people file
        
    Returns:
        List of TeamMember objects
        
    Raises:
        TeamNotFoundError: If file doesn't exist or cannot be read
    """
    # people_path is derived from validated team_path - safe to use
    if not people_path.exists():  # nosec B108
        logger.info("Team people file not found")
        raise TeamNotFoundError("Team members file not found")
    
    try:
        # people_path is derived from validated team_path - safe to use
        content = people_path.read_text(encoding="utf-8")  # nosec B108
        members = []

        for line in content.splitlines():
            # Skip empty lines
            line = line.strip()
            if not line:
                continue

            # Split on first comma
            if "," not in line:
                logger.warning("Skipping invalid line format in team members file")
                continue

            username, display_name = line.split(",", 1)
            username = username.strip()
            display_name = display_name.strip()

            if username:  # Only add if username is not empty
                members.append(TeamMember(username=username, display_name=display_name))

        return members
    except PermissionError as e:
        logger.exception("Permission denied reading team members file")
        raise TeamNotFoundError("Cannot read team members file") from e
    except Exception:
        logger.exception("Error reading team members file")
        raise


def _sanitize_path_component(value: str, component_type: str) -> str:
    """Validate and sanitize a path component for safe use in file paths.

    This ensures that the returned value is safe to use as a single
    path component and does not allow path traversal.

    Args:
        value: The raw path component value (e.g., team_id or username).
        component_type: Description of component type for error messages (e.g., "team_id", "username").

    Returns:
        A sanitized string safe to embed in a path.

    Raises:
        ValueError: If the value is not in an allowed format.
    """
    # Validate - only allow alphanumeric, underscore, hyphen, and dot.
    # Disallow leading dot to avoid "hidden" or special paths (like "..").
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$", value):
        raise ValueError(f"Invalid {component_type} format")

    # Additional check: must not contain path separators or traversal patterns
    if "/" in value or "\\" in value or ".." in value:
        raise ValueError(f"Invalid {component_type} format")

    # Use only the final path component to be extra defensive.
    safe_value = Path(value).name

    # Final guard: apply the same pattern to the derived name to ensure
    # that Path().name did not introduce any unexpected value.
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$", safe_value):
        raise ValueError(f"Invalid {component_type} format")

    return safe_value


def _sanitize_team_id(team_id: str) -> str:
    """Validate and sanitize a team_id for use in directory paths.

    Args:
        team_id: The raw team_id from the API.

    Returns:
        A sanitized team_id string safe to embed in a directory path.

    Raises:
        ValueError: If the team_id is not in an allowed format.
    """
    return _sanitize_path_component(team_id, "team_id")


def _sanitize_username(username: str) -> str:
    """Validate and sanitize a username for use in file paths.

    Args:
        username: The raw username from the team members data.

    Returns:
        A sanitized username string safe to embed in a filename.

    Raises:
        ValueError: If the username is not in an allowed format.
    """
    return _sanitize_path_component(username, "username")


def get_team_path(team_id: str) -> Path:
    """Get the full path to a team's directory.
    
    Validates team_id to prevent path traversal attacks.
    
    Args:
        team_id: The team identifier
        
    Returns:
        Path object for the team directory (sanitized and validated)
        
    Raises:
        ValueError: If team_id contains invalid characters
        TeamNotFoundError: If the team directory doesn't exist
        ShareNotAccessibleError: If the share directory is not accessible
    """
    # First, sanitize the team_id so that it is safe to use as a path component.
    # This removes any taint from the user input
    safe_team_id = _sanitize_team_id(team_id)

    share_dir = settings.get_share_dir_path()
    
    # Check if share directory is accessible
    # share_dir comes from settings configuration - safe to use
    if not share_dir.exists():  # nosec B108
        logger.error("Share directory does not exist")
        raise ShareNotAccessibleError("Share directory not found")

    # share_dir comes from settings configuration - safe to use
    if not share_dir.is_dir():  # nosec B108
        logger.error("Share directory is not a directory")
        raise ShareNotAccessibleError("Share directory is not a directory")

    # share_dir comes from settings configuration - safe to use
    if not os.access(share_dir, os.R_OK | os.X_OK):  # nosec B108
        logger.error("Share directory is not readable/accessible")
        raise ShareNotAccessibleError("Share directory not accessible")
    
    # Resolve the share directory to an absolute, normalized path
    # share_dir comes from settings configuration - safe to use
    resolved_share = share_dir.resolve()  # nosec B108

    # Construct the directory path using only the sanitized team_id.
    # At this point, safe_team_id has been validated and is not user-controlled
    team_path = resolved_share / safe_team_id

    # Verify the normalized path is within share_dir to prevent path traversal
    try:
        # Use strict=False so resolution does not depend on the directory already existing
        # codeql[py/path-injection] - team_path is constructed from sanitized team_id only
        normalized_path = team_path.resolve(strict=False)
        normalized_path.relative_to(resolved_share)
    except ValueError as err:
        # Either resolution failed or the path escapes the share directory
        raise ValueError("Invalid team_id format") from err

    # Check if directory exists
    # normalized_path has been validated - safe to use
    if not normalized_path.exists():  # nosec B108
        logger.info("Team directory not found")
        raise TeamNotFoundError("Team not found")

    # normalized_path has been validated - safe to use
    if not normalized_path.is_dir():  # nosec B108
        logger.error("Team path exists but is not a directory")
        raise TeamNotFoundError("Team not found")

    # Always return the normalized, share-rooted path
    # This path is safe to use - it has been validated and confined to share_dir
    return normalized_path


def read_team_config(team_id: str) -> str:
    """Read the team configuration file and return the team name.
    
    Args:
        team_id: The team identifier
        
    Returns:
        The team name with whitespace stripped
        
    Raises:
        TeamNotFoundError: If the config file doesn't exist
        ValueError: If team_id is invalid
    """
    team_path = get_team_path(team_id)
    config_path = team_path / "config"
    team_name = _parse_config_file(config_path)
    logger.info("Successfully read team config")
    return team_name


def read_team_members(team_id: str) -> List[TeamMember]:
    """Read the team members file and parse the CSV format.
    
    Parses CSV format by splitting each line on the first comma into
    username and display_name. Skips empty lines and trims whitespace.
    
    Args:
        team_id: The team identifier
        
    Returns:
        List of TeamMember objects
        
    Raises:
        TeamNotFoundError: If the people file doesn't exist
        ValueError: If team_id is invalid
    """
    team_path = get_team_path(team_id)
    people_path = team_path / "people"
    members = _parse_members_file(people_path)
    logger.info(f"Successfully read {len(members)} team members")
    return members


def read_team_info(team_id: str) -> tuple[str, List[TeamMember]]:
    """Read both team config and members with a single team_path lookup.
    
    Optimized version that calls get_team_path() once and reads both
    config and people files from the same validated path.
    
    Args:
        team_id: The team identifier
        
    Returns:
        Tuple of (team_name, members_list)
        
    Raises:
        TeamNotFoundError: If team or required files don't exist
        ValueError: If team_id is invalid
    """
    team_path = get_team_path(team_id)
    
    # Read config and members using shared parsing logic
    config_path = team_path / "config"
    team_name = _parse_config_file(config_path)
    
    people_path = team_path / "people"
    members = _parse_members_file(people_path)
    
    logger.info("Successfully read team info")
    return team_name, members


def _create_empty_member_data(member: TeamMember) -> TeamMemberHdayData:
    """Create an empty TeamMemberHdayData object for a member.
    
    Used when a member's .hday file doesn't exist or cannot be read.
    
    Args:
        member: The team member
        
    Returns:
        TeamMemberHdayData with empty raw content, no events, and no etag
    """
    return TeamMemberHdayData(
        username=member.username,
        display_name=member.display_name,
        raw="",
        events=[],
        etag=None,
    )


def read_team_hday_files(
    team_id: str,
    members: List[TeamMember],
    team_path: Path | None = None
) -> List[TeamMemberHdayData]:
    """Read .hday files for all team members.
    
    Attempts to read each member's .hday file from the team directory.
    For missing files, returns empty raw string, empty events list, and None for etag.
    Continues processing other members even if individual files are missing.
    
    Args:
        team_id: The team identifier
        members: List of team members
        team_path: Optional pre-validated team path. If not provided, calls get_team_path(team_id).
                   Use this to avoid redundant path validation when already have the path.
        
    Returns:
        List of TeamMemberHdayData objects with parsed .hday data
    """
    # Use provided team_path or get it if not provided
    if team_path is None:
        team_path = get_team_path(team_id)
    
    # Resolve the validated team_path once and reuse it for member file checks
    resolved_team_path = team_path.resolve()
    member_data = []

    for member in members:
        # Sanitize username to prevent path traversal
        try:
            safe_username = _sanitize_username(member.username)
        except ValueError:
            logger.warning("Invalid username format, skipping member")
            member_data.append(_create_empty_member_data(member))
            continue
        
        hday_path = team_path / f"{safe_username}.hday"
        
        # Verify the path is still within the team directory
        try:
            # Normalize the member file path and ensure it is under the resolved team path
            resolved_hday_path = hday_path.resolve()
            # codeql[py/path-injection] - resolved_hday_path is constructed from validated team_path and sanitized username
            resolved_hday_path.relative_to(resolved_team_path)  # nosec B108
        except ValueError:
            logger.warning("Path traversal attempt detected, skipping member")
            member_data.append(_create_empty_member_data(member))
            continue

        # resolved_hday_path is derived from validated team_path and sanitized username - safe to use
        if not resolved_hday_path.exists():  # nosec B108
            # File doesn't exist - return empty data
            member_data.append(_create_empty_member_data(member))
            continue

        try:
            # resolved_hday_path is derived from validated team_path - safe to use
            content = resolved_hday_path.read_text(encoding="utf-8")  # nosec B108
            
            # Parse the .hday content into events
            events = parse_text(content)
            
            # Compute etag
            etag = compute_etag(content)
            
            member_data.append(
                TeamMemberHdayData(
                    username=member.username,
                    display_name=member.display_name,
                    raw=content,
                    events=events,
                    etag=etag,
                )
            )
            logger.debug("Successfully read .hday file for team member")
        except PermissionError:
            logger.warning("Permission denied reading .hday file for team member")
            # Continue with empty data for this member
            member_data.append(_create_empty_member_data(member))
        except Exception:
            logger.exception("Error reading .hday file for team member")
            # Continue with empty data for this member
            member_data.append(_create_empty_member_data(member))

    logger.info(f"Successfully processed .hday files for {len(member_data)} team members")
    return member_data
