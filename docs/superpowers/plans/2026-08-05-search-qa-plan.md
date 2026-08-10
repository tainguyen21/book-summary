# Search and Question Answering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make verified book evidence searchable by exact text and semantic similarity, then answer user questions only from resolved private evidence with valid source citations.

**Architecture:** PostgreSQL full-text search and pgvector generate independent candidate lists. A deterministic reciprocal-rank fusion layer merges them after owner and book filtering. Question answering receives a bounded evidence pack, produces a structured cited answer, and passes the existing citation and support validators before publication.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL full-text search, pgvector, Celery, Pydantic, pytest, Next.js, TypeScript, Vitest, Playwright

## Global Constraints

- Consume only published, verified evidence and summaries.
- Apply owner, book, and optional section filters before ranking.
- Keep PostgreSQL canonical for search records and embeddings.
- Use one deployment-wide embedding dimension for the initial release.
- Version embeddings by provider, model, input hash, and index version.
- Never use retrieval to choose which sections are summarized.
- Answer only from the bounded resolved evidence pack.
- Require valid source-span citations for every factual answer claim.
- Show incomplete or conflicting evidence instead of inventing an answer.
- Do not add web search, external knowledge, OCR, billing, or shared libraries.

---

### Task 1: Add lexical search documents and pgvector embeddings

**Files:**
- Create: `services/backend/alembic/versions/0005_search_tables.py`
- Create: `services/backend/src/bookwise/db/models/search.py`
- Create: `services/backend/tests/db/test_search_models.py`
- Modify: `services/backend/src/bookwise/config.py`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `EvidenceItem`, `Summary`, and `SourceSpan`.
- Produces: `SearchDocument` and `EmbeddingRecord`.
- Produces: configuration `embedding_dimensions` and `embedding_index_version`.

- [ ] **Step 1: Write failing search-model tests**

```python
async def test_search_document_is_owner_scoped(db, evidence_item):
    document = SearchDocument.from_evidence(evidence_item)
    assert document.owner_id == evidence_item.owner_id
    assert document.book_id == evidence_item.book_id

async def test_embedding_identity_is_versioned(db, evidence_item):
    first = EmbeddingRecord.for_evidence(
        evidence_item,
        provider="configured",
        model="embedding-model",
        index_version="v1",
    )
    duplicate = first.copy()
    db.add_all([first, duplicate])
    with pytest.raises(IntegrityError):
        await db.commit()
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/db/test_search_models.py -v
```

Expected: FAIL because search tables do not exist.

- [ ] **Step 3: Implement search schema**

Create:

```sql
search_documents(
  id uuid primary key,
  owner_id uuid not null,
  book_id uuid not null,
  structure_node_id uuid,
  source_type text not null,
  source_id uuid not null,
  title text,
  body text not null,
  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', body), 'B')
  ) stored
)
```

Add a GIN index on `search_vector` and owner/book indexes.

Create `embedding_records` with `embedding vector(1536)`, provider, model,
input hash, and index version. Startup must fail when configured embedding
dimensions are not 1536. Changing dimensions requires a migration and full
reindex.

- [ ] **Step 4: Apply migration and run tests**

Run:

```bash
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest services/backend/tests/db/test_search_models.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/alembic/versions/0005_search_tables.py services/backend/src/bookwise/db/models/search.py services/backend/src/bookwise/config.py services/backend/tests/db/test_search_models.py .env.example
git commit -m "feat: add full text and vector search schema"
```

### Task 2: Build versioned search documents and embeddings

**Files:**
- Create: `services/backend/src/bookwise/search/document_builder.py`
- Create: `services/backend/src/bookwise/search/embedding_service.py`
- Create: `services/backend/src/bookwise/worker/handlers/index_book.py`
- Create: `services/backend/tests/search/test_document_builder.py`
- Create: `services/backend/tests/search/test_embedding_service.py`

