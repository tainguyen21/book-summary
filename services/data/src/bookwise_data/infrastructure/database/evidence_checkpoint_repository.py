"""PostgreSQL store for validated per-chunk evidence output."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Engine

from bookwise_data.domain.commands import ClaimedCommand

_SET_OWNER_CONTEXT = text("SELECT set_config('bookwise.owner_id', :owner_id, true)")

_LOAD_CHECKPOINTS = text(
    """
    SELECT chunk_input_hash, evidence_output
    FROM data.generation_evidence_checkpoints
    WHERE command_id = :command_id
        AND source_document_id = :source_document_id
        AND provider = :provider
        AND model = :model
        AND prompt_version = :prompt_version
    """
)

_INSERT_CHECKPOINT = text(
    """
    INSERT INTO data.generation_evidence_checkpoints (
        owner_id,
        book_id,
        command_id,
        source_document_id,
        chunk_input_hash,
        provider,
        model,
        prompt_version,
        evidence_output
    )
    VALUES (
        :owner_id,
        :book_id,
        :command_id,
        :source_document_id,
        :chunk_input_hash,
        :provider,
        :model,
        :prompt_version,
        CAST(:evidence_output AS jsonb)
    )
    ON CONFLICT ON CONSTRAINT uq_data_generation_evidence_checkpoints_chunk
    DO NOTHING
    """
)


class SqlAlchemyEvidenceCheckpointRepository:
    """Load and save checkpoints, each in its own owner-scoped transaction."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def load(
        self,
        command: ClaimedCommand,
        source_document_id: UUID,
        provider: str,
        model: str,
        prompt_version: str,
    ) -> dict[str, dict[str, Any]]:
        """Return saved evidence outputs keyed by chunk input hash."""

        with self._engine.begin() as transaction:
            transaction.execute(_SET_OWNER_CONTEXT, {"owner_id": str(command.owner_id)})
            rows = transaction.execute(
                _LOAD_CHECKPOINTS,
                {
                    "command_id": command.id,
                    "source_document_id": source_document_id,
                    "provider": provider,
                    "model": model,
                    "prompt_version": prompt_version,
                },
            ).all()
        return {row.chunk_input_hash: dict(row.evidence_output) for row in rows}

    def save(
        self,
        command: ClaimedCommand,
        source_document_id: UUID,
        chunk_input_hash: str,
        provider: str,
        model: str,
        prompt_version: str,
        evidence_output: Mapping[str, Any],
    ) -> None:
        """Insert one chunk's validated output; an existing key is kept."""

        with self._engine.begin() as transaction:
            transaction.execute(_SET_OWNER_CONTEXT, {"owner_id": str(command.owner_id)})
            transaction.execute(
                _INSERT_CHECKPOINT,
                {
                    "owner_id": command.owner_id,
                    "book_id": command.book_id,
                    "command_id": command.id,
                    "source_document_id": source_document_id,
                    "chunk_input_hash": chunk_input_hash,
                    "provider": provider,
                    "model": model,
                    "prompt_version": prompt_version,
                    "evidence_output": json.dumps(evidence_output, sort_keys=True),
                },
            )
