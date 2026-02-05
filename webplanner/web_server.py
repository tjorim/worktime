#!/usr/bin/env python3
import ast
import getpass
import json
import os
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)


DATA_DIR = BASE_DIR / "data"
DEFAULT_DB_PATH = DATA_DIR / "webplanner.db"
DB_PATH = Path(os.environ.get("WEBPLANNER_DB_PATH", str(DEFAULT_DB_PATH)))
LEGACY_TASKS = BASE_DIR / "time_writing.json"
LEGACY_TEMPLATES = BASE_DIR / "time_templates.lst"


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            task_date TEXT NOT NULL,
            text TEXT NOT NULL,
            tag TEXT NOT NULL,
            start_time TEXT NOT NULL,
            stop_time TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            tag TEXT NOT NULL,
            start_time TEXT NOT NULL,
            stop_time TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def migrate_legacy_tasks():
    if not LEGACY_TASKS.exists():
        return
    try:
        legacy = json.loads(LEGACY_TASKS.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return

    conn = get_db()
    for task_date, items in legacy.items():
        for item in items:
            conn.execute(
                """
                INSERT OR IGNORE INTO tasks
                (id, task_date, text, tag, start_time, stop_time)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    item.get("id"),
                    task_date,
                    item.get("text", ""),
                    item.get("tag", ""),
                    item.get("start", ""),
                    item.get("stop", ""),
                ),
            )
    conn.commit()
    conn.close()


def migrate_legacy_templates():
    if not LEGACY_TEMPLATES.exists():
        return
    content = LEGACY_TEMPLATES.read_text(encoding="utf-8").strip()
    if not content:
        return
    try:
        templates = json.loads(content)
    except json.JSONDecodeError:
        templates = ast.literal_eval(content)

    conn = get_db()
    existing = conn.execute("SELECT COUNT(*) AS count FROM templates").fetchone()
    if existing and existing["count"] > 0:
        conn.close()
        return
    for tpl in templates:
        conn.execute(
            """
            INSERT INTO templates (text, tag, start_time, stop_time)
            VALUES (?, ?, ?, ?)
            """,
            (tpl.get("text", ""), tpl.get("tag", ""), tpl.get("start", ""), tpl.get("stop", "")),
        )
    conn.commit()
    conn.close()


init_db()
migrate_legacy_tasks()
migrate_legacy_templates()


def load_templates():
    conn = get_db()
    rows = conn.execute(
        "SELECT id, text, tag, start_time, stop_time FROM templates ORDER BY id"
    ).fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "text": row["text"],
            "tag": row["tag"],
            "start": row["start_time"],
            "stop": row["stop_time"],
        }
        for row in rows
    ]

@app.route('/get_templates', methods=['GET'])
def get_templates():
    return jsonify(load_templates())


@app.route('/add_template', methods=['POST'])
def add_template():
    new_tpl = request.json
    conn = get_db()
    cur = conn.execute(
        """
        INSERT INTO templates (text, tag, start_time, stop_time)
        VALUES (?, ?, ?, ?)
        """,
        (new_tpl.get("text", ""), new_tpl.get("tag", ""), new_tpl.get("start", ""), new_tpl.get("stop", "")),
    )
    conn.commit()
    template_id = cur.lastrowid
    conn.close()
    return jsonify({"status": "ok", "id": template_id})


@app.route('/update_template', methods=['POST'])
def update_template():
    template_id = request.json['id']
    tpl = request.json['template']
    conn = get_db()
    conn.execute(
        """
        UPDATE templates
        SET text = ?, tag = ?, start_time = ?, stop_time = ?
        WHERE id = ?
        """,
        (tpl.get("text", ""), tpl.get("tag", ""), tpl.get("start", ""), tpl.get("stop", ""), template_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route('/delete_template', methods=['POST'])
def delete_template():
    template_id = request.json['id']
    conn = get_db()
    conn.execute("DELETE FROM templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


def load_tasks_for_date(task_date):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT id, text, tag, start_time, stop_time
        FROM tasks
        WHERE task_date = ?
        ORDER BY start_time
        """,
        (task_date,),
    ).fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "text": row["text"],
            "tag": row["tag"],
            "start": row["start_time"],
            "stop": row["stop_time"],
        }
        for row in rows
    ]


