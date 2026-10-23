"""Write requests fail visibly on unknown fields without losing opaque user data."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas import SyncPushRequest, TaskUpdate, UserPreferencesWrite


def test_unknown_label_field_does_not_create_a_row(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
) -> None:
    user_id = create_user_factory(db_client, auth_headers(1, is_admin=True), "request-contracts")
    headers = auth_headers(user_id)
    url = f"/api/time-tracking/labels?user_id={user_id}"
    response = db_client.post(url, headers=headers, json={"name": "Focus", "color": "#112233", "colour": "#445566"})
    assert response.status_code == 422
    assert db_client.get(url, headers=headers).json()["items"] == []


@pytest.mark.parametrize(
    "payload, location",
    [
        ({"taskz": []}, ("taskz",)),
        (
            {"tasks": [{"id": "task", "action": "update", "client_updated_at": "2026-10-23T10:00:00Z", "txt": "lost"}]},
            ("tasks", 0, "txt"),
        ),
    ],
)
def test_sync_rejects_unknown_fields(payload: dict, location: tuple) -> None:
    with pytest.raises(ValidationError) as error:
        SyncPushRequest.model_validate(payload)
    assert any(item["type"] == "extra_forbidden" and item["loc"] == location for item in error.value.errors())


def test_partial_updates_preserve_omission_and_explicit_null() -> None:
    assert TaskUpdate().model_dump(exclude_unset=True) == {}
    assert TaskUpdate(stop_time=None).model_dump(exclude_unset=True) == {"stop_time": None}


def test_preferences_keep_arbitrary_nested_keys() -> None:
    data = {"futureSetting": {"customKey": True}}
    request = UserPreferencesWrite(data=data, client_updated_at="2026-10-23T10:00:00Z")
    assert request.data == data
