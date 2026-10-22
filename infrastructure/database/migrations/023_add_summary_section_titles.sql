-- A short model-written title for each part of a long book. NULL when titling
-- failed or was skipped; the reader then shows only the part number. The title
-- is the one column the worker may change, so parts saved without a title can
-- be titled later without regenerating them.
ALTER TABLE data.generated_summary_sections
    ADD COLUMN title VARCHAR(200)
    CHECK (title IS NULL OR btrim(title) <> '');

GRANT UPDATE (title) ON data.generated_summary_sections TO data_rw;

-- Same projection as migration 022 with the title appended.
CREATE OR REPLACE VIEW data.book_current_summary_sections AS
SELECT
    section.generated_summary_id,
    section.owner_id,
    section.book_id,
    section.position,
    section.segments,
    section.citations,
    section.location_start,
    section.location_end,
    section.title
FROM data.generated_summary_sections AS section
JOIN data.book_current_summaries AS summary
    ON summary.id = section.generated_summary_id
    AND summary.owner_id = section.owner_id
    AND summary.book_id = section.book_id;
