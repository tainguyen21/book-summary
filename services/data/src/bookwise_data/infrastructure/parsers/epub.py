"""EPUB parser adapter."""

from __future__ import annotations

import warnings
from io import BytesIO

from bs4 import BeautifulSoup, NavigableString, XMLParsedAsHTMLWarning
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
from bookwise_data.infrastructure.parsers.spans import bounded_spans

# Elements that start a new paragraph; inline markup (em, a, span) does not.
_BLOCK_TAGS = frozenset(
    {
        "address",
        "article",
        "aside",
        "blockquote",
        "body",
        "dd",
        "div",
        "dl",
        "dt",
        "figcaption",
        "figure",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "li",
        "main",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "td",
        "th",
        "tr",
        "ul",
    }
)
_SKIPPED_TAGS = frozenset({"head", "script", "style", "title"})

# EPUB chapters are XHTML parsed with the HTML parser on purpose; the warning
# about it would print plain text into the worker's JSON-only log stream.
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


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
            _chapter_section(item, index, paragraphs)
            for index, item in enumerate(documents, start=1)
            if (paragraphs := _paragraphs_for(item))
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


def _chapter_section(
    item: epub.EpubItem,
    index: int,
    paragraphs: list[str],
) -> ParsedSection:
    """One chapter node whose spans are its paragraphs."""

    location = {"spine_index": index, "href": item.get_name()}
    return ParsedSection(
        node_type="chapter",
        title=_title_for(item, index),
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


def _paragraphs_for(item: epub.EpubItem) -> list[str]:
    """Group text by its nearest block element, keeping inline markup together."""

    soup = BeautifulSoup(item.get_content(), "lxml")
    paragraphs: list[str] = []
    current: list[str] = []
    current_block: object = None
    for string in soup.find_all(string=True):
        if not isinstance(string, NavigableString) or not string.strip():
            continue
        if any(parent.name in _SKIPPED_TAGS for parent in string.parents):
            continue
        block = next(
            (parent for parent in string.parents if parent.name in _BLOCK_TAGS),
            None,
        )
        if block is not current_block and current:
            paragraphs.append(" ".join(" ".join(current).split()))
            current = []
        current_block = block
        current.append(str(string))
    if current:
        paragraphs.append(" ".join(" ".join(current).split()))
    return [paragraph for paragraph in paragraphs if paragraph]


def _title_for(item: epub.EpubItem, index: int) -> str:
    soup = BeautifulSoup(item.get_content(), "lxml")
    heading = soup.find(["h1", "h2", "h3"])
    return (
        heading.get_text(" ", strip=True)
        if heading
        else item.get_name() or f"Chapter {index}"
    )
