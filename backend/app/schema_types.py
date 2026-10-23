"""Reusable value constraints; schemas own defaults and nullability."""

from typing import Annotated

from pydantic import Field

NonEmptyText = Annotated[str, Field(min_length=1)]
