"""Use cases for claiming and transitioning Python processing runs."""

from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Protocol

from bookwise_data.application.emit_event import EmitEvent
from bookwise_data.domain.commands import (
    ClaimedCommand,
    ProcessingEvent,
    ProcessingEventType,
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

        return commands

    def complete(self, command: ClaimedCommand) -> None:
        """Mark successfully handled work as completed and emit its event."""

        with self._repository.transaction() as transaction:
            if not self._repository.complete(transaction, command):
                return

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

    def fail_retryably(
        self,
        command: ClaimedCommand,
        error: Exception,
    ) -> None:
        """Record a retryable failure without changing the immutable request."""

        with self._repository.transaction() as transaction:
            if not self._repository.fail_retryably(transaction, command):
                return

            self._emit_event.execute(
                transaction,
                self._event_for(
                    command,
                    ProcessingEventType.COMMAND_FAILED,
                    {
                        "run_id": str(command.run_id),
                        "error_type": type(error).__name__,
                        "message": str(error),
                    },
                ),
            )

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
