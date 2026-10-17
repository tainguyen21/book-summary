"""Selectable-text PDF parser adapter."""

from __future__ import annotations

import pymupdf

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
    MAX_PDF_PAGES,
    validate_source_size,
)
from bookwise_data.infrastructure.parsers.spans import bounded_spans


def parse_pdf(source_content: bytes) -> ParsedSource:
    """Extract one section per non-empty page, with one span per text block."""

    try:
        validate_source_size(source_content, "pdf")
        document = pymupdf.open(stream=source_content, filetype="pdf")
    except PermanentProcessingError:
        raise
    except Exception as error:
        raise InvalidSourceError(
            "invalid_pdf_document",
            "The PDF document could not be parsed.",
        ) from error

    try:
        if document.needs_pass:
            raise InvalidSourceError(
                "encrypted_pdf_document",
                "Password-protected PDF documents are not supported.",
            )
        if document.page_count > MAX_PDF_PAGES:
            raise SourceLimitError(
                "pdf_page_limit",
                "The PDF document exceeds the supported page limit.",
            )

        sections = tuple(
            _page_section(page_number, paragraphs)
            for page_number, page in enumerate(document, start=1)
            if (paragraphs := _page_paragraphs(page))
        )
    except PermanentProcessingError:
        raise
    except Exception as error:
        raise InvalidSourceError(
            "invalid_pdf_document",
            "The PDF document could not be parsed.",
        ) from error
    finally:
        document.close()

    if not sections:
        raise EmptySourceError(
            "empty_pdf_document",
            "The PDF document contains no selectable text.",
        )

    return ParsedSource(source_format=SourceFormat.PDF, sections=sections)


def _page_paragraphs(page: pymupdf.Page) -> list[str]:
    """Text blocks in reading order, with line wraps joined."""

    return [
        text
        for block in page.get_text("blocks")
        # Block type 0 is text; 1 is an image.
        if block[6] == 0 and (text := " ".join(str(block[4]).split()))
    ]


def _page_section(page_number: int, paragraphs: list[str]) -> ParsedSection:
    location = {"page_number": page_number}
    return ParsedSection(
        node_type="page",
        title=f"Page {page_number}",
        text="\n\n".join(paragraphs),
        location=location,
        spans=tuple(
            span
            for number, paragraph in enumerate(paragraphs, start=1)
            for span in bounded_spans(
                paragraph, {**location, "paragraph_number": number}
            )
        ),
    )
