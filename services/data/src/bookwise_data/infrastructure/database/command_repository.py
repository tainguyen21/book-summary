"""PostgreSQL repository for immutable app commands and data runs."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from bookwise_data.domain.commands import (
    ClaimedCommand,
    ProcessingRunStatus,
    ProcessingStatus,
)

DEFAULT_CLAIM_LEASE_SECONDS = 300

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
        AND (
            run.id IS NULL
            OR run.status = 'retryable_failed'
            OR (
                run.status = 'running'
                AND run.updated_at < (
                    clock_timestamp() - make_interval(secs => :lease_seconds)
                )
            )
        )
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
        OR (
            data.processing_runs.status = 'running'
            AND data.processing_runs.updated_at < (
                clock_timestamp() - make_interval(secs => :lease_seconds)
            )
        )
    RETURNING id, started_at
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
        AND started_at = :lease_started_at
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
        AND started_at = :lease_started_at
        AND status = 'running'
    RETURNING id
    """
)

_FAIL_RUN_PERMANENTLY = text(
    """
    UPDATE data.processing_runs
    SET
        status = 'permanent_failed',
        completed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = :run_id
        AND command_id = :command_id
        AND processing_version = :processing_version
        AND started_at = :lease_started_at
        AND status = 'running'
    RETURNING id
    """
)

_HEARTBEAT_RUN = text(
    """
    UPDATE data.processing_runs
    SET updated_at = clock_timestamp()
    WHERE id = :run_id
        AND command_id = :command_id
        AND processing_version = :processing_version
        AND started_at = :lease_started_at
        AND status = 'running'
    RETURNING id
    """
)

_READ_PROCESSING_STATUS = text(
    """
    SELECT
        book_id,
        owner_id,
        command_id,
        command_status::text AS command_status,
        run_status::text AS run_status,
        latest_event_type,
        latest_event_at
    FROM data.book_processing_status
    WHERE command_id = :command_id
    """
)


class SqlAlchemyCommandRepository:
    """Read immutable app requests and own state in data.processing_runs."""

    def __init__(
        self,
        engine: Engine,
        claim_lease_seconds: int = DEFAULT_CLAIM_LEASE_SECONDS,
    ) -> None:
        if claim_lease_seconds <= 0:
            raise ValueError("claim_lease_seconds must be greater than zero")

        self._engine = engine
        self._claim_lease_seconds = claim_lease_seconds

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

        candidates = transaction.execute(
            _CLAIM_CANDIDATES,
            {
                "limit": limit,
                "lease_seconds": self._claim_lease_seconds,
            },
        )
        commands: list[ClaimedCommand] = []

        for row in candidates.mappings():
            run = (
                transaction.execute(
                    _CREATE_OR_REOPEN_RUN,
                    {
                        "owner_id": row["owner_id"],
                        "book_id": row["book_id"],
                        "command_id": row["id"],
                        "processing_version": row["processing_version"],
                        "lease_seconds": self._claim_lease_seconds,
                    },
                )
                .mappings()
                .one_or_none()
            )
            if run is None:
                continue

            commands.append(
                ClaimedCommand(
                    id=row["id"],
                    owner_id=row["owner_id"],
                    book_id=row["book_id"],
                    command_type=row["command_type"],
                    payload=_payload_mapping(row["payload"]),
                    processing_version=row["processing_version"],
                    run_id=run["id"],
                    lease_started_at=run["started_at"],
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
                    "lease_started_at": command.lease_started_at,
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
                    "lease_started_at": command.lease_started_at,
                },
            ).scalar_one_or_none()
            is not None
        )

    def fail_permanently(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> bool:
        """Record a permanent terminal state in the Python-owned run."""

        return (
            transaction.execute(
                _FAIL_RUN_PERMANENTLY,
                {
                    "run_id": command.run_id,
                    "command_id": command.id,
                    "processing_version": command.processing_version,
                    "lease_started_at": command.lease_started_at,
                },
            ).scalar_one_or_none()
            is not None
        )

    def heartbeat(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> bool:
        """Renew a lease only when this worker still owns its generation."""

        return (
            transaction.execute(
                _HEARTBEAT_RUN,
                {
                    "run_id": command.run_id,
                    "command_id": command.id,
                    "processing_version": command.processing_version,
                    "lease_started_at": command.lease_started_at,
                },
            ).scalar_one_or_none()
            is not None
        )

    def read_status(
        self,
        transaction: Connection,
        command_id: UUID,
    ) -> ProcessingStatus | None:
        """Read the existing application-facing processing status projection."""

        row = (
            transaction.execute(
                _READ_PROCESSING_STATUS,
                {"command_id": command_id},
            )
            .mappings()
            .one_or_none()
        )
        if row is None:
            return None

        run_status = row["run_status"]
        return ProcessingStatus(
            book_id=row["book_id"],
            owner_id=row["owner_id"],
            command_id=row["command_id"],
            command_status=row["command_status"],
            run_status=ProcessingRunStatus(run_status) if run_status else None,
            latest_event_type=row["latest_event_type"],
            latest_event_at=row["latest_event_at"],
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
