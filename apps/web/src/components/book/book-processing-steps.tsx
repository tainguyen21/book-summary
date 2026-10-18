"use client";

import { Check, X } from "lucide-react";

import { useMessages } from "../../lib/i18n/messages";
import { bookMessages } from "../../lib/i18n/messages/book";
import type { BookProcessingStatus } from "../../lib/library-types";
import { Spinner } from "../ui/loading";

type StepState = "done" | "active" | "pending" | "failed";

interface Step {
  title: string;
  detail: string;
  state: StepState;
}

/**
 * Derives a human-readable pipeline from the summary command's status.
 * No run yet means the command is still queued; a run means the worker is
 * reading and summarizing the book.
 */
function stepsFor(
  status: BookProcessingStatus,
  failed: boolean,
  t: (typeof bookMessages)["en"]["steps"],
): Step[] {
  const run = status.runStatus;
  const started = run !== undefined;
  const paused =
    run === "retryable_failed" && status.latestEventType === "budget_paused";
  const retrying = run === "retryable_failed" && !paused;

  return [
    {
      title: t.uploadTitle,
      detail: t.uploadDetail,
      state: "done",
    },
    {
      title: t.queueTitle,
      detail: started ? t.queueStarted : t.queueWaiting,
      state: started || failed ? "done" : "active",
    },
    {
      title: t.readingTitle,
      detail: failed
        ? t.readingFailed
        : paused
          ? t.readingPaused
          : retrying
          ? t.readingRetrying
          : started
            ? t.readingStarted
            : t.readingPending,
      state: failed ? "failed" : paused ? "pending" : started ? "active" : "pending",
    },
    {
      title: t.readyTitle,
      detail: t.readyDetail,
      state: "pending",
    },
  ];
}

export function BookProcessingSteps({
  status,
  failed = false,
}: {
  status: BookProcessingStatus;
  failed?: boolean;
}) {
  const t = useMessages(bookMessages);

  return (
    <ol className="progress-steps">
      {stepsFor(status, failed, t.steps).map((step) => (
        <li className="progress-step" data-state={step.state} key={step.title}>
          <span className="progress-step-marker" aria-hidden="true">
            {step.state === "done" && <Check size={12} strokeWidth={3.5} />}
            {step.state === "active" && <Spinner size="sm" />}
            {step.state === "failed" && <X size={12} strokeWidth={3.5} />}
          </span>
          <span className="progress-step-text">
            <strong>
              {step.title}
              <span className="visually-hidden"> ({t.stepStates[step.state]})</span>
            </strong>
            <span>{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
