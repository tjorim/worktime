"""Validate serialized success bodies, rather than coercing them back into Pydantic models."""

from functools import lru_cache

from jsonschema import Draft202012Validator, FormatChecker
from rfc3339_validator import validate_rfc3339
from starlette.routing import compile_path

from app.main import app
from tests.test_response_models import NOT_JSON

# Register explicitly: jsonschema silently ignores optional formats if their dependency is absent.
FORMATS = FormatChecker()
FORMATS.checks("date-time")(lambda value: not isinstance(value, str) or validate_rfc3339(value.upper()))


@lru_cache
def operations():
    document = app.openapi()
    return document, [(path, compile_path(path)[0], methods) for path, methods in document["paths"].items()]


def assert_success_contract(response):
    if not 200 <= response.status_code < 300:
        return
    document, paths = operations()
    for path, pattern, methods in paths:
        if pattern.fullmatch(response.request.url.path):
            if (response.request.method.lower(), path) in NOT_JSON:
                return
            operation = methods.get(response.request.method.lower())
            if operation is None:
                continue
            code = str(response.status_code)
            assert code in operation["responses"], (
                f"Undocumented success: {response.request.method} {response.request.url.path} -> {code}"
            )
            contract = operation["responses"][code]
            if code == "204":
                assert not response.content
                return
            content = contract.get("content", {})
            if "application/json" not in content:
                return  # SSE, calendar feeds and plain text have separate contracts.
            assert "application/json" in response.headers.get("content-type", "")
            schema = content["application/json"]["schema"]
            validator = Draft202012Validator({**schema, "components": document["components"]}, format_checker=FORMATS)
            validator.validate(response.json())
            return
