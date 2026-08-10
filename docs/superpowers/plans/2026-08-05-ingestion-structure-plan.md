# Ingestion and Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert uploaded PDF, EPUB, DOCX, and TXT books into validated structure trees, source spans, normalized artifacts, and section-bounded token chunks.

**Architecture:** Format-specific parsers emit one common normalized document contract. A deterministic structure builder prefers embedded outlines, falls back to heading evidence, and requires user review below a confidence threshold. The ingestion worker persists immutable source spans, writes a normalized JSONL artifact, and creates chunks that never cross leaf-section boundaries.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Alembic, Pydantic, Celery, PostgreSQL, S3-compatible storage, PyMuPDF, EbookLib, Beautiful Soup, python-docx, pytest, Next.js, Vitest, Playwright

## Global Constraints

- Consume the platform contracts from `2026-08-05-platform-upload-plan.md`.
- Support only selectable-text PDF, EPUB, DOCX, and TXT.
- Preserve page, EPUB, paragraph, and character location data when available.
- Never allow a chunk to cross a leaf-section boundary.
- Keep normalized text semantically unchanged.
- Mark uncertain structure as `needs_review` instead of pretending it is complete.
- Persist PostgreSQL records before publishing ingestion completion.
- Store normalized artifacts in private object storage under the book owner.
- Make parser, structure, and chunking outputs versioned and idempotent.
- Do not add model calls, evidence extraction, summaries, embeddings, or OCR.

---

### Task 1: Add ingestion domain contracts and canonical tables

**Files:**
- Create: `services/backend/alembic/versions/0003_ingestion_tables.py`
- Create: `services/backend/src/bookwise/ingestion/contracts.py`
- Create: `services/backend/src/bookwise/db/models/structure.py`
- Create: `services/backend/src/bookwise/db/models/source.py`
- Create: `services/backend/src/bookwise/db/models/coverage.py`
- Create: `services/backend/tests/ingestion/test_contracts.py`
- Create: `services/backend/tests/db/test_ingestion_models.py`

**Interfaces:**
- Consumes: `Book`, `BookObject`, and `ProcessingJob`.
- Produces: `ParsedDocument`, `NormalizedBlock`, `OutlineEntry`, and `SourceLocator`.
- Produces: `StructureNode`, `SourceSpan`, `Chunk`, and `CoverageEntry`.
- Produces: stable `StructureKind` and `CoverageStatus` enums.

- [ ] **Step 1: Write failing contract and model tests**

```python
from bookwise.ingestion.contracts import NormalizedBlock, SourceLocator

def test_normalized_block_requires_source_locator() -> None:
    block = NormalizedBlock(
        sequence=3,
        kind="paragraph",
        text="A bounded source paragraph.",
        locator=SourceLocator(page=12, start_offset=40, end_offset=67),
    )
    assert block.locator.page == 12
    assert block.text == "A bounded source paragraph."
```

```python
from bookwise.db.models.coverage import CoverageStatus

def test_coverage_states_match_the_spec() -> None:
    assert {state.value for state in CoverageStatus} == {
        "pending",
        "processing",
        "complete",
        "retryable_failed",
        "permanent_failed",
        "needs_review",
    }
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_contracts.py services/backend/tests/db/test_ingestion_models.py -v
```

Expected: FAIL because ingestion contracts and tables do not exist.

- [ ] **Step 3: Implement immutable contracts and models**

```python
@dataclass(frozen=True)
class SourceLocator:
    page: int | None = None
    epub_href: str | None = None
    paragraph_index: int | None = None
    start_offset: int = 0
    end_offset: int = 0

@dataclass(frozen=True)
class NormalizedBlock:
    sequence: int
    kind: Literal["heading", "paragraph", "list", "table", "code", "footnote"]
    text: str
    locator: SourceLocator
    heading_level: int | None = None

@dataclass(frozen=True)
class ParsedDocument:
    title: str | None
    language: str | None
    blocks: tuple[NormalizedBlock, ...]
    embedded_outline: tuple["OutlineEntry", ...]
    parser_version: str
```

The migration creates:

- `structure_nodes` with parent ID, kind, title, ordinal, depth, confidence,
  and review status.
