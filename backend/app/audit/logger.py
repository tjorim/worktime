"""Audit logging functionality for tracking API operations.

This module provides audit logging that records all API operations
to a persistent log file with structured JSON entries.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Audit log location (in backend data directory, not on shared drive)
AUDIT_LOG_DIR = Path(__file__).parent.parent.parent / "data"
AUDIT_LOG_FILE = AUDIT_LOG_DIR / "audit.log"


def append(target: str, action: str, details: Optional[str] = None) -> None:
    """Append an audit log entry to the audit log file.
    
    Args:
        target: The target of the action (e.g., filename, user, resource)
        action: The action performed (e.g., "read", "write", "delete")
        details: Optional additional details about the action
    
    The audit log entry is a JSON object with the following fields:
        - ts: ISO 8601 timestamp in UTC
        - target: Target identifier
        - action: Action performed
        - details: Additional details (null if not provided)
    
    Example log entry:
        {"ts": "2026-02-10T05:30:28.123456Z", "target": "user123.hday", 
         "action": "read", "details": "via API"}
    """
    # Generate UTC ISO 8601 timestamp
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Create audit entry
    entry = {
        "ts": timestamp,
        "target": target,
        "action": action,
        "details": details
    }
    
    # Ensure log directory exists
    try:
        AUDIT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    except (PermissionError, OSError) as e:
        logger.error(f"Failed to create audit log directory: {e}")
        raise
    
    # Append to audit log file
    try:
        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            json.dump(entry, f, ensure_ascii=False)
            f.write("\n")
    except (PermissionError, OSError) as e:
        logger.error(f"Failed to write to audit log: {e}")
        raise
    
    logger.debug(f"Audit log entry: {entry}")
