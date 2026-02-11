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
    
    A team directory must contain both 'config' and 'people' files.
    
    Args:
        path: Directory path to check
        
    Returns:
        True if directory contains both config and people files
    """
    if not path.is_dir():
        return False
    
    config_file = path / "config"
    people_file = path / "people"
    
    return config_file.exists() and people_file.exists()


def _discover_team_directories(share_dir: Path) -> List[Path]:
    """Discover all team directories in the share directory.
    
    Args:
        share_dir: Share directory path
        
    Returns:
        List of team directory paths
    """
    team_dirs = []
    
    try:
        for item in share_dir.iterdir():
            if _is_team_directory(item):
                team_dirs.append(item)
    except (PermissionError, OSError) as e:
        logger.warning(f"Could not list share directory during cache warming: {e}")
    
    return team_dirs


def _discover_hday_files(share_dir: Path, team_dirs: List[Path]) -> List[Tuple[Path, str]]:
    """Discover all .hday files in the share directory and team directories.
    
    Args:
        share_dir: Share directory path
        team_dirs: List of team directory paths
        
    Returns:
        List of tuples (file_path, username) for all discovered .hday files
    """
    hday_files = []
    
    # Discover top-level .hday files
    try:
        for item in share_dir.iterdir():
            if item.is_file() and item.suffix == ".hday":
                username = item.stem
                hday_files.append((item, username))
    except (PermissionError, OSError) as e:
        logger.warning(f"Could not list top-level .hday files during cache warming: {e}")
    
    # Discover .hday files within team directories
    for team_dir in team_dirs:
        try:
            for item in team_dir.iterdir():
                if item.is_file() and item.suffix == ".hday":
                    username = item.stem
                    hday_files.append((item, username))
        except (PermissionError, OSError) as e:
            logger.warning(f"Could not list .hday files in team directory {team_dir.name}: {e}")
    
    return hday_files


def _cache_team_config(team_dir: Path) -> bool:
    """Read and cache team configuration.
    
    Args:
        team_dir: Team directory path
        
    Returns:
        True if successfully cached, False otherwise
    """
    team_id = team_dir.name
    
    try:
        # Read config file
        config_path = team_dir / "config"
        team_name = config_path.read_text(encoding="utf-8").strip()
        config_mtime = config_path.stat().st_mtime
        
        # Read people file
        people_path = team_dir / "people"
        people_content = people_path.read_text(encoding="utf-8")
        people_mtime = people_path.stat().st_mtime
        
        # Parse members
        members = []
        for line in people_content.splitlines():
            line = line.strip()
            if not line:
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
    - All team directories (directories containing config + people files)
    - All .hday files (both top-level and within team directories)
    
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
    
    # Discover team directories
    team_dirs = _discover_team_directories(share_dir)
    logger.debug(f"Discovered {len(team_dirs)} team directories")
    
    # Cache team configurations
    teams_cached = 0
    for team_dir in team_dirs:
        if _cache_team_config(team_dir):
            teams_cached += 1
    
    # Discover .hday files
    hday_files = _discover_hday_files(share_dir, team_dirs)
    logger.debug(f"Discovered {len(hday_files)} .hday files")
    
    # Cache .hday files
    users_cached = 0
    for file_path, username in hday_files:
        if _cache_hday_file(file_path, username):
            users_cached += 1
    
    # Log summary
    logger.info(f"Cache warming complete: {users_cached} users cached, {teams_cached} teams cached")
