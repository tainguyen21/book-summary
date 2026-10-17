import { Gauge } from "lucide-react";

import type { DailyUsage } from "../../lib/library-types";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Slim strip under the stats: today's shared AI spend against the daily cap. */
export function DailyBudgetCard({ usage }: { usage: DailyUsage }) {
  // A cap of 0 means budgeting is off; there is nothing to show.
  if (usage.capUsd <= 0) {
    return null;
  }

  const percent = Math.min(100, (usage.spentUsd / usage.capUsd) * 100);
  const resets = new Date(usage.resetsAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      className="lib-budget"
      data-paused={usage.paused || undefined}
      aria-label="Today’s AI spend"
    >
      <span
        className={`lib-stat-icon tone-${usage.paused ? "warning" : "info"}`}
      >
        <Gauge aria-hidden="true" size={15} />
      </span>
      <p className="lib-budget-text">
        <strong>Today’s AI spend:</strong> {usd.format(usage.spentUsd)} of{" "}
        {usd.format(usage.capUsd)}
      </p>
      <div
        className="lib-budget-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Share of today’s AI budget used"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="lib-budget-detail">
        {usage.paused
          ? `Budget reached · summaries resume at ${resets}`
          : `Resets at ${resets}`}
      </p>
    </section>
  );
}
