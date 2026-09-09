"""Rules for source-linked evidence, summaries, and embeddings."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid5

from pydantic import BaseModel, Field

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.source import PermanentProcessingError

_GENERATION_NAMESPACE = UUID("81fa0b47-176f-40c5-9ce7-eed5c42d35ff")
DEFAULT_GENERATION_CHUNK_CHARS = 12000


class EvidenceType(StrEnum):
    """Evidence categories supported by the first summarization path."""

    MAIN_CLAIM = "main_claim"
    SUPPORTING_ARGUMENT = "supporting_argument"
    DEFINITION = "definition"
    CONCEPT = "concept"
    PROCEDURE = "procedure"
    EXAMPLE = "example"
    DATA_POINT = "data_point"
    LIMITATION = "limitation"
    COUNTERARGUMENT = "counterargument"
    CONCLUSION = "conclusion"


class ValidationStatus(StrEnum):
    """Validation states recorded for generated candidates."""

    ACCEPTED = "accepted"
    REJECTED = "rejected"
    AMBIGUOUS = "ambiguous"


class EmbeddingTargetType(StrEnum):
    """Canonical record kinds that can receive embeddings."""

    EVIDENCE = "evidence"
    GENERATED_SUMMARY = "generated_summary"


class InvalidGenerationOutput(PermanentProcessingError):
    """A provider result failed deterministic validation."""


class ModelProviderConfigurationError(PermanentProcessingError):
    """No usable model provider was configured for this worker."""


class EmbeddingDimensionError(PermanentProcessingError):
    """A provider returned embeddings with the wrong dimensions."""


class ProviderOutputError(PermanentProcessingError):
    """A provider returned an invalid structured or embedding response."""

    def __init__(
        self,
        code: str,
        public_message: str,
        output_hash: str | None = None,
    ) -> None:
        super().__init__(code, public_message)
        self.output_hash = output_hash


class ProviderRequestError(Exception):
    """A retryable provider transport or capacity failure."""

    def __init__(self, code: str, public_message: str) -> None:
        super().__init__(public_message)
        self.code = code
        self.public_message = public_message


class SourceSelectionError(PermanentProcessingError):
    """The command did not identify one immutable normalized source."""


class SourceSpanChunkLimitError(InvalidGenerationOutput):
    """One immutable span cannot fit inside the configured provider bound."""

    def __init__(
        self,
        source_node_id: UUID,
        chunk_sequence_number: int,
        input_hash: str,
    ) -> None:
        super().__init__(
            "source_span_exceeds_generation_chunk_limit",
            "A source span exceeds the configured generation chunk limit.",
        )
        self.source_node_id = source_node_id
        self.chunk_sequence_number = chunk_sequence_number
        self.input_hash = input_hash


class SummaryIdentityConflictError(InvalidGenerationOutput):
    """The same immutable summary input already resolved to another output."""


class EvidenceDraft(BaseModel):
    """Structured evidence returned by a model provider before validation."""

    evidence_type: EvidenceType
    statement: str = Field(min_length=1, max_length=2000)
    source_span_ids: list[UUID] = Field(min_length=1)
    source_excerpt: str | None = Field(default=None, max_length=500)
    confidence: float = Field(ge=0, le=1)


class EvidenceExtractionOutput(BaseModel):
    """Provider output for one source-bounded chunk."""

    items: list[EvidenceDraft]


class SummaryDraft(BaseModel):
    """Structured summary returned by a model provider before validation."""

    body: str = Field(min_length=1, max_length=20000)
    source_span_ids: list[UUID] = Field(min_length=1)


@dataclass(frozen=True, slots=True)
class GenerationSourceSpan:
    """A source span loaded from the immutable source tables."""

    id: UUID
    source_document_id: UUID
    sequence_number: int
    content: str
    content_hash: str
    location: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class GenerationStructureNode:
    """A structure node that bounds summary and evidence generation."""

    id: UUID
    source_document_id: UUID
    sequence_number: int
    node_type: str
    title: str | None
    source_span_start_sequence: int | None
    source_span_end_sequence: int | None


@dataclass(frozen=True, slots=True)
class GenerationSourceDocument:
    """Source document metadata consumed by generation."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    parser_version: str
    source_content_hash: str


@dataclass(frozen=True, slots=True)
class GenerationSourceBook:
    """The immutable source records for one owner/book source document."""

    document: GenerationSourceDocument
    spans: tuple[GenerationSourceSpan, ...]
    nodes: tuple[GenerationStructureNode, ...]


