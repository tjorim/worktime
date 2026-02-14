# Worktime Backend - Windows Executable

This guide explains how to use the Worktime backend as a standalone Windows executable.

## What is it?

The Worktime backend is an API server that bridges the Worktime web application with your .hday files
and team configuration stored on a shared network drive. This Windows executable version bundles
everything you need into a single file - no Python installation required!

## Requirements

- Windows 10 or later
- Network share access (if using shared .hday files)
- That's it! No Python, no dependencies, just the executable.

## Download

The Windows executable workflow is manual-only (`workflow_dispatch`) and should be triggered when
you need a fresh build:

1. Go to https://github.com/tjorim/worktime/actions/workflows/build-exe.yml
2. Click **Run workflow** and start a run from the branch you want to build
3. Open the successful workflow run (green checkmark)
4. Scroll down to the **Artifacts** section
5. Download the `worktime-backend-windows` artifact
6. Extract the ZIP file to get `worktime-backend.exe`

## Quick Start

### Basic Usage (Default Settings)

1. Place `worktime-backend.exe` in any folder
2. Double-click `worktime-backend.exe`
3. The server starts on http://localhost:8000
4. Open your Worktime web app and connect to http://localhost:8000

### Custom Configuration

To customize the server settings:

1. Create a file named `.env` in the same folder as `worktime-backend.exe`
2. Add your configuration (see examples below)
3. Double-click `worktime-backend.exe` to start with your settings

#### Example .env file:

```env
# Path to your .hday files (local or network share)
SHARE_DIR=C:\SharedFiles\Worktime

# Allow requests from your frontend
CORS_ORIGINS=http://localhost:5173,http://localhost:8000

# Server port (default: 8000)
PORT=8000

# Environment mode (development or production)
ENVIRONMENT=production
```

## Network Share Setup

If you're using a network share for team .hday files:

### Windows Network Share (SMB)

1. Map your network share as a drive letter (e.g., Z:)
   - Right-click "This PC" → "Map network drive"
   - Choose a drive letter
   - Enter the network path (e.g., `\\server\share`)
   - Check "Reconnect at sign-in"
   - Click "Finish"

2. In your `.env` file, use the mapped drive:
   ```env
   SHARE_DIR=Z:\worktime
   ```

### UNC Path (Alternative)

You can also use a UNC path directly:
```env
SHARE_DIR=\\server\share\worktime
```

Make sure your Windows user has read/write access to the share!

## Running the Server

### Option 1: Double-click

Simply double-click `worktime-backend.exe`. A console window will open showing server logs.

### Option 2: Command Line

```cmd
worktime-backend.exe
```

The server will start and display:
```
Worktime Backend API - Starting up
============================================================
Environment:     production
Host:            0.0.0.0
Port:            8000
Share Directory: C:\SharedFiles\Worktime
CORS Origins:    http://localhost:5173
============================================================
Server ready to accept connections
```

## Configuration Options

All configuration is done via environment variables. You can set these:

1. In a `.env` file (recommended)
2. In Windows environment variables
3. Via command line (set before running the executable)

| Variable | Description | Default |
|----------|-------------|---------|
| `SHARE_DIR` | Path to folder with .hday files | `./data/hday_files` |
| `CORS_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:5173` |
| `PORT` | Server port | `8000` |
| `HOST` | Server host/bind address | `0.0.0.0` |
| `ENVIRONMENT` | `development` or `production` | `development` |
| `CACHE_TTL` | Cache lifetime in seconds | `10` |
| `CACHE_ENABLED` | Enable caching (`true` or `false`) | `true` |

## Connecting the Frontend

Once the backend is running:

1. Open the Worktime web application
2. Open Settings (gear icon)
3. Triple-click the version number at the bottom to enable Developer Options
4. Enter the backend URL: `http://localhost:8000` (or your custom port)
5. Click "Test Connection"
6. If successful, click "Auto-connect"

Now your Worktime app can read and write .hday files through the backend!

## Troubleshooting

### Server won't start

- **Port already in use**: Another application is using port 8000. Change the PORT in your `.env` file.
- **Permission denied**: Run the executable as Administrator (right-click → "Run as administrator")

### Cannot access share directory

- **Check permissions**: Ensure your Windows user can read/write to the network share
- **Check path**: Verify the path in SHARE_DIR exists and is correct
- **Test manually**: Open the share path in Windows Explorer to confirm access

### CORS errors in web browser

- **Check CORS_ORIGINS**: Make sure it includes the URL where your frontend is served
- **Multiple origins**: Separate with commas, no spaces: `http://localhost:5173,http://localhost:8000`
- **Protocol matters**: Use `http://` not `https://` for local development

### Backend connection fails

- **Check the URL**: Make sure you're using the correct protocol and port
- **Firewall**: Windows Firewall might block the connection. Allow the executable through the firewall.
- **Test with curl**: Open Command Prompt and run:
  ```cmd
  curl http://localhost:8000/v1/health
  ```
  Should return: `{"status": "ok", "share": "accessible"}`

## Stopping the Server

Simply close the console window or press `Ctrl+C` in the terminal.

## Building from Source

If you want to build the executable yourself:

1. Install Python 3.12
2. Navigate to the backend directory
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   pip install nuitka ordered-set zstandard
   ```
4. Build with Nuitka:
   ```bash
   python -m nuitka launcher.py \
     --onefile \
     --output-dir=dist \
     --output-filename=worktime-backend.exe \
     --include-package=app \
     --windows-console-mode=force \
     --assume-yes-for-downloads
   ```
5. Find the executable in `dist/worktime-backend.exe`

## Support

For issues or questions:
- Check the [main README](../README.md)
- Review the [backend documentation](README.md)
- Open an issue on [GitHub](https://github.com/tjorim/worktime/issues)

## License

Same license as the Worktime project. See [LICENSE](../LICENSE) file.
