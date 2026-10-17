---
title: "Chunking for EPUB, PDF, and DOCX: paragraph spans and packed chunks"
description: "Stop long EPUB chapters failing, and stop one model call per PDF page or DOCX paragraph."
status: completed
priority: P1
effort: 0.5d
branch: master
tags: [worker, parser, generation, cost]
created: 2026-10-17
---

# Chunking for EPUB, PDF, and DOCX

## Problem (verified in source)

- **EPUB:** one section, and so one span, per spine document. A chapter over
  12,000 characters raises `SourceSpanChunkLimitError`, a permanent failure,
  so most real EPUB books fail. `get_text("\n")` also breaks inline markup
  (`<em>`, links) onto separate lines.
- **PDF:** one node per page. Chunks never cross nodes, so a 300-page PDF
  makes 300 evidence calls, each repeating about 600 tokens of instructions.
- **DOCX:** one node per paragraph, so one evidence call per paragraph.

## Contract

- **Outcome:** every format splits text into paragraph spans of at most
  4,000 characters, and chunks pack adjacent spans across sections up to the
  chunk size (12,000 characters).
- **Constraints:** no migration; same tables; citation locations keep the
  keys the reader already labels (`page_number`, `spine_index`,
  `paragraph_number`); no new dependencies; no new automated tests; no push.
- **Non-goals:** heading detection in TXT or PDF; chapter-level summaries; reprocessing already-ingested books.
- **Acceptance:**
  1. Offline: generated EPUB (one 30,000-character chapter plus small chapters),
     PDF (12 short pages), and DOCX (headings and 120 paragraphs) all parse and chunk
     without errors, with every span at most 4,000 characters and chunks filled near
     12,000 characters instead of one per page or paragraph.
  2. EPUB paragraphs keep inline text together ("Hello *world* again" is one span).
  3. One small EPUB runs end to end locally: summary persisted, citations
     labelled by chapter, evidence calls equal to chunk count.
  4. TXT behaviour unchanged (same span and chunk counts for the evaluation book).
  5. ruff and compileall pass.

## Design

1. **`parsers/spans.py`:** `MAX_SPAN_CHARS = 4000`, `split_long_text()`
   (cut at whitespace), and `bounded_spans(text, location)`, which adds
   `part` only when a paragraph is split. TXT reuses `split_long_text`.
2. **EPUB:** a section per chapter as before; spans are block elements
   (`p`, `h1`–`h6`, `li`, `blockquote`, `pre`, `dd`, `dt`, `td` without nested
   blocks), with text joined by spaces. Falls back to the whole chapter
   text when a chapter has no block elements. Location:
   `spine_index`, `href`, `paragraph_number`.
3. **PDF:** a section per page as before; spans are PyMuPDF text blocks with
   line wraps joined. Location: `page_number`, `paragraph_number`.
4. **DOCX:** sections start at each heading (`node_type` `section`, title =
   heading). Paragraphs, including the heading, are spans with
   `paragraph_number` and `style`. Text before the first heading forms an untitled section.
5. **`build_chunks`:** pack spans in reading order across leaf sections. A chunk
   inside one section keeps that section's node; a chunk spanning sections
   uses the document node. The DB requires only that citations stay in the
   same document (trigger in migration 004).

## Risks

- Chunk input hashes change, so evidence checkpoints from earlier runs are
  not reused (by design: keys include the chunk hash).
- More, shorter spans add per-span overhead (id plus location) to the evidence prompt.

## Results (2026-10-17)

**Offline** (generated files; parse, normalize, and chunk at 12,000 characters, no model calls):

| Format | Before | After |
| --- | --- | --- |
| EPUB: 30,000-character chapter plus 3 small chapters | permanent `SourceSpanChunkLimitError` | 112 spans (max 322 characters), 3 chunks (2 span several sections) |
| PDF, 12 pages | 12 chunks (12 calls) | 24 spans, 1 chunk |
| DOCX, 4 headings and 121 paragraphs | 125 chunks | 5 sections, 125 spans, 2 chunks |
| TXT evaluation book | 42 spans, 1 chunk (4 at 3,000 characters) | unchanged |

- **EPUB inline markup** stays in one span ("Hello world again, with a link inline.").
  Text placed directly in a `<div>` is kept. A 10,000-character paragraph splits
  into four parts, each with `part`.
- **Logs:** the EPUB parser no longer prints `XMLParsedAsHTMLWarning` into the
  JSON log stream (a pre-existing issue).

**End to end** (the evaluation book converted to a 10-chapter EPUB, live Vertex,
production settings):

- 53 spans and 1 evidence call for all 10 chapters; evidence owned by the document node.
- The summary has 25 citations covering 9 of the 10 chapters; there were no validation outcomes.
- Estimated cost $0.061 (TXT run 4 was $0.092); 589 words.
- Rubric: 11.5/12 with 0 traps, the same as TXT.

Acceptance 1–5 met.
