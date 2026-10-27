"""Reduce many evidence records to a bounded set before the final summary.

Long books produce thousands of evidence records. Instead of sending them all
in one summary call, consecutive groups are summarized first; each group
summary becomes a record that cites only spans from its own group. This repeats
until one group fits, so every call stays bounded and citations stay grounded.
"""

from __future__ import annotations

import dataclasses
import itertools
import math
from collections.abc import Callable, Sequence
from typing import Any
from uuid import UUID

from bookwise_data.domain.generation import (
    GeneratedEvidence,
    GeneratedSummary,
    GeneratedSummarySection,
    GenerationSourceBook,
    InvalidGenerationOutput,
    PartTitlesOutput,
    SummaryDraft,
    SummaryParagraph,
    SummaryRefsOutput,
    SummarySentence,
    accepted_summary_section,
    canonical_hash,
)

DEFAULT_SUMMARY_GROUP_RECORDS = 120
# Keeps each sentence's quote list readable when it cites a whole part.
MAX_SENTENCE_CITATIONS = 12

SummaryRecord = dict[str, Any]
# Summarizes one group; receives the group's records and their input hash.
GroupSummarizer = Callable[[list[SummaryRecord], str], SummaryDraft]


def evidence_records(evidence: Sequence[GeneratedEvidence]) -> list[SummaryRecord]:
    """The records the summary prompt receives, in reading order."""

    return [
        {
            "evidence_id": str(item.id),
            "statement": item.statement,
            "evidence_type": item.evidence_type.value,
            "source_span_ids": [
                str(citation["source_span_id"]) for citation in item.citation_data
            ],
        }
        for item in evidence
    ]


def summary_prompt_records(records: Sequence[SummaryRecord]) -> list[dict[str, str]]:
    """Records as the summary prompt sees them: a short ref, not span UUIDs.

    A span UUID costs about 35 output tokens, so citing a long book's parts by
    span ID ran past the output limit.
    """

    return [
        {
            "ref": _record_ref(index),
            "statement": record["statement"],
            "evidence_type": record["evidence_type"],
        }
        for index, record in enumerate(records, start=1)
    ]


def draft_from_refs(
    records: Sequence[SummaryRecord],
    output: SummaryRefsOutput,
) -> SummaryDraft:
    """Resolve each sentence's record refs to the records' source spans.

    Spans are taken in turn from each cited record, so every record keeps a
    citation when a sentence hits ``MAX_SENTENCE_CITATIONS``. Unknown refs are
    dropped.
    """

    spans_by_ref = {
        _record_ref(index): record["source_span_ids"]
        for index, record in enumerate(records, start=1)
    }

    def spans(refs: list[str]) -> list[str]:
        cited = [
            spans_by_ref[ref]
            for ref in dict.fromkeys(ref.strip() for ref in refs)
            if ref in spans_by_ref
        ]
        interleaved = dict.fromkeys(
            span
            for row in itertools.zip_longest(*cited)
            for span in row
            if span is not None
        )
        return list(interleaved)[:MAX_SENTENCE_CITATIONS]

    return SummaryDraft(
        paragraphs=[
            SummaryParagraph(
                sentences=[
                    SummarySentence(
                        text=sentence.text,
                        source_span_ids=spans(sentence.record_refs),
                    )
                    for sentence in paragraph.sentences
                ]
            )
            for paragraph in output.paragraphs
        ]
    )


def _record_ref(index: int) -> str:
    return f"r{index}"


def balanced_groups(
    records: Sequence[SummaryRecord],
    group_size: int,
) -> list[list[SummaryRecord]]:
    """Split into ``ceil(n / size)`` consecutive groups of near-equal size."""

    group_count = math.ceil(len(records) / group_size)
    base, extra = divmod(len(records), group_count)
    groups: list[list[SummaryRecord]] = []
    start = 0
    for index in range(group_count):
        end = start + base + (1 if index < extra else 0)
        groups.append(list(records[start:end]))
        start = end
    return groups


def group_input_hash(records: Sequence[SummaryRecord]) -> str:
    return canonical_hash(list(records))


def reduce_records(
    records: list[SummaryRecord],
    group_size: int,
    summarize: GroupSummarizer,
) -> list[SummaryRecord]:
    """Summarize groups until at most ``group_size`` records remain."""

    level = 0
    while len(records) > group_size:
        level += 1
        records = [
            _section_record(
                level, index, group, summarize(group, group_input_hash(group))
            )
            for index, group in enumerate(balanced_groups(records, group_size), start=1)
        ]
    return records


def section_citations(
    group: Sequence[SummaryRecord],
    draft: SummaryDraft,
) -> list[str]:
    """The group summary's citations; spans outside the group are dropped.

    The draft is rejected only when none of its citations are in the group.
    """

    allowed = {span for record in group for span in record["source_span_ids"]}
    cited = [
        span_id
        for span_id in map(str, dict.fromkeys(draft.source_span_ids))
        if span_id in allowed
    ]
    if not cited:
        raise InvalidGenerationOutput(
            "invalid_section_summary_citation",
            "No section summary citation was inside its section.",
        )
    return cited


def summary_sections(
    summary: GeneratedSummary,
    source: GenerationSourceBook,
    evidence: Sequence[GeneratedEvidence],
    parts: Sequence[tuple[Sequence[SummaryRecord], SummaryDraft]],
) -> tuple[GeneratedSummarySection, ...]:
    """Turn the first-level groups and their drafts into part summaries."""

    evidence_by_id = {str(item.id): item for item in evidence}
    span_by_id = {str(span.id): span for span in source.spans}
    sections = []
    for position, (group, draft) in enumerate(parts, start=1):
        group_evidence = [evidence_by_id[record["evidence_id"]] for record in group]
        group_spans = {
            span_id: span_by_id[span_id]
            for record in group
            for span_id in record["source_span_ids"]
        }
        sections.append(
            accepted_summary_section(
                summary,
                position,
                draft,
                [UUID(span_id) for span_id in section_citations(group, draft)],
                group_evidence,
                list(group_spans.values()),
            )
        )
    return tuple(sections)


MAX_PART_TITLE_CHARS = 200


def part_title_inputs(
    sections: Sequence[GeneratedSummarySection],
) -> list[dict[str, Any]]:
    """What the titling prompt receives: each part's summary by position."""

    return [
        {"position": section.position, "summary": section.body} for section in sections
    ]


def titled_sections(
    sections: Sequence[GeneratedSummarySection],
    output: PartTitlesOutput,
) -> tuple[GeneratedSummarySection, ...]:
    """Attach returned titles by position; a part without one keeps None."""

    titles: dict[int, str] = {}
    for item in output.titles:
        title = " ".join(item.title.split()).strip("\"'“”‘’ ")
        if title:
            titles.setdefault(item.position, title[:MAX_PART_TITLE_CHARS])
    return tuple(
        dataclasses.replace(section, title=titles.get(section.position))
        for section in sections
    )


def _section_record(
    level: int,
    index: int,
    group: Sequence[SummaryRecord],
    draft: SummaryDraft,
) -> SummaryRecord:
    """Turn a validated group summary into a record for the next level."""

    cited = section_citations(group, draft)
    return {
        "evidence_id": f"section-{level}-{index}",
        "statement": draft.body.strip(),
        "evidence_type": "section_summary",
        "source_span_ids": cited,
    }