- `source_spans` with structure node, normalized text, locator JSON, sequence,
  and SHA-256 hash.
- `chunks` with source-span range, token count, chunking version, and hash.
- `coverage_entries` with target type, target ID, state, and failure metadata.

Add unique constraints on versioned identities and owner indexes for RLS.

- [ ] **Step 4: Apply the migration and run tests**

Run:

```bash
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest services/backend/tests/ingestion/test_contracts.py services/backend/tests/db/test_ingestion_models.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/alembic/versions/0003_ingestion_tables.py services/backend/src/bookwise/ingestion services/backend/src/bookwise/db/models services/backend/tests
git commit -m "feat: add ingestion contracts and schema"
```

### Task 2: Implement the parser registry and TXT/DOCX parsers

**Files:**
- Create: `services/backend/src/bookwise/ingestion/parsers/base.py`
- Create: `services/backend/src/bookwise/ingestion/parsers/registry.py`
- Create: `services/backend/src/bookwise/ingestion/parsers/text.py`
- Create: `services/backend/src/bookwise/ingestion/parsers/docx.py`
- Create: `services/backend/tests/fixtures/ingestion/sample.txt`
- Create: `services/backend/tests/fixtures/ingestion/sample.docx`
- Create: `services/backend/tests/ingestion/test_text_parser.py`
- Create: `services/backend/tests/ingestion/test_docx_parser.py`
- Modify: `services/backend/pyproject.toml`

**Interfaces:**
- Produces: `DocumentParser.parse(path: Path) -> ParsedDocument`.
- Produces: `ParserRegistry.for_content_type(content_type: str)`.

- [ ] **Step 1: Write failing TXT and DOCX parser tests**

```python
def test_text_parser_preserves_paragraph_order(text_parser, fixture_path) -> None:
    parsed = text_parser.parse(fixture_path("sample.txt"))
    assert [block.text for block in parsed.blocks] == [
        "Chapter One",
        "First paragraph.",
        "Second paragraph.",
    ]
    assert parsed.blocks[0].kind == "heading"
```

```python
def test_docx_parser_maps_heading_levels(docx_parser, fixture_path) -> None:
    parsed = docx_parser.parse(fixture_path("sample.docx"))
    headings = [block for block in parsed.blocks if block.kind == "heading"]
    assert [(item.text, item.heading_level) for item in headings] == [
        ("Part I", 1),
        ("Chapter 1", 2),
    ]
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_text_parser.py services/backend/tests/ingestion/test_docx_parser.py -v
```

Expected: FAIL because parser modules do not exist.

- [ ] **Step 3: Implement registry, plain text, and DOCX parsing**

```python
class DocumentParser(Protocol):
    content_types: frozenset[str]
    parser_version: str

    def parse(self, path: Path) -> ParsedDocument: ...

class ParserRegistry:
    def __init__(self, parsers: Sequence[DocumentParser]) -> None:
        self._by_content_type = {
            content_type: parser
            for parser in parsers
            for content_type in parser.content_types
        }

    def for_content_type(self, content_type: str) -> DocumentParser:
        try:
            return self._by_content_type[content_type]
        except KeyError as exc:
            raise UnsupportedDocumentType(content_type) from exc
```

TXT parsing treats Markdown-style headings and short title-like lines as
heading candidates but records their confidence below explicit DOCX heading
styles. DOCX parsing uses paragraph styles and preserves tables as table blocks.
Add `python-docx` to backend dependencies.

- [ ] **Step 4: Run parser tests**

Run:

```bash
uv sync --project services/backend
uv run --project services/backend pytest services/backend/tests/ingestion/test_text_parser.py services/backend/tests/ingestion/test_docx_parser.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/pyproject.toml services/backend/src/bookwise/ingestion/parsers services/backend/tests
git commit -m "feat: parse text and docx books"
```

### Task 3: Implement selectable-text PDF parsing

**Files:**
- Create: `services/backend/src/bookwise/ingestion/parsers/pdf.py`
- Create: `services/backend/tests/fixtures/ingestion/sample.pdf`
- Create: `services/backend/tests/fixtures/ingestion/repeated-headers.pdf`
- Create: `services/backend/tests/ingestion/test_pdf_parser.py`
- Modify: `services/backend/pyproject.toml`

