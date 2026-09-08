"""Immutable source-document records produced by book ingestion."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid5

from bookwise_data.domain.commands import ClaimedCommand

_SOURCE_NAMESPACE = UUID("d62bb1b3-9013-4fda-91a0-23a8a8b0b673")
MAX_SOURCE_BYTES = 100 * 1024 * 1024


class SourceFormat(StrEnum):
    """Book formats supported by the first ingestion stage."""

    PDF = "pdf"
    EPUB = "epub"
    DOCX = "docx"
    TXT = "txt"


class PermanentProcessingError(Exception):
    """A processing failure that must not be retried automatically."""

    def __init__(self, code: str, public_message: str) -> None:
        super().__init__(public_message)
        self.code = code
        self.public_message = public_message


class UnsupportedSourceError(PermanentProcessingError):
    """The claimed source is outside the supported parsing boundary."""


class EmptySourceError(PermanentProcessingError):
    """The parser found no selectable or textual content."""


class InvalidSourceError(PermanentProcessingError):
    """The source claims a supported format but cannot be parsed."""


class SourceLimitError(PermanentProcessingError):
    """The source exceeds a durable ingestion safety limit."""


@dataclass(frozen=True, slots=True)
class OriginalBookObject:
    """Read-only metadata for an uploaded original object in the app schema."""

    id: UUID
    filename: str
    object_key: str
    content_type: str
    size_bytes: int


@dataclass(frozen=True, slots=True)
class ParsedSection:
    """A parser-produced unit with durable ordering and source coordinates."""

    node_type: str
    text: str
    location: Mapping[str, Any]
    title: str | None = None


@dataclass(frozen=True, slots=True)
class ParsedSource:
    """Format-specific parser output before it is normalized for persistence."""

    source_format: SourceFormat
    sections: tuple[ParsedSection, ...]


@dataclass(frozen=True, slots=True)
class SourceSpan:
    """An immutable text span with a stable sequence number and hash."""

    id: UUID
    sequence_number: int
    content: str
    content_hash: str
    location: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class StructureNode:
    """A stable ordered structure node describing a source span."""

    id: UUID
    sequence_number: int
    node_type: str
    title: str | None
    location: Mapping[str, Any]
    parent_sequence_number: int | None
    source_span_start_sequence: int | None
    source_span_end_sequence: int | None


@dataclass(frozen=True, slots=True)
class NormalizedSource:
    """The complete immutable source representation for one parser version."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    source_object_id: UUID
    source_location: str
    source_content_hash: str
    source_format: SourceFormat
    parser_version: str
    artifact_key: str
    artifact_content_hash: str
    spans: tuple[SourceSpan, ...]
    nodes: tuple[StructureNode, ...]
    artifact_bytes: bytes


@dataclass(frozen=True, slots=True)
class PersistedSource:
    """The persisted identity returned after a source transaction commits."""

    id: UUID
    artifact_key: str
    artifact_content_hash: str


def source_format_for(original: OriginalBookObject) -> SourceFormat:
    """Resolve a supported format only when extension and content type agree."""

    extension = original.filename.rsplit(".", maxsplit=1)[-1].lower()
    expected_content_types = {
        "pdf": ("application/pdf", SourceFormat.PDF),
        "epub": ("application/epub+zip", SourceFormat.EPUB),
        ("docx"): (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            SourceFormat.DOCX,
        ),
        "txt": ("text/plain", SourceFormat.TXT),
    }
    expected = expected_content_types.get(extension)

    if expected is None or original.content_type.strip().lower() != expected[0]:
        raise UnsupportedSourceError(
            "unsupported_source_format",
            "The book format is not supported for processing.",
        )

    return expected[1]


