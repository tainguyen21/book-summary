"""UTF-8 plain-text parser adapter."""

from __future__ import annotations

from bookwise_data.domain.source import (
    EmptySourceError,
    InvalidSourceError,
    ParsedSection,
    ParsedSource,
    SourceFormat,
)
from bookwise_data.infrastructure.parsers.limits import validate_source_size


def parse_text(source_content: bytes) -> ParsedSource:
    """Parse a UTF-8 text source as one stable document section."""

    validate_source_size(source_content, "text")

    try:
        text = source_content.decode("utf-8-sig").strip()
    except UnicodeDecodeError as error:
        raise InvalidSourceError(
            "invalid_text_encoding",
            "The text document must be UTF-8 encoded.",
        ) from error

    if not text:
        raise EmptySourceError(
            "empty_text_document",
            "The text document contains no readable text.",
        )

    return ParsedSource(
        source_format=SourceFormat.TXT,
        sections=(
            ParsedSection(
                node_type="text",
                title=None,
                text=text,
                location={"line_start": 1},
            ),
        ),
    )
