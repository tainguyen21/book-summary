"""Private worker that claims commands and records their outcomes."""

from __future__ import annotations

from collections.abc import Callable

from bookwise_data.application.claim_command import ClaimCommand
from bookwise_data.domain.commands import ClaimedCommand

CommandHandler = Callable[[ClaimedCommand], None]


class CommandWorker:
    """Run an injected command handler against a durable command batch."""

    def __init__(
        self,
        claim_command: ClaimCommand,
        handler: CommandHandler | None = None,
    ) -> None:
        self._claim_command = claim_command
        self._handler = handler or _complete_without_external_work

    def run_once(self, limit: int) -> int:
        """Claim and handle one bounded batch of commands."""

        commands = self._claim_command.execute(limit)
        for command in commands:
            try:
                self._handler(command)
            except Exception as error:  # noqa: BLE001
                self._claim_command.fail_retryably(command, error)
            else:
                self._claim_command.complete(command)

        return len(commands)


def _complete_without_external_work(command: ClaimedCommand) -> None:
    """Provide a deterministic Task 1 handler until ingestion is composed."""
