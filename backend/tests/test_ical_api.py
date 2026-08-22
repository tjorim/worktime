"""Integration tests for calendar subscription management and feed access."""

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_ical_feed_lifecycle_over_http(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "ical-lifecycle-owner")
    headers = auth_headers(owner_id)

    initial = db_client.get("/api/ical", headers=headers)
    assert initial.status_code == 200
    assert initial.headers["cache-control"] == "no-store"
    assert initial.json() == {
        "configured": False,
        "token_preview": None,
        "created_at": None,
        "last_used_at": None,
    }

    created = db_client.post("/api/ical", headers=headers)
    assert created.status_code == 201, created.text
    feed_path = created.json()["url_path"]
    assert feed_path.startswith("/api/ical/wtical_")
    assert feed_path.endswith(".ics")

    configured = db_client.get("/api/ical", headers=headers)
    assert configured.status_code == 200
    assert configured.json()["configured"] is True
    assert configured.json()["token_preview"]
    assert configured.json()["created_at"]
    assert configured.json()["last_used_at"] is None

    fetched = db_client.get(feed_path)
    assert fetched.status_code == 200, fetched.text
    assert fetched.headers["content-type"].startswith("text/calendar")
    assert fetched.headers["cache-control"] == "private, max-age=300"
    assert fetched.headers["content-disposition"] == 'inline; filename="worktime.ics"'
    assert fetched.headers["x-content-type-options"] == "nosniff"
    assert fetched.text.startswith("BEGIN:VCALENDAR\r\n")
    assert fetched.text.endswith("END:VCALENDAR\r\n")

    used = db_client.get("/api/ical", headers=headers)
    assert used.status_code == 200
    assert used.json()["last_used_at"] is not None

    revoked = db_client.delete("/api/ical", headers=headers)
    assert revoked.status_code == 204
    assert db_client.get(feed_path).status_code == 404

    final = db_client.get("/api/ical", headers=headers)
    assert final.status_code == 200
    assert final.json()["configured"] is False
