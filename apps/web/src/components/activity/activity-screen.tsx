"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Activity as ActivityIcon, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { loadActivity, type Activity, type ActivityRun } from "../../lib/activity-api";
import { formatRelative } from "../../lib/format";
import { useLocale, type Locale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { activityMessages } from "../../lib/i18n/messages/activity";
import { intlLocales } from "../../lib/i18n/messages/common";
import { subscribeLiveStatus } from "../../lib/live-status";
import { AppShell } from "../app-shell/app-shell";
import { RetrySummaryButton } from "../book/retry-summary-button";
import { StateCallout } from "../layout/state-callout";
import { useLibraryBooks } from "../library/use-library-books";
import { Spinner } from "../ui/loading";
import "./activity.css";

type ActivityState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; activity: Activity };

function money(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocales[locale], {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
  }).format(value);
}

function duration(run: ActivityRun, locale: Locale): string | undefined {
  if (!run.completedAt) {
    return undefined;
  }
  const seconds = Math.max(0, Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000));
  const inMinutes = seconds >= 90;
  return new Intl.NumberFormat(intlLocales[locale], {
    style: "unit",
    unit: inMinutes ? "minute" : "second",
    unitDisplay: "short",
  }).format(inMinutes ? Math.round(seconds / 60) : seconds);
}

/** The owner's processing activity, refreshed when a book's status changes. */
export function ActivityScreen() {
  const library = useLibraryBooks();
  const { getAccessTokenSilently } = useAuth0();
  const locale = useLocale();
  const t = useMessages(activityMessages);
  const [state, setState] = useState<ActivityState>({ kind: "loading" });

  const load = useCallback(() => {
    loadActivity(getAccessTokenSilently)
      .then((activity) => setState({ kind: "ready", activity }))
      .catch(() => setState((current) => (current.kind === "ready" ? current : { kind: "error" })));
  }, [getAccessTokenSilently]);

  useEffect(() => {
    load();
    return subscribeLiveStatus(getAccessTokenSilently, () => load());
  }, [getAccessTokenSilently, load]);

  return (
    <AppShell
      books={library.state.kind === "ready" ? library.state.books : undefined}
      onUploaded={library.refresh}
      activityActive
    >
      <div className="shell-content activity-page">
        <header className="activity-heading">
          <h1>{t.title}</h1>
          <p>{t.lede}</p>
        </header>

        {state.kind === "loading" && (
          <p className="activity-loading" role="status">
            <Spinner size="sm" /> {t.loading}
          </p>
        )}
        {state.kind === "error" && (
          <StateCallout
            tone="danger"
            title={t.loadError}
            body=""
            action={
              <button className="button button-line button-sm" type="button" onClick={load}>
                {t.tryAgain}
              </button>
            }
          />
        )}

        {state.kind === "ready" && (
          <>
            <div className="activity-cards">
              <section className="activity-card" aria-labelledby="queue-title">
                <h2 id="queue-title">{t.queueTitle}</h2>
                <p className="activity-big">{state.activity.queue.mine}</p>
                <p>{t.queueMine(state.activity.queue.mine)}</p>
                {state.activity.queue.mine > 0 && <p>{t.queueAhead(state.activity.queue.ahead)}</p>}
              </section>
              <section className="activity-card" aria-labelledby="spend-title">
                <h2 id="spend-title">{t.spendTitle}</h2>
                <p className="activity-big">{money(state.activity.spendToday.totalUsd, locale)}</p>
                {state.activity.spendToday.byOperation.length === 0 ? (
                  <p>{t.spendNone}</p>
                ) : (
                  <dl className="activity-spend">
                    {state.activity.spendToday.byOperation.map((row) => (
                      <div key={row.operation}>
                        <dt>{t.operations[row.operation] ?? row.operation}</dt>
                        <dd>
                          {money(row.usd, locale)} <small>· {t.calls(row.calls)}</small>
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            </div>

            <section className="activity-runs" aria-labelledby="runs-title">
              <h2 id="runs-title">
                <ActivityIcon aria-hidden="true" size={17} />
                {t.runsTitle}
              </h2>
              {state.activity.runs.length === 0 ? (
                <p className="activity-empty">{t.runsEmpty}</p>
              ) : (
                <ol>
                  {state.activity.runs.map((run) => {
                    const took = duration(run, locale);
                    return (
                      <li key={run.runId} className={`activity-run status-${run.status}`}>
                        <div className="activity-run-main">
                          <Link href={`/books/${run.bookId}`}>{run.bookTitle}</Link>
                          <span className="activity-run-meta">
                            {t.stages[run.commandType] ?? run.commandType} ·{" "}
                            {t.started(formatRelative(run.startedAt, locale))}
                            {took ? ` · ${t.took(took)}` : ""}
                          </span>
                          {run.errorCode && (
                            <span className="activity-run-error">
                              <CircleAlert aria-hidden="true" size={14} />
                              {t.errors[run.errorCode] ?? t.errorCode(run.errorCode)}
                            </span>
                          )}
                        </div>
                        <span className="activity-status">{t.statuses[run.status] ?? run.status}</span>
                        {run.status === "permanent_failed" && (
                          <RetrySummaryButton bookId={run.bookId} onRetried={load} />
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