**Interfaces:**
- Consumes: verified evidence and published summaries.
- Consumes: owner-specific `ModelRoutingService` route for `embedding`.
- Produces: `SearchDocumentBuilder.build_for_book(book_id)`.
- Produces: `EmbeddingService.embed_missing(book_id, batch_size=64)`.

- [ ] **Step 1: Write failing document and embedding tests**

```python
async def test_builder_excludes_unsupported_evidence(builder, book):
    documents = await builder.build_for_book(book.id)
    assert all(document.source_id != book.unsupported_evidence.id for document in documents)

async def test_embedding_service_reuses_matching_hash(service, existing_record):
    count = await service.embed_missing(existing_record.book_id)
    assert count == 0
    assert service.provider.embed_call_count == 0
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_document_builder.py services/backend/tests/search/test_embedding_service.py -v
```

Expected: FAIL because search indexing services do not exist.

- [ ] **Step 3: Implement canonical search text and batching**

Build one search document per:

- Published evidence item.
- Published section summary.
- Published chapter, part, and whole-book summary.

Canonical embedding text is:

```text
{book_title}
{outline_path}
{source_type}
{body}
```

Hash this exact UTF-8 string. Batch at most 64 texts or the configured provider
token limit, whichever is reached first. Persist embeddings only after checking
the returned count and dimension.

When the owner has no confirmed embedding route, complete lexical indexing,
mark semantic indexing `needs_review` with issue code
`embedding_provider_choice_required`, and keep search available in lexical-only
mode. A private embedding route must return exactly 1536 values.

- [ ] **Step 4: Run indexing tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_document_builder.py services/backend/tests/search/test_embedding_service.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/search services/backend/src/bookwise/worker/handlers/index_book.py services/backend/tests/search
git commit -m "feat: index verified knowledge records"
```

### Task 3: Implement owner-filtered lexical and semantic retrieval

**Files:**
- Create: `services/backend/src/bookwise/search/contracts.py`
- Create: `services/backend/src/bookwise/search/lexical.py`
- Create: `services/backend/src/bookwise/search/vector.py`
- Create: `services/backend/tests/search/test_lexical_search.py`
- Create: `services/backend/tests/search/test_vector_search.py`

**Interfaces:**
- Produces: `SearchFilters(owner_id, book_ids, structure_node_ids)`.
- Produces: `LexicalSearch.search(query, filters, limit)`.
- Produces: `VectorSearch.search(query_embedding, filters, limit)`.
- Produces: `SearchCandidate`.

- [ ] **Step 1: Write failing retrieval tests**

```python
async def test_lexical_search_never_returns_another_users_document(
    lexical_search, user_a, user_b_document
):
    results = await lexical_search.search(
        "bounded context",
        SearchFilters(owner_id=user_a.id),
        limit=10,
    )
    assert user_b_document.id not in {result.document_id for result in results}

async def test_vector_search_honors_book_filter(vector_search, query_vector, book_a):
    results = await vector_search.search(
        query_vector,
        SearchFilters(owner_id=book_a.owner_id, book_ids=[book_a.id]),
        limit=10,
    )
    assert all(result.book_id == book_a.id for result in results)
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_lexical_search.py services/backend/tests/search/test_vector_search.py -v
```

Expected: FAIL because retrieval services do not exist.

- [ ] **Step 3: Implement filtered PostgreSQL queries**

Lexical ranking uses `ts_rank_cd(search_vector, websearch_to_tsquery(...))`.
Semantic ranking uses cosine distance:

```sql
1 - (embedding <=> :query_embedding) as score
```

Both queries include owner filters in SQL even though RLS is active. Reject
empty queries before reaching PostgreSQL.

- [ ] **Step 4: Run retrieval tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_lexical_search.py services/backend/tests/search/test_vector_search.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/search/contracts.py services/backend/src/bookwise/search/lexical.py services/backend/src/bookwise/search/vector.py services/backend/tests/search
git commit -m "feat: add private lexical and semantic retrieval"
```

### Task 4: Fuse, deduplicate, and rerank hybrid candidates

