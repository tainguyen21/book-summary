"""Read token counts from provider responses and report them to a usage sink.

Field names differ between SDK versions and providers, so every count is read
defensively: a missing or non-integer count becomes 0 and is warned about once
per provider and model, rather than failing an already-paid request.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from bookwise_data.domain.usage import ModelUsage, UsageOperation, UsageSink
from bookwise_data.workers.logging_setup import log_event, worker_logger

_warned_missing_usage: set[tuple[str, str]] = set()


def emit_usage(
    sink: UsageSink | None,
    operation: UsageOperation,
    provider: str,
    model: str,
    counts: tuple[int | None, int | None],
) -> None:
    """Send one call's token counts to the sink, if one is attached."""

    if sink is None:
        return
    input_tokens, output_tokens = counts
    if input_tokens is None or output_tokens is None:
        _warn_missing_usage(provider, model)
    sink(
        ModelUsage(
            operation=operation,
            provider=provider,
            model=model,
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
        )
    )


def vertex_generation_counts(response: Any) -> tuple[int | None, int | None]:
    """Input and output tokens of a Vertex ``generate_content`` response.

    Thinking tokens are billed as output on Gemini, so they count as output.
    """

    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return None, None
    candidates = _count(getattr(metadata, "candidates_token_count", None))
    thoughts = _count(getattr(metadata, "thoughts_token_count", None)) or 0
    output = None if candidates is None else candidates + thoughts
    return _count(getattr(metadata, "prompt_token_count", None)), output


def vertex_embedding_counts(response: Any) -> tuple[int | None, int | None]:
    """Input tokens of a Vertex ``embed_content`` response (no output tokens)."""

    total = 0
    for embedding in getattr(response, "embeddings", None) or ():
        statistics = getattr(embedding, "statistics", None)
        count = _count(getattr(statistics, "token_count", None))
        if count is None:
            return None, 0
        total += count
    return total, 0


def openai_counts(
    response: Mapping[str, Any],
    *,
    embedding: bool,
) -> tuple[int | None, int | None]:
    """Input and output tokens from an OpenAI-compatible ``usage`` object."""

    usage = response.get("usage")
    if not isinstance(usage, Mapping):
        return None, (0 if embedding else None)
    input_tokens = _count(usage.get("prompt_tokens"))
    if embedding:
        return input_tokens, 0
    return input_tokens, _count(usage.get("completion_tokens"))


def _count(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, int) and value >= 0:
        return value
    return None


def _warn_missing_usage(provider: str, model: str) -> None:
    key = (provider, model)
    if key in _warned_missing_usage:
        return
    _warned_missing_usage.add(key)
    log_event(
        worker_logger(),
        logging.WARNING,
        "usage_metadata_missing",
        "Provider response had no token counts; recording 0.",
        model_provider=provider,
        generation_model=model,
    )
