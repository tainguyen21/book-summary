"""PostgreSQL repository for immutable normalized book sources."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.source import (
    NormalizedSource,
    OriginalBookObject,
    PersistedSource,
)

_READ_ORIGINAL_SOURCE = text(
    """
    SELECT
        object.id,
        book.filename,
        object.object_key,
        object.content_type,
        object.size_bytes
    FROM app.books AS book
    JOIN app.book_objects AS object
        ON object.book_id = book.id
        AND object.owner_id = book.owner_id
        AND object.object_type = 'original'
        AND object.state = 'uploaded'
    WHERE book.id = :book_id
        AND book.owner_id = :owner_id
    """
)

_SET_OWNER_CONTEXT = text("SELECT set_config('bookwise.owner_id', :owner_id, true)")

_INSERT_SOURCE_DOCUMENT = text(
    """
    INSERT INTO data.source_documents (
        id,
        owner_id,
        book_id,
        source_object_id,
        source_location,
        source_content_hash,
        source_format,
        parser_version,
        artifact_object_key,
        artifact_content_hash
    )
    VALUES (
        :id,
        :owner_id,
        :book_id,
        :source_object_id,
        :source_location,
        :source_content_hash,
        :source_format,
        :parser_version,
        :artifact_object_key,
        :artifact_content_hash
    )
    ON CONFLICT (book_id, source_content_hash, parser_version) DO NOTHING
    RETURNING id, artifact_object_key, artifact_content_hash
    """
)

_SELECT_SOURCE_DOCUMENT = text(
    """
    SELECT id, artifact_object_key, artifact_content_hash
    FROM data.source_documents
    WHERE book_id = :book_id
        AND source_content_hash = :source_content_hash
        AND parser_version = :parser_version
    """
)

_INSERT_SPAN = text(
    """
    INSERT INTO data.source_spans (
        id,
        source_document_id,
        sequence_number,
        content,
        content_hash,
        location
    )
    VALUES (
        :id,
        :source_document_id,
        :sequence_number,
        :content,
        :content_hash,
        CAST(:location AS jsonb)
    )
    """
)

_INSERT_STRUCTURE_NODE = text(
    """
    INSERT INTO data.structure_nodes (
        id,
        source_document_id,
        sequence_number,
        parent_sequence_number,
        node_type,
        title,
        source_span_start_sequence,
        source_span_end_sequence,
        location
    )
    VALUES (
        :id,
        :source_document_id,
        :sequence_number,
        :parent_sequence_number,
        :node_type,
        :title,
        :source_span_start_sequence,
        :source_span_end_sequence,
        CAST(:location AS jsonb)
    )
    """
)


class SqlAlchemySourceRepository:
    """Read original metadata from app and append immutable records in data."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @contextmanager
    def transaction(self) -> Iterator[Connection]:
        """Yield a transaction for one bounded source persistence operation."""

        with self._engine.begin() as connection:
            yield connection

    def read_original(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> OriginalBookObject | None:
        """Read the claimed book's uploaded original without modifying app data."""

        row = (
            transaction.execute(
                _READ_ORIGINAL_SOURCE,
                {
                    "owner_id": command.owner_id,
                    "book_id": command.book_id,
                },
            )
            .mappings()
            .one_or_none()
        )
        if row is None:
            return None

        return OriginalBookObject(
            id=row["id"],
            filename=row["filename"],
            object_key=row["object_key"],
            content_type=row["content_type"],
            size_bytes=row["size_bytes"],
        )

    def set_owner_context(self, transaction: Connection, owner_id: object) -> None:
        """Set the transaction-local owner used by source-table RLS policies."""

        transaction.execute(_SET_OWNER_CONTEXT, {"owner_id": str(owner_id)})

    def persist(
        self,
        transaction: Connection,
        source: NormalizedSource,
    ) -> PersistedSource:
        """Insert a document and all of its ordered source rows atomically."""

        document = (
            transaction.execute(
                _INSERT_SOURCE_DOCUMENT,
                {
                    "id": source.id,
                    "owner_id": source.owner_id,
                    "book_id": source.book_id,
                    "source_object_id": source.source_object_id,
                    "source_location": source.source_location,
                    "source_content_hash": source.source_content_hash,
                    "source_format": source.source_format.value,
                    "parser_version": source.parser_version,
                    "artifact_object_key": source.artifact_key,
                    "artifact_content_hash": source.artifact_content_hash,
                },
            )
            .mappings()
            .one_or_none()
        )

        if document is not None:
            transaction.execute(
                _INSERT_STRUCTURE_NODE,
                [
                    {
                        "id": node.id,
                        "source_document_id": source.id,
                        "sequence_number": node.sequence_number,
                        "parent_sequence_number": node.parent_sequence_number,
                        "node_type": node.node_type,
                        "title": node.title,
                        "source_span_start_sequence": node.source_span_start_sequence,
                        "source_span_end_sequence": node.source_span_end_sequence,
                        "location": json.dumps(node.location),
                    }
                    for node in source.nodes
                ],
            )
            transaction.execute(
                _INSERT_SPAN,
                [
                    {
                        "id": span.id,
                        "source_document_id": source.id,
                        "sequence_number": span.sequence_number,
                        "content": span.content,
                        "content_hash": span.content_hash,
                        "location": json.dumps(span.location),
                    }
                    for span in source.spans
                ],
            )
            return PersistedSource(
                id=document["id"],
                artifact_key=document["artifact_object_key"],
                artifact_content_hash=document["artifact_content_hash"],
            )

        existing = (
            transaction.execute(
                _SELECT_SOURCE_DOCUMENT,
                {
                    "book_id": source.book_id,
                    "source_content_hash": source.source_content_hash,
                    "parser_version": source.parser_version,
                },
            )
            .mappings()
            .one()
        )
        return PersistedSource(
            id=existing["id"],
            artifact_key=existing["artifact_object_key"],
            artifact_content_hash=existing["artifact_content_hash"],
        )
