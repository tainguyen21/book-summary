"""Reuse validated per-chunk evidence across retries of one command."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any, Protocol
from uuid import UUID

from pydantic import ValidationError

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.generation import EvidenceExtractionOutput
from bookwise_data.workers.logging_setup import (
    command_context,
    log_event,
    worker_logger,
)


class EvidenceCheckpointStore(Protocol):
    """Port for the append-only checkpoint table."""

    def load(
        self,
        command: ClaimedCommand,
        source_document_id: UUID,
        provider: str,
        model: str,
        prompt_version: str,
    ) -> dict[str, dict[str, Any]]:
        """Return saved evidence outputs keyed by chunk input hash."""

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
        """Persist one chunk's validated output."""


class EvidenceCheckpoints:
    """Checkpoints for one command's generation run.

    Checkpoint problems never fail generation: a failed load means every chunk
    is extracted again, and a failed save only loses the ability to resume.
    """

    def __init__(
        self,
        store: EvidenceCheckpointStore,
        command: ClaimedCommand,
        source_document_id: UUID,
        provider: str,
        model: str,
        prompt_version: str,
    ) -> None:
        self._store = store
        self._command = command
        self._key = (source_document_id, provider, model, prompt_version)
        self._logger = worker_logger()
        self._saved = self._load()
        self.reused = 0

    def get(self, chunk_input_hash: str) -> EvidenceExtractionOutput | None:
        """Return a saved, still-valid output for the chunk, if any."""

        saved = self._saved.get(chunk_input_hash)
        if saved is None:
            return None
        try:
            output = EvidenceExtractionOutput.model_validate(saved)
        except ValidationError:
            return None
        self.reused += 1
        return output

    def save(self, chunk_input_hash: str, output: EvidenceExtractionOutput) -> None:
        """Save a chunk's output after it passed evidence validation."""

        source_document_id, provider, model, prompt_version = self._key
        try:
            self._store.save(
                self._command,
                source_document_id,
                chunk_input_hash,
                provider,
                model,
                prompt_version,
                output.model_dump(mode="json"),
            )
        except Exception as error:  # noqa: BLE001
            self._log_failure("save", error)

    def log_resumed(self, chunk_count: int) -> None:
        """Record how many chunks were reused, when any were."""

        if self.reused:
            log_event(
                self._logger,
                logging.INFO,
                "evidence_resumed",
                "Reused saved evidence for finished chunks.",
                chunks_reused=self.reused,
                chunk_count=chunk_count,
                **command_context(self._command),
            )

    def _load(self) -> dict[str, dict[str, Any]]:
        source_document_id, provider, model, prompt_version = self._key
        try:
            return self._store.load(
                self._command,
                source_document_id,
                provider,
                model,
                prompt_version,
            )
        except Exception as error:  # noqa: BLE001
            self._log_failure("load", error)
            return {}

    def _log_failure(self, operation: str, error: Exception) -> None:
        log_event(
            self._logger,
            logging.WARNING,
            "evidence_checkpoint_failed",
            f"Evidence checkpoint {operation} failed; continuing without it.",
            error_class=type(error).__name__,
            **command_context(self._command),
        )
