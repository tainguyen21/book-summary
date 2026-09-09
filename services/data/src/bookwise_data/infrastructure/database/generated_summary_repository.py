"""PostgreSQL repository for generated evidence, summaries, and embeddings."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.generation import (
    AcceptedGeneration,
    GenerationSourceBook,
    GenerationSourceDocument,
    GenerationSourceSpan,
    GenerationStructureNode,
    GenerationValidationOutcome,
    SourceSelectionError,
    SummaryIdentityConflictError,
)

_SET_OWNER_CONTEXT = text("SELECT set_config('bookwise.owner_id', :owner_id, true)")

_LOAD_SOURCE_DOCUMENT_BY_ID = text(
    """
    SELECT id, owner_id, book_id, parser_version, source_content_hash
    FROM data.source_documents
    WHERE id = :source_document_id
        AND owner_id = :owner_id
        AND book_id = :book_id
    """
)

_LOAD_SOURCE_DOCUMENT_CANDIDATES = text(
    """
    SELECT id, owner_id, book_id, parser_version, source_content_hash
    FROM data.source_documents
    WHERE owner_id = :owner_id
        AND book_id = :book_id
    ORDER BY id
    LIMIT 2
    """
)

_LOAD_SOURCE_SPANS = text(
    """
    SELECT id, source_document_id, sequence_number, content, content_hash, location
    FROM data.source_spans
    WHERE source_document_id = :source_document_id
    ORDER BY sequence_number
    """
)

_LOAD_STRUCTURE_NODES = text(
    """
    SELECT
        id,
        source_document_id,
        sequence_number,
        node_type,
        title,
        source_span_start_sequence,
        source_span_end_sequence
    FROM data.structure_nodes
    WHERE source_document_id = :source_document_id
    ORDER BY sequence_number
    """
)

_LOCK_SUMMARY_SCOPE = text(
    """
    SELECT pg_advisory_xact_lock(
        hashtextextended(
            :summary_scope,
            0
        )
    )
    """
)

_SELECT_SUMMARY_IDENTITY = text(
    """
    SELECT id
    FROM data.generated_summaries
    WHERE owner_id = :owner_id
        AND book_id = :book_id
        AND source_document_id = :source_document_id
        AND source_node_id = :source_node_id
        AND generation_version = :generation_version
        AND input_hash = :input_hash
    FOR UPDATE
    """
)

_SELECT_CURRENT_SUMMARY = text(
    """
    SELECT id
    FROM data.generated_summaries
    WHERE owner_id = :owner_id
        AND book_id = :book_id
        AND source_document_id = :source_document_id
        AND source_node_id = :source_node_id
        AND validation_status = 'accepted'
        AND superseded_by_id IS NULL
    FOR UPDATE
    """
)

_INSERT_VALIDATION_OUTCOME = text(
    """
    INSERT INTO data.generation_validation_outcomes (
        id,
        owner_id,
        book_id,
        source_document_id,
        source_node_id,
        source_chunk_sequence_number,
        generation_version,
        stage,
        validation_status,
        reason_code,
        input_hash,
        output_hash,
        provider,
        model,
        details
    )
    VALUES (
        :id,
        :owner_id,
        :book_id,
        :source_document_id,
        :source_node_id,
        :source_chunk_sequence_number,
        :generation_version,
        :stage,
        :validation_status,
        :reason_code,
        :input_hash,
        :output_hash,
        :provider,
        :model,
        CAST(:details AS jsonb)
    )
    ON CONFLICT (id) DO NOTHING
    """
)

_INSERT_EVIDENCE = text(
    """
    INSERT INTO data.generated_evidence (
        id,
        owner_id,
        book_id,
        source_document_id,
        source_node_id,
        generation_version,
        evidence_type,
        statement,
        citation_data,
        validation_status,
        input_hash,
        output_hash,
        provider,
        model,
        confidence
    )
    VALUES (
        :id,
        :owner_id,
        :book_id,
        :source_document_id,
        :source_node_id,
        :generation_version,
        :evidence_type,
        :statement,
        CAST(:citation_data AS jsonb),
        :validation_status,
        :input_hash,
        :output_hash,
        :provider,
        :model,
        :confidence
    )
    ON CONFLICT (id) DO NOTHING
    """
)

_INSERT_SUMMARY = text(
    """
    INSERT INTO data.generated_summaries (
        id,
        owner_id,
        book_id,
        source_document_id,
        source_node_id,
        generation_version,
        body,
        citation_data,
        validation_status,
        input_hash,
        output_hash,
        provider,
        model,
        superseded_by_id
    )
    VALUES (
        :id,
        :owner_id,
        :book_id,
        :source_document_id,
        :source_node_id,
        :generation_version,
        :body,
        CAST(:citation_data AS jsonb),
        :validation_status,
        :input_hash,
        :output_hash,
        :provider,
        :model,
        NULL
    )
    """
)

_SUPERSEDE_SUMMARY = text(
    """
    UPDATE data.generated_summaries
    SET superseded_by_id = :new_summary_id
    WHERE id = :old_summary_id
        AND owner_id = :owner_id
        AND book_id = :book_id
        AND source_document_id = :source_document_id
        AND source_node_id = :source_node_id
        AND id <> :new_summary_id
        AND superseded_by_id IS NULL
    """
)

_INSERT_EMBEDDING = text(
    """
    INSERT INTO data.embedding_records (
        id,
        owner_id,
        book_id,
        source_document_id,
        target_type,
        target_id,
        embedding_version,
        input_hash,
        provider,
        model,
        dimensions,
        embedding
    )
    VALUES (
        :id,
        :owner_id,
        :book_id,
        :source_document_id,
        :target_type,
        :target_id,
        :embedding_version,
        :input_hash,
        :provider,
        :model,
        :dimensions,
        CAST(:embedding AS vector)
    )
    ON CONFLICT (target_type, target_id, embedding_version, provider, model)
    DO NOTHING
    """
)


class SqlAlchemyGeneratedSummaryRepository:
    """Read immutable source rows and append generated records in data."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @contextmanager
    def transaction(self) -> Iterator[Connection]:
        """Yield a transaction for one generation persistence operation."""

        with self._engine.begin() as connection:
            yield connection

    def set_owner_context(self, transaction: Connection, owner_id: object) -> None:
        """Set the transaction-local owner used by data-table RLS policies."""

        transaction.execute(_SET_OWNER_CONTEXT, {"owner_id": str(owner_id)})

    def load_source(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> GenerationSourceBook | None:
        """Load one explicit source document or reject ambiguous source versions."""

        requested_id = command.payload.get("source_document_id")
        if requested_id is not None:
            try:
                source_document_id = UUID(str(requested_id))
            except (TypeError, ValueError) as error:
                raise SourceSelectionError(
                    "invalid_source_document_identity",
                    "The processing command contains an invalid source document identity.",
                ) from error
            document_row = (
                transaction.execute(
                    _LOAD_SOURCE_DOCUMENT_BY_ID,
                    {
                        "source_document_id": source_document_id,
                        "owner_id": command.owner_id,
                        "book_id": command.book_id,
                    },
                )
                .mappings()
                .one_or_none()
            )
        else:
            candidates = (
                transaction.execute(
                    _LOAD_SOURCE_DOCUMENT_CANDIDATES,
                    {
                        "owner_id": command.owner_id,
                        "book_id": command.book_id,
                    },
                )
                .mappings()
                .all()
            )
            if len(candidates) > 1:
                raise SourceSelectionError(
                    "ambiguous_source_document",
                    "The processing command must identify one normalized source document.",
                )
            document_row = candidates[0] if candidates else None

        if document_row is None:
            return None
        spans = tuple(
            GenerationSourceSpan(
                id=row["id"],
                source_document_id=row["source_document_id"],
                sequence_number=row["sequence_number"],
                content=row["content"],
                content_hash=row["content_hash"],
                location=_json_mapping(row["location"]),
            )
            for row in transaction.execute(
                _LOAD_SOURCE_SPANS,
                {"source_document_id": document_row["id"]},
            ).mappings()
        )
        nodes = tuple(
            GenerationStructureNode(
                id=row["id"],
                source_document_id=row["source_document_id"],
                sequence_number=row["sequence_number"],
                node_type=row["node_type"],
                title=row["title"],
                source_span_start_sequence=row["source_span_start_sequence"],
                source_span_end_sequence=row["source_span_end_sequence"],
            )
            for row in transaction.execute(
                _LOAD_STRUCTURE_NODES,
                {"source_document_id": document_row["id"]},
            ).mappings()
        )
        return GenerationSourceBook(
            document=GenerationSourceDocument(
                id=document_row["id"],
                owner_id=document_row["owner_id"],
                book_id=document_row["book_id"],
                parser_version=document_row["parser_version"],
                source_content_hash=document_row["source_content_hash"],
            ),
            spans=spans,
            nodes=nodes,
        )

    def append_validation_outcome(
        self,
        transaction: Connection,
        outcome: GenerationValidationOutcome,
    ) -> None:
        """Record rejected or ambiguous output without accepted generated text."""

        transaction.execute(
            _INSERT_VALIDATION_OUTCOME,
            {
                "id": outcome.id,
                "owner_id": outcome.owner_id,
                "book_id": outcome.book_id,
                "source_document_id": outcome.source_document_id,
                "source_node_id": outcome.source_node_id,
                "source_chunk_sequence_number": outcome.source_chunk_sequence_number,
                "generation_version": outcome.generation_version,
                "stage": outcome.stage,
                "validation_status": outcome.validation_status.value,
                "reason_code": outcome.reason_code,
                "input_hash": outcome.input_hash,
                "output_hash": outcome.output_hash,
                "provider": outcome.provider,
                "model": outcome.model,
                "details": json.dumps(outcome.details),
            },
        )

    def persist(
        self,
        transaction: Connection,
        generation: AcceptedGeneration,
    ) -> None:
        """Serialize one summary scope and safely append idempotent records."""

        summary = generation.summary
        transaction.execute(
            _LOCK_SUMMARY_SCOPE,
            {
                "summary_scope": ":".join(
                    (
                        str(summary.owner_id),
                        str(summary.book_id),
                        str(summary.source_document_id),
                        str(summary.source_node_id),
                    )
                )
            },
        )
        existing_summary_id = transaction.execute(
            _SELECT_SUMMARY_IDENTITY,
            {
                "owner_id": summary.owner_id,
                "book_id": summary.book_id,
                "source_document_id": summary.source_document_id,
                "source_node_id": summary.source_node_id,
                "generation_version": summary.generation_version,
                "input_hash": summary.input_hash,
            },
        ).scalar_one_or_none()
        if existing_summary_id is not None and existing_summary_id != summary.id:
            raise SummaryIdentityConflictError(
                "summary_identity_conflict",
                "The same summary input already has a different immutable output.",
            )

        transaction.execute(
            _INSERT_EVIDENCE,
            [
                {
                    "id": item.id,
                    "owner_id": item.owner_id,
                    "book_id": item.book_id,
                    "source_document_id": item.source_document_id,
                    "source_node_id": item.source_node_id,
                    "generation_version": item.generation_version,
                    "evidence_type": item.evidence_type.value,
                    "statement": item.statement,
                    "citation_data": json.dumps(item.citation_data),
                    "validation_status": item.validation_status.value,
                    "input_hash": item.input_hash,
                    "output_hash": item.output_hash,
                    "provider": item.provider,
                    "model": item.model,
                    "confidence": item.confidence,
                }
                for item in generation.evidence
            ],
        )
        if existing_summary_id is None:
            current_summary_id = transaction.execute(
                _SELECT_CURRENT_SUMMARY,
                {
                    "owner_id": summary.owner_id,
                    "book_id": summary.book_id,
                    "source_document_id": summary.source_document_id,
                    "source_node_id": summary.source_node_id,
                },
            ).scalar_one_or_none()
            transaction.execute(
                _INSERT_SUMMARY,
                {
                    "id": summary.id,
                    "owner_id": summary.owner_id,
                    "book_id": summary.book_id,
                    "source_document_id": summary.source_document_id,
                    "source_node_id": summary.source_node_id,
                    "generation_version": summary.generation_version,
                    "body": summary.body,
                    "citation_data": json.dumps(summary.citation_data),
                    "validation_status": summary.validation_status.value,
                    "input_hash": summary.input_hash,
                    "output_hash": summary.output_hash,
                    "provider": summary.provider,
                    "model": summary.model,
                },
            )
            if current_summary_id is not None:
                transaction.execute(
                    _SUPERSEDE_SUMMARY,
                    {
                        "old_summary_id": current_summary_id,
                        "new_summary_id": summary.id,
                        "owner_id": summary.owner_id,
                        "book_id": summary.book_id,
                        "source_document_id": summary.source_document_id,
                        "source_node_id": summary.source_node_id,
                    },
                )

        transaction.execute(
            _INSERT_EMBEDDING,
            [
                {
                    "id": item.id,
                    "owner_id": item.owner_id,
                    "book_id": item.book_id,
                    "source_document_id": item.source_document_id,
                    "target_type": item.target_type.value,
                    "target_id": item.target_id,
                    "embedding_version": item.embedding_version,
                    "input_hash": item.input_hash,
                    "provider": item.provider,
                    "model": item.model,
                    "dimensions": item.dimensions,
                    "embedding": _vector_literal(item.vector),
                }
                for item in generation.embeddings
            ],
        )


def _json_mapping(value: object) -> dict[str, object]:
    if isinstance(value, str):
        decoded = json.loads(value)
    else:
        decoded = value
    if not isinstance(decoded, dict):
        raise TypeError("source location must be a JSON object")
    return decoded


def _vector_literal(values: tuple[float, ...]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"
