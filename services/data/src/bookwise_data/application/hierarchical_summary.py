"""Reduce many evidence records to a bounded set before the final summary.

Long books produce thousands of evidence records. Instead of sending them all
in one summary call, consecutive groups are summarized first; each group
summary becomes a record that cites only spans from its own group. This repeats
until one group fits, so every call stays bounded and citations stay grounded.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from typing import Any

from bookwise_data.domain.generation import (
    GeneratedEvidence,
    InvalidGenerationOutput,
    SummaryDraft,
    canonical_hash,
)

DEFAULT_SUMMARY_GROUP_RECORDS = 120

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
    """The group summary's citations; any span outside the group is rejected."""

    allowed = {span for record in group for span in record["source_span_ids"]}
    cited = [str(span_id) for span_id in dict.fromkeys(draft.source_span_ids)]
    if not cited or any(span_id not in allowed for span_id in cited):
        raise InvalidGenerationOutput(
            "invalid_section_summary_citation",
            "A section summary cited a source span outside its section.",
        )
    return cited


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