**Interfaces:**
- Consumes: `DocumentParser`.
- Produces: PDF `NormalizedBlock` records with one-based page locators.
- Produces: embedded outline entries when the PDF contains bookmarks.

- [ ] **Step 1: Write failing PDF parser tests**

```python
def test_pdf_parser_preserves_page_locations(pdf_parser, fixture_path) -> None:
    parsed = pdf_parser.parse(fixture_path("sample.pdf"))
    paragraph = next(block for block in parsed.blocks if "bounded context" in block.text)
    assert paragraph.locator.page == 2
    assert paragraph.locator.end_offset > paragraph.locator.start_offset
```

```python
def test_repeated_headers_are_removed(pdf_parser, fixture_path) -> None:
    parsed = pdf_parser.parse(fixture_path("repeated-headers.pdf"))
    texts = [block.text for block in parsed.blocks]
    assert "Example Book Title" not in texts
    assert "Unique body paragraph." in texts
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_pdf_parser.py -v
```

Expected: FAIL because `PdfParser` does not exist.

- [ ] **Step 3: Implement PyMuPDF block extraction**

Use `page.get_text("dict")`, sort blocks by vertical then horizontal position,
join spans by line, and preserve page-local offsets.

Add `pymupdf` to backend dependencies.

Detect repeated headers and footers by normalizing text in the top and bottom
10% of each page. Remove a candidate only when it appears on at least 60% of
pages and is shorter than 120 characters. Keep the removal decision in parser
metadata for audit.

Reject PDFs with no extractable non-whitespace body text using
`SelectableTextRequired`.

- [ ] **Step 4: Run PDF tests**

Run:

```bash
uv sync --project services/backend
uv run --project services/backend pytest services/backend/tests/ingestion/test_pdf_parser.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/pyproject.toml services/backend/src/bookwise/ingestion/parsers/pdf.py services/backend/tests
git commit -m "feat: parse selectable text pdf books"
```

### Task 4: Implement EPUB parsing

**Files:**
- Create: `services/backend/src/bookwise/ingestion/parsers/epub.py`
- Create: `services/backend/tests/fixtures/ingestion/sample.epub`
- Create: `services/backend/tests/ingestion/test_epub_parser.py`
- Modify: `services/backend/pyproject.toml`

**Interfaces:**
- Consumes: `DocumentParser`.
- Produces: EPUB blocks with `epub_href` and document-local offsets.
- Produces: spine-ordered embedded outline entries.

- [ ] **Step 1: Write failing EPUB tests**

```python
def test_epub_parser_follows_spine_order(epub_parser, fixture_path) -> None:
    parsed = epub_parser.parse(fixture_path("sample.epub"))
    headings = [block.text for block in parsed.blocks if block.kind == "heading"]
    assert headings == ["Introduction", "Chapter One", "Chapter Two"]

def test_epub_locator_contains_href(epub_parser, fixture_path) -> None:
    parsed = epub_parser.parse(fixture_path("sample.epub"))
    assert parsed.blocks[0].locator.epub_href == "intro.xhtml"
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_epub_parser.py -v
```

Expected: FAIL because `EpubParser` does not exist.

- [ ] **Step 3: Implement spine and navigation parsing**

Use EbookLib for package/spine metadata and Beautiful Soup for XHTML content.
Process only linear spine documents. Convert `h1` through `h6`, paragraphs,
lists, tables, and preformatted content to normalized blocks. Resolve the EPUB
navigation document into `OutlineEntry` values.

Add `ebooklib`, `beautifulsoup4`, and `lxml` to backend dependencies.

- [ ] **Step 4: Run EPUB tests**

Run:

```bash
uv sync --project services/backend
uv run --project services/backend pytest services/backend/tests/ingestion/test_epub_parser.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/pyproject.toml services/backend/src/bookwise/ingestion/parsers/epub.py services/backend/tests
git commit -m "feat: parse epub books"
```

### Task 5: Build the deterministic structure tree

**Files:**
- Create: `services/backend/src/bookwise/ingestion/structure.py`
- Create: `services/backend/src/bookwise/ingestion/structure_confidence.py`
- Create: `services/backend/tests/ingestion/test_structure_builder.py`

