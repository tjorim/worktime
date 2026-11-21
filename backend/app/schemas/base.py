"""Shared base classes for the Pydantic request/response models."""

from __future__ import annotations

from typing import Annotated

import pycountry
from pydantic import BaseModel, ConfigDict, Field

ISO_ALPHA2_CODES = frozenset(country.alpha_2 for country in pycountry.countries)


NonEmptyText = Annotated[str, Field(min_length=1)]


class ResponseModel(BaseModel):
    """Base for response models.

    ``json_schema_serialization_defaults_required`` only changes the OpenAPI document: a field with a default
    is always sent (a response is built from the whole model), so the generated client type must not mark it
    optional. It does not touch validation or serialization, so the wire is unchanged. Models whose routes
    really omit a field (an upstream pass-through, ``exclude_unset``, a hand-built dict) stay on ``BaseModel``
    and say so.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class RequestModel(BaseModel):
    """External write payload; unknown fields must not be silently discarded."""

    model_config = ConfigDict(extra="forbid")


class ListResponse[T](ResponseModel):
    """Generic paged list response."""

    items: list[T]
    total: int
