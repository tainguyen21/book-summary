"""PostgreSQL repository for immutable app commands and data runs."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from bookwise_data.domain.commands import ClaimedCommand

_CLAIM_CANDIDATES = text(
    """
    SELECT
        command.id,
        command.owner_id,
        command.book_id,
        command.command_type::text AS command_type,
        command.payload,
        command.processing_version
    FROM app.processing_commands AS command
    LEFT JOIN data.processing_runs AS run
        ON run.command_id = command.id
        AND run.processing_version = command.processing_version
    WHERE command.status = 'queued'
        AND (run.id IS NULL OR run.status = 'retryable_failed')
        AND NOT EXISTS (
            SELECT 1
            FROM data.processing_runs AS completed_run
            WHERE completed_run.command_id = command.id
                AND completed_run.processing_version = command.processing_version
                AND completed_run.status = 'completed'
        )
    ORDER BY command.created_at, command.id
    FOR UPDATE OF command SKIP LOCKED
    LIMIT :limit
    """
)

_CREATE_OR_REOPEN_RUN = text(
    """
    INSERT INTO data.processing_runs (
        owner_id,
        book_id,
        command_id,
        processing_version,
        status,
        started_at,
        updated_at
    )
    VALUES (
        :owner_id,
        :book_id,
        :command_id,
        :processing_version,
        'running',
        clock_timestamp(),
        clock_timestamp()
    )
    ON CONFLICT (command_id, processing_version) DO UPDATE
    SET
        status = 'running',
        started_at = clock_timestamp(),
        completed_at = NULL,
        updated_at = clock_timestamp()
    WHERE data.processing_runs.status = 'retryable_failed'
    RETURNING id
    """
)

_COMPLETE_RUN = text(
    """
    UPDATE data.processing_runs
    SET
        status = 'completed',
        completed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = :run_id
        AND command_id = :command_id
        AND processing_version = :processing_version
        AND status = 'running'
    RETURNING id
    """
)

_FAIL_RUN_RETRYABLY = text(
    """
    UPDATE data.processing_runs
    SET
        status = 'retryable_failed',
        updated_at = clock_timestamp()
    WHERE id = :run_id
        AND command_id = :command_id
        AND processing_version = :processing_version
        AND status = 'running'
    RETURNING id
    """
)


class SqlAlchemyCommandRepository:
    """Read immutable app requests and own state in data.processing_runs."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @contextmanager
    def transaction(self) -> Iterator[Connection]:
        """Yield a database transaction shared with event persistence."""

        with self._engine.begin() as connection:
            yield connection

    def claim_available(
        self,
        transaction: Connection,
        limit: int,
    ) -> list[ClaimedCommand]:
        """Lock claimable requests, then create or reopen their data runs."""

        candidates = transaction.execute(_CLAIM_CANDIDATES, {"limit": limit})
        commands: list[ClaimedCommand] = []

        for row in candidates.mappings():
            run_id = transaction.execute(
                _CREATE_OR_REOPEN_RUN,
                {
                    "owner_id": row["owner_id"],
                    "book_id": row["book_id"],
                    "command_id": row["id"],
                    "processing_version": row["processing_version"],
                },
            ).scalar_one_or_none()
            if run_id is None:
                continue

            commands.append(
                ClaimedCommand(
                    id=row["id"],
                    owner_id=row["owner_id"],
                    book_id=row["book_id"],
                    command_type=row["command_type"],
                    payload=_payload_mapping(row["payload"]),
                    processing_version=row["processing_version"],
                    run_id=run_id,
                )
            )

        return commands

    def complete(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> bool:
        """Record a successful terminal state in the Python-owned run."""

        return (
            transaction.execute(
                _COMPLETE_RUN,
                {
                    "run_id": command.run_id,
                    "command_id": command.id,
                    "processing_version": command.processing_version,
                },
            ).scalar_one_or_none()
            is not None
        )

    def fail_retryably(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> bool:
        """Record a retryable terminal state in the Python-owned run."""

        return (
            transaction.execute(
                _FAIL_RUN_RETRYABLY,
                {
                    "run_id": command.run_id,
                    "command_id": command.id,
                    "processing_version": command.processing_version,
                },
            ).scalar_one_or_none()
            is not None
        )


def _payload_mapping(payload: Any) -> dict[str, Any]:
    """Normalize PostgreSQL JSON output to an application payload mapping."""

    if isinstance(payload, str):
        decoded = json.loads(payload)
    else:
        decoded = payload

    if not isinstance(decoded, dict):
        raise TypeError("processing command payload must be a JSON object")

    return decoded
