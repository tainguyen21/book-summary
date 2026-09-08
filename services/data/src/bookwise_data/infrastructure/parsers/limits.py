"""Shared safety limits for untrusted book-parser input."""

from __future__ import annotations

from io import BytesIO
from zipfile import BadZipFile, ZipFile

from bookwise_data.domain.source import (
    MAX_SOURCE_BYTES,
    InvalidSourceError,
    SourceLimitError,
)

MAX_ARCHIVE_MEMBERS = 10_000
MAX_PDF_PAGES = 10_000
MAX_EPUB_SPINE_DOCUMENTS = 10_000
MAX_DOCX_PARAGRAPHS = 50_000


def validate_archive_limits(source_content: bytes, format_name: str) -> None:
    """Reject ZIP-based documents that exceed bounded expansion limits."""

    validate_source_size(source_content, format_name)

    try:
        with ZipFile(BytesIO(source_content)) as archive:
            members = archive.infolist()
    except BadZipFile as error:
        raise InvalidSourceError(
            f"invalid_{format_name}_document",
            f"The {format_name.upper()} document could not be parsed.",
        ) from error

    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise SourceLimitError(
            f"{format_name}_archive_member_limit",
            f"The {format_name.upper()} document exceeds the supported archive limit.",
        )

    expanded_size = sum(member.file_size for member in members)
    if expanded_size > MAX_SOURCE_BYTES:
        raise SourceLimitError(
            f"{format_name}_archive_expansion_limit",
            f"The {format_name.upper()} document exceeds the supported expansion limit.",
        )


def validate_source_size(source_content: bytes, format_name: str) -> None:
    """Reject parser input that exceeds the product's upload-size boundary."""

    if len(source_content) > MAX_SOURCE_BYTES:
        raise SourceLimitError(
            f"{format_name}_source_size_limit",
            f"The {format_name.upper()} document exceeds the supported size limit.",
        )