**Files:**
- Create: `services/backend/src/bookwise/search/hybrid.py`
- Create: `services/backend/src/bookwise/search/ranking.py`
- Create: `services/backend/tests/search/test_hybrid_search.py`

**Interfaces:**
- Consumes: lexical and vector candidate lists.
- Produces: `HybridSearch.search(query, filters, limit)`.
- Produces: deterministic `reciprocal_rank_fusion`.

- [ ] **Step 1: Write failing fusion tests**

```python
def test_reciprocal_rank_fusion_rewards_agreement():
    lexical = [candidate("a"), candidate("b")]
    semantic = [candidate("b"), candidate("c")]
    fused = reciprocal_rank_fusion(lexical, semantic, k=60)
    assert fused[0].document_id == "b"

def test_duplicate_source_is_returned_once():
    fused = reciprocal_rank_fusion(
        [candidate("a", source_id="same")],
        [candidate("b", source_id="same")],
        k=60,
    )
    assert len(fused) == 1
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_hybrid_search.py -v
```

Expected: FAIL because hybrid ranking does not exist.

- [ ] **Step 3: Implement deterministic fusion**

Use:

```python
score(document) = sum(1 / (60 + rank)) for each ranking containing document
```

Deduplicate by canonical `source_type` and `source_id`, retain the best source
location, and break ties by source order. Return lexical results when embedding
generation is temporarily unavailable.

- [ ] **Step 4: Run hybrid tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_hybrid_search.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/search/hybrid.py services/backend/src/bookwise/search/ranking.py services/backend/tests/search/test_hybrid_search.py
git commit -m "feat: fuse hybrid search candidates"
```

### Task 5: Build bounded evidence packs for questions

**Files:**
- Create: `services/backend/src/bookwise/search/evidence_pack.py`
- Create: `services/backend/tests/search/test_evidence_pack.py`

**Interfaces:**
- Consumes: ranked `SearchCandidate` values and source spans.
- Produces: `EvidencePackBuilder.build(candidates, token_budget)`.
- Produces: stable citation labels such as `S1`, `S2`, and `S3`.

- [ ] **Step 1: Write failing evidence-pack tests**

```python
async def test_pack_never_exceeds_token_budget(builder, candidates):
    pack = await builder.build(candidates, token_budget=1200)
    assert pack.token_count <= 1200

async def test_pack_keeps_source_and_outline_metadata(builder, candidates):
    pack = await builder.build(candidates, token_budget=1200)
    assert pack.items[0].citation_label == "S1"
    assert pack.items[0].outline_path
    assert pack.items[0].source_span_ids
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_evidence_pack.py -v
```

Expected: FAIL because the evidence-pack builder does not exist.

- [ ] **Step 3: Implement diversity-aware packing**

Iterate candidates by fused rank. Skip exact duplicates, limit any one section
to 40% of the token budget, and retain at least one candidate from each highly
ranked distinct chapter when space permits. Never truncate citation labels or
source IDs.

- [ ] **Step 4: Run evidence-pack tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_evidence_pack.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/search/evidence_pack.py services/backend/tests/search/test_evidence_pack.py
git commit -m "feat: build bounded question evidence packs"
```

### Task 6: Compose and validate cited answers

**Files:**
- Create: `services/backend/src/bookwise/search/answer_schema.py`
- Create: `services/backend/src/bookwise/search/prompts/answer_v1.md`
- Create: `services/backend/src/bookwise/search/question_answering.py`
- Create: `services/backend/tests/search/test_question_answering.py`

**Interfaces:**
- Consumes: `HybridSearch`, `EvidencePackBuilder`, `StructuredModelRunner`,
  citation validator, and support verifier.
- Produces: `QuestionAnsweringService.answer(question, filters)`.

- [ ] **Step 1: Write failing answer-policy tests**

