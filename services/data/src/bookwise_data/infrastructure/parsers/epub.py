"""EPUB parser adapter."""

from __future__ import annotations

from io import BytesIO

from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, epub

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
    MAX_EPUB_SPINE_DOCUMENTS,
    validate_archive_limits,
)


def parse_epub(source_content: bytes) -> ParsedSource:
    """Extract readable spine documents in the publisher-defined order."""

    try:
        validate_archive_limits(source_content, "epub")
        book = epub.read_epub(BytesIO(source_content))
        documents = _spine_documents(book)
        if len(documents) > MAX_EPUB_SPINE_DOCUMENTS:
            raise SourceLimitError(
                "epub_spine_document_limit",
                "The EPUB document exceeds the supported spine limit.",
            )
        sections = tuple(
            ParsedSection(
                node_type="chapter",
                title=_title_for(item, index),
                text=text,
                location={
                    "spine_index": index,
                    "href": item.get_name(),
                },
            )
            for index, item in enumerate(documents, start=1)
            if (text := _text_for(item))
        )
    except PermanentProcessingError:
        raise
    except Exception as error:
        raise InvalidSourceError(
            "invalid_epub_document",
            "The EPUB document could not be parsed.",
        ) from error

    if not sections:
        raise EmptySourceError(
            "empty_epub_document",
            "The EPUB document contains no readable text.",
        )

    return ParsedSource(source_format=SourceFormat.EPUB, sections=sections)


def _spine_documents(book: epub.EpubBook) -> tuple[epub.EpubItem, ...]:
    documents: list[epub.EpubItem] = []
    for spine_item in book.spine:
        item_id = spine_item[0] if isinstance(spine_item, tuple) else spine_item
        item = book.get_item_with_id(item_id)
        if item is not None and item.get_type() == ITEM_DOCUMENT:
            documents.append(item)
    return tuple(documents)


def _text_for(item: epub.EpubItem) -> str:
    soup = BeautifulSoup(item.get_content(), "lxml")
    return soup.get_text("\n", strip=True)


def _title_for(item: epub.EpubItem, index: int) -> str:
    soup = BeautifulSoup(item.get_content(), "lxml")
    heading = soup.find(["h1", "h2", "h3"])
    return (
        heading.get_text(" ", strip=True)
        if heading
        else item.get_name() or f"Chapter {index}"
    )
