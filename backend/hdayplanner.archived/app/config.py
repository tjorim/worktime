from pathlib import Path
import os

# DEV: local data folder; PROD: mount SMB share to this path
SHARE_DIR = Path(os.getenv('SHARE_DIR', str(Path(__file__).resolve().parent.parent / 'data' / 'hday_files')))
SHARE_DIR.mkdir(parents=True, exist_ok=True)

# Simple allow-list of editors; in PROD use Azure AD roles
EDITORS = set(os.getenv('EDITORS', '').split(',')) if os.getenv('EDITORS') else set()
