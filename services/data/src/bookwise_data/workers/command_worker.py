"""Private worker that claims commands and records their outcomes."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

from bookwise_data.application.claim_command import ClaimCommand, error_code
from bookwise_data.application.daily_budget import DailyBudget, DailyBudgetExceeded
from bookwise_data.domain.commands import ClaimedCommand
from bookwise_data.domain.source import PermanentProcessingError
from bookwise_data.workers.logging_setup import (
    command_context,
    log_event,
    worker_logger,
)

CommandHandler = Callable[[ClaimedCommand, Callable[[], bool]], None]


class CommandWorker:
    """Run an injected command handler against a durable command batch."""

    def __init__(
        self,
        claim_command: ClaimCommand,
        handler: CommandHandler,
        daily_budget: DailyBudget | None = None,
    ) -> None:
        self._claim_command = claim_command
        self._handler = handler
        self._daily_budget = daily_budget
        self._generation_held = False
        self._logger = worker_logger()

    def run_once(self, limit: int) -> int:
        """Claim and handle one bounded batch of commands."""

        commands = self._claim_command.execute(limit, self._allow_generation())
        if not commands:
            log_event(
                self._logger, logging.DEBUG, "batch_idle", "No commands to claim."
            )

        for command in commands:
            context = command_context(command)
            log_event(
                self._logger,
                logging.INFO,
                "command_claimed",
                "Command claimed.",
                **context,
            )

            if not self._claim_command.heartbeat(command):
                log_event(
                    self._logger,
                    logging.WARNING,
                    "lease_lost",
                    "Lease lost before handling; skipping command.",
                    **context,
                )
                continue

            started = time.monotonic()
            try:
                self._handler(
                    command,
                    lambda command=command: self._claim_command.heartbeat(command),
                )
            except DailyBudgetExceeded as error:
                self._claim_command.fail_retryably(command, error)
                log_event(
                    self._logger,
                    logging.WARNING,
                    "budget_paused",
                    "Daily model budget reached; generation paused until tomorrow.",
                    spent_usd=str(error.spent_usd),
                    cap_usd=str(error.cap_usd),
                    duration_ms=_elapsed_ms(started),
                    **context,
                )
            except PermanentProcessingError as error:
                self._claim_command.fail_permanently(command, error)
                self._log_failure(command, error, "permanent", started)
            except Exception as error:  # noqa: BLE001
                self._claim_command.fail_retryably(command, error)
                self._log_failure(command, error, "retryable", started)
            else:
                self._claim_command.complete(command)
                log_event(
                    self._logger,
                    logging.INFO,
                    "command_completed",
                    "Command completed.",
                    duration_ms=_elapsed_ms(started),
                    **context,
                )

        return len(commands)

    def _allow_generation(self) -> bool:
        """Hold summary commands while today's budget is spent; log changes only."""

        if self._daily_budget is None:
            return True
        held = self._daily_budget.is_exhausted()
        if held != self._generation_held:
            self._generation_held = held
            log_event(
                self._logger,
                logging.WARNING if held else logging.INFO,
                "budget_hold_started" if held else "budget_hold_ended",
                "Summary generation held: daily budget reached."
                if held
                else "Daily budget available; summary generation resumed.",
                spent_usd=str(self._daily_budget.spent_today()),
                cap_usd=str(self._daily_budget.cap_usd),
            )
        return not held

    def _log_failure(
        self,
        command: ClaimedCommand,
        error: Exception,
        outcome: str,
        started: float,
    ) -> None:
        # Only the error class and bounded code are logged; messages may hold content.
        log_event(
            self._logger,
            logging.ERROR if outcome == "permanent" else logging.WARNING,
            "command_failed",
            f"Command failed ({outcome}).",
            outcome=outcome,
            error_class=type(error).__name__,
            error_code=error_code(error),
            duration_ms=_elapsed_ms(started),
            **command_context(command),
        )


def _elapsed_ms(started: float) -> int:
    return round((time.monotonic() - started) * 1000)
