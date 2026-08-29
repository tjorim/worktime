"""Mock of Worktime's Pebble routes, for testing the watchapp.

Mirrors backend/app/routers/pebble.py:

    GET  /api/pebble/dashboard              (pebble:read)
    POST /api/pebble/actions/clock-in       (pebble:write)  201, or 409 if already running
    POST /api/pebble/actions/clock-out      (pebble:write)  200, or 409 if nothing running

Every request is appended to a timestamped log file, which is the point: the
acceptance criteria about repeated button presses and cache replay are claims
about what the server received, not about what the watch displayed. Three rapid
SELECT presses should leave exactly one "POST clock-in" line behind.

    python3 pebble/scripts/mock-server.py [port] [--host H] [--token T]

Point the watch at it through the pairing flow, or push the configuration
straight to the emulator (see ../EMULATOR.md for the numeric message keys):

    pebble send-app-message --emulator emery \
      --string 10000=http://127.0.0.1:8899 10001=wtpat_test

Useful flags:

    --latency 3          hold every response, so there is time to press SELECT
                         repeatedly while a mutation is in flight
    --fail-with 503      make every request fail, to check that the watch keeps
                         the state retryable (401/403 should ask for pairing)
    --clocked-in         start with a running task, to exercise clock-out first

Responses are served on threads, so a genuinely overlapping mutation would show
up as interleaved log lines rather than being serialized by the server.
"""

import argparse
import json
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import sleep

DASHBOARD_PATH = "/api/pebble/dashboard"
CLOCK_IN_PATH = "/api/pebble/actions/clock-in"
CLOCK_OUT_PATH = "/api/pebble/actions/clock-out"

# Shaped like read_models.ReadModelShift.
MORNING = {
    "code": "M",
    "display_code": "M",
    "name": "Morning",
    "start_hour": 6.0,
    "end_hour": 14.0,
    "is_working": True,
}
EVENING = {
    "code": "E",
    "display_code": "E",
    "name": "Evening",
    "start_hour": 14.0,
    "end_hour": 22.0,
    "is_working": True,
}

STATE = {"running_task": None, "planned_task": None, "next_task_id": 1}


def now():
    """Timestamps in the format FastAPI emits for aware datetimes."""
    return datetime.now(UTC).isoformat()


def task_read(text, start_time, stop_time=None, task_id="task_1"):
    """Shaped like schemas.TaskRead."""
    return {
        "id": task_id,
        "user_id": 1,
        "label_id": None,
        "gantt_task_id": None,
        "text": text,
        "start_time": start_time,
        "stop_time": stop_time,
        "includes_break": False,
        "created_at": start_time,
    }


def dashboard(with_shift=True):
    """Shaped like routers.pebble.PebbleDashboardRead."""
    today = datetime.now(UTC).date()
    current_shift = (
        {
            "team_number": 3,
            "date": today.isoformat(),
            "shift_day": today.isoformat(),
            "shift_code": "M",
            "shift": MORNING,
            "is_currently_working": True,
        }
        if with_shift
        else None
    )
    next_items = (
        [
            {
                "team_number": 3,
                "date": (today + timedelta(days=1)).isoformat(),
                "shift_code": "E",
                "shift": EVENING,
            }
        ]
        if with_shift
        else []
    )
    return {
        "running_task": STATE["running_task"],
        "planned_task": STATE["planned_task"],
        "current_status": {
            "as_of": now(),
            "current_shift": current_shift,
            "currently_working_team": None,
            "off_day_progress": None,
        },
        "next_shifts": {"as_of": now(), "items": next_items},
    }


