# Evaluation — "The Slow Orchard" end-to-end run (2026-10-17)

## Result in one paragraph

The pipeline works end to end and the new usage ledger is correct, but the
summary is thin. Everything the summary says is true to the book (no traps
triggered, no outside facts), yet it covers only about 5 of the 12 key facts
in the rubric. The cause is upstream: evidence extraction returned just 5
items for a 1,678-word book, and the summary step may only restate evidence.
Separately, a TXT book is stored as a single source span, so its citations
point at the whole book and carry no location.

## Setup

- Book: `the-slow-orchard.txt`, original content written for this test,
  1,678 words / 9,287 bytes, seven chapters with specific invented numbers and
  five deliberate traps. Rubric in `expected-summary.md`, written before the run.
- Path: real ingestion and generation code (`IngestBook`, `GenerateSummary`,
  `CommandWorker`, `RecordModelUsage`) against the local stack and live Vertex AI
  (`gemini-3.8-flash`, `gemini-embedding-001`), with production settings
  (12,000-char chunks, 4,000 max output tokens). The book row, object, and
  commands were created with the same shape as the API's upload and finalize.
- Isolation: the 76 MB book's commands were held under their advisory claim
  locks for the whole run, so the worker could not claim them; a guard also
  refused any other book. No other book reached a model.

## Pipeline and ledger

| Check | Result |
| --- | --- |
| Ingest | completed, 144 ms |
| Generation | completed, 21.4 s (1 evidence call, 1 summary call, 1 embedding batch) |
| Validation outcomes (rejections) | 0 |
| Evidence items | 5 |
| Embeddings | 6 (5 evidence + 1 summary) |
| Ledger rows | 3: evidence, summary, embedding |

| Operation | Input tokens | Output tokens | Est. cost (USD) |
| --- | --- | --- | --- |
| evidence | 2,695 | 1,456 | 0.014963 |
| summary | 816 | 986 | 0.008619 |
| embedding | 328 | 0 | 0.000049 |
| **Total** | **3,839** | **2,442** | **0.023631** |

The costs match the configured list prices by hand calculation. Output
tokens include Gemini thinking tokens.

## Generated summary (verbatim)

> Establishing a public orchard presents the ongoing challenge of keeping trees
> alive rather than planting them. While frost cloth failed to protect nursery
> stock from damage, grafting cuttings from local survivor trees onto hardy
> rootstock proved to be the effective solution, reducing five-year tree losses
> to under 9 percent (9 of 102 trees) compared to nearly 50 percent among
> nursery-bought stock. The Orchard Circle manages its orchard under three
> rules: an assigned individual must commit to watering each tree for its first
> two summers, pruning is restricted to a single Saturday in late February, and
> no fruit is ever sold. Total harvest measurements are not entirely precise
> because direct weighing applied only to fruit donated to the food bank and
> school, with remaining amounts taken by passers-by estimated from bare
> branches.

## Scores

**Coverage: 5 / 12 key facts (42%).**

| # | Key fact | Score |
| --- | --- | --- |
| 1 | Merrow Bay, Orchard Circle, 140 trees, 2019–2024 | 0 (only "Orchard Circle") |
| 2 | Core thesis | 1 |
| 3 | Frost killed 17 of 38 | 0 |
| 4 | Cause: trees raised for a milder climate | 0 |
| 5 | Grafting from local survivors, 9 of 102 | 1 |
| 6 | Harbour roundabout failed and was returned | 0 |
| 7 | Named waterer, two summers | 1 |
| 8 | One fixed pruning day, late February | 1 |
| 9 | Never sold; surplus to food bank and school | 0.5 (surplus route missing) |
| 10 | Harvest 0.8 → 1.9 → 3.1 t, estimated | 0.5 (caveat only, no figures) |
| 11 | Cost about 9,400 euros, mostly sapling sales | 0 |
| 12 | Not free to the town, but cheaper than mowing | 0 |

**Faithfulness: 4 / 4 summary sentences supported; 0 / 5 traps triggered.**
The frost-cloth sentence correctly says the cloth did not help (trap T1
avoided), the harvest caveat is kept (T4 avoided), and nothing is invented (T5).
Topics wholly absent: the town and timeline, the four sites, and the whole
money chapter.

**Citations: structurally valid, practically uninformative.** The summary has
one citation and it resolves, but the TXT parser stores the entire book as one
span (`{"line_start": 1}`, 9,286 characters). Every evidence item and the
summary therefore cite "the whole book".

## Root causes

1. **Sparse evidence.** The extraction prompt asks for evidence but sets no
   coverage expectation, and the model returned exactly one item for each of
   five evidence types (`main_claim`, `data_point`, `counterargument`,
   `procedure`, `limitation`). Nothing caps the count in the schema; the prompt
   simply does not ask for more.
2. **Summary bounded by evidence.** By design the summary may use only accepted
   evidence, so it cannot recover facts the evidence step dropped. Its body is
   close to a paraphrase of the five items.
3. **One span per TXT document.** `parse_text` returns a single section, so the
   span granularity that citations rely on does not exist for TXT.