**Interfaces:**
- Consumes: `ParsedDocument`.
- Produces: `StructureTree(root, nodes, confidence, requires_review)`.
- Produces: every block assigned to exactly one leaf node.

- [ ] **Step 1: Write failing structure tests**

```python
def test_embedded_outline_wins_over_heading_heuristics(builder, parsed_document):
    tree = builder.build(parsed_document.with_conflicting_heading_candidates())
    assert tree.find("Chapter 1").source == "embedded_outline"

def test_every_block_is_owned_by_one_leaf(builder, parsed_document):
    tree = builder.build(parsed_document)
    assigned = [block_id for node in tree.leaves for block_id in node.block_ids]
    assert sorted(assigned) == list(range(len(parsed_document.blocks)))
```

Add tests for skipped heading levels, duplicate titles, front matter, appendices,
and no detected headings.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_structure_builder.py -v
```

Expected: FAIL because `StructureBuilder` does not exist.

- [ ] **Step 3: Implement outline precedence and confidence**

Confidence uses explicit weighted evidence:

```python
score = (
    0.55 * embedded_outline_coverage
    + 0.20 * heading_sequence_consistency
    + 0.15 * block_assignment_coverage
    + 0.10 * title_alignment
)
requires_review = score < 0.80
```

When no headings exist, create one leaf section named `Full text` with
`requires_review=True`. Never drop front matter or appendix blocks.

- [ ] **Step 4: Run structure tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_structure_builder.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/ingestion/structure.py services/backend/src/bookwise/ingestion/structure_confidence.py services/backend/tests/ingestion/test_structure_builder.py
git commit -m "feat: reconstruct reviewable book structure"
```

### Task 6: Persist normalized artifacts and source hashes

**Files:**
- Create: `services/backend/src/bookwise/ingestion/persistence.py`
- Create: `services/backend/src/bookwise/ingestion/artifacts.py`
- Create: `services/backend/tests/ingestion/test_ingestion_persistence.py`

**Interfaces:**
- Consumes: `StructureTree`, `ParsedDocument`, and `ObjectStorage.upload_file`.
- Produces: `persist_normalized_document(book_id, parsed, tree) -> PersistedIngestion`.
- Produces: owner-scoped `normalized.jsonl` object.

- [ ] **Step 1: Write failing persistence tests**

```python
async def test_source_hash_matches_persisted_text(persistence, parsed, tree):
    result = await persistence.persist(parsed=parsed, tree=tree)
    span = result.source_spans[0]
    assert span.sha256 == hashlib.sha256(span.text.encode("utf-8")).hexdigest()

async def test_persist_is_idempotent(persistence, parsed, tree):
    first = await persistence.persist(parsed=parsed, tree=tree)
    second = await persistence.persist(parsed=parsed, tree=tree)
    assert second.run_id == first.run_id
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_ingestion_persistence.py -v
```

Expected: FAIL because persistence services do not exist.

- [ ] **Step 3: Implement transaction-first persistence**

Serialize one JSON object per source span:

```json
{"span_id":"11111111-1111-4111-8111-111111111111","node_id":"22222222-2222-4222-8222-222222222222","sequence":1,"text":"Bounded source text.","locator":{"page":4},"sha256":"eaf1227c32af566b97004b0b4c930a54944c476ecf772d09e307f65124d1ce69"}
```

Insert structure nodes and source spans in one PostgreSQL transaction. After
commit, upload the JSONL artifact. Then update the artifact object record in a
second transaction. If upload fails, retain canonical rows and schedule an
artifact retry.

- [ ] **Step 4: Run persistence tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_ingestion_persistence.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/ingestion/persistence.py services/backend/src/bookwise/ingestion/artifacts.py services/backend/tests/ingestion/test_ingestion_persistence.py
git commit -m "feat: persist normalized source spans"
```

### Task 7: Create section-bounded token chunks

**Files:**
- Create: `services/backend/src/bookwise/models/tokens.py`
- Create: `services/backend/src/bookwise/ingestion/chunking.py`
- Create: `services/backend/tests/ingestion/test_chunking.py`

**Interfaces:**
- Produces: `TokenCounter.count(text: str) -> int`.
- Produces: `ChunkBudget(max_context, instruction_tokens, output_tokens, retry_tokens)`.
- Produces: `SectionChunker.chunk(node, spans, budget) -> list[ChunkDraft]`.

- [ ] **Step 1: Write failing chunking tests**

```python
def test_chunks_never_cross_sections(chunker, section_a, section_b, budget):
    chunks = chunker.chunk_many([section_a, section_b], budget)
    assert all(len({span.node_id for span in chunk.spans}) == 1 for chunk in chunks)

