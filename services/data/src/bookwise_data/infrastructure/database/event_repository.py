"""PostgreSQL repository for Python-owned processing events."""

from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.engine import Connection

from bookwise_data.domain.commands import ProcessingEvent

_INSERT_EVENT = text(
    """
    INSERT INTO data.processing_events (
        owner_id,
        book_id,
        command_id,
        event_type,
        payload,
        processing_version,
        created_at
    )
    VALUES (
        :owner_id,
        :book_id,
        :command_id,
        :event_type,
        CAST(:payload AS jsonb),
        :processing_version,
        clock_timestamp()
    )
    """
)


class SqlAlchemyEventRepository:
    """Append events with the command repository's active transaction."""

    def append(self, transaction: Connection, event: ProcessingEvent) -> None:
        transaction.execute(
            _INSERT_EVENT,
            {
                "owner_id": event.owner_id,
                "book_id": event.book_id,
                "command_id": event.command_id,
                "event_type": event.event_type.value,
                "payload": json.dumps(event.payload),
                "processing_version": event.processing_version,
            },
        )
