"""Use case for evidence-first summary generation."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from sqlalchemy.engine import Connection

from bookwise_data.application.build_embeddings import BuildEmbeddings
from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.generation import (
    AcceptedGeneration,
    EmbeddingTargetType,
    EvidenceExtractionOutput,
    GenerationSourceBook,
    GenerationValidationOutcome,
    InvalidGenerationOutput,
    ProviderRequestError,
    SourceSpanChunkLimitError,
    SummaryDraft,
    ValidationStatus,
    accepted_evidence_from_output,
    accepted_summary_from_output,
    build_chunks,
    canonical_hash,
    source_chunk_payload,
    summary_input_hash,
    validation_outcome,
)
from bookwise_data.domain.source import PermanentProcessingError


class GeneratedSummaryRepository(Protocol):
    """Port for reading immutable sources and writing generated data."""

    def transaction(self) -> object:
        """Open a database transaction."""

    def set_owner_context(self, transaction: Connection, owner_id: object) -> None:
        """Scope data-schema operations to the claimed owner."""

    def load_source(
        self,
        transaction: Connection,
        command: ClaimedCommand,
    ) -> GenerationSourceBook | None:
        """Load exactly one source selected by the claimed command."""

    def append_validation_outcome(
        self,
        transaction: Connection,
        outcome: GenerationValidationOutcome,
    ) -> None:
        """Persist a rejected or ambiguous candidate outcome."""

    def persist(
        self,
        transaction: Connection,
        generation: AcceptedGeneration,
    ) -> None:
        """Persist accepted evidence, summary, citations, and embeddings."""


class GenerationProvider(Protocol):
    """Application-facing provider contract."""

    provider_name: str
    generation_model: str
    embedding_model: str
    embedding_dimensions: int

    def generate_evidence(
        self,
        chunk: dict[str, object],
        schema: type[EvidenceExtractionOutput],
    ) -> EvidenceExtractionOutput:
        """Generate structured evidence for one chunk."""

    def generate_summary(
        self,
        evidence: list[dict[str, object]],
        schema: type[SummaryDraft],
    ) -> SummaryDraft:
        """Generate a structured summary from accepted evidence."""

    def embed(self, texts: list[str]) -> object:
        """Generate ordered embeddings."""


@dataclass(frozen=True, slots=True)
class GenerationStageFailure(Exception):
    """A stage error plus immutable validation-outcome provenance."""

    cause: Exception
    stage: str
    source_document_id: UUID | None
    source_node_id: UUID | None
    source_chunk_sequence_number: int | None
    input_hash: str | None
    output_hash: str | None
    provider: str | None
    model: str | None
    validation_status: ValidationStatus = ValidationStatus.REJECTED


class GenerateSummary:
    """Generate source-linked evidence, one accepted summary, and embeddings."""

    def __init__(
        self,
        repository: GeneratedSummaryRepository,
        provider_factory: Callable[[], GenerationProvider],
        maximum_chunk_chars_factory: Callable[[], int],
    ) -> None:
        self._repository = repository
        self._provider_factory = provider_factory
        self._maximum_chunk_chars_factory = maximum_chunk_chars_factory

    def handle(
        self,
        command: ClaimedCommand,
        heartbeat: Callable[[], bool],
    ) -> None:
        """Handle the CommandWorker contract for one regenerate_summary command."""

        if command.command_type != "regenerate_summary":
            raise PermanentProcessingError(
                "unsupported_processing_command",
                "The processing command is not supported by summary generation.",
            )

        self._require_lease(heartbeat)
        try:
            with self._repository.transaction() as transaction:
                self._repository.set_owner_context(transaction, command.owner_id)
                source = self._repository.load_source(transaction, command)
        except Exception as error:
            self._record_failure(
                command,
                GenerationStageFailure(
                    error,
                    "source_selection",
                    None,
                    None,
                    None,
                    None,
                    _output_hash(error),
                    None,
                    None,
                ),
            )
            raise
        if source is None:
            error = PermanentProcessingError(
                "missing_normalized_source",
                "The book has no normalized source available for summary generation.",
            )
            self._record_failure(
                command,
                GenerationStageFailure(
                    error,
                    "source_selection",
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                ),
            )
            raise error

        provider: GenerationProvider | None = None
        try:
            provider = self._provider_factory()
            maximum_chunk_chars = self._maximum_chunk_chars_factory()
        except Exception as error:
            self._record_failure(
                command,
                GenerationStageFailure(
                    error,
                    "provider_configuration",
                    source.document.id,
                    None,
                    None,
                    None,
                    _output_hash(error),
                    None,
                    None,
                ),
            )
            raise

        try:
            generation = self._build_generation(
                command,
                source,
                provider,
                maximum_chunk_chars,
                heartbeat,
            )
            self._require_lease(heartbeat)
            with self._repository.transaction() as transaction:
                self._repository.set_owner_context(transaction, command.owner_id)
                try:
                    self._repository.persist(transaction, generation)
                except Exception as error:
                    raise self._failure(
                        error,
                        "summary_persistence",
                        source.document.id,
                        generation.summary.source_node_id,
                        None,
                        generation.summary.input_hash,
                        provider,
                        output_hash=generation.summary.output_hash,
                    ) from error
        except GenerationStageFailure as failure:
            self._record_failure(command, failure)
            raise failure.cause
        except Exception as error:
            self._record_failure(
                command,
                GenerationStageFailure(
                    error,
                    "generation_handler",
                    source.document.id,
                    None,
                    None,
                    None,
                    _output_hash(error),
                    _provider_name_or_none(provider),
                    _provider_model_or_none(provider),
                ),
            )
            raise

    def _build_generation(
        self,
        command: ClaimedCommand,
        source: GenerationSourceBook,
        provider: GenerationProvider,
        maximum_chunk_chars: int,
        heartbeat: Callable[[], bool],
    ) -> AcceptedGeneration:
        try:
            chunks = build_chunks(source, maximum_chunk_chars)
        except SourceSpanChunkLimitError as error:
            raise self._failure(
                error,
                "chunk_validation",
                source.document.id,
                error.source_node_id,
                error.chunk_sequence_number,
                error.input_hash,
                provider,
            ) from error
        except Exception as error:
            raise self._failure(
                error,
                "chunk_validation",
                source.document.id,
                None,
                None,
                None,
                provider,
            ) from error
        if not chunks:
            error = InvalidGenerationOutput(
                "source_has_no_generation_chunks",
                "The normalized source has no section-bounded text for generation.",
            )
            raise self._failure(
                error,
                "chunk_validation",
                source.document.id,
                None,
                None,
                None,
                provider,
            )

        evidence = []
        for chunk in chunks:
            self._require_lease(heartbeat)
            try:
                evidence_output = provider.generate_evidence(
                    source_chunk_payload(chunk),
                    EvidenceExtractionOutput,
                )
            except Exception as error:
                raise self._failure(
                    error,
                    "evidence_extraction",
                    source.document.id,
                    chunk.source_node_id,
                    chunk.sequence_number,
                    chunk.input_hash,
                    provider,
                ) from error
            if not evidence_output.items:
                error = InvalidGenerationOutput(
                    "empty_chunk_evidence",
                    "The model returned no source-linked evidence for a required chunk.",
                )
                raise self._failure(
                    error,
                    "evidence_extraction",
                    source.document.id,
                    chunk.source_node_id,
                    chunk.sequence_number,
                    chunk.input_hash,
                    provider,
                    ValidationStatus.AMBIGUOUS,
                    canonical_hash(evidence_output.model_dump(mode="json")),
                )
            try:
                evidence.extend(
                    accepted_evidence_from_output(
                        command,
                        source.document.id,
                        chunk,
                        evidence_output,
                        provider.provider_name,
                        provider.generation_model,
                    )
                )
            except Exception as error:
                raise self._failure(
                    error,
                    "evidence_validation",
                    source.document.id,
                    chunk.source_node_id,
                    chunk.sequence_number,
                    chunk.input_hash,
                    provider,
                    output_hash=canonical_hash(evidence_output.model_dump(mode="json")),
                ) from error

        root_node = min(source.nodes, key=lambda node: node.sequence_number)
        summary_hash = summary_input_hash(source.document.id, root_node.id, evidence)
        self._require_lease(heartbeat)
        try:
            summary_output = provider.generate_summary(
                [
                    {
                        "evidence_id": str(item.id),
                        "statement": item.statement,
                        "evidence_type": item.evidence_type.value,
                        "source_span_ids": [
                            citation["source_span_id"]
                            for citation in item.citation_data
                        ],
                    }
                    for item in evidence
                ],
                SummaryDraft,
            )
        except Exception as error:
            raise self._failure(
                error,
                "summary_generation",
                source.document.id,
                root_node.id,
                None,
                summary_hash,
                provider,
            ) from error
        try:
            summary = accepted_summary_from_output(
                command,
                source,
                root_node.id,
                evidence,
                summary_output,
                provider.provider_name,
                provider.generation_model,
            )
        except Exception as error:
            raise self._failure(
                error,
                "summary_validation",
                source.document.id,
                root_node.id,
                None,
                summary_hash,
                provider,
                output_hash=canonical_hash(summary_output.model_dump(mode="json")),
            ) from error

        target_texts = {
            **{
                (EmbeddingTargetType.EVIDENCE, item.id): item.statement
                for item in evidence
            },
            (EmbeddingTargetType.GENERATED_SUMMARY, summary.id): summary.body,
        }
        embedding_input_hash = canonical_hash(
            [
                {
                    "target_type": target_type.value,
                    "target_id": str(target_id),
                    "text": body,
                }
                for (target_type, target_id), body in target_texts.items()
            ]
        )
        self._require_lease(heartbeat)
        try:
            embeddings = BuildEmbeddings(provider).execute(
                command,
                source.document.id,
                target_texts,
            )
        except Exception as error:
            raise self._failure(
                error,
                "embedding_generation",
                source.document.id,
                root_node.id,
                None,
                embedding_input_hash,
                provider,
            ) from error
        return AcceptedGeneration(
            summary=summary,
            evidence=tuple(evidence),
            embeddings=embeddings,
        )

    def _record_failure(
        self,
        command: ClaimedCommand,
        failure: GenerationStageFailure,
    ) -> None:
        """Append an immutable validation outcome before the worker transitions."""

        error = failure.cause
        if isinstance(error, ProviderRequestError):
            return
        reason_code = getattr(error, "code", None)
        if not isinstance(reason_code, str) or not reason_code:
            reason_code = _error_code(error)
        message = getattr(error, "public_message", None)
        if not isinstance(message, str) or not message:
            message = "Generation stage failed."
        with self._repository.transaction() as transaction:
            self._repository.set_owner_context(transaction, command.owner_id)
            self._repository.append_validation_outcome(
                transaction,
                validation_outcome(
                    command,
                    failure.stage,
                    failure.validation_status,
                    reason_code,
                    {"message": message},
                    failure.source_document_id,
                    failure.source_node_id,
                    failure.source_chunk_sequence_number,
                    failure.input_hash,
                    failure.output_hash,
                    failure.provider,
                    failure.model,
                ),
            )

    @staticmethod
    def _failure(
        error: Exception,
        stage: str,
        source_document_id: UUID,
        source_node_id: UUID | None,
        source_chunk_sequence_number: int | None,
        input_hash: str | None,
        provider: GenerationProvider,
        validation_status: ValidationStatus = ValidationStatus.REJECTED,
        output_hash: str | None = None,
    ) -> GenerationStageFailure:
        return GenerationStageFailure(
            error,
            stage,
            source_document_id,
            source_node_id,
            source_chunk_sequence_number,
            input_hash,
            output_hash or _output_hash(error),
            provider.provider_name,
            provider.generation_model,
            validation_status,
        )

    @staticmethod
    def _require_lease(heartbeat: Callable[[], bool]) -> None:
        if not heartbeat():
            raise RuntimeError("The processing lease was lost.")


def _error_code(error: Exception) -> str:
    normalized = "".join(
        character.lower() if character.isalnum() else "_"
        for character in type(error).__name__
    ).strip("_")
    return normalized[:100] or "generation_error"


def _output_hash(error: Exception) -> str | None:
    value = getattr(error, "output_hash", None)
    return value if isinstance(value, str) else None


def _provider_name_or_none(provider: object) -> str | None:
    value = getattr(provider, "provider_name", None)
    return value if isinstance(value, str) else None


def _provider_model_or_none(provider: object) -> str | None:
    value = getattr(provider, "generation_model", None)
    return value if isinstance(value, str) else None
