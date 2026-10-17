"""Structured JSON logging for the private processing worker.

Each record is one JSON object per line on stdout, which Cloud Logging on GKE
parses natively (``severity`` maps to the log level). Only an allow-listed set
of identifiers may be attached as context, so book content, filenames, object
keys, tokens, and raw exception messages can never reach the logs.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from bookwise_data.domain.commands import ClaimedCommand

LOGGER_NAME = "bookwise.worker"

_ALLOWED_CONTEXT_KEYS = frozenset(
    {
        "command_id",
        "book_id",
        "run_id",
        "command_type",
        "processing_version",
        "outcome",
        "error_class",
        "error_code",
        "duration_ms",
        "batch_size",
        "batch_limit",
        "poll_interval_seconds",
        "model_provider",
        "generation_model",
        "signal",
        "chunks_reused",
        "chunk_count",
        "spent_usd",
        "cap_usd",
        "budget_timezone",
        "retry",
    }
)


class JsonFormatter(logging.Formatter):
    """Render a log record as a single JSON line with allow-listed context."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "event": getattr(record, "event", record.getMessage()),
            "message": record.getMessage(),
        }
        context = getattr(record, "context", None)
        if isinstance(context, Mapping):
            entry.update(
                (key, value)
                for key, value in context.items()
                if key in _ALLOWED_CONTEXT_KEYS and value is not None
            )
        return json.dumps(entry, default=str)


def configure_logging() -> logging.Logger:
    """Send worker logs to stdout as JSON at ``BOOKWISE_LOG_LEVEL`` (default INFO)."""

    level_name = os.environ.get("BOOKWISE_LOG_LEVEL", "INFO").strip().upper() or "INFO"
    level = logging.getLevelName(level_name)
    if not isinstance(level, int):
        level = logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger(LOGGER_NAME)
    logger.handlers[:] = [handler]
    logger.setLevel(level)
    logger.propagate = False
    return logger


def worker_logger() -> logging.Logger:
    """Return the shared worker logger (unconfigured loggers stay silent)."""

    return logging.getLogger(LOGGER_NAME)


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    message: str,
    **context: Any,
) -> None:
    """Log a named event with allow-listed context fields."""

    logger.log(level, message, extra={"event": event, "context": context})


def command_context(command: ClaimedCommand) -> dict[str, Any]:
    """Identifiers that correlate a log line with durable command state."""

    return {
        "command_id": command.id,
        "book_id": command.book_id,
        "run_id": command.run_id,
        "command_type": command.command_type,
        "processing_version": command.processing_version,
    }
