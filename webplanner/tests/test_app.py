import importlib
import os


def create_client(tmp_path):
    os.environ["WEBPLANNER_DB_PATH"] = str(tmp_path / "webplanner_test.db")
    import web_server

    importlib.reload(web_server)
    return web_server.app.test_client()


def test_templates_roundtrip(tmp_path):
    client = create_client(tmp_path)
    add_res = client.post(
        "/add_template",
        json={"text": "Test", "tag": "Meeting", "start": "09:00", "stop": "10:00"},
    )
    assert add_res.status_code == 200

    templates = client.get("/get_templates").get_json()
    assert templates
    assert templates[0]["text"] == "Test"


def test_tasks_roundtrip(tmp_path):
    client = create_client(tmp_path)
    task = {
        "date": "2026-02-05",
        "text": "Work",
        "tag": "Support",
        "start": "08:00",
        "stop": "09:00",
        "id": "task-1",
    }
    add_res = client.post("/add_task", json=task)
    assert add_res.status_code == 200

    tasks = client.post("/get_tasks", json={"date": "2026-02-05"}).get_json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == "task-1"


def test_overview_page(tmp_path):
    client = create_client(tmp_path)
    client.post(
        "/add_task",
        json={
            "date": "2026-02-03",
            "text": "Work",
            "tag": "Support",
            "start": "08:00",
            "stop": "10:00",
            "id": "task-2",
        },
    )
    res = client.get("/overview?year=2026&week=6")
    assert res.status_code == 200


def test_tasks_range(tmp_path):
    client = create_client(tmp_path)
    client.post(
        "/add_task",
        json={
            "date": "2026-02-04",
            "text": "Work",
            "tag": "Support",
            "start": "08:00",
            "stop": "10:00",
            "id": "task-3",
        },
    )
    res = client.post(
        "/get_tasks_range",
        json={"startDate": "2026-02-01", "endDate": "2026-02-07"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert any(item["date"] == "2026-02-04" for item in data)
