"""Use case for parsing one uploaded book into immutable source records."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from sqlalchemy.engine import Connection

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.source import (
    MAX_SOURCE_BYTES,
    InvalidSourceError,
    NormalizedSource,
    OriginalBookObject,
    PermanentProcessingError,
    PersistedSource,
    SourceLimitError,
    normalize_source,
    source_format_for,
)
from bookwise_data.infrastructure.parsers.docx import parse_docx
from bookwise_data.infrastructure.parsers.epub import parse_epub
from bookwise_data.infrastructure.parsers.pdf import parse_pdf
from bookwise_data.infrastructure.parsers.text import parse_text
from bookwise_data.infrastructure.storage.object_storage import (
    ArtifactIntegrityError,
    S3ObjectStorage,
    StoredObjectLimitError,
    StoredObjectMetadataError,
    StoredObjectNotFoundError,
)


class SourceRepository(Protocol):
    """Port for the app-read/data-write boundary of source ingestion."""

    def transaction(self) -> object:
        """Open a database transaction."""

    def read_original(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> OriginalBookObject | None:
        """Read the matching uploaded original from the app schema."""

    def set_owner_context(self, transaction: Connection, owner_id: object) -> None:
        """Scope data-schema operations to the claimed source owner."""

    def persist(
        self,
        transaction: Connection,
        source: NormalizedSource,
    ) -> PersistedSource:
        """Write immutable normalized rows in the data schema."""


class IngestBook:
    """Download, parse, persist, and archive a claimed uploaded book."""

    def __init__(
        self,
        repository: SourceRepository,
        storage: S3ObjectStorage,
    ) -> None:
        self._repository = repository
        self._storage = storage

    def handle(
        self,
        command: ClaimedCommand,
        heartbeat: Callable[[], bool],
    ) -> None:
        """Handle the CommandWorker contract for one ingest_book command."""

        if command.command_type != "ingest_book":
            raise PermanentProcessingError(
                "unsupported_processing_command",
                "The processing command is not supported by book ingestion.",
            )

        self._require_lease(heartbeat)
        with self._repository.transaction() as transaction:
            self._repository.set_owner_context(transaction, command.owner_id)
            original = self._repository.read_original(transaction, command)
        if original is None:
            raise PermanentProcessingError(
                "missing_original_source",
                "The uploaded book source is not available for processing.",
            )

        source_format = source_format_for(original)
        if original.size_bytes > MAX_SOURCE_BYTES:
            raise SourceLimitError(
                "source_size_limit",
                "The uploaded book exceeds the supported size limit.",
            )
        self._require_lease(heartbeat)
        try:
            source_content = self._storage.download(
                original.object_key,
                original.size_bytes,
                MAX_SOURCE_BYTES,
            )
        except StoredObjectNotFoundError as error:
            raise PermanentProcessingError(
                "missing_original_source",
                "The uploaded book source is not available for processing.",
            ) from error
        except StoredObjectLimitError as error:
            raise SourceLimitError(
                "source_size_limit",
                "The uploaded book exceeds the supported size limit.",
            ) from error
        except StoredObjectMetadataError as error:
            raise PermanentProcessingError(
                "invalid_original_source",
                "The uploaded book source does not match its durable metadata.",
            ) from error
        self._require_lease(heartbeat)
        parsed = _parse(source_format.value, source_content)
        source = normalize_source(command, original, source_content, parsed)

        with self._repository.transaction() as transaction:
            self._repository.set_owner_context(transaction, command.owner_id)
            persisted = self._repository.persist(transaction, source)

        self._require_lease(heartbeat)
        if source.artifact_content_hash != persisted.artifact_content_hash:
            raise PermanentProcessingError(
                "normalized_artifact_hash_mismatch",
                "The normalized artifact does not match its durable metadata.",
            )
        try:
            self._storage.put_private_immutable(
                persisted.artifact_key,
                source.artifact_bytes,
                "application/json",
                persisted.artifact_content_hash,
            )
        except ArtifactIntegrityError as error:
            raise PermanentProcessingError(
                "normalized_artifact_integrity_error",
                "The normalized artifact could not be verified.",
            ) from error

    @staticmethod
    def _require_lease(heartbeat: Callable[[], bool]) -> None:
        if not heartbeat():
            raise RuntimeError("The processing lease was lost.")


def _parse(source_format: str, source_content: bytes):
    parsers = {
        "pdf": parse_pdf,
        "epub": parse_epub,
        "docx": parse_docx,
        "txt": parse_text,
    }
    parser = parsers.get(source_format)
    if parser is None:
        raise InvalidSourceError(
            "unsupported_source_format",
            "The book format is not supported for processing.",
        )
    return parser(source_content)