## Cost implications for the daily budget

At list prices this 1,678-word book cost about $0.024. Evidence cost scales
roughly with book length, so a typical 80,000–100,000-word book would cost on
the order of $1–1.5. With the planned $1/day cap, the worker would often pause
partway through a single full-length book, and (as the plan notes) restart it
from scratch the next day. The cap, the chunk size, or the "save finished
chunks" follow-up should be revisited before phase 3 ships. At the current
launch promotion (half the list price) the cost would be about half.

## Minor findings

- The google-genai SDK prints a plain-text "automatic function calling"
  warning to stderr on each generate call. It is not JSON, so it breaks the
  one-JSON-object-per-line log contract in Cloud Logging. Passing an explicit
  AFC-disabled config would silence it.
- The library shows already-summarized books as "queued": app command status
  is never updated by the worker (app commands are read-only to it), so status
  must come from the run projection, as the web already does.

## Recommendations (not implemented)

1. Add an explicit coverage instruction to evidence extraction, for example
   "extract every distinct claim, number, rule, and outcome; one item per fact",
   and re-run this rubric to measure the change.
2. Split TXT sources into paragraph-level spans with line ranges, so citations
   locate the passage.
3. Re-run with a long, multi-chunk book to test evidence merging and cost at
   realistic size before setting the daily cap.
4. Disable AFC in the Vertex generate config to keep worker logs pure JSON.

## Re-run after fixes (2026-10-17, afternoon)

Fixes from `plans/261017-1440-summary-coverage-and-txt-spans/plan.md`:
paragraph spans for TXT, shared coverage prompts, AFC disabled, thinking
level LOW, output ceiling raised. Same book, same rubric, fresh book rows.

| Run | Change | Outcome |
| --- | --- | --- |
| 2 | Coverage prompt, paragraph spans, 8,192 output tokens | **Failed.** Evidence JSON truncated at 8,178 output tokens (`invalid_structured_provider_output`). The ledger kept the $0.071 spent. |
| 3 | + thinking LOW, excerpts omitted | Completed, 11/12 coverage, but the summary body contained raw span UUIDs and ran about 1,000 words. |
| 4 | + summary prompt: no ids in body, combine facts, under ~600 words | **Completed.** Scored below. |

**Run 4 scores**

- **Coverage: 11.5 / 12 (96%)**, up from 5 / 12. Only item 11 is partial:
  the funding sources are listed, but not that sapling sales supplied most of the money.
- **Faithfulness: 0 / 5 traps triggered; no outside facts.** One qualifier
  was dropped ("roughly twice" became "doubled survival").
- **Citations: 32 summary citations, each at paragraph level** with
  `paragraph_number`, `line_start`, `line_end`. 42 spans for the book (was 1).
- **Logs: JSON only.** The SDK notice is gone.
- **Length:** 764 words for a 1,678-word book, over the ~600-word target.
  The title and subtitle run together, because the parser joins a paragraph's lines with spaces.

| Operation | Input tokens | Output tokens | Est. cost (USD) |
| --- | --- | --- | --- |
| evidence | 6,127 | 7,150 | 0.062816 |
| summary | 8,024 | 2,249 | 0.028904 |
| embedding | 2,673 | 0 | 0.000401 |
| **Total** | **16,824** | **9,399** | **0.092121** (3.9× run 1) |

Evidence items rose from 5 to 63, and generation took 56 s (was 21 s).

**Output ceiling.** Run 4's evidence call produced 7,150 output tokens for a
9.2 KB chunk, about 40 s of generation. A full 12,000-character chunk would
likely exceed 8,192 tokens or 60 s. So the ceiling is now 16,384 tokens and
the timeout 120 s, in the ConfigMap and `.env.example`. The chunk size is
unchanged, because lowering it could break existing EPUB and PDF sections.

**Long TXT books.** Offline, a 59,000-character TXT now builds 5 chunks.
Before the fix, any TXT over 12,000 characters failed permanently with
`SourceSpanChunkLimitError`.

### What this means for cost and the daily budget

At run 4's rate (about $0.092 per 1,678 words), a 100,000-word book would cost
roughly $4–5 at list price. The summary step's input also grows with the
evidence count, to several hundred thousand tokens. Two consequences:

- The planned $1/day cap would never finish a full-length book. Because a paused book
  restarts from scratch, it would spend the cap every day and never finish.
  Saving finished chunks (or a much higher cap) must come before phase 3.
- A single summary call over all evidence will not scale to long books. A
  hierarchical summary (per section, then the whole book) is needed.

## Artifacts

- Book: `plans/reports/eval-261017-1047-slow-orchard/the-slow-orchard.txt`
- Rubric: `plans/reports/eval-261017-1047-slow-orchard/expected-summary.md`
- Local book id: `f9d35964-f052-4f01-a464-406bdf082052` (local DB only)
- Backup before creating the book: `pre-eval-book.dump` in the session scratchpad

## Unresolved questions

1. Should the daily cap stay at $1 given about $1–1.5 per full book at list price?
2. Should coverage tuning (recommendation 1) become its own plan before Q&A work?
