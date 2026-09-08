"""Use cases for claiming and transitioning Python processing runs."""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Protocol
from uuid import UUID

from bookwise_data.application.emit_event import EmitEvent
from bookwise_data.domain.commands import (
    ClaimedCommand,
    ProcessingEvent,
    ProcessingEventType,
    ProcessingRunStatus,
    ProcessingStatus,
)


class ProcessingCommandRepository(Protocol):
    """Port for command claims and Python-owned run state changes."""

    def transaction(self) -> AbstractContextManager[object]:
        """Open a transaction shared by a state transition and its events."""

    def claim_available(
        self,
        transaction: object,
        limit: int,
    ) -> list[ClaimedCommand]:
        """Claim available commands and create/reopen their runs."""

    def complete(
        self,
        transaction: object,
        command: ClaimedCommand,
    ) -> bool:
        """Move a running command's data run to completed."""

    def fail_retryably(
        self,
        transaction: object,
        command: ClaimedCommand,
    ) -> bool:
        """Move a running command's data run to retryable_failed."""

    def fail_permanently(
        self,
        transaction: object,
        command: ClaimedCommand,
    ) -> bool:
        """Move a running command's data run to permanent_failed."""

    def heartbeat(
        self,
        transaction: object,
        command: ClaimedCommand,
    ) -> bool:
        """Renew a running command's active lease."""

    def read_status(
        self,
        transaction: object,
        command_id: UUID,
    ) -> ProcessingStatus | None:
        """Read the application-facing processing status projection."""


class ClaimCommand:
    """Coordinate command-run state changes with durable event emission."""

    def __init__(
        self,
        repository: ProcessingCommandRepository,
        emit_event: EmitEvent,
    ) -> None:
        self._repository = repository
        self._emit_event = emit_event

    def execute(self, limit: int) -> list[ClaimedCommand]:
        """Claim at most ``limit`` commands and record their initial events."""

        if limit <= 0:
            raise ValueError("limit must be greater than zero")

        with self._repository.transaction() as transaction:
            commands = self._repository.claim_available(transaction, limit)
            for command in commands:
                self._emit_event.execute(
                    transaction,
                    self._event_for(
                        command,
                        ProcessingEventType.COMMAND_CLAIMED,
                        {"run_id": str(command.run_id)},
                    ),
                )
                self._emit_event.execute(
                    transaction,
                    self._event_for(
                        command,
                        ProcessingEventType.STAGE_STARTED,
                        {
                            "run_id": str(command.run_id),
                            "stage": command.command_type,
                        },
                    ),
                )
                self._require_projected_status(
                    transaction,
                    command,
                    ProcessingRunStatus.RUNNING,
                    ProcessingEventType.STAGE_STARTED,
                )

        return commands

    def complete(self, command: ClaimedCommand) -> ProcessingStatus | None:
        """Mark successfully handled work as completed and emit its event."""

        with self._repository.transaction() as transaction:
            if not self._repository.complete(transaction, command):
                return None

            self._emit_event.execute(
                transaction,
                self._event_for(
                    command,
                    ProcessingEventType.STAGE_COMPLETED,
                    {
                        "run_id": str(command.run_id),
                        "stage": command.command_type,
                    },
                ),
            )
            return self._require_projected_status(
                transaction,
                command,
                ProcessingRunStatus.COMPLETED,
                ProcessingEventType.STAGE_COMPLETED,
            )

    def fail_retryably(
        self,
        command: ClaimedCommand,
        error: Exception,
    ) -> ProcessingStatus | None:
        """Record a retryable failure without changing the immutable request."""

        with self._repository.transaction() as transaction:
            if not self._repository.fail_retryably(transaction, command):
                return None

            self._emit_event.execute(
                transaction,
                self._event_for(
                    command,
                    ProcessingEventType.COMMAND_FAILED,
                    {
                        "run_id": str(command.run_id),
                        "error_code": _error_code(error),
                        "message": "Retryable processing failure.",
                    },
                ),
            )
            return self._require_projected_status(
                transaction,
                command,
                ProcessingRunStatus.RETRYABLE_FAILED,
                ProcessingEventType.COMMAND_FAILED,
            )

    def fail_permanently(
        self,
        command: ClaimedCommand,
        error: Exception,
    ) -> ProcessingStatus | None:
        """Record a terminal input failure without changing the app command."""

        with self._repository.transaction() as transaction:
            if not self._repository.fail_permanently(transaction, command):
                return None

            self._emit_event.execute(
                transaction,
                self._event_for(
                    command,
                    ProcessingEventType.COMMAND_FAILED,
                    {
                        "run_id": str(command.run_id),
                        "error_code": _error_code(error),
                        "message": _error_message(
                            error, "Permanent processing failure."
                        ),
                        "terminal_status": ProcessingRunStatus.PERMANENT_FAILED.value,
                    },
                ),
            )
            return self._require_projected_status(
                transaction,
                command,
                ProcessingRunStatus.PERMANENT_FAILED,
                ProcessingEventType.COMMAND_FAILED,
            )

    def heartbeat(self, command: ClaimedCommand) -> bool:
        """Renew the command's current lease while external work is active."""

        with self._repository.transaction() as transaction:
            return self._repository.heartbeat(transaction, command)

    def _require_projected_status(
        self,
        transaction: object,
        command: ClaimedCommand,
        expected_run_status: ProcessingRunStatus,
        expected_event_type: ProcessingEventType,
    ) -> ProcessingStatus:
        status = self._repository.read_status(transaction, command.id)
        if (
            status is None
            or status.run_status != expected_run_status
            or status.latest_event_type != expected_event_type.value
        ):
            raise RuntimeError(
                "processing status projection did not reflect the state change"
            )

        return status

    @staticmethod
    def _event_for(
        command: ClaimedCommand,
        event_type: ProcessingEventType,
        payload: dict[str, str],
    ) -> ProcessingEvent:
        return ProcessingEvent(
            owner_id=command.owner_id,
            book_id=command.book_id,
            command_id=command.id,
            processing_version=command.processing_version,
            event_type=event_type,
            payload=payload,
        )


def _error_code(error: Exception) -> str:
    """Convert an exception type to a bounded, non-sensitive event code."""

    code = getattr(error, "code", None)
    if isinstance(code, str) and code:
        return code[:64]

    normalized = "".join(
        character.lower() if character.isalnum() else "_"
        for character in type(error).__name__
    ).strip("_")
    return normalized[:64] or "processing_error"


def _error_message(error: Exception, default: str) -> str:
    """Expose an intentionally safe message when a domain error supplies one."""

    message = getattr(error, "public_message", None)
    return message if isinstance(message, str) and message else default
