"""UTF-8 plain-text parser adapter."""

from __future__ import annotations

from bookwise_data.domain.source import (
    EmptySourceError,
    InvalidSourceError,
    ParsedSection,
    ParsedSource,
    ParsedSpan,
    SourceFormat,
)
from bookwise_data.infrastructure.parsers.limits import validate_source_size
from bookwise_data.infrastructure.parsers.spans import (
    MAX_SPAN_CHARS,
    split_long_text,
)


def parse_text(source_content: bytes) -> ParsedSource:
    """Parse UTF-8 text as one section with one citable span per paragraph."""

    validate_source_size(source_content, "text")

    try:
        text = source_content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise InvalidSourceError(
            "invalid_text_encoding",
            "The text document must be UTF-8 encoded.",
        ) from error

    spans = tuple(_paragraph_spans(text.splitlines()))
    if not spans:
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
                text="\n\n".join(span.text for span in spans),
                location={"line_start": 1},
                spans=spans,
            ),
        ),
    )


def _paragraph_spans(lines: list[str]) -> list[ParsedSpan]:
    """Group blank-line-separated paragraphs, splitting oversized ones."""

    spans: list[ParsedSpan] = []
    paragraph: list[tuple[int, str]] = []
    paragraph_number = 0
    for line_number, line in enumerate([*lines, ""], start=1):
        if line.strip():
            paragraph.append((line_number, line.strip()))
            continue
        if paragraph:
            paragraph_number += 1
            spans.extend(_bounded_spans(paragraph, paragraph_number))
            paragraph = []
    return spans


def _bounded_spans(
    paragraph: list[tuple[int, str]],
    paragraph_number: int,
) -> list[ParsedSpan]:
    """Split a paragraph at line breaks, then whitespace, to bound span size."""

    pieces: list[tuple[int, int, str]] = []
    for line_number, line in paragraph:
        for part in split_long_text(line):
            if pieces and len(pieces[-1][2]) + 1 + len(part) <= MAX_SPAN_CHARS:
                start, _, joined = pieces[-1]
                pieces[-1] = (start, line_number, f"{joined} {part}")
            else:
                pieces.append((line_number, line_number, part))
    return [
        ParsedSpan(
            text=content,
            location={
                "paragraph_number": paragraph_number,
                "line_start": line_start,
                "line_end": line_end,
                # Only oversized paragraphs are split; their pieces are numbered.
                **({"part": index} if len(pieces) > 1 else {}),
            },
        )
        for index, (line_start, line_end, content) in enumerate(pieces, start=1)
    ]
