"use client";

import { Gauge } from "lucide-react";

import type { DailyUsage } from "../../lib/library-types";
import { useLocale, type Locale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { intlLocales } from "../../lib/i18n/messages/common";
import { libraryMessages } from "../../lib/i18n/messages/library";

/** US-dollar amounts written the way each interface language writes numbers. */
const usdByLocale = Object.fromEntries(
  Object.entries(intlLocales).map(([locale, tag]) => [
    locale,
    new Intl.NumberFormat(tag, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  ]),
) as Record<Locale, Intl.NumberFormat>;

/** Slim strip under the stats: today's shared AI spend against the daily cap. */
export function DailyBudgetCard({ usage }: { usage: DailyUsage }) {
  const locale = useLocale();
  const t = useMessages(libraryMessages);

  // A cap of 0 means budgeting is off; there is nothing to show.
  if (usage.capUsd <= 0) {
    return null;
  }

  const percent = Math.min(100, (usage.spentUsd / usage.capUsd) * 100);
  const usd = usdByLocale[locale];
  const resets = new Date(usage.resetsAt).toLocaleTimeString(intlLocales[locale], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      className="lib-budget"
      data-paused={usage.paused || undefined}
      aria-label={t.budgetLabel}
    >
      <span
        className={`lib-stat-icon tone-${usage.paused ? "warning" : "info"}`}
      >
        <Gauge aria-hidden="true" size={15} />
      </span>
      <p className="lib-budget-text">
        <strong>{t.budgetHeading}</strong>{" "}
        {t.spentOf(usd.format(usage.spentUsd), usd.format(usage.capUsd))}
      </p>
      <div
        className="lib-budget-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={t.budgetUsed}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="lib-budget-detail">
        {usage.paused
          ? t.budgetReached(resets)
          : t.resetsAt(resets)}
      </p>
    </section>
  );
}