def normalize_source(
    command: ClaimedCommand,
    original: OriginalBookObject,
    source_content: bytes,
    parsed: ParsedSource,
) -> NormalizedSource:
    """Assign immutable identifiers, ordering, hashes, and artifact metadata."""

    sections = tuple(section for section in parsed.sections if section.text.strip())
    if not sections:
        raise EmptySourceError(
            "empty_source_document",
            "The document contains no selectable text.",
        )

    source_content_hash = sha256_hex(source_content)
    identity = ":".join(
        (
            str(command.owner_id),
            str(command.book_id),
            source_content_hash,
            command.processing_version,
        )
    )
    source_id = uuid5(_SOURCE_NAMESPACE, identity)
    spans = tuple(
        SourceSpan(
            id=uuid5(source_id, f"span:{sequence_number}"),
            sequence_number=sequence_number,
            content=section.text.strip(),
            content_hash=sha256_hex(section.text.strip().encode("utf-8")),
            location=dict(section.location),
        )
        for sequence_number, section in enumerate(sections, start=1)
    )
    nodes = (
        StructureNode(
            id=uuid5(source_id, "node:0"),
            sequence_number=0,
            node_type="document",
            title=original.filename,
            location={"object_key": original.object_key},
            parent_sequence_number=None,
            source_span_start_sequence=1,
            source_span_end_sequence=len(spans),
        ),
        *tuple(
            StructureNode(
                id=uuid5(source_id, f"node:{span.sequence_number}"),
                sequence_number=span.sequence_number,
                node_type=section.node_type,
                title=section.title,
                location=dict(section.location),
                parent_sequence_number=0,
                source_span_start_sequence=span.sequence_number,
                source_span_end_sequence=span.sequence_number,
            )
            for span, section in zip(spans, sections, strict=True)
        ),
    )
    artifact_key = (
        f"normalized/{command.owner_id}/{command.book_id}/"
        f"{source_content_hash}/{sha256_hex(command.processing_version.encode('utf-8'))}.json"
    )
    artifact_payload = _artifact_payload(
        command,
        original,
        source_id,
        source_content_hash,
        parsed.source_format,
        artifact_key,
        spans,
        nodes,
    )
    artifact_bytes = json.dumps(
        artifact_payload,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")

    return NormalizedSource(
        id=source_id,
        owner_id=command.owner_id,
        book_id=command.book_id,
        source_object_id=original.id,
        source_location=original.object_key,
        source_content_hash=source_content_hash,
        source_format=parsed.source_format,
        parser_version=command.processing_version,
        artifact_key=artifact_key,
        artifact_content_hash=sha256_hex(artifact_bytes),
        spans=spans,
        nodes=nodes,
        artifact_bytes=artifact_bytes,
    )


def sha256_hex(content: bytes) -> str:
    """Return a lowercase SHA-256 digest for immutable source content."""

    return hashlib.sha256(content).hexdigest()


def _artifact_payload(
    command: ClaimedCommand,
    original: OriginalBookObject,
    source_id: UUID,
    source_content_hash: str,
    source_format: SourceFormat,
    artifact_key: str,
    spans: tuple[SourceSpan, ...],
    nodes: tuple[StructureNode, ...],
) -> dict[str, Any]:
    return {
        "source_document": {
            "id": str(source_id),
            "owner_id": str(command.owner_id),
            "book_id": str(command.book_id),
            "source_object_id": str(original.id),
            "source_location": original.object_key,
            "source_content_hash": source_content_hash,
            "source_format": source_format.value,
            "parser_version": command.processing_version,
            "artifact_key": artifact_key,
        },
        "source_spans": [
            {
                "id": str(span.id),
                "sequence_number": span.sequence_number,
                "content": span.content,
                "content_hash": span.content_hash,
                "location": dict(span.location),
            }
            for span in spans
        ],
        "structure_nodes": [
            {
                "id": str(node.id),
                "sequence_number": node.sequence_number,
                "node_type": node.node_type,
                "title": node.title,
                "location": dict(node.location),
                "parent_sequence_number": node.parent_sequence_number,
                "source_span_start_sequence": node.source_span_start_sequence,
                "source_span_end_sequence": node.source_span_end_sequence,
            }
            for node in nodes
        ],
    }
