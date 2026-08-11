from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from bookwise.db.base import Base, TimestampedModel

if TYPE_CHECKING:
    from bookwise.db.models.user import User


class BookStatus(StrEnum):
    PENDING_UPLOAD = "pending_upload"
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class BookObjectState(StrEnum):
    PENDING = "pending"
    UPLOADED = "uploaded"
    DELETED = "deleted"


class Book(TimestampedModel, Base):
    __tablename__ = "books"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(length=500))
    filename: Mapped[str] = mapped_column(String(length=500))
    status: Mapped[BookStatus] = mapped_column(
        Enum(BookStatus, name="book_status"),
        default=BookStatus.PENDING_UPLOAD,
    )

    owner: Mapped["User"] = relationship(back_populates="books")
    objects: Mapped[list["BookObject"]] = relationship(back_populates="book")


class BookObject(TimestampedModel, Base):
    __tablename__ = "book_objects"
    __table_args__ = (
        UniqueConstraint("book_id", "object_type", name="uq_book_object_type"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    book_id: Mapped[UUID] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        index=True,
    )
    object_type: Mapped[str] = mapped_column(String(length=50))
    object_key: Mapped[str] = mapped_column(String(length=1024), unique=True)
    content_type: Mapped[str] = mapped_column(String(length=255))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    etag: Mapped[str | None] = mapped_column(String(length=255))
    sha256: Mapped[str | None] = mapped_column(String(length=64))
    state: Mapped[BookObjectState] = mapped_column(
        Enum(BookObjectState, name="book_object_state"),
        default=BookObjectState.PENDING,
    )

    owner: Mapped["User"] = relationship(back_populates="objects")
    book: Mapped[Book] = relationship(back_populates="objects")
