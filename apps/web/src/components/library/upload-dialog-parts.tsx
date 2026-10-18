"use client";

import { Check, CircleCheck, ShieldCheck } from "lucide-react";

import { formatFileSize } from "../../lib/format";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { uploadMessages } from "../../lib/i18n/messages/upload";
import { Spinner } from "../ui/loading";
import { fileFormat } from "./book-cover";

export type UploadStage =
  | "idle"
  | "creating"
  | "uploading"
  | "finalizing"
  | "done";

const formatTones: Record<string, string> = {
  PDF: "is-pdf",
  EPUB: "is-epub",
  DOCX: "is-docx",
  TXT: "is-txt",
};

/** Small document glyph with the file's format, colored per format. */
export function FileTypeIcon({ filename, small = false }: { filename: string; small?: boolean }) {
  const format = fileFormat(filename);

  return (
    <span
      className={`up-file-icon ${formatTones[format] ?? "is-txt"}${small ? " is-small" : ""}`}
      aria-hidden="true"
    >
      {format}
    </span>
  );
}

/** Circular progress showing percent and bytes sent. */
export function UploadProgressRing({
  progress,
  loaded,
  total,
}: {
  progress: number;
  loaded: number;
  total: number;
}) {
  const locale = useLocale();
  const t = useMessages(uploadMessages);

  return (
    <div
      className="up-ring"
      style={{ ["--up-progress" as string]: `${progress}%` }}
      role="progressbar"
      aria-label={t.progressLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <div>
        <b>{progress}%</b>
        <small>
          {t.bytesOf(formatFileSize(loaded, locale), formatFileSize(total, locale))}
        </small>
      </div>
    </div>
  );
}

type StepState = "done" | "active" | "pending";

function stepStates(stage: UploadStage): StepState[] {
  switch (stage) {
    case "creating":
      return ["active", "pending", "pending"];
    case "uploading":
      return ["done", "active", "pending"];
    case "finalizing":
      return ["done", "done", "active"];
    case "done":
      return ["done", "done", "done"];
    default:
      return ["pending", "pending", "pending"];
  }
}

/** Right-hand panel: what happens next, updated live while uploading. */
export function UploadTimeline({
  stage,
  progress,
  sizeLabel,
}: {
  stage: UploadStage;
  progress: number;
  sizeLabel?: string;
}) {
  const t = useMessages(uploadMessages);
  const step = t.steps;
  const idle = stage === "idle";
  const states = stepStates(stage);
  const steps = idle
    ? [
        { title: step.upload, detail: sizeLabel ? step.uploadDetailSized(sizeLabel) : step.uploadDetail },
        { title: step.read, detail: step.readDetail },
        { title: step.summarize, detail: step.summarizeDetail },
      ]
    : [
        { title: states[0] === "done" ? step.prepared : step.preparing, detail: step.secureLink },
        {
          title:
            states[1] === "done"
              ? step.uploaded
              : states[1] === "active"
                ? step.uploadingPercent(progress)
                : step.upload,
          detail: sizeLabel ? step.toStorageSized(sizeLabel) : step.toStorage,
        },
        {
          title:
            states[2] === "done"
              ? step.summaryQueued
              : states[2] === "active"
                ? step.queuingSummary
                : step.queueSummary,
          detail: states[2] === "done" ? step.startsAutomatically : step.startsAfterUpload,
        },
      ];

  return (
    <aside className="up-side">
      <h3>{idle ? t.whatNext : t.progress}</h3>
      <ol className="up-timeline">
        {steps.map((item, index) => {
          const state = idle ? (index === 0 ? "active" : "pending") : states[index];

          return (
            <li key={item.title} data-state={state}>
              <span className="up-timeline-marker" aria-hidden="true">
                {state === "done" ? (
                  <Check size={11} strokeWidth={4} />
                ) : state === "active" && !idle ? (
                  <Spinner size="sm" />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <b>{item.title}</b>
                <small>{item.detail}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="up-note">
        {stage === "done" ? (
          <CircleCheck aria-hidden="true" size={16} />
        ) : (
          <ShieldCheck aria-hidden="true" size={16} />
        )}
        {stage === "done"
          ? t.noteDone
          : stage === "uploading"
            ? t.noteUploading
            : t.notePrivate}
      </p>
    </aside>
  );
}