class Handler(BaseHTTPRequestHandler):
    token = "wtpat_test"
    log_path = Path("requests.log")
    latency = 0.0
    fail_with = None
    with_shift = True

    def log_message(self, *args):
        """Silence the default stderr access log; we keep our own."""

    def record(self, line):
        stamped = f"{datetime.now(UTC).strftime('%H:%M:%S.%f')[:-3]} {line}"
        with self.log_path.open("a") as fh:
            fh.write(stamped + "\n")
        print(stamped, flush=True)

    def authorized(self):
        return self.headers.get("Authorization") == f"Bearer {self.token}"

    def respond(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def preconditions(self, label):
        """Shared 401 / forced-failure handling. True means keep going."""
        if not self.authorized():
            self.record(f"{label} -> 401 (bad or missing bearer token)")
            self.respond(401, {"detail": "invalid access token"})
            return False
        if self.latency:
            self.record(f"{label} … holding {self.latency}s")
            sleep(self.latency)
        if self.fail_with:
            self.record(f"{label} -> {self.fail_with} (forced)")
            self.respond(self.fail_with, {"detail": "forced failure"})
            return False
        return True

    def do_GET(self):
        label = f"GET {self.path}"
        if self.path != DASHBOARD_PATH:
            self.record(f"{label} -> 404")
            return self.respond(404, {"detail": "not found"})
        if not self.preconditions(label):
            return
        running = STATE["running_task"]
        self.record(f"{label} -> 200 ({'running' if running else 'not clocked in'})")
        self.respond(200, dashboard(self.with_shift))

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            self.rfile.read(length)
        if self.path == CLOCK_IN_PATH:
            action = "clock-in"
        elif self.path == CLOCK_OUT_PATH:
            action = "clock-out"
        else:
            self.record(f"POST {self.path} -> 404")
            return self.respond(404, {"detail": "not found"})

        label = f"POST {action}"
        if not self.preconditions(label):
            return

        if action == "clock-in":
            if STATE["running_task"] is not None:
                self.record(f"{label} -> 409 (a task is already running)")
                return self.respond(409, {"detail": "A task is already running"})
            task_id = f"task_{STATE['next_task_id']}"
            STATE["next_task_id"] += 1
            STATE["running_task"] = task_read("Working", now(), task_id=task_id)
            self.record(f"{label} -> 201 {task_id}")
            return self.respond(201, STATE["running_task"])

        running = STATE["running_task"]
        if running is None:
            self.record(f"{label} -> 409 (no running task)")
            return self.respond(409, {"detail": "No running task to clock out"})
        stopped = {**running, "stop_time": now()}
        STATE["running_task"] = None
        self.record(f"{label} -> 200 {stopped['id']}")
        self.respond(200, stopped)


def main():
    parser = argparse.ArgumentParser(description="Mock Worktime Pebble API.")
    parser.add_argument("port", nargs="?", type=int, default=8899)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="bind address; pass the LAN address to reach it from a watch on the network",
    )
    parser.add_argument("--token", default=Handler.token, help="expected bearer token")
    parser.add_argument("--log", default="requests.log", help="request log file")
    parser.add_argument(
        "--latency",
        type=float,
        default=0.0,
        help="seconds to hold each response, for testing repeated button presses",
    )
    parser.add_argument(
        "--fail-with",
        type=int,
        help="respond to everything with this status (401, 429, 503 …)",
    )
    parser.add_argument("--clocked-in", action="store_true", help="start with a running task")
    parser.add_argument("--no-shift", action="store_true", help="report no configured shift")
    parser.add_argument(
        "--planned-in",
        type=float,
        metavar="MINUTES",
        help="report a planned task starting this many minutes from now, to exercise the "
        "watch's starting-soon reminder",
    )
    args = parser.parse_args()

    Handler.token = args.token
    Handler.log_path = Path(args.log)
    Handler.latency = args.latency
    Handler.fail_with = args.fail_with
    Handler.with_shift = not args.no_shift
    Handler.log_path.write_text("")

    if args.clocked_in:
        started = (datetime.now(UTC) - timedelta(minutes=42)).isoformat()
        STATE["running_task"] = task_read("Working", started)
        STATE["next_task_id"] = 2

    if args.planned_in is not None:
        start = datetime.now(UTC) + timedelta(minutes=args.planned_in)
        STATE["planned_task"] = task_read(
            "Team sync",
            start.isoformat(),
            stop_time=(start + timedelta(hours=1)).isoformat(),
            task_id=f"task_{STATE['next_task_id']}",
        )
        STATE["next_task_id"] += 1

    print(f"mock Worktime Pebble API on http://{args.host}:{args.port} (log: {args.log})")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
