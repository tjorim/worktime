"""Regression checks for the wire validator and the two alternate success statuses."""

import json
from copy import deepcopy

import httpx
import pytest
from jsonschema import ValidationError

from tests.wire_contracts import assert_success_contract


def response(path, body, status=200, method="GET"):
    return httpx.Response(
        status,
        content=json.dumps(body),
        headers={"content-type": "application/json"},
        request=httpx.Request(method, f"http://testserver{path}"),
    )


@pytest.mark.parametrize("body", [{}, {"status": "dead"}, {"status": 1}])
def test_wire_validator_rejects_missing_literal_and_wrong_type(body):
    with pytest.raises(ValidationError):
        assert_success_contract(response("/api/health/liveness", body))


def test_wire_validator_rejects_nested_missing_fields_and_invalid_timestamp(
    db_client, auth_headers, create_user_factory
):
    headers = auth_headers(create_user_factory(db_client, auth_headers(1, is_admin=True), "wire-negative"))
    created = db_client.post("/api/time-off", headers=headers, json={"date": "2026-06-01", "entry_type": "vacation"})
    assert created.status_code == 201
    listed = db_client.get("/api/time-off", headers=headers).json()
    for field, value in [("updated_at", "not-a-timestamp"), ("entry_type", "unknown")]:
        invalid = deepcopy(listed)
        invalid["items"][0][field] = value
        with pytest.raises(ValidationError):
            assert_success_contract(response("/api/time-off", invalid))
    del listed["items"][0]["note"]
    with pytest.raises(ValidationError):
        assert_success_contract(response("/api/time-off", listed))


def test_alternate_success_statuses_preserve_wire_and_match_document(db_client, auth_headers, create_user_factory):
    headers = auth_headers(create_user_factory(db_client, auth_headers(1, is_admin=True), "wire-statuses"))
    empty = db_client.get("/api/time-tracking/tasks/running", headers=headers)
    assert empty.status_code == 204
    assert empty.content == b""
    payload = {"date": "2026-06-01", "entry_type": "vacation", "entry_id": "wire-upsert"}
    created = db_client.post("/api/time-off", headers=headers, json=payload)
    updated = db_client.post("/api/time-off", headers=headers, json={**payload, "note": "Updated"})
    assert created.status_code == 201
    assert updated.status_code == 200
    assert updated.json()["note"] == "Updated"
    # The ordinary fixture hook verifies both declared success bodies, with no model coercion.


def test_wire_validator_rejects_undocumented_success_and_nonempty_204():
    with pytest.raises(AssertionError, match="Undocumented success"):
        assert_success_contract(response("/api/health/liveness", {"status": "alive"}, status=201))
    with pytest.raises(AssertionError):
        assert_success_contract(response("/api/time-tracking/tasks/running", {}, status=204))


def test_running_task_200_cannot_be_null():
    with pytest.raises(ValidationError):
        assert_success_contract(response("/api/time-tracking/tasks/running", None))


def test_json_contract_cannot_silently_become_plain_text():
    plain = httpx.Response(
        200,
        text='{"status":"alive"}',
        request=httpx.Request("GET", "http://testserver/api/health/liveness"),
    )
    with pytest.raises(AssertionError):
        assert_success_contract(plain)
