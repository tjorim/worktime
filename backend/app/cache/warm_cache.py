"""Cache warming functionality for startup optimization.

This module provides functions to pre-populate the cache at application
startup by discovering and caching all .hday files and team configurations.
"""

import hashlib
import logging
from pathlib import Path

from app.cache.store import get_cache
from app.config.settings import settings
from app.services.hday_parser import parse_text
from app.services.team_service import _parse_config_file, _parse_members_file

logger = logging.getLogger(__name__)


def _compute_etag(content: str) -> str:
    """Compute SHA-256 based etag for content.
    
    Args:
        content: The content to hash
        
    Returns:
        Etag in format "sha256:{hex_digest}"
    """
    hash_obj = hashlib.sha256(content.encode("utf-8"))
    return f"sha256:{hash_obj.hexdigest()}"


def _discover_team_files(share_dir: Path) -> list[tuple[str, Path, Path]]:
    """Discover all team configuration files in the config subdirectory.
    
    Team files are stored as:
    - config/{team_id}.conf
    - config/{team_id}.people
    
    Args:
        share_dir: Share directory path
        
    Returns:
        List of tuples (team_id, config_path, people_path) for all discovered teams
    """
    team_files = []
    config_dir = share_dir / "config"
    
    if not config_dir.exists() or not config_dir.is_dir():
        logger.info("Config directory does not exist or is not a directory")
        return team_files
    
    try:
        # Find all .conf files in config directory
        for conf_file in config_dir.glob("*.conf"):
            team_id = conf_file.stem  # e.g., "dl-example-group" from "dl-example-group.conf"
            people_file = config_dir / f"{team_id}.people"
            
            # Only include if both .conf and .people files exist
            if people_file.exists():
                team_files.append((team_id, conf_file, people_file))
            else:
                logger.warning(f"Found {conf_file.name} but missing corresponding {team_id}.people")
    except (PermissionError, OSError) as e:
        logger.warning(f"Could not list config directory during cache warming: {e}")
    
    return team_files


def _discover_hday_files(share_dir: Path) -> list[tuple[Path, str]]:
    """Discover all .hday files in the share directory root.
    
    Args:
        share_dir: Share directory path
        
    Returns:
        List of tuples (file_path, username) for all discovered .hday files
    """
    hday_files = []
    
    # Discover top-level .hday files in share root
    try:
        for item in share_dir.iterdir():
            if item.is_file() and item.suffix == ".hday":
                username = item.stem
                hday_files.append((item, username))
    except (PermissionError, OSError) as e:
        logger.warning(f"Could not list .hday files during cache warming: {e}")
    
    # Note: .hday files are now only in the share root, not in team directories
    
    return hday_files


def _cache_team_config(team_id: str, config_path: Path, people_path: Path) -> bool:
    """Read and cache team configuration.
    
    Args:
        team_id: Team identifier
        config_path: Path to the team config file (.conf)
        people_path: Path to the team people file (.people)
        
    Returns:
        True if successfully cached, False otherwise
    """
    try:
        # Get modification times
        config_mtime = config_path.stat().st_mtime
        people_mtime = people_path.stat().st_mtime
        
        # Use service layer parsers (single source of truth)
        team_name = _parse_config_file(config_path)
        team_members = _parse_members_file(people_path)
        
        # Convert TeamMember objects to dict format expected by cache
        members = [
            {
                "username": member.username,
                "display_name": member.display_name
            }
            for member in team_members
        ]
        
        # Cache team config
        cache = get_cache()
        cache.set_team_config(
            team_id=team_id,
            name=team_name,
            members=members,
            config_mtime=config_mtime,
            people_mtime=people_mtime
        )
        
        return True
    
    except Exception as e:
        # Catch any errors from parsing or file operations
        logger.warning(f"Could not cache team config for {team_id}: {e}")
        return False


def _cache_hday_file(file_path: Path, username: str) -> bool:
    """Read, parse, and cache an .hday file.
    
    Args:
        file_path: Path to .hday file
        username: Username associated with the file
        
    Returns:
        True if successfully cached, False otherwise
    """
    try:
        # Read file
        raw_content = file_path.read_text(encoding="utf-8")
        mtime = file_path.stat().st_mtime
        
        # Parse events
        events = parse_text(raw_content)
        
        # Compute etag
        etag = _compute_etag(raw_content)
        
        # Cache entry
        cache = get_cache()
        cache.set_hday(
            username=username,
            raw=raw_content,
            events=events,
            etag=etag,
            mtime=mtime
        )
        
        return True
    
    except (FileNotFoundError, PermissionError, OSError, UnicodeDecodeError) as e:
        logger.warning(f"Could not cache .hday file for {username}: {e}")
        return False
    except Exception as e:
        # Catch parsing errors and other unexpected issues
        logger.warning(f"Could not parse .hday file for {username}: {e}")
        return False


def warm_cache() -> None:
    """Pre-populate cache with all .hday files and team configurations.
    
    This function discovers and caches:
    - All team configuration files (config/{team_id}.conf and {team_id}.people)
    - All .hday files in the share root directory
    
    Errors are handled gracefully by logging warnings and continuing.
    A summary is logged at the end with the number of cached entries.
    """
    # Check if caching is enabled
    if not settings.CACHE_ENABLED:
        logger.info("Cache warming skipped (CACHE_ENABLED=False)")
        return
    
    logger.info("Cache warming starting...")
    
    # Get share directory
    share_dir = settings.get_share_dir_path()
    
    # Check if share directory is accessible
    if not share_dir.exists():
        logger.warning(f"Cache warming skipped: share directory does not exist: {share_dir}")
        return
    
    if not share_dir.is_dir():
        logger.warning(f"Cache warming skipped: share path is not a directory: {share_dir}")
        return
    
    # Discover team files in config/ subdirectory
    team_files = _discover_team_files(share_dir)
    logger.debug(f"Discovered {len(team_files)} team configurations")
    
    # Cache team configurations
    teams_cached = 0
    for team_id, config_path, people_path in team_files:
        if _cache_team_config(team_id, config_path, people_path):
            teams_cached += 1
    
    # Discover .hday files in share root
    hday_files = _discover_hday_files(share_dir)
    logger.debug(f"Discovered {len(hday_files)} .hday files")
    
    # Cache .hday files
    users_cached = 0
    for file_path, username in hday_files:
        if _cache_hday_file(file_path, username):
            users_cached += 1
    
    # Log summary
    logger.info(f"Cache warming complete: {users_cached} users cached, {teams_cached} teams cached")
