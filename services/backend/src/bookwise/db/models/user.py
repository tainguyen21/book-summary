from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from bookwise.db.base import Base, TimestampedModel

if TYPE_CHECKING:
    from bookwise.db.models.book import Book, BookObject
    from bookwise.db.models.job import ProcessingJob


class User(TimestampedModel, Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    oidc_subject: Mapped[str | None] = mapped_column(String(length=255), unique=True)
    email: Mapped[str] = mapped_column(String(length=320), unique=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    books: Mapped[list["Book"]] = relationship(back_populates="owner")
    objects: Mapped[list["BookObject"]] = relationship(back_populates="owner")
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="owner")


class Invitation(TimestampedModel, Base):
    __tablename__ = "invitations"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(length=320), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_subject: Mapped[str | None] = mapped_column(String(length=255))
