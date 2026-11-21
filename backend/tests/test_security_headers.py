"""Privacy and security headers of the API: what it sets itself, and what it deliberately leaves to the edge.

The API has no blanket header layer (transport headers such as HSTS and a content security policy belong to the reverse
proxy, like in the other apps). What it does set are the headers of responses that carry a credential or depend on who
asks, and the CORS contract the browser client relies on. These tests pin both, so a change is a decision.
"""

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.main import app

ALLOWED_ORIGIN = "http://localhost:5173"


def _create_feed(db_client: TestClient, headers: dict[str, str]) -> str:
    created = db_client.post("/api/ical", headers=headers)
    assert created.status_code == 201, created.text
    return created.json()["url_path"]


def test_calendar_feed_is_private_inline_and_not_sniffable(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    owner = create_user_factory(db_client, auth_headers(1, is_admin=True), "headers-owner")
    feed = db_client.get(_create_feed(db_client, auth_headers(owner)))

    assert feed.status_code == 200
    assert feed.headers["content-type"].startswith("text/calendar")
    assert feed.headers["cache-control"] == "private, max-age=300"
    assert feed.headers["x-content-type-options"] == "nosniff"
    assert feed.headers["content-disposition"] == 'inline; filename="worktime.ics"'


def test_an_unknown_calendar_feed_is_a_json_404_that_is_not_cacheable_as_a_feed(db_client: TestClient) -> None:
    response = db_client.get("/api/ical/wtical_unknown.ics")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert "private" not in response.headers.get("cache-control", "")
    assert "content-disposition" not in response.headers


def test_responses_that_hand_out_a_credential_are_not_stored(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    owner = create_user_factory(db_client, auth_headers(1, is_admin=True), "headers-credential-owner")
    headers = auth_headers(owner)

    token = db_client.post("/api/access-tokens", json={"name": "ci", "scopes": ["pebble:read"]}, headers=headers)
    pebble = db_client.post("/api/access-tokens/pebble", headers=headers)
    feed_status = db_client.get("/api/ical", headers=headers)

    for response in (token, pebble, feed_status):
        assert response.status_code in (200, 201), response.text
        assert response.headers["cache-control"] == "no-store"


def test_request_id_and_timing_headers_are_on_every_kind_of_response(
    db_client: TestClient, auth_headers: Callable[..., dict[str, str]]
) -> None:
    responses = (
        db_client.get("/api/health"),  # 200
        db_client.get("/api/does-not-exist"),  # 404 from the framework
        db_client.get("/api/users/9999", headers=auth_headers(1, is_admin=True)),  # 404 from a route
        TestClient(app).get("/api/users/me"),  # 401 before any route
    )
    for response in responses:
        assert response.headers["x-request-id"]
        assert "x-total-ms" in response.headers
        assert "server-timing" in response.headers


def test_cors_allows_only_the_configured_origin_with_credentials(db_client: TestClient) -> None:
    allowed = db_client.options(
        "/api/health",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization, X-Request-ID",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == ALLOWED_ORIGIN
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "x-request-id" in allowed.headers["access-control-allow-headers"].lower()

    denied = db_client.options(
        "/api/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers

    simple = db_client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in simple.headers


def test_cors_exposes_the_headers_the_client_reads(db_client: TestClient) -> None:
    response = db_client.get("/api/health", headers={"Origin": ALLOWED_ORIGIN})

    exposed = {name.strip().lower() for name in response.headers["access-control-expose-headers"].split(",")}
    assert {"x-request-id", "x-total-ms", "retry-after", "x-ratelimit-remaining"} <= exposed


def test_the_api_leaves_transport_headers_to_the_edge(db_client: TestClient) -> None:
    # HSTS, CSP and frame options are set by the reverse proxy in front of the API; setting them twice would let the
    # two layers disagree. A change here is a decision to move that responsibility.
    response = db_client.get("/api/health")

    for name in ("strict-transport-security", "content-security-policy", "x-frame-options"):
        assert name not in response.headers
