"""Daily model-spend cap shared by claiming and summary generation."""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import datetime
from datetime import time as day_time
from decimal import Decimal
from zoneinfo import ZoneInfo


class DailyBudgetExceeded(Exception):
    """Today's estimated model spend reached the cap; generation pauses.

    It is deliberately not a permanent failure: the run becomes retryable and
    resumes from its saved evidence chunks after the local day rolls over.
    """

    code = "daily_budget_exceeded"

    def __init__(self, spent_usd: Decimal, cap_usd: Decimal) -> None:
        super().__init__("Daily model budget reached.")
        self.spent_usd = spent_usd
        self.cap_usd = cap_usd


class DailyBudget:
    """Compare today's spend (in the budget time zone) with a USD cap.

    A cap of 0 disables budgeting. Spend is cached for a few seconds so a
    per-chunk check does not query the database on every model call.
    """

    def __init__(
        self,
        spent_since: Callable[[datetime], Decimal],
        cap_usd: Decimal,
        timezone: ZoneInfo,
        cache_seconds: float = 5.0,
    ) -> None:
        self._spent_since = spent_since
        self.cap_usd = cap_usd
        self._timezone = timezone
        self._cache_seconds = cache_seconds
        self._cached: tuple[float, datetime, Decimal] | None = None

    @property
    def enabled(self) -> bool:
        return self.cap_usd > 0

    def spent_today(self) -> Decimal:
        """Estimated spend since local midnight, across all owners."""

        day_start = datetime.combine(
            datetime.now(self._timezone).date(),
            day_time.min,
            tzinfo=self._timezone,
        )
        now = time.monotonic()
        if (
            self._cached is not None
            and self._cached[1] == day_start
            and now - self._cached[0] < self._cache_seconds
        ):
            return self._cached[2]
        spent = self._spent_since(day_start)
        self._cached = (now, day_start, spent)
        return spent

    def is_exhausted(self) -> bool:
        return self.enabled and self.spent_today() >= self.cap_usd

    def require_available(self) -> None:
        """Raise ``DailyBudgetExceeded`` when no budget is left today."""

        if not self.enabled:
            return
        spent = self.spent_today()
        if spent >= self.cap_usd:
            raise DailyBudgetExceeded(spent, self.cap_usd)
