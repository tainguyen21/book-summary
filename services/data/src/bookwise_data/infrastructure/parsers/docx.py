"""DOCX parser adapter."""

from __future__ import annotations

from io import BytesIO

from docx import Document

from bookwise_data.domain.source import (
    EmptySourceError,
    InvalidSourceError,
    ParsedSection,
    ParsedSource,
    PermanentProcessingError,
    SourceFormat,
    SourceLimitError,
)
from bookwise_data.infrastructure.parsers.limits import (
    MAX_DOCX_PARAGRAPHS,
    validate_archive_limits,
)


def parse_docx(source_content: bytes) -> ParsedSource:
    """Extract document paragraphs in their original order."""

    try:
        validate_archive_limits(source_content, "docx")
        document = Document(BytesIO(source_content))
    except PermanentProcessingError:
        raise
    except Exception as error:
        raise InvalidSourceError(
            "invalid_docx_document",
            "The DOCX document could not be parsed.",
        ) from error

    if len(document.paragraphs) > MAX_DOCX_PARAGRAPHS:
        raise SourceLimitError(
            "docx_paragraph_limit",
            "The DOCX document exceeds the supported paragraph limit.",
        )

    sections = tuple(
        ParsedSection(
            node_type=_node_type(paragraph.style.name),
            title=text if _node_type(paragraph.style.name) == "heading" else None,
            text=text,
            location={
                "paragraph_number": index,
                "style": paragraph.style.name,
            },
        )
        for index, paragraph in enumerate(document.paragraphs, start=1)
        if (text := paragraph.text.strip())
    )

    if not sections:
        raise EmptySourceError(
            "empty_docx_document",
            "The DOCX document contains no readable text.",
        )

    return ParsedSource(source_format=SourceFormat.DOCX, sections=sections)


def _node_type(style_name: str) -> str:
    return "heading" if style_name.lower().startswith("heading") else "paragraph"