```python
async def test_answer_uses_only_pack_citations(service, fake_provider):
    answer = await service.answer("What is bounded context?", filters)
    assert answer.claims[0].citation_labels == ["S1"]

async def test_no_evidence_returns_explicit_unknown(service):
    answer = await service.answer("What color is the author's car?", filters)
    assert answer.status == "insufficient_evidence"
    assert answer.claims == []
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_question_answering.py -v
```

Expected: FAIL because question answering does not exist.

- [ ] **Step 3: Implement structured cited answers**

```python
class AnswerClaim(BaseModel):
    text: str
    citation_labels: list[str] = Field(min_length=1)

class AnswerOutput(BaseModel):
    status: Literal["answered", "insufficient_evidence", "conflicting_evidence"]
    claims: list[AnswerClaim]
    caveat: str | None = None
```

The answer prompt forbids outside knowledge and instructs the model to return
`insufficient_evidence` when the pack does not support an answer. Resolve labels
back to source IDs, run citation integrity, and support-verify each claim.
Remove unsupported claims; if none remain, return `insufficient_evidence`.

- [ ] **Step 4: Run question-answering tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/search/test_question_answering.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/search/answer_schema.py services/backend/src/bookwise/search/prompts services/backend/src/bookwise/search/question_answering.py services/backend/tests/search/test_question_answering.py
git commit -m "feat: answer questions from cited evidence"
```

### Task 7: Expose search and question APIs

**Files:**
- Create: `services/backend/src/bookwise/api/routes/search.py`
- Create: `services/backend/src/bookwise/api/routes/questions.py`
- Create: `services/backend/tests/api/test_search_api.py`
- Create: `services/backend/tests/api/test_questions_api.py`

**Interfaces:**
- Produces: `GET /v1/search`.
- Produces: `POST /v1/questions`.
- Produces: resolved source locations and signed reader URLs.

- [ ] **Step 1: Write failing API tests**

```python
async def test_search_is_private_and_filterable(api_client, book):
    response = await api_client.get(
        "/v1/search",
        params={"q": "bounded context", "book_id": str(book.id)},
    )
    assert response.status_code == 200
    assert all(item["book_id"] == str(book.id) for item in response.json()["items"])

