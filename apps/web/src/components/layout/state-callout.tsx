import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** Inline alert with a title, explanation, and optional recovery actions. */
export function StateCallout({
  tone,
  title,
  body,
  action,
}: {
  tone: "warning" | "danger";
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`} role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <div className="callout-body">
        <strong>{title}</strong>
        <p>{body}</p>
        {action && <div className="callout-actions">{action}</div>}
      </div>
    </div>
  );
}
