/**
 * Picks, for each [n] marker in an answer, the sentence of passage n that best
 * supports the claim the marker follows. Quotes are verbatim from the passage
 * (trimmed with an ellipsis when long); null means no sentence shares a
 * meaningful word with the claim, so the caller falls back to the evidence quote.
 */

const MAX_QUOTE_CHARS = 280;
const MARKER = /\[(\d+)\]/g;

// Common English function words; short Vietnamese words are kept on purpose.
const STOP_WORDS = new Set(
  "the a an and or but of to in on at by for from with as is are was were be been being it its this that these those he she they them his her their we you i not no so than then there here what which who whom when where why how does did do has have had into about over after before also just only very can could would should will may might".split(
    " ",
  ),
);

/** Meaningful words, crudely stemmed to 5 letters so "watered" meets "watering". */
function words(text: string): string[] {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(
      (word) =>
        (word.length >= 2 || /\p{N}/u.test(word)) && !STOP_WORDS.has(word),
    )
    .map((word) => word.slice(0, 5));
}

/** Passage split into sentences and lines, keeping the original text. */
function sentences(passage: string): string[] {
  return passage
    .split(/(?<=[.!?。])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** A window of a long sentence centred on its first matching word. */
function trimmed(sentence: string, claimWords: Set<string>): string {
  if (sentence.length <= MAX_QUOTE_CHARS) {
    return sentence;
  }
  const lower = sentence.toLocaleLowerCase();
  const firstHit = Math.min(
    ...[...claimWords]
      .map((word) => lower.indexOf(word))
      .filter((index) => index >= 0),
  );
  const start = Math.max(
    0,
    Math.min(firstHit - 60, sentence.length - MAX_QUOTE_CHARS),
  );
  const end = start + MAX_QUOTE_CHARS;
  return `${start > 0 ? "…" : ""}${sentence.slice(start, end).trim()}${end < sentence.length ? "…" : ""}`;
}

function bestSentence(passage: string, claim: string): string | null {
  const claimWords = new Set(words(claim));
  if (claimWords.size === 0) {
    return null;
  }
  let best: { sentence: string; score: number } | undefined;
  for (const sentence of sentences(passage)) {
    const score = new Set(
      words(sentence).filter((word) => claimWords.has(word)),
    ).size;
    if (
      score > 0 &&
      (!best ||
        score > best.score ||
        (score === best.score && sentence.length < best.sentence.length))
    ) {
      best = { sentence, score };
    }
  }
  return best ? trimmed(best.sentence, claimWords) : null;
}

/**
 * One entry per marker whose number is in `passages` (1-based), in text order —
 * the same markers the web renders as buttons.
 */
export function markerQuotes(
  answer: string,
  passages: string[],
): (string | null)[] {
  const quotes: (string | null)[] = [];
  let claimStart = 0;
  for (const match of answer.matchAll(MARKER)) {
    const index = match.index ?? 0;
    // The claim is the sentence the marker closes; when the marker follows a
    // full stop ("... fact. [1]"), it is the sentence before.
    const parts = answer
      .slice(claimStart, index)
      .replace(MARKER, " ")
      .split(/(?<=[.!?\n])/u);
    const last = parts.at(-1) ?? "";
    const claim = /[\p{L}\p{N}]/u.test(last) ? last : (parts.at(-2) ?? "");
    const passage = passages[Number(match[1]) - 1];
    if (passage !== undefined) {
      quotes.push(bestSentence(passage, claim));
    }
    // Adjacent markers ([1][3]) share the same claim.
    if (!/^\s*\[\d+\]/u.test(answer.slice(index + match[0].length))) {
      claimStart = index + match[0].length;
    }
  }
  return quotes;
}
