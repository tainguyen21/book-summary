"""Paragraph-sized citable spans shared by every parser."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from bookwise_data.domain.source import ParsedSpan

# Keeps every span well inside one generation chunk (12,000 chars by default),
# because chunks group whole spans and never split one.
MAX_SPAN_CHARS = 4_000


def split_long_text(text: str) -> list[str]:
    """Split text longer than ``MAX_SPAN_CHARS`` at whitespace."""

    parts: list[str] = []
    while len(text) > MAX_SPAN_CHARS:
        cut = text.rfind(" ", 0, MAX_SPAN_CHARS)
        if cut <= 0:
            cut = MAX_SPAN_CHARS
        parts.append(text[:cut].rstrip())
        text = text[cut:].lstrip()
    if text:
        parts.append(text)
    return parts


def bounded_spans(text: str, location: Mapping[str, Any]) -> list[ParsedSpan]:
    """One span per paragraph; oversized paragraphs get numbered parts."""

    pieces = split_long_text(" ".join(text.split()))
    if len(pieces) == 1:
        return [ParsedSpan(text=pieces[0], location=dict(location))]
    return [
        ParsedSpan(text=piece, location={**location, "part": index})
        for index, piece in enumerate(pieces, start=1)
    ]