def test_oversized_paragraph_splits_with_exact_offsets(chunker, long_span, budget):
    chunks = chunker.chunk(long_span.node, [long_span], budget)
    assert "".join(chunk.text for chunk in chunks) == long_span.text
    assert chunks[-1].end_offset == long_span.locator.end_offset
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_chunking.py -v
```

Expected: FAIL because token and chunking modules do not exist.

- [ ] **Step 3: Implement model-aware chunk budgets**

```python
@dataclass(frozen=True)
class ChunkBudget:
    max_context: int
    instruction_tokens: int
    output_tokens: int
    retry_tokens: int

    @property
    def source_tokens(self) -> int:
        return (
            self.max_context
            - self.instruction_tokens
            - self.output_tokens
            - self.retry_tokens
        )
```

Append whole blocks while they fit. Split only an oversized block, preferring
sentence boundaries, then word boundaries. Persist exact source offsets for
every split.

- [ ] **Step 4: Run chunking tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_chunking.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/models/tokens.py services/backend/src/bookwise/ingestion/chunking.py services/backend/tests/ingestion/test_chunking.py
git commit -m "feat: add section bounded token chunking"
```

### Task 8: Orchestrate the ingestion job and coverage states

**Files:**
- Create: `services/backend/src/bookwise/ingestion/workflow.py`
- Create: `services/backend/src/bookwise/worker/handlers/ingest_book.py`
- Modify: `services/backend/src/bookwise/worker/tasks.py`
- Create: `services/backend/tests/ingestion/test_ingestion_workflow.py`

**Interfaces:**
- Consumes: parser registry, structure builder, persistence, and chunker.
- Produces: `IngestionWorkflow.run(book_id: UUID) -> IngestionOutcome`.
- Produces: `ingest_book` job handler.

- [ ] **Step 1: Write failing workflow tests**

```python
async def test_low_confidence_outline_requires_review(workflow, uploaded_book):
    outcome = await workflow.run(uploaded_book.id)
    assert outcome.status == "needs_review"
    assert await coverage_state(uploaded_book.id) == "needs_review"

async def test_successful_ingestion_creates_chunk_coverage(workflow, uploaded_book):
    outcome = await workflow.run(uploaded_book.id)
    assert outcome.status == "complete"
    assert all(entry.status == "complete" for entry in outcome.chunk_coverage)
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_ingestion_workflow.py -v
```

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Implement checkpointed orchestration**

The handler sequence is:

```text
materialize object
-> parse
-> build structure
-> persist structure and spans
-> stop for review when required
-> create chunks
-> complete ingestion coverage
-> create canonical queued extract_evidence jobs
```

Before the evidence plan is implemented, the dispatcher recognizes that
`extract_evidence` has no registered handler and leaves those canonical jobs
queued without publishing Redis deliveries. The evidence plan registers the
handler and the reconciler publishes the waiting jobs.

Map unsupported format and empty text to `permanent_failed`; map temporary
storage and database errors to `retryable_failed`.

- [ ] **Step 4: Run workflow tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/ingestion/test_ingestion_workflow.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/ingestion/workflow.py services/backend/src/bookwise/worker services/backend/tests/ingestion/test_ingestion_workflow.py
git commit -m "feat: orchestrate resumable book ingestion"
```

### Task 9: Add outline review APIs and interface

**Files:**
- Create: `services/backend/src/bookwise/api/routes/outline.py`
- Create: `services/backend/src/bookwise/domain/outline_review.py`
- Create: `services/backend/tests/api/test_outline_review.py`
- Create: `apps/web/src/app/books/[bookId]/outline/page.tsx`
- Create: `apps/web/src/components/outline/outline-tree.tsx`
- Create: `apps/web/src/components/outline/outline-review.tsx`
- Create: `apps/web/tests/outline-review.test.tsx`

**Interfaces:**
- Produces: `GET /v1/books/{book_id}/outline`.
- Produces: `PUT /v1/books/{book_id}/outline`.
- Produces: `POST /v1/books/{book_id}/outline/confirm`.

- [ ] **Step 1: Write failing API and component tests**

```python
async def test_confirmed_outline_requeues_ingestion(api_client, review_book):
    response = await api_client.post(f"/v1/books/{review_book.id}/outline/confirm")
    assert response.status_code == 202
    assert response.json()["status"] == "queued"