@dataclass(frozen=True, slots=True)
class EvidenceChunk:
    """A provider input that never crosses a structure-node boundary."""

    source_node_id: UUID
    sequence_number: int
    spans: tuple[GenerationSourceSpan, ...]
    input_hash: str


@dataclass(frozen=True, slots=True)
class GeneratedEvidence:
    """Accepted source-linked evidence ready for persistence."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    source_document_id: UUID
    source_node_id: UUID
    generation_version: str
    evidence_type: EvidenceType
    statement: str
    citation_data: tuple[dict[str, Any], ...]
    validation_status: ValidationStatus
    input_hash: str
    output_hash: str
    provider: str
    model: str
    confidence: float


@dataclass(frozen=True, slots=True)
class GeneratedSummary:
    """An accepted immutable generated summary."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    source_document_id: UUID
    source_node_id: UUID
    generation_version: str
    body: str
    citation_data: tuple[dict[str, Any], ...]
    validation_status: ValidationStatus
    input_hash: str
    output_hash: str
    provider: str
    model: str
    supersedes_id: UUID | None


@dataclass(frozen=True, slots=True)
class EmbeddingRecord:
    """A versioned embedding for an accepted generated record."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    source_document_id: UUID
    target_type: EmbeddingTargetType
    target_id: UUID
    embedding_version: str
    input_hash: str
    provider: str
    model: str
    dimensions: int
    vector: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class ProviderEmbedding:
    """A provider embedding paired with the request index that produced it."""

    index: int
    values: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class GenerationValidationOutcome:
    """A rejected or ambiguous model output without accepted generated text."""

    id: UUID
    owner_id: UUID
    book_id: UUID
    source_document_id: UUID | None
    source_node_id: UUID | None
    source_chunk_sequence_number: int | None
    generation_version: str
    stage: str
    validation_status: ValidationStatus
    reason_code: str
    input_hash: str | None
    output_hash: str | None
    provider: str | None
    model: str | None
    details: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class AcceptedGeneration:
    """The accepted summary, its evidence, and embeddings."""

    summary: GeneratedSummary
    evidence: tuple[GeneratedEvidence, ...]
    embeddings: tuple[EmbeddingRecord, ...]


def build_chunks(
    source: GenerationSourceBook,
    maximum_chars: int = DEFAULT_GENERATION_CHUNK_CHARS,
) -> tuple[EvidenceChunk, ...]:
    """Group adjacent spans without crossing a source structure-node boundary."""

    if maximum_chars <= 0:
        raise ValueError("maximum_chars must be greater than zero")

    spans_by_sequence = {span.sequence_number: span for span in source.spans}
    chunks: list[EvidenceChunk] = []
    chunk_sequence = 1
    for node in _leaf_section_nodes(source.nodes):
        if (
            node.source_span_start_sequence is None
            or node.source_span_end_sequence is None
        ):
            continue

        section_spans = tuple(
            spans_by_sequence[sequence]
            for sequence in range(
                node.source_span_start_sequence,
                node.source_span_end_sequence + 1,
            )
            if sequence in spans_by_sequence
        )
        current: list[GenerationSourceSpan] = []
        current_chars = 0
        for span in section_spans:
            span_size = len(span.content)
            if span_size > maximum_chars:
                candidate = _chunk(
                    node.id,
                    chunk_sequence + (1 if current else 0),
                    (span,),
                )
                raise SourceSpanChunkLimitError(
                    node.id,
                    candidate.sequence_number,
                    candidate.input_hash,
                )
            if current and current_chars + span_size > maximum_chars:
                chunks.append(_chunk(node.id, chunk_sequence, current))
                chunk_sequence += 1
                current = []
                current_chars = 0
            current.append(span)
            current_chars += span_size

        if current:
            chunks.append(_chunk(node.id, chunk_sequence, current))
            chunk_sequence += 1

    return tuple(chunks)


def source_chunk_payload(chunk: EvidenceChunk) -> dict[str, Any]:
    """Return provider input with span IDs preserved next to untrusted text."""

    return {
        "source_node_id": str(chunk.source_node_id),
        "sequence_number": chunk.sequence_number,
        "spans": [
            {
                "source_span_id": str(span.id),
                "sequence_number": span.sequence_number,
                "content": span.content,
                "location": dict(span.location),
            }
            for span in chunk.spans
        ],
    }


def accepted_evidence_from_output(
    command: ClaimedCommand,
    source_document_id: UUID,
    chunk: EvidenceChunk,
    output: EvidenceExtractionOutput,
    provider: str,
    model: str,
) -> tuple[GeneratedEvidence, ...]:
    """Validate provider evidence citations and create immutable records."""

    allowed_span_ids = {span.id for span in chunk.spans}
    records: list[GeneratedEvidence] = []
    for index, item in enumerate(output.items, start=1):
        cited = tuple(dict.fromkeys(item.source_span_ids))
        if not cited or any(span_id not in allowed_span_ids for span_id in cited):
            raise InvalidGenerationOutput(
                "invalid_evidence_citation",
                "Generated evidence cited a source span outside its chunk.",
            )

        citation_data = tuple(
            {
                "source_span_id": str(span_id),
                "citation_order": order,
                "source_excerpt": item.source_excerpt,
            }
            for order, span_id in enumerate(cited, start=1)
        )
        output_payload = {
            "evidence_type": item.evidence_type.value,
            "statement": item.statement.strip(),
            "citation_data": citation_data,
            "confidence": item.confidence,
        }
        output_hash = canonical_hash(output_payload)
        records.append(
            GeneratedEvidence(
                id=uuid5(
                    _GENERATION_NAMESPACE,
                    (
                        f"evidence:{source_document_id}:{chunk.source_node_id}:"
                        f"{command.processing_version}:{chunk.input_hash}:"
                        f"{index}:{output_hash}"
                    ),
                ),
                owner_id=command.owner_id,
                book_id=command.book_id,
                source_document_id=source_document_id,
                source_node_id=chunk.source_node_id,
                generation_version=command.processing_version,
                evidence_type=item.evidence_type,
                statement=item.statement.strip(),
                citation_data=citation_data,
                validation_status=ValidationStatus.ACCEPTED,
                input_hash=chunk.input_hash,
                output_hash=output_hash,
                provider=provider,
                model=model,
                confidence=item.confidence,
            )
        )

    return tuple(records)


def accepted_summary_from_output(
    command: ClaimedCommand,
    source: GenerationSourceBook,
    source_node_id: UUID,
    evidence: Sequence[GeneratedEvidence],
    output: SummaryDraft,
    provider: str,
    model: str,
    supersedes_id: UUID | None = None,
) -> GeneratedSummary:
    """Validate summary citations against accepted evidence."""

    allowed_span_ids = {
        UUID(str(citation["source_span_id"]))
        for item in evidence
        for citation in item.citation_data
    }
    cited = tuple(dict.fromkeys(output.source_span_ids))
    if not cited or any(span_id not in allowed_span_ids for span_id in cited):
        raise InvalidGenerationOutput(
            "invalid_summary_citation",
            "Generated summary cited a source span without accepted evidence.",
        )

    input_hash = summary_input_hash(source.document.id, source_node_id, evidence)
    citation_data = tuple(
        {"source_span_id": str(span_id), "citation_order": order}
        for order, span_id in enumerate(cited, start=1)
    )
    output_hash = canonical_hash(
        {"body": output.body.strip(), "citation_data": citation_data}
    )

    return GeneratedSummary(
        id=uuid5(
            _GENERATION_NAMESPACE,
            (
                f"summary:{source.document.id}:{source_node_id}:"
                f"{command.processing_version}:{input_hash}:{output_hash}"
            ),
        ),
        owner_id=command.owner_id,
        book_id=command.book_id,
        source_document_id=source.document.id,
        source_node_id=source_node_id,
        generation_version=command.processing_version,
        body=output.body.strip(),
        citation_data=citation_data,
        validation_status=ValidationStatus.ACCEPTED,
        input_hash=input_hash,
        output_hash=output_hash,
        provider=provider,
        model=model,
        supersedes_id=supersedes_id,
    )


def embedding_records(
    command: ClaimedCommand,
    source_document_id: UUID,
    target_texts: Mapping[tuple[EmbeddingTargetType, UUID], str],
    vectors: Sequence[ProviderEmbedding],
    provider: str,
    model: str,
    dimensions: int,
) -> tuple[EmbeddingRecord, ...]:
    """Validate vector dimensions and build deterministic embedding records."""

    if dimensions <= 0:
        raise EmbeddingDimensionError(
            "embedding_dimension_invalid",
            "The configured embedding dimension must be greater than zero.",
        )
    if len(target_texts) != len(vectors):
        raise EmbeddingDimensionError(
            "embedding_count_mismatch",
            "The provider returned a different number of embeddings than requested.",
        )

    records: list[EmbeddingRecord] = []
    for expected_index, ((target_type, target_id), text) in enumerate(
        target_texts.items()
    ):
        provider_embedding = vectors[expected_index]
        if provider_embedding.index != expected_index:
            raise EmbeddingDimensionError(
                "embedding_order_mismatch",
                "The provider returned embeddings in an unexpected order.",
            )
        vector = provider_embedding.values
        if len(vector) != dimensions:
            raise EmbeddingDimensionError(
                "embedding_dimension_mismatch",
                "The provider returned an embedding with unexpected dimensions.",
            )
        input_hash = canonical_hash(
            {
                "target_type": target_type.value,
                "target_id": str(target_id),
                "text": text,
            }
        )
        records.append(
            EmbeddingRecord(
                id=uuid5(
                    _GENERATION_NAMESPACE,
                    (
                        f"embedding:{source_document_id}:{target_type.value}:"
                        f"{target_id}:{command.processing_version}:"
                        f"{provider}:{model}:{input_hash}"
                    ),
                ),
                owner_id=command.owner_id,
                book_id=command.book_id,
                source_document_id=source_document_id,
                target_type=target_type,
                target_id=target_id,
                embedding_version=command.processing_version,
                input_hash=input_hash,
                provider=provider,
                model=model,
                dimensions=dimensions,
                vector=vector,
            )
        )

    return tuple(records)


def validation_outcome(
    command: ClaimedCommand,
    stage: str,
    status: ValidationStatus,
    reason_code: str,
    details: Mapping[str, Any],
    source_document_id: UUID | None = None,
    source_node_id: UUID | None = None,
    source_chunk_sequence_number: int | None = None,
    input_hash: str | None = None,
    output_hash: str | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> GenerationValidationOutcome:
    """Create an immutable validation outcome without raw generated text."""

    identity = canonical_hash(
        {
            "command_id": str(command.id),
            "run_id": str(command.run_id),
            "stage": stage,
            "status": status.value,
            "reason_code": reason_code,
            "source_document_id": str(source_document_id)
            if source_document_id
            else None,
            "source_node_id": str(source_node_id) if source_node_id else None,
            "source_chunk_sequence_number": source_chunk_sequence_number,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "provider": provider,
            "model": model,
            "details": details,
        }
    )
    return GenerationValidationOutcome(
        id=uuid5(_GENERATION_NAMESPACE, f"validation:{identity}"),
        owner_id=command.owner_id,
        book_id=command.book_id,
        source_document_id=source_document_id,
        source_node_id=source_node_id,
        source_chunk_sequence_number=source_chunk_sequence_number,
        generation_version=command.processing_version,
        stage=stage,
        validation_status=status,
        reason_code=reason_code,
        input_hash=input_hash,
        output_hash=output_hash,
        provider=provider,
        model=model,
        details=dict(details),
    )


def summary_input_hash(
    source_document_id: UUID,
    source_node_id: UUID,
    evidence: Sequence[GeneratedEvidence],
) -> str:
    """Hash the ordered accepted evidence supplied to summary synthesis."""

    return canonical_hash(
        {
            "source_document_id": str(source_document_id),
            "source_node_id": str(source_node_id),
            "evidence_ids": [str(item.id) for item in evidence],
            "evidence_hashes": [item.output_hash for item in evidence],
        }
    )


def canonical_hash(value: Mapping[str, Any] | Sequence[Any] | str) -> str:
    """Hash canonical JSON or text with SHA-256."""

    if isinstance(value, str):
        payload = value.encode("utf-8")
    else:
        payload = json.dumps(
            _json_safe(value),
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _chunk(
    source_node_id: UUID,
    sequence_number: int,
    spans: Iterable[GenerationSourceSpan],
) -> EvidenceChunk:
    span_tuple = tuple(spans)
    return EvidenceChunk(
        source_node_id=source_node_id,
        sequence_number=sequence_number,
        spans=span_tuple,
        input_hash=canonical_hash(
            {
                "source_node_id": str(source_node_id),
                "sequence_number": sequence_number,
                "source_spans": [
                    {
                        "id": str(span.id),
                        "sequence_number": span.sequence_number,
                        "content_hash": span.content_hash,
                    }
                    for span in span_tuple
                ],
            }
        ),
    )


def _leaf_section_nodes(
    nodes: Sequence[GenerationStructureNode],
) -> tuple[GenerationStructureNode, ...]:
    sections = tuple(
        node
        for node in nodes
        if node.node_type != "document"
        and node.source_span_start_sequence is not None
        and node.source_span_end_sequence is not None
    )
    if sections:
        return sections

    return tuple(
        node
        for node in nodes
        if node.source_span_start_sequence is not None
        and node.source_span_end_sequence is not None
    )


def _json_safe(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, StrEnum):
        return value.value
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [_json_safe(item) for item in value]
    return value
