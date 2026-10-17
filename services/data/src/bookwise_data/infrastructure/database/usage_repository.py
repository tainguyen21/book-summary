"""PostgreSQL repository for the append-only model usage ledger."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.engine import Engine

from bookwise_data.domain.usage import ModelUsage

_SET_OWNER_CONTEXT = text("SELECT set_config('bookwise.owner_id', :owner_id, true)")

_INSERT_USAGE = text(
    """
    INSERT INTO data.model_usage (
        owner_id,
        book_id,
        command_id,
        operation,
        provider,
        model,
        input_tokens,
        output_tokens,
        estimated_cost_usd
    )
    VALUES (
        :owner_id,
        :book_id,
        :command_id,
        :operation,
        :provider,
        :model,
        :input_tokens,
        :output_tokens,
        :estimated_cost_usd
    )
    """
)


class SqlAlchemyUsageRepository:
    """Insert usage rows, each in its own short owner-scoped transaction.

    A separate transaction per row keeps spend recorded even when the
    surrounding generation later fails and nothing else is persisted.
    """

    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def record(
        self,
        owner_id: UUID,
        book_id: UUID,
        command_id: UUID,
        usage: ModelUsage,
        estimated_cost_usd: Decimal,
    ) -> None:
        with self._engine.begin() as transaction:
            transaction.execute(_SET_OWNER_CONTEXT, {"owner_id": str(owner_id)})
            transaction.execute(
                _INSERT_USAGE,
                {
                    "owner_id": owner_id,
                    "book_id": book_id,
                    "command_id": command_id,
                    "operation": usage.operation.value,
                    "provider": usage.provider,
                    "model": usage.model,
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "estimated_cost_usd": estimated_cost_usd,
                },
            )