```

```tsx
it("shows confidence and permits reparenting a section", async () => {
  render(<OutlineReview initialTree={uncertainTree} />);
  expect(screen.getByText("Needs review")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Move Chapter 2" }));
  expect(onChange).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/api/test_outline_review.py -v
pnpm --dir apps/web test -- outline-review
```

Expected: FAIL because review APIs and components do not exist.

- [ ] **Step 3: Implement validated outline editing**

The API accepts a complete ordered tree with stable node IDs. Validate:

- Exactly one root.
- No cycles.
- Every source span belongs to one leaf.
- Sibling ordinals are unique and contiguous.
- Owner matches the authenticated principal.

Confirmation creates a new structure version, rebuilds chunks, marks the prior
version superseded, and requeues ingestion from the chunking checkpoint.

- [ ] **Step 4: Run review tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/api/test_outline_review.py -v
pnpm --dir apps/web test -- outline-review
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/api/routes/outline.py services/backend/src/bookwise/domain/outline_review.py services/backend/tests/api apps/web
git commit -m "feat: add reviewable book outlines"
```

### Task 10: Verify the ingestion milestone end to end

**Files:**
- Create: `apps/web/tests/e2e/ingestion.spec.ts`
- Create: `services/backend/tests/fixtures/ingestion/long-book.txt`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete ingestion pipeline.
- Produces: verified structure and chunk inspection flow.

- [ ] **Step 1: Write the failing end-to-end scenarios**

```ts
test("uploaded book becomes a complete reviewable outline", async ({ page }) => {
  await signInAsInvitedUser(page, "reader@example.com");
  await uploadFixture(page, "tests/fixtures/long-book.txt");
  await expect(page.getByText("Ingestion complete")).toBeVisible();
  await page.getByRole("link", { name: "View outline" }).click();
  await expect(page.getByText("Chapter 1")).toBeVisible();
  await expect(page.getByText("Chapter 2")).toBeVisible();
});
```

Add a second scenario that uploads a low-confidence TXT file, reviews its
outline, confirms it, and observes resumed ingestion.

- [ ] **Step 2: Run scenarios and verify failure**

Run:

```bash
pnpm --dir apps/web exec playwright test tests/e2e/ingestion.spec.ts
```

Expected: FAIL until polling, worker execution, and outline pages are integrated.

- [ ] **Step 3: Wire progress events and deterministic fixtures**

Expose `GET /v1/books/{book_id}/processing` with stage, completed units, total
units, and issue codes. The UI must show parser, structure, and chunking stages
without claiming summarization has started.

- [ ] **Step 4: Run the complete ingestion checkpoint**

Run:

```bash
docker compose up -d
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest -v
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test tests/e2e/ingestion.spec.ts
```

Expected: all commands pass for PDF, EPUB, DOCX, and TXT fixtures.

- [ ] **Step 5: Commit**

```bash
git add .github README.md apps/web/tests/e2e/ingestion.spec.ts services/backend/tests/fixtures/ingestion/long-book.txt
git commit -m "test: verify structured ingestion milestone"
```

## Plan Acceptance Checkpoint

The plan passes only when:

- Each supported format produces normalized text and source locators.
- Empty or scanned-only PDFs fail explicitly with `permanent_failed`.
- Embedded outlines take precedence over heuristics.
- Low-confidence structure requires review.
- Every source block belongs to exactly one leaf section.
- Every chunk contains source spans from exactly one leaf section.
- Normalized artifacts and database text have matching hashes.
- Retrying ingestion creates no duplicate nodes, spans, chunks, or coverage.
- The web UI shows and repairs uncertain outlines.
