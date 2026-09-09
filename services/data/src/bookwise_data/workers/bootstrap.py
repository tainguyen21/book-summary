"""Runtime composition for the private Python processing worker."""

from __future__ import annotations

import os

from sqlalchemy import create_engine

from bookwise_data.application.claim_command import ClaimCommand
from bookwise_data.application.emit_event import EmitEvent
from bookwise_data.application.generate_summary import GenerateSummary
from bookwise_data.application.ingest_book import IngestBook
from bookwise_data.domain.generation import DEFAULT_GENERATION_CHUNK_CHARS
from bookwise_data.infrastructure.database.command_repository import (
    SqlAlchemyCommandRepository,
)
from bookwise_data.infrastructure.database.event_repository import (
    SqlAlchemyEventRepository,
)
from bookwise_data.infrastructure.database.generated_summary_repository import (
    SqlAlchemyGeneratedSummaryRepository,
)
from bookwise_data.infrastructure.database.source_repository import (
    SqlAlchemySourceRepository,
)
from bookwise_data.infrastructure.providers.model_provider import (
    generation_chunk_chars_from_environment,
    provider_from_environment,
)
from bookwise_data.infrastructure.storage.object_storage import (
    S3ObjectStorage,
    S3ObjectStorageConfig,
)
from bookwise_data.workers.command_worker import CommandWorker


def run_worker() -> None:
    """Compose and run one bounded batch of private processing commands."""

    engine = create_engine(_required_environment("DATA_DATABASE_URL"))
    try:
        commands = SqlAlchemyCommandRepository(engine)
        ingest_book = IngestBook(
            SqlAlchemySourceRepository(engine),
            S3ObjectStorage(
                S3ObjectStorageConfig(
                    endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
                    region=_required_environment("S3_REGION"),
                    access_key_id=_required_environment("S3_ACCESS_KEY_ID"),
                    secret_access_key=_required_environment("S3_SECRET_ACCESS_KEY"),
                    bucket=_required_environment("S3_BUCKET"),
                )
            ),
        )
        generate_summary = GenerateSummary(
            SqlAlchemyGeneratedSummaryRepository(engine),
            provider_from_environment,
            lambda: generation_chunk_chars_from_environment(
                DEFAULT_GENERATION_CHUNK_CHARS
            ),
        )
        worker = CommandWorker(
            ClaimCommand(commands, EmitEvent(SqlAlchemyEventRepository())),
            lambda command, heartbeat: (
                generate_summary.handle(command, heartbeat)
                if command.command_type == "regenerate_summary"
                else ingest_book.handle(command, heartbeat)
            ),
        )
        worker.run_once(_positive_integer_environment("PROCESSING_BATCH_LIMIT", 1))
    finally:
        engine.dispose()


def _required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be configured.")
    return value


def _positive_integer_environment(name: str, default: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None:
        return default

    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a positive integer.") from error

    if value <= 0:
        raise RuntimeError(f"{name} must be a positive integer.")
    return value
