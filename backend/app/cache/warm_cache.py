"""Cache warming functionality for startup optimization.

This module provides functions to pre-populate the cache at application
startup by discovering and caching all .hday files and team configurations.
"""

import hashlib
import logging
from pathlib import Path
from typing import List, Tuple

from app.cache.store import get_cache
from app.config.settings import settings
from app.services.hday_parser import parse_text

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


def _is_team_directory(path: Path) -> bool:
    """Check if a directory is a team directory.
    
    DEPRECATED: This function is no longer used with the new structure
    where team configs are in config/ subdirectory.
    
    Args:
        path: Directory path to check
        
    Returns:
        False (teams are now identified by .conf files in config/ directory)
    """
    return False


def _discover_team_files(share_dir: Path) -> List[Tuple[str, Path, Path]]:
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


def _discover_team_directories(share_dir: Path) -> List[Path]:
    """Discover all team directories in the share directory.
    
    DEPRECATED: This function is no longer used with the new structure
    where team configs are in config/ subdirectory. Returns empty list.
    
    Args:
        share_dir: Share directory path
        
    Returns:
        Empty list (teams are now identified by files in config/ directory)
    """
    return []


def _discover_hday_files(share_dir: Path, team_files: List[Tuple[str, Path, Path]]) -> List[Tuple[Path, str]]:
    """Discover all .hday files in the share directory root.
    
    Args:
        share_dir: Share directory path
        team_files: List of (team_id, config_path, people_path) tuples (not used)
        
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
        # Read config file and parse key=value format
        config_content = config_path.read_text(encoding="utf-8")
        config_mtime = config_path.stat().st_mtime
        
        # Extract groupname from config
        team_name = None
        for line in config_content.splitlines():
            line = line.strip()
            if not line or "=" not in line:
                continue
            
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            
            if key == "groupname":
                team_name = value
                break
        
        if not team_name:
            logger.warning(f"groupname not found in config file for team {team_id}")
            return False
        
        # Read people file
        people_content = people_path.read_text(encoding="utf-8")
        people_mtime = people_path.stat().st_mtime
        
        # Parse members, skipping HTML headers
        members = []
        for line in people_content.splitlines():
            line = line.strip()
            if not line:
                continue
            
            # Skip HTML section headers
            if line.startswith("<") and line.endswith(">"):
                continue
            
            parts = line.split(",", 1)
            if len(parts) == 2:
                username = parts[0].strip()
                display_name = parts[1].strip()
                members.append({
                    "username": username,
                    "display_name": display_name
                })
        
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
    
    except (FileNotFoundError, PermissionError, OSError, UnicodeDecodeError) as e:
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
    hday_files = _discover_hday_files(share_dir, team_files)
    logger.debug(f"Discovered {len(hday_files)} .hday files")
    
    # Cache .hday files
    users_cached = 0
    for file_path, username in hday_files:
        if _cache_hday_file(file_path, username):
            users_cached += 1
    
    # Log summary
    logger.info(f"Cache warming complete: {users_cached} users cached, {teams_cached} teams cached")
