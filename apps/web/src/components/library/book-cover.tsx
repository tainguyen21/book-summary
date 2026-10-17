const coverCount = 6;

/** Stable gradient per book so a cover never changes between visits. */
function coverVariant(seed: string): number {
  let hash = 0;

  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return (hash % coverCount) + 1;
}

export function fileFormat(filename: string): string {
  const index = filename.lastIndexOf(".");

  return index > 0 ? filename.slice(index + 1).toUpperCase() : "FILE";
}

/**
 * Generated book cover: a gradient with the format and title. The small size
 * is a plain thumbnail; larger sizes print the title like a real cover.
 */
export function BookCover({
  id,
  title,
  filename,
  size,
  muted = false,
}: {
  id: string;
  title: string;
  filename: string;
  size: "sm" | "md" | "lg";
  muted?: boolean;
}) {
  const className = [
    "book-cover",
    `book-cover-${size}`,
    `cover-${coverVariant(id)}`,
    muted ? "book-cover-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} aria-hidden="true">
      {size !== "sm" && (
        <>
          <span className="book-cover-format">{fileFormat(filename)}</span>
          <span className="book-cover-title">{title}</span>
        </>
      )}
    </span>
  );
}
