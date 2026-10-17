"""Turn provider usage reports into priced ledger rows for one command."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from decimal import Decimal
from typing import Protocol
from uuid import UUID

from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.usage import ModelPrice, ModelUsage, UsageSink, estimate_cost
from bookwise_data.workers.logging_setup import (
    command_context,
    log_event,
    worker_logger,
)


class UsageRepository(Protocol):
    """Port for the append-only usage ledger."""

    def record(
        self,
        owner_id: UUID,
        book_id: UUID,
        command_id: UUID,
        usage: ModelUsage,
        estimated_cost_usd: Decimal,
    ) -> None:
        """Persist one usage row in its own transaction."""


class RecordModelUsage:
    """Price usage with configured model prices and record it per command."""

    def __init__(
        self,
        repository: UsageRepository,
        pricing: Mapping[str, ModelPrice],
    ) -> None:
        self._repository = repository
        self._pricing = dict(pricing)
        self._warned_unpriced_models: set[str] = set()
        self._logger = worker_logger()

    def sink_for(self, command: ClaimedCommand) -> UsageSink:
        """Return a provider usage sink bound to one claimed command."""

        def sink(usage: ModelUsage) -> None:
            self._record(command, usage)

        return sink

    def _record(self, command: ClaimedCommand, usage: ModelUsage) -> None:
        cost = estimate_cost(usage, self._pricing)
        if cost is None:
            self._warn_unpriced(usage)
            cost = Decimal(0)
        try:
            self._repository.record(
                command.owner_id,
                command.book_id,
                command.id,
                usage,
                cost,
            )
        except Exception as error:  # noqa: BLE001
            # The provider call is already paid for; losing one ledger row must
            # not fail the generation, but it has to be visible in the logs.
            log_event(
                self._logger,
                logging.ERROR,
                "usage_record_failed",
                "Model usage could not be recorded.",
                error_class=type(error).__name__,
                **command_context(command),
            )

    def _warn_unpriced(self, usage: ModelUsage) -> None:
        if usage.model in self._warned_unpriced_models:
            return
        self._warned_unpriced_models.add(usage.model)
        log_event(
            self._logger,
            logging.WARNING,
            "pricing_missing",
            "Model has no configured price; recording cost 0.",
            model_provider=usage.provider,
            generation_model=usage.model,
        )
