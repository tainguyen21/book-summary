"""Use case for appending a durable processing event."""

from __future__ import annotations

from typing import Protocol

from bookwise_data.domain.commands import ProcessingEvent


class ProcessingEventRepository(Protocol):
    """Port for the Python-owned processing event stream."""

    def append(self, transaction: object, event: ProcessingEvent) -> None:
        """Append an event using the active transaction."""


class EmitEvent:
    """Append events without exposing infrastructure details to callers."""

    def __init__(self, repository: ProcessingEventRepository) -> None:
        self._repository = repository

    def execute(self, transaction: object, event: ProcessingEvent) -> None:
        """Persist an event as part of the caller's state-change transaction."""

        self._repository.append(transaction, event)