async def test_question_response_resolves_citations(api_client, book):
    response = await api_client.post(
        "/v1/questions",
        json={"question": "What is the method?", "book_ids": [str(book.id)]},
    )
    assert response.json()["claims"][0]["citations"][0]["source_span_id"]
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/api/test_search_api.py services/backend/tests/api/test_questions_api.py -v
```

Expected: FAIL because API routes do not exist.

- [ ] **Step 3: Implement validated query endpoints**

Search query length is 1-500 characters. Question length is 1-2000 characters.
Allow at most 20 selected books. Return HTTP 409 with
`search_index_incomplete` only when lexical indexing is incomplete. Missing
semantic embeddings set `semantic_search_available=false` and use lexical
retrieval.

Reader links use a source-location API, not a public object URL:

```text
GET /v1/books/{book_id}/source/{source_span_id}
```

The response includes a short-lived signed object URL plus page or EPUB
location.

- [ ] **Step 4: Run API tests**

Run:

```bash
uv run --project services/backend pytest services/backend/tests/api/test_search_api.py services/backend/tests/api/test_questions_api.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/bookwise/api/routes/search.py services/backend/src/bookwise/api/routes/questions.py services/backend/tests/api
git commit -m "feat: expose private search and question APIs"
```

### Task 8: Build the search, ask, and source-reader interface

**Files:**
- Create: `apps/web/src/app/search/page.tsx`
- Create: `apps/web/src/app/books/[bookId]/ask/page.tsx`
- Create: `apps/web/src/components/search/search-input.tsx`
- Create: `apps/web/src/components/search/search-results.tsx`
- Create: `apps/web/src/components/search/question-panel.tsx`
- Create: `apps/web/src/components/search/cited-answer.tsx`
- Create: `apps/web/src/components/book/source-viewer.tsx`
- Create: `apps/web/tests/search.test.tsx`
- Create: `apps/web/tests/question-panel.test.tsx`

**Interfaces:**
- Consumes: search, question, and source-location APIs.
- Produces: searchable private library and cited answer experience.

- [ ] **Step 1: Write failing interface tests**

```tsx
it("renders source path and opens the citation", async () => {
  render(<SearchResults results={[resultWithCitation]} />);
  expect(screen.getByText("Part I / Chapter 2")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Open source" }));
  expect(openSource).toHaveBeenCalledWith(resultWithCitation.sourceSpanId);
});

it("shows insufficient evidence without an invented answer", () => {
  render(<CitedAnswer answer={insufficientEvidenceAnswer} />);
  expect(screen.getByText("The selected books do not provide enough evidence.")).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --dir apps/web test -- search question-panel
```

Expected: FAIL because search components do not exist.

- [ ] **Step 3: Implement ergonomic search and source navigation**

Use one search input, book filter menu, and optional outline filter. Results
show type, book, outline path, source snippet, and an icon button to open the
source. Answers display claims with numbered citation buttons and visible
ambiguity or conflict warnings.

The source viewer opens the original PDF page or EPUB location and keeps the
answer visible beside it on desktop. On mobile, it opens as a full-screen
reader with a back control.

- [ ] **Step 4: Run interface tests**

Run:

```bash
pnpm --dir apps/web test -- search question-panel
pnpm --dir apps/web lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add searchable cited knowledge interface"
```

### Task 9: Verify the knowledge-base milestone end to end

**Files:**
- Create: `apps/web/tests/e2e/search-qa.spec.ts`
- Create: `apps/web/tests/e2e/helpers/books.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete search and question-answering flow.
- Produces: end-to-end cited retrieval checkpoint.

- [ ] **Step 1: Write the failing Playwright scenarios**

```ts
test("user searches and opens the original source", async ({ page }) => {
  await openCompletedFixtureBook(page);
  await page.goto("/search");
  await page.getByRole("searchbox").fill("bounded context");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Open source" }).first().click();
  await expect(page.getByText("Page 2")).toBeVisible();
});
```

Add scenarios for cited answers, insufficient evidence, conflicting evidence,
book filters, and cross-user result isolation.

- [ ] **Step 2: Run scenarios and verify failure**

Run:

```bash
pnpm --dir apps/web exec playwright test tests/e2e/search-qa.spec.ts
```

Expected: FAIL until indexing and UI integration are complete.

- [ ] **Step 3: Add deterministic search fixtures**

Seed lexical and vector records for the evaluation mini-book. Use a fixed fake
embedding function in tests:

```python
def fake_embedding(text: str) -> list[float]:
    digest = hashlib.sha256(text.encode()).digest()
    return [byte / 255 for byte in digest] * 48
```

Trim the vector to 1536 values.

Create:

```ts
export async function openCompletedFixtureBook(page: Page): Promise<void> {
  await signInAsInvitedUser(page, "reader@example.com");
  await page.goto("/library");
  await page.getByRole("link", { name: "mini-book.txt" }).click();
  await expect(page.getByText("Summary complete")).toBeVisible();
}
```

- [ ] **Step 4: Run the complete search checkpoint**

Run:

```bash
docker compose up -d
uv run --project services/backend alembic upgrade head
uv run --project services/backend pytest -v
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test tests/e2e/search-qa.spec.ts
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add .github README.md apps/web/tests/e2e/search-qa.spec.ts
git commit -m "test: verify searchable knowledge base"
```

## Plan Acceptance Checkpoint

The plan passes only when:

- Unsupported evidence never enters search documents.
- Every retrieval query applies owner filters before ranking.
- Lexical search remains available when the owner has no embedding route.
- Lexical search continues when embedding service is unavailable.
- Hybrid results are deterministic and deduplicated.
- Evidence packs stay within their token budget.
- Answers use only citation labels supplied in the evidence pack.
- Unsupported answer claims are removed.
- No-evidence questions return an explicit insufficient-evidence response.
- Users can open the original cited page or EPUB location.
- Cross-user documents never appear in search or answer citations.
