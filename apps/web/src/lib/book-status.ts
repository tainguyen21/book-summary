/**
 * One place that turns raw book/command/run statuses into what the UI shows:
 * a label, a tone, a library category, and a pipeline step.
 * The most specific status wins: run status, then command status, then book status.
 */

export interface BookStatusSource {
  bookStatus: string;
  commandStatus?: string;
  runStatus?: string;
  latestEventType?: string;
}

export type StatusTone = "success" | "info" | "warning" | "danger" | "neutral";
export type BookCategory = "ready" | "processing" | "queued" | "attention";

interface StatusPresentation {
  label: string;
  tone: StatusTone;
  category: BookCategory;
}

const presentations: Record<string, StatusPresentation> = {
  completed: { label: "Ready", tone: "success", category: "ready" },
  queued: { label: "Queued", tone: "neutral", category: "queued" },
  processing: { label: "Summarizing", tone: "info", category: "processing" },
  running: { label: "Summarizing", tone: "info", category: "processing" },
  retryable_failed: { label: "Retrying", tone: "warning", category: "processing" },
  // Waiting for tomorrow's budget, so it reads as queued rather than running.
  budget_paused: { label: "Paused · daily budget", tone: "warning", category: "queued" },
  pending_upload: { label: "Upload incomplete", tone: "warning", category: "attention" },
  needs_review: { label: "Needs review", tone: "warning", category: "attention" },
  failed: { label: "Failed", tone: "danger", category: "attention" },
  permanent_failed: { label: "Failed", tone: "danger", category: "attention" },
};

export function effectiveStatus(source: BookStatusSource): string {
  // An unfinished upload outranks any command state.
  if (source.bookStatus === "pending_upload") {
    return "pending_upload";
  }

  // A retryable run stopped by the daily budget is waiting, not failing.
  if (
    source.runStatus === "retryable_failed" &&
    source.latestEventType === "budget_paused"
  ) {
    return "budget_paused";
  }

  return source.runStatus ?? source.commandStatus ?? source.bookStatus;
}

export function presentStatus(source: BookStatusSource): StatusPresentation {
  const status = effectiveStatus(source);

  return (
    presentations[status] ?? {
      label: status.replaceAll("_", " "),
      tone: "neutral",
      category: "queued",
    }
  );
}

/** Active books are polled until they reach a terminal state. */
export function isActive(source: BookStatusSource): boolean {
  const { category } = presentStatus(source);

  return category === "processing" || category === "queued";
}

export const pipelineSteps = ["Uploaded", "In queue", "Summarizing", "Ready"];

/** Index of the current pipeline step (0-based); every step before it is done. */
export function pipelineIndex(source: BookStatusSource): number {
  const { category } = presentStatus(source);

  if (category === "ready") {
    return pipelineSteps.length;
  }

  return category === "processing" ? 2 : 1;
}

export const categoryLabels: Record<BookCategory, string> = {
  ready: "Ready to read",
  processing: "In progress",
  queued: "Queued",
  attention: "Needs attention",
};
