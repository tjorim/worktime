# WebPlanner

WebPlanner is a lightweight, single-user time tracking web app. It lets you log tasks with start/stop times, group them by tag, and view a weekly breakdown of hours.

## What It Does
- Track tasks for a specific date with start/stop times and a tag.
- Update or remove tasks after creation.
- Save reusable task templates (quick inserts).
- View a weekly overview table with per-day/per-tag totals and a weekly summary.
- Show a daily progress bar based on 8.5 hours of work.

## How It Works
WebPlanner is currently frontend-only with localStorage persistence:
- The React UI lives in `frontend/` and stores tasks/templates in localStorage.
- No backend is required to run the app.
- A legacy Flask backend remains in `web_server.py` as a reference.

## Features
- **Task entry**: Add a task with a date, description, tag, and time range.
- **Edit times**: Update start/stop times per task.
- **Delete tasks**: Remove unwanted entries.
- **Template library**: Create, edit, and delete task templates.
- **Weekly overview**: See hours per day per tag plus weekly totals.
- **Progress bar**: Visualizes total daily hours vs. 8.5 hours.
- **Input validation**: Prevents invalid time ranges and overlaps.
- **Import/Export**: Download or restore your data as JSON.

## Project Structure
- `web_server.py` Legacy Flask app and API endpoints (reference).
- `frontend/` React 19 + TypeScript + Vite 8 app (localStorage).
- `templates/` Legacy HTML views (kept for now).
- `static/` Legacy CSS + JS assets (kept for now).
- `tests/` pytest coverage for backend endpoints.

## Run (Frontend)
1. Install frontend dependencies:

```bash
cd frontend
npm install
```

2. Start the Vite dev server:

```bash
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://127.0.0.1:5173`).

## Run (Backend - Legacy)
Only needed if you want to run the old Flask app.
1. Ensure Python 3.9+ is installed.
2. Install backend dependencies:

```bash
pip install -r requirements.txt
```

3. Start the server:

```bash
python web_server.py
```

Backend runs on `http://127.0.0.1:8876`.

## Data Files
- Frontend persistence: browser localStorage (`webplanner_tasks`, `webplanner_templates`).
- Legacy backend database (if used): `data/webplanner.db`

## Shutdown
The `/shutdown` endpoint is disabled by default. To enable it for localhost use:

```bash
set WEBPLANNER_ALLOW_SHUTDOWN=1
```

Then use the Shutdown link in the header.

## Tests
```bash
pytest
```

```bash
cd frontend
npm run test
```
