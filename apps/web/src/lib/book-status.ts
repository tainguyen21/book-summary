/**
 * One place that turns raw book/command/run statuses into what the UI shows:
 * a label, a tone, a library category, and a pipeline step.
 * The most specific status wins: run status, then command status, then book status.
 */

import type { Locale } from "./i18n/locale";

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

type Labelled = Omit<StatusPresentation, "label"> & { label: Record<Locale, string> };

const presentations: Record<string, Labelled> = {
  completed: { label: { en: "Ready", vi: "Sẵn sàng" }, tone: "success", category: "ready" },
  queued: { label: { en: "Queued", vi: "Đang chờ" }, tone: "neutral", category: "queued" },
  processing: { label: { en: "Summarizing", vi: "Đang tóm tắt" }, tone: "info", category: "processing" },
  running: { label: { en: "Summarizing", vi: "Đang tóm tắt" }, tone: "info", category: "processing" },
  retryable_failed: { label: { en: "Retrying", vi: "Đang thử lại" }, tone: "warning", category: "processing" },
  // Waiting for tomorrow's budget, so it reads as queued rather than running.
  budget_paused: {
    label: { en: "Paused · daily budget", vi: "Tạm dừng · ngân sách ngày" },
    tone: "warning",
    category: "queued",
  },
  pending_upload: {
    label: { en: "Upload incomplete", vi: "Tải lên chưa xong" },
    tone: "warning",
    category: "attention",
  },
  needs_review: { label: { en: "Needs review", vi: "Cần xem lại" }, tone: "warning", category: "attention" },
  failed: { label: { en: "Failed", vi: "Thất bại" }, tone: "danger", category: "attention" },
  permanent_failed: { label: { en: "Failed", vi: "Thất bại" }, tone: "danger", category: "attention" },
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

/** Label, tone, and category for a book; the label is in `locale` (English by default). */
export function presentStatus(source: BookStatusSource, locale: Locale = "en"): StatusPresentation {
  const status = effectiveStatus(source);
  const known = presentations[status];

  return (
    (known && { ...known, label: known.label[locale] }) ?? {
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

export const pipelineStepLabels: Record<Locale, string[]> = {
  en: ["Uploaded", "In queue", "Summarizing", "Ready"],
  vi: ["Đã tải lên", "Trong hàng chờ", "Đang tóm tắt", "Sẵn sàng"],
};

export const pipelineSteps = pipelineStepLabels.en;

/** Index of the current pipeline step (0-based); every step before it is done. */
export function pipelineIndex(source: BookStatusSource): number {
  const { category } = presentStatus(source);

  if (category === "ready") {
    return pipelineSteps.length;
  }

  return category === "processing" ? 2 : 1;
}

export const categoryLabelsByLocale: Record<Locale, Record<BookCategory, string>> = {
  en: {
    ready: "Ready to read",
    processing: "In progress",
    queued: "Queued",
    attention: "Needs attention",
  },
  vi: {
    ready: "Sẵn sàng để đọc",
    processing: "Đang xử lý",
    queued: "Đang chờ",
    attention: "Cần xử lý",
  },
};

export const categoryLabels = categoryLabelsByLocale.en;
