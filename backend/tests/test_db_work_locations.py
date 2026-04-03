"""Tests for database-backed work location endpoints."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient



def test_work_location_upsert_and_filtering(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    owner_id = create_user_factory(db_client, admin_headers, "loc-owner")
    other_id = create_user_factory(db_client, admin_headers, "loc-other")

    owner_headers = auth_headers(owner_id)
    other_headers = auth_headers(other_id)

    first_create = db_client.post(
        f"/db/work-locations/?user_id={owner_id}",
        json={"date": "2026-02-01", "country_code": "nl", "label": "Home"},
        headers=owner_headers,
    )
    assert first_create.status_code == 201

    upsert_update = db_client.post(
        f"/db/work-locations/?user_id={owner_id}",
        json={"date": "2026-02-01", "country_code": "BE", "label": "Client office"},
        headers=owner_headers,
    )
    assert upsert_update.status_code == 201
    assert upsert_update.json()["id"] == first_create.json()["id"]
    assert upsert_update.json()["country_code"] == "BE"
    assert upsert_update.json()["label"] == "Client office"

    other_user_location = db_client.post(
        f"/db/work-locations/?user_id={other_id}",
        json={"date": "2026-02-01", "country_code": "DE", "label": "HQ"},
        headers=other_headers,
    )
    assert other_user_location.status_code == 201

    owner_filtered = db_client.get(
        f"/db/work-locations/?user_id={owner_id}&start_date=2026-02-01&end_date=2026-02-01",
        headers=owner_headers,
    )
    assert owner_filtered.status_code == 200
    assert owner_filtered.json()["total"] == 1
    assert owner_filtered.json()["items"][0]["date"] == "2026-02-01"

    owner_out_of_range = db_client.get(
        f"/db/work-locations/?user_id={owner_id}&start_date=2026-02-02&end_date=2026-02-03",
        headers=owner_headers,
    )
    assert owner_out_of_range.status_code == 200
    assert owner_out_of_range.json()["total"] == 0


def test_work_location_country_code_validation(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    admin_headers = auth_headers(1, is_admin=True)
    user_id = create_user_factory(db_client, admin_headers, "loc-validation")
    headers = auth_headers(user_id)

    invalid_country_code = db_client.post(
        f"/db/work-locations/?user_id={user_id}",
        json={"date": "2026-02-02", "country_code": "ZZ", "label": "Unknown"},
        headers=headers,
    )
    assert invalid_country_code.status_code == 422
