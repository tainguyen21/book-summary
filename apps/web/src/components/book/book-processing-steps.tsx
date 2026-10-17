import { Check, X } from "lucide-react";

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
function stepsFor(status: BookProcessingStatus, failed: boolean): Step[] {
  const run = status.runStatus;
  const started = run !== undefined;
  const paused =
    run === "retryable_failed" && status.latestEventType === "budget_paused";
  const retrying = run === "retryable_failed" && !paused;

  return [
    {
      title: "Upload received",
      detail: "Your file is stored privately.",
      state: "done",
    },
    {
      title: "Waiting in queue",
      detail: started ? "Picked up for processing." : "Starts automatically, usually within a minute.",
      state: started || failed ? "done" : "active",
    },
    {
      title: "Reading and summarizing",
      detail: failed
        ? "Processing stopped before a summary was written."
        : paused
          ? "Paused because today’s AI budget was reached. It resumes automatically after midnight."
          : retrying
          ? "Hit a temporary problem — retrying automatically."
          : started
            ? "Extracting text and writing a cited summary."
            : "Bookwise reads every chapter and cites its sources.",
      state: failed ? "failed" : paused ? "pending" : started ? "active" : "pending",
    },
    {
      title: "Summary ready",
      detail: "You’ll be able to read it right here.",
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
  return (
    <ol className="progress-steps">
      {stepsFor(status, failed).map((step) => (
        <li className="progress-step" data-state={step.state} key={step.title}>
          <span className="progress-step-marker" aria-hidden="true">
            {step.state === "done" && <Check size={12} strokeWidth={3.5} />}
            {step.state === "active" && <Spinner size="sm" />}
            {step.state === "failed" && <X size={12} strokeWidth={3.5} />}
          </span>
          <span className="progress-step-text">
            <strong>
              {step.title}
              <span className="visually-hidden"> ({step.state})</span>
            </strong>
            <span>{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
