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


def parse_pdf(source_content: bytes) -> ParsedSource:
    """Extract one ordered source section for each non-empty PDF page."""

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
            ParsedSection(
                node_type="page",
                title=f"Page {page_number}",
                text=text,
                location={"page_number": page_number},
            )
            for page_number, page in enumerate(document, start=1)
            if (text := page.get_text("text").strip())
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
