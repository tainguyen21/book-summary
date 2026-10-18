import type { PublishedSummary } from "./library-types";

/**
 * A summary as Markdown for notes apps such as Obsidian: YAML front matter,
 * the summary paragraphs, and footnotes holding each sentence's verified quotes
 * and locations. Nothing beyond the summary and its quotes is included.
 */
export function summaryMarkdown({
  title,
  filename,
  summary,
  labelFor,
  sourcesHeading,
  highlights = [],
  highlightsHeading = "Highlights",
}: {
  title: string;
  filename: string;
  summary: PublishedSummary;
  labelFor(location: Record<string, unknown>): string;
  sourcesHeading: string;
  /** The reader's highlights and notes, appended as their own section. */
  highlights?: { text: string; note: string | null }[];
  highlightsHeading?: string;
}): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `source_file: ${JSON.stringify(filename)}`,
    `summarized: ${summary.createdAt.slice(0, 10)}`,
    "tags: [bookwise]",
    "---",
    "",
    `# ${title}`,
    "",
  ];

  if (summary.paragraphs.length === 0) {
    // Older summaries have no sentence citations: body text and a source list.
    lines.push(summary.body.trim(), "");
    if (summary.citations.length) {
      lines.push(`## ${sourcesHeading}`, "");
      for (const citation of summary.citations) {
        lines.push(`${citation.order}. ${labelFor(citation.location)}`);
      }
      lines.push("");
    }
    return withHighlights(lines, highlights, highlightsHeading).join("\n");
  }

  const notes: string[] = [];
  for (const paragraph of summary.paragraphs) {
    const sentences = paragraph.map((sentence) => {
      if (sentence.citations.length === 0) {
        return sentence.text;
      }
      // One entry per distinct quote, listing every location that shares it.
      const byQuote = new Map<string, string[]>();
      for (const citation of sentence.citations) {
        const key = citation.quote ?? "";
        byQuote.set(key, [...(byQuote.get(key) ?? []), labelFor(citation.location)]);
      }
      notes.push(
        [...byQuote]
          .map(([quote, labels]) => (quote ? `“${quote}” (${labels.join(", ")})` : labels.join(", ")))
          .join("; "),
      );
      return `${sentence.text}[^${notes.length}]`;
    });
    lines.push(sentences.join(" "), "");
  }
  notes.forEach((note, index) => lines.push(`[^${index + 1}]: ${note}`));
  lines.push("");
  return withHighlights(lines, highlights, highlightsHeading).join("\n");
}

/** Highlighted sentences as quotes, each followed by the reader's note. */
function withHighlights(
  lines: string[],
  highlights: { text: string; note: string | null }[],
  heading: string,
): string[] {
  if (highlights.length === 0) {
    return lines;
  }
  lines.push(`## ${heading}`, "");
  for (const highlight of highlights) {
    lines.push(`> ${highlight.text}`, "");
    if (highlight.note) {
      lines.push(...highlight.note.split("\n").map((line) => line.trimEnd()), "");
    }
  }
  return lines;
}

/** Downloads text as a file named after the book. */
export function downloadMarkdown(name: string, markdown: string) {
  const slug =
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "summary";
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}.md`;
  link.click();
  URL.revokeObjectURL(url);
}
