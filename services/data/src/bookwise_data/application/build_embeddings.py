"""Build versioned embeddings for accepted generated records."""

from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.generation import (
    EmbeddingRecord,
    EmbeddingTargetType,
    ProviderEmbedding,
    embedding_records,
)


class BuildEmbeddings:
    """Use a provider port to create validated embedding records."""

    def __init__(self, provider: object) -> None:
        self._provider = provider

    def execute(
        self,
        command: ClaimedCommand,
        source_document_id: UUID,
        target_texts: Mapping[tuple[EmbeddingTargetType, UUID], str],
    ) -> tuple[EmbeddingRecord, ...]:
        """Return embeddings after checking provider-declared dimensions."""

        vectors: list[ProviderEmbedding] = self._provider.embed(
            list(target_texts.values())
        )
        return embedding_records(
            command,
            source_document_id,
            target_texts,
            vectors,
            self._provider.provider_name,
            self._provider.embedding_model,
            self._provider.embedding_dimensions,
        )