def load_tasks_range(start_date, end_date):
    conn = get_db()
    rows = conn.execute(
        """
        SELECT task_date, tag, start_time, stop_time
        FROM tasks
        WHERE task_date BETWEEN ? AND ?
        ORDER BY task_date, start_time
        """,
        (start_date, end_date),
    ).fetchall()
    conn.close()
    return [
        {
            "date": row["task_date"],
            "tag": row["tag"],
            "start": row["start_time"],
            "stop": row["stop_time"],
        }
        for row in rows
    ]

@app.route('/get_tasks', methods=['POST'])
def get_tasks():
    task_date = request.json.get('date')
    return jsonify(load_tasks_for_date(task_date))

@app.route('/add_task', methods=['POST'])
def add_task():
    data = request.json
    task_date = data['date']
    conn = get_db()
    conn.execute(
        """
        INSERT INTO tasks (id, task_date, text, tag, start_time, stop_time)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (data['id'], task_date, data['text'], data['tag'], data['start'], data['stop']),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "success"})


@app.route('/get_tasks_range', methods=['POST'])
def get_tasks_range():
    start_date = request.json.get('startDate')
    end_date = request.json.get('endDate')
    if not start_date or not end_date:
        return jsonify({"error": "startDate and endDate required"}), 400
    return jsonify(load_tasks_range(start_date, end_date))

@app.route('/remove_task', methods=['POST'])
def remove_task():
    data = request.json
    task_id = data['id']
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "removed"})

@app.route('/update_task_times', methods=['POST'])
def update_task_times():
    data = request.get_json()
    task_date = data['date']
    task_id = data['id']
    new_start = data['newStart']
    new_stop = data['newStop']

    conn = get_db()
    cur = conn.execute(
        """
        UPDATE tasks
        SET start_time = ?, stop_time = ?
        WHERE id = ? AND task_date = ?
        """,
        (new_start, new_stop, task_id, task_date),
    )
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return jsonify({'status': 'error', 'message': 'Invalid date or id'}), 400
    return jsonify({'status': 'success'})

def calculate_duration(start, stop):
    fmt = "%H:%M"
    start_dt = datetime.strptime(start, fmt)
    stop_dt = datetime.strptime(stop, fmt)
    delta = stop_dt - start_dt
    if delta.total_seconds() < 0:
        delta += timedelta(days=1)
    return delta.total_seconds() / 3600

@app.route('/overview')
def weekly_overview():
    weekly_data = {}
    summary = {}
    year = int(request.args.get('year', datetime.now().year))
    week = int(request.args.get('week', datetime.now().isocalendar()[1]))
    start_date = datetime.fromisocalendar(year, week, 1)
    end_date = start_date + timedelta(days=6)

    conn = get_db()
    rows = conn.execute(
        """
        SELECT task_date, tag, start_time, stop_time
        FROM tasks
        WHERE task_date BETWEEN ? AND ?
        """,
        (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')),
    ).fetchall()
    conn.close()

    data = {}
    for row in rows:
        data.setdefault(row["task_date"], []).append(
            {
                "tag": row["tag"],
                "start": row["start_time"],
                "stop": row["stop_time"],
            }
        )

    for i in range(7):
        day_date = start_date + timedelta(days=i)
        day_str = day_date.strftime('%Y-%m-%d')
        day_name = day_date.strftime('%A')
        entries = data.get(day_str, [])

        for entry in entries:
            project = entry['tag']
            duration = calculate_duration(entry['start'], entry['stop'])

            weekly_data.setdefault(day_name, {}).setdefault(project, 0)
            weekly_data[day_name][project] += duration

            summary[project] = summary.get(project, 0) + duration

    return render_template('overview.html', week=week, year=year,
                           weekly_data=weekly_data, summary=summary)


@app.errorhandler(404)
def not_found(e):
    return "Error page not found!"

@app.route('/')
def home():
    return render_template("index.html", name=getpass.getuser())

@app.route('/about')
def about():
    return render_template("about.html")

@app.route('/timetracker')
def timetracker():
    today = date.today().isoformat()
    return render_template("timetracker.html", current_date=today)

@app.get('/shutdown')
def shutdown():
    if os.environ.get("WEBPLANNER_ALLOW_SHUTDOWN") != "1":
        return "Shutdown disabled", 403
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return "Forbidden", 403
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        os._exit(0)
    func()
    return "Server shutting down..."


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8876)
