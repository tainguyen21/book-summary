"""Domain records and valid transitions for processing commands."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from uuid import UUID


class ProcessingRunStatus(StrEnum):
    """Python-owned states for a processing run."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    RETRYABLE_FAILED = "retryable_failed"
    PERMANENT_FAILED = "permanent_failed"
    NEEDS_REVIEW = "needs_review"


class ProcessingEventType(StrEnum):
    """Durable event names exposed to the application service."""

    COMMAND_CLAIMED = "command_claimed"
    STAGE_STARTED = "stage_started"
    STAGE_COMPLETED = "stage_completed"
    COMMAND_FAILED = "command_failed"


_ALLOWED_TRANSITIONS: dict[ProcessingRunStatus, frozenset[ProcessingRunStatus]] = {
    ProcessingRunStatus.QUEUED: frozenset(
        {
            ProcessingRunStatus.RUNNING,
            ProcessingRunStatus.RETRYABLE_FAILED,
        }
    ),
    ProcessingRunStatus.RUNNING: frozenset(
        {
            ProcessingRunStatus.COMPLETED,
            ProcessingRunStatus.RETRYABLE_FAILED,
        }
    ),
}


def can_transition(
    current: ProcessingRunStatus,
    target: ProcessingRunStatus,
) -> bool:
    """Return whether a processing run can move to the requested state."""

    return target in _ALLOWED_TRANSITIONS.get(current, frozenset())


@dataclass(frozen=True, slots=True)
class ClaimedCommand:
    """An immutable application command claimed by the Python worker."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    command_type: str
    payload: Mapping[str, Any]
    processing_version: str
    run_id: UUID


@dataclass(frozen=True, slots=True)
class ProcessingEvent:
    """An event appended to the Python-owned processing event stream."""

    owner_id: UUID
    book_id: UUID
    command_id: UUID
    processing_version: str
    event_type: ProcessingEventType
    payload: Mapping[str, Any]
