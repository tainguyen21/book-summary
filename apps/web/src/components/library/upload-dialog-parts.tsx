import { Check, CircleCheck, ShieldCheck } from "lucide-react";

import { formatFileSize } from "../../lib/format";
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
  return (
    <div
      className="up-ring"
      style={{ ["--up-progress" as string]: `${progress}%` }}
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <div>
        <b>{progress}%</b>
        <small>
          {formatFileSize(loaded)} of {formatFileSize(total)}
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
  const idle = stage === "idle";
  const states = stepStates(stage);
  const steps = idle
    ? [
        { title: "Upload", detail: sizeLabel ? `${sizeLabel}, sent straight to private storage` : "Sent straight to private storage" },
        { title: "Read", detail: "Text is extracted, chapter by chapter" },
        { title: "Summarize", detail: "A summary with cited sources" },
      ]
    : [
        { title: states[0] === "done" ? "Prepared" : "Preparing", detail: "Secure upload link" },
        {
          title:
            states[1] === "done" ? "Uploaded" : states[1] === "active" ? `Uploading ${progress}%` : "Upload",
          detail: sizeLabel ? `${sizeLabel} to private storage` : "To private storage",
        },
        {
          title: states[2] === "done" ? "Summary queued" : states[2] === "active" ? "Queuing summary" : "Queue summary",
          detail: states[2] === "done" ? "Starts automatically" : "Starts as soon as the upload ends",
        },
      ];

  return (
    <aside className="up-side">
      <h3>{idle ? "What happens next" : "Progress"}</h3>
      <ol className="up-timeline">
        {steps.map((step, index) => {
          const state = idle ? (index === 0 ? "active" : "pending") : states[index];

          return (
            <li key={step.title} data-state={state}>
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
                <b>{step.title}</b>
                <small>{step.detail}</small>
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
          ? "Your library updates automatically when the summary is ready."
          : stage === "uploading"
            ? "If the connection drops, just retry — no need to pick the file again."
            : "Stored privately — only your account can see it."}
      </p>
    </aside>
  );
}
