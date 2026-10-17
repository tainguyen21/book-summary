import type { CSSProperties } from "react";

/**
 * Loading primitives. Rules:
 * - Content on its way: <Skeleton> shaped like the final layout.
 * - An action in progress: <Spinner> (12px inline, 16px in buttons, 24px for a
 *   blocking section). Spinners inherit text color and never stand alone on an
 *   empty page.
 */

type SpinnerSize = "sm" | "md" | "lg";

export function Spinner({
  size = "md",
  label,
}: {
  size?: SpinnerSize;
  /** Accessible label; omit when adjacent text already describes the work. */
  label?: string;
}) {
  const className = size === "md" ? "spinner" : `spinner spinner-${size}`;

  return label ? (
    <span className={className} role="status" aria-label={label} />
  ) : (
    <span className={className} aria-hidden="true" />
  );
}

export function Skeleton({
  width,
  height,
  radius,
  className,
}: {
  width?: CSSProperties["width"];
  height: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
}) {
  return (
    <span
      className={className ? `skeleton ${className}` : "skeleton"}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
