"""Pin intentional opaque response fields; ordinary nested records must be generated too."""

from app.main import app
from app.schemas import SyncPushResponse, SyncPushResults
from tests.test_response_models import NOT_JSON

# These are data owned by clients or extensible diagnostic/capability boundaries, not forgotten records.
OPAQUE = {
    "AuditEntryRead/properties/details": "Action-specific diagnostic metadata, not a stable record.",
    "UserRead/properties/settings": "Legacy user settings JSON, opaque to the backend.",
    "UserDataExport/properties/preferences": "Client-owned preferences exported unchanged.",
    "UserPreferencesRead/properties/data/anyOf/1": "Historical unversioned documents returned unchanged for older clients.",
    "McpCapabilities/properties/resources/items": "Always empty in MCP contract v1; no resource wire record yet.",
    "McpCapabilities/properties/prompts/items": "Always empty in MCP contract v1; no prompt wire record yet.",
}


def test_only_documented_response_boundaries_are_opaque():
    document = app.openapi()
    seen = set()
    opaque = set()

    def visit(schema, path):
        if not isinstance(schema, dict):
            return
        if "$ref" in schema:
            name = schema["$ref"].rsplit("/", 1)[1]
            if name not in seen:
                seen.add(name)
                visit(document["components"]["schemas"][name], name)
            return
        if (
            not schema
            or schema.get("additionalProperties") is True
            or (schema.get("type") == "object" and not schema.get("properties"))
        ):
            opaque.add(path)
        for key, value in schema.items():
            if key == "properties":
                for name, field in value.items():
                    visit(field, f"{path}/properties/{name}")
            elif key in {"items", "additionalProperties"}:
                visit(value, f"{path}/{key}")
            elif key in {"anyOf", "allOf", "oneOf"}:
                for index, field in enumerate(value):
                    visit(field, f"{path}/{key}/{index}")

    for path, methods in document["paths"].items():
        for method, operation in methods.items():
            if (method, path) in NOT_JSON:
                continue
            for code, response in operation["responses"].items():
                if code.startswith("2") and code != "204":
                    for content in response.get("content", {}).values():
                        visit(content["schema"], f"{method} {path}")
    assert opaque == OPAQUE.keys()


def test_sync_results_name_every_collection_without_changing_serialization():
    collections = {"labels", "tasks", "templates", "work_locations", "time_off_entries", "gantt_tasks"}
    schema = SyncPushResults.model_json_schema(mode="serialization")
    assert set(schema["required"]) == collections
    wire = {"results": {name: [] for name in collections}}
    assert SyncPushResponse.model_validate(wire).model_dump(mode="json") == wire


def test_empty_sync_push_still_sends_all_six_collections(db_client, auth_headers, create_user_factory):
    headers = auth_headers(create_user_factory(db_client, auth_headers(1, is_admin=True), "fixture-contract-owner"))
    response = db_client.post("/api/sync/push", json={}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "results": {
            name: [] for name in ("labels", "tasks", "templates", "work_locations", "time_off_entries", "gantt_tasks")
        }
    }
