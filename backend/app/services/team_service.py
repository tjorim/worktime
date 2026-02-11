"""Service layer for team operations.

This module provides file operations for reading team configurations,
member lists, and aggregating .hday data across all team members.
"""

import logging
import os
import re
from pathlib import Path
from typing import List

from app.cache.store import get_cache
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
    
    Expects a key=value format config file and extracts the 'groupname' field.
    Example format:
        costcentername=CC000000
        groupname=Generic Group Name
        region=XX
    
    Args:
        config_path: Path to the config file
        
    Returns:
        Team name (value of 'groupname' field) with whitespace stripped
        
    Raises:
        TeamNotFoundError: If file doesn't exist, cannot be read, or groupname is missing
    """
    # config_path is derived from validated team_path - safe to use
    if not config_path.exists():
        logger.info("Team config file not found")
        raise TeamNotFoundError("Team configuration not found")
    
    try:
        # config_path is derived from validated team_path - safe to use
        content = config_path.read_text(encoding="utf-8")
        
        # Parse key=value format and extract groupname
        for line in content.splitlines():
            line = line.strip()
            if not line or "=" not in line:
                continue
            
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            
            if key == "groupname":
                if not value:
                    raise TeamNotFoundError("groupname field is empty in config file")
                return value
        
        # If we get here, groupname was not found
        raise TeamNotFoundError("groupname field not found in config file")
        
    except PermissionError as e:
        logger.exception("Permission denied reading team config")
        raise TeamNotFoundError("Cannot read team configuration") from e
    except TeamNotFoundError:
        # Re-raise our own exceptions
        raise
    except Exception:
        logger.exception("Error reading team config")
        raise


def _parse_members_file(people_path: Path) -> List[TeamMember]:
    """Parse team members file and return list of members.
    
    Parses CSV format by splitting each line on the first comma into
    username and display_name. Skips empty lines, HTML section headers,
    and trims whitespace.
    
    Expected format:
        <h2>Team Management</h2>
        user01,Manager One
        user02,Manager Two
        
        <h2>Team Support</h2>
        user03,Support Member One
    
    Args:
        people_path: Path to the people file
        
    Returns:
        List of TeamMember objects
        
    Raises:
        TeamNotFoundError: If file doesn't exist or cannot be read
    """
    # people_path is derived from validated team_path - safe to use
    if not people_path.exists():
        logger.info("Team people file not found")
        raise TeamNotFoundError("Team members file not found")
    
    try:
        # people_path is derived from validated team_path - safe to use
        content = people_path.read_text(encoding="utf-8")
        members = []

        for line in content.splitlines():
            # Skip empty lines
            line = line.strip()
            if not line:
                continue
            
            # Skip HTML section headers (e.g., <h2>Team Management</h2>)
            # Use regex to match specific HTML heading tags
            if re.match(r"^<h[1-6]\b[^>]*>.*</h[1-6]>\s*$", line, re.IGNORECASE):
                logger.debug(f"Skipping HTML header: {line}")
                continue

            # Split on first comma
            if "," not in line:
                logger.warning(f"Skipping invalid line format in team members file: {line}")
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


def get_team_path(team_id: str) -> Path:
    """Get the full path to the config subdirectory for team files.
    
    Team configuration files are stored in the config subdirectory:
    - Config file: {SHARE_DIR}/config/{team_id}.conf
    - People file: {SHARE_DIR}/config/{team_id}.people
    
    Validates team_id to prevent path traversal attacks.
    
    Args:
        team_id: The team identifier
        
    Returns:
        Path object for the config subdirectory (sanitized and validated)
        
    Raises:
        ValueError: If team_id contains invalid characters
        TeamNotFoundError: If the config subdirectory doesn't exist
        ShareNotAccessibleError: If the share directory is not accessible
    """
    # First, sanitize the team_id so that it is safe to use as a path component.
    # This removes any taint from the user input
    safe_team_id = _sanitize_team_id(team_id)

    share_dir = settings.get_share_dir_path()
    
    # Check if share directory is accessible
    # share_dir comes from settings configuration - safe to use
    if not share_dir.exists():
        logger.error("Share directory does not exist")
        raise ShareNotAccessibleError("Share directory not found")

    # share_dir comes from settings configuration - safe to use
    if not share_dir.is_dir():
        logger.error("Share directory is not a directory")
        raise ShareNotAccessibleError("Share directory is not a directory")

    # share_dir comes from settings configuration - safe to use
    if not os.access(share_dir, os.R_OK | os.X_OK):
        logger.error("Share directory is not readable/accessible")
        raise ShareNotAccessibleError("Share directory not accessible")
    
    # Resolve the share directory to an absolute, normalized path
    # share_dir comes from settings configuration - safe to use
    resolved_share = share_dir.resolve()
    
    # Config files are in a config/ subdirectory
    config_dir = resolved_share / "config"
    
    # Verify the config directory exists
    if not config_dir.exists():
        logger.error("Config directory does not exist")
        raise TeamNotFoundError("Config directory not found")
    
    if not config_dir.is_dir():
        logger.error("Config path exists but is not a directory")
        raise TeamNotFoundError("Config directory not found")
    
    # Return the config directory - the calling functions will construct
    # the full paths to {team_id}.conf and {team_id}.people
    return config_dir


def read_team_config(team_id: str) -> str:
    """Read the team configuration file and return the team name.
    
    Reads from {SHARE_DIR}/config/{team_id}.conf
    
    Args:
        team_id: The team identifier
        
    Returns:
        The team name (value of 'groupname' field) with whitespace stripped
        
    Raises:
        TeamNotFoundError: If the config file doesn't exist or groupname is missing
        ValueError: If team_id is invalid
    """
    config_dir = get_team_path(team_id)
    safe_team_id = _sanitize_team_id(team_id)
    clean_team_id = os.path.basename(safe_team_id)
    config_path = config_dir / f"{clean_team_id}.conf"
    
    # Verify the path is within the config directory to prevent path traversal
    try:
        resolved_config_path = config_path.resolve(strict=False)
        resolved_config_dir = config_dir.resolve()
        resolved_config_path.relative_to(resolved_config_dir)
    except ValueError as err:
        logger.error("Path traversal attempt detected in team config path")
        raise ValueError("Invalid team_id format") from err
    
    team_name = _parse_config_file(config_path)
    logger.info("Successfully read team config")
    return team_name


def read_team_members(team_id: str) -> List[TeamMember]:
    """Read the team members file and parse the CSV format.
    
    Reads from {SHARE_DIR}/config/{team_id}.people
    
    Parses CSV format by splitting each line on the first comma into
    username and display_name. Skips empty lines, HTML section headers,
    and trims whitespace.
    
    Args:
        team_id: The team identifier
        
    Returns:
        List of TeamMember objects
        
    Raises:
        TeamNotFoundError: If the people file doesn't exist
        ValueError: If team_id is invalid
    """
    config_dir = get_team_path(team_id)
    safe_team_id = _sanitize_team_id(team_id)
    clean_team_id = os.path.basename(safe_team_id)
    people_path = config_dir / f"{clean_team_id}.people"
    
    # Verify the path is within the config directory to prevent path traversal
    try:
        resolved_people_path = people_path.resolve(strict=False)
        resolved_config_dir = config_dir.resolve()
        resolved_people_path.relative_to(resolved_config_dir)
    except ValueError as err:
        logger.error("Path traversal attempt detected in team people path")
        raise ValueError("Invalid team_id format") from err
    
    members = _parse_members_file(people_path)
    logger.info(f"Successfully read {len(members)} team members")
    return members


def read_team_info(team_id: str) -> tuple[str, List[TeamMember]]:
    """Read both team config and members with cache optimization.
    
    Uses cache with write-through pattern:
    - First checks for fresh cache entry (within TTL)
    - If stale entry exists, validates via mtime of both config and people files
    - If either mtime changed, re-reads files and updates cache
    
    Args:
        team_id: The team identifier
        
    Returns:
        Tuple of (team_name, members_list)
        
    Raises:
        TeamNotFoundError: If team or required files don't exist
        ValueError: If team_id is invalid
    """
    cache = get_cache()
    
    # Check for fresh cache entry first
    cached_entry = cache.get_team_config(team_id)
    if cached_entry is not None:
        logger.debug("Cache hit: returning fresh team config entry")
        # Convert cached member dicts back to TeamMember objects
        members = [TeamMember(**m) for m in cached_entry.members]
        return cached_entry.name, members
    
    # Check for stale entry that might still be valid
    stale_entry = cache.get_team_config_stale(team_id)
    if stale_entry is not None:
        # We have a stale entry - check if file mtimes have changed
        config_dir = get_team_path(team_id)
        safe_team_id = _sanitize_team_id(team_id)
        clean_team_id = os.path.basename(safe_team_id)
        config_path = config_dir / f"{clean_team_id}.conf"
        people_path = config_dir / f"{clean_team_id}.people"
        
        try:
            # Check both file mtimes
            current_config_mtime = config_path.stat().st_mtime
            current_people_mtime = people_path.stat().st_mtime
            
            # If both mtimes unchanged, refresh TTL and return cached data
            if (current_config_mtime == stale_entry.config_mtime and 
                current_people_mtime == stale_entry.people_mtime):
                cache.refresh_team_config_ttl(team_id)
                logger.debug("Cache refresh: mtimes unchanged, TTL extended")
                members = [TeamMember(**m) for m in stale_entry.members]
                return stale_entry.name, members
            
            # At least one mtime changed - fall through to re-read files
            logger.debug("Cache stale: mtime changed, re-reading files")
        except (FileNotFoundError, PermissionError) as e:
            # Files missing or inaccessible - invalidate cache and fall through
            logger.debug("Cache invalidated: files missing or inaccessible")
            cache.invalidate_team_config(team_id)
    
    # No cache entry or mtime changed - read files and update cache
    config_dir = get_team_path(team_id)
    safe_team_id = _sanitize_team_id(team_id)
    clean_team_id = os.path.basename(safe_team_id)
    
    # Read config and members using shared parsing logic
    config_path = config_dir / f"{clean_team_id}.conf"
    team_name = _parse_config_file(config_path)
    
    people_path = config_dir / f"{clean_team_id}.people"
    members = _parse_members_file(people_path)
    
    # Get file mtimes and update cache
    try:
        config_mtime = config_path.stat().st_mtime
        people_mtime = people_path.stat().st_mtime
        
        # Convert TeamMember objects to dicts for cache storage
        members_dicts = [{"username": m.username, "display_name": m.display_name} for m in members]
        
        cache.set_team_config(
            team_id=team_id,
            name=team_name,
            members=members_dicts,
            config_mtime=config_mtime,
            people_mtime=people_mtime
        )
        logger.info("Successfully read team info and updated cache")
    except Exception as e:
        logger.warning("Failed to update team config cache", exc_info=e)
        # Continue even if cache update fails
    
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
    team_path: Path | None = None,
    parse_events: bool = True
) -> List[TeamMemberHdayData]:
    """Read .hday files for all team members with cache optimization.
    
    .hday files are located in the share root directory, not in team directories.
    Attempts to read each member's .hday file, leveraging the individual hday 
    cache entries for each member. For missing files, returns empty raw string, 
    empty events list, and None for etag. Continues processing other members 
    even if individual files are missing.
    
    Args:
        team_id: The team identifier (used only for validation)
        members: List of team members
        team_path: DEPRECATED - no longer used. .hday files are in share root.
        parse_events: Whether to parse .hday content into events. When False, skip parsing
                     and set events=[]. When True, execute existing parsing logic.
        
    Returns:
        List of TeamMemberHdayData objects with .hday data (parsed or unparsed)
    """
    cache = get_cache()
    
    # Get share directory - .hday files are in the share root
    share_dir = settings.get_share_dir_path()
    resolved_share_dir = share_dir.resolve()
    member_data = []

    for member in members:
        # Sanitize username to prevent path traversal
        try:
            safe_username = _sanitize_username(member.username)
        except ValueError:
            logger.warning("Invalid username format, skipping member")
            member_data.append(_create_empty_member_data(member))
            continue
        
        # Check cache first for this member's .hday file
        cached_entry = cache.get_hday(member.username)
        if cached_entry is not None:
            logger.debug(f"Cache hit: returning fresh .hday entry for {member.username}")
            # Use cached data, but respect parse_events flag
            events = cached_entry.events if parse_events else []
            member_data.append(
                TeamMemberHdayData(
                    username=member.username,
                    display_name=member.display_name,
                    raw=cached_entry.raw,
                    events=events,
                    etag=cached_entry.etag,
                )
            )
            continue
        
        # Check for stale cache entry that might still be valid
        stale_entry = cache.get_hday_stale(member.username)
        
        # Apply os.path.basename() — a recognized path-injection sanitizer — to
        # the filename to break the taint chain before path construction.
        hday_filename = os.path.basename(f"{safe_username}.hday")
        hday_path = share_dir / hday_filename

        # Verify the path is still within the share directory
        try:
            resolved_hday_path = hday_path.resolve()
            resolved_hday_path.relative_to(resolved_share_dir)
        except ValueError:
            logger.warning("Path traversal attempt detected, skipping member")
            member_data.append(_create_empty_member_data(member))
            continue

        if not resolved_hday_path.exists():
            # File doesn't exist - invalidate cache if present and return empty
            if stale_entry is not None:
                cache.invalidate_hday(member.username)
            member_data.append(_create_empty_member_data(member))
            continue

        # Check if stale entry is still valid via mtime
        if stale_entry is not None:
            try:
                current_mtime = resolved_hday_path.stat().st_mtime
                
                # If mtime unchanged, refresh TTL and return cached data
                if current_mtime == stale_entry.mtime:
                    cache.refresh_hday_ttl(member.username)
                    logger.debug(f"Cache refresh: mtime unchanged for {member.username}")
                    events = stale_entry.events if parse_events else []
                    member_data.append(
                        TeamMemberHdayData(
                            username=member.username,
                            display_name=member.display_name,
                            raw=stale_entry.raw,
                            events=events,
                            etag=stale_entry.etag,
                        )
                    )
                    continue
                
                # mtime changed - fall through to re-read file
                logger.debug(f"Cache stale: mtime changed for {member.username}")
            except (PermissionError, OSError):
                # Can't check mtime - fall through to re-read
                pass

        # No cache or mtime changed - read file and update cache
        try:
            content = resolved_hday_path.read_text(encoding="utf-8")
            
            # Conditionally parse the .hday content into events based on parse_events flag
            # Always parse for cache, but only include in response if parse_events=True
            try:
                parsed_events = parse_text(content)
            except Exception as parse_error:
                logger.warning(f"Failed to parse .hday for {member.username}", exc_info=parse_error)
                parsed_events = []
            
            # Compute etag
            etag = compute_etag(content)
            
            # Update cache with parsed events
            try:
                file_mtime = resolved_hday_path.stat().st_mtime
                cache.set_hday(member.username, content, parsed_events, etag, file_mtime)
            except Exception as cache_error:
                logger.warning(f"Failed to update cache for {member.username}", exc_info=cache_error)
            
            # Return data with events based on parse_events flag
            events = parsed_events if parse_events else []
            member_data.append(
                TeamMemberHdayData(
                    username=member.username,
                    display_name=member.display_name,
                    raw=content,
                    events=events,
                    etag=etag,
                )
            )
            logger.debug(f"Successfully read .hday file for {member.username}")
        except PermissionError:
            logger.warning(f"Permission denied reading .hday file for {member.username}")
            # Continue with empty data for this member
            member_data.append(_create_empty_member_data(member))
        except Exception:
            logger.exception(f"Error reading .hday file for {member.username}")
            # Continue with empty data for this member
            member_data.append(_create_empty_member_data(member))

    logger.info(f"Successfully processed .hday files for {len(member_data)} team members")
    return member_data
