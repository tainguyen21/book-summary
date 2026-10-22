-- Part-by-part summaries of a long book. The worker reduces many evidence
-- records by summarizing consecutive groups first; the first level of those
-- group summaries is kept here so readers can read the book part by part.
-- Short books have none. Rows are written with their summary and never change.
CREATE TABLE data.generated_summary_sections (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    book_id UUID NOT NULL,
    generated_summary_id UUID NOT NULL
        REFERENCES data.generated_summaries(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 1),
    body TEXT NOT NULL CHECK (btrim(body) <> ''),
    -- Paragraphs -> sentences -> citations, as in generated_summaries.segments.
    segments JSONB NOT NULL CHECK (jsonb_typeof(segments) = 'array'),
    -- Numbered citations: source_span_id, citation_order, and span location.
    citations JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array'),
    -- Locations of the first and last source span the part covers.
    location_start JSONB NOT NULL CHECK (jsonb_typeof(location_start) = 'object'),
    location_end JSONB NOT NULL CHECK (jsonb_typeof(location_end) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_data_generated_summary_section_position UNIQUE (
        generated_summary_id,
        position
    )
);

CREATE INDEX ix_data_generated_summary_sections_owner_id
    ON data.generated_summary_sections(owner_id);

ALTER TABLE data.generated_summary_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_generated_summary_sections_owner_policy
    ON data.generated_summary_sections
    FOR ALL
    TO data_rw
    USING (owner_id = data.current_owner_id())
    WITH CHECK (owner_id = data.current_owner_id());

GRANT SELECT, INSERT ON data.generated_summary_sections TO data_rw;

-- Sections of the current accepted summary. The API filters by owner and book,
-- like the summary projections in migration 006.
CREATE VIEW data.book_current_summary_sections AS
SELECT
    section.generated_summary_id,
    section.owner_id,
    section.book_id,
    section.position,
    section.segments,
    section.citations,
    section.location_start,
    section.location_end
FROM data.generated_summary_sections AS section
JOIN data.book_current_summaries AS summary
    ON summary.id = section.generated_summary_id
    AND summary.owner_id = section.owner_id
    AND summary.book_id = section.book_id;

GRANT SELECT ON data.book_current_summary_sections TO app_rw;
