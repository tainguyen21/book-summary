/**
 * On-demand answer evaluation for "Ask a book": asks one book every golden
 * question (skipping the answer cache), has the model judge each answer, and
 * writes a Markdown report. Spends real tokens, recorded in the usage ledger.
 *
 * pnpm --dir services/api eval:ask -- --owner <ownerId> --book <bookId> \
 *   --set evaluation/the-slow-orchard.questions.json --out <report.md>
 */
import { config as loadEnvironment } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Pool } from "pg";

import {
  answerGeneratorFromEnvironment,
  dailyBudgetFromEnvironment,
  queryEmbedderFromEnvironment,
} from "../app.module";
import { AskUseCase } from "../application/ask/ask.use-case";
import type { AnswerSource } from "../domain/ask/ask";
import { parseModelPricing } from "../domain/search/model-pricing";
import { AppUsageRecorder } from "../infrastructure/database/app-usage.recorder";
import { AskRepository } from "../infrastructure/database/ask.repository";
import { SearchRepository } from "../infrastructure/database/search.repository";
import { UsageReadRepository } from "../infrastructure/database/usage-read.repository";
import {
  judgeAnswer,
  type GoldenQuestion,
  type Judgement,
} from "./answer-judge";

loadEnvironment({ path: resolve(__dirname, "../../../../.env"), quiet: true });

interface Row {
  golden: GoldenQuestion;
  answered: boolean;
  answer: string;
  error?: string;
  firstTextMs?: number;
  totalMs: number;
  markers: number;
  matchedQuotes: number;
  judgement?: Judgement;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

async function main() {
  const { values } = parseArgs({
    options: {
      owner: { type: "string" },
      book: { type: "string" },
      set: { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.owner || !values.book || !values.set || !values.out) {
    throw new Error(
      "Usage: --owner <id> --book <id> --set <questions.json> --out <report.md>",
    );
  }
  const generator = answerGeneratorFromEnvironment();
  if (!generator) {
    throw new Error(
      "Answering is not configured (BOOKWISE_MODEL_PROVIDER=vertex and model settings).",
    );
  }

  const golden = (
    JSON.parse(readFileSync(values.set, "utf8")) as {
      questions: GoldenQuestion[];
    }
  ).questions;
  const pool = new Pool({ connectionString: process.env.APP_DATABASE_URL });
  const ask = new AskRepository(pool);
  const usage = new AppUsageRecorder(
    pool,
    parseModelPricing(process.env.BOOKWISE_MODEL_PRICING_JSON),
  );
  const spend = new UsageReadRepository(pool);
  const budget = dailyBudgetFromEnvironment();
  const useCase = new AskUseCase(
    ask,
    new SearchRepository(pool),
    queryEmbedderFromEnvironment(),
    generator,
    usage,
    spend,
    budget,
  );

  try {
    const scope = await useCase.bookScope(values.owner, values.book);
    if (!scope) {
      throw new Error(
        "That book is not the owner's, or it has no summary yet.",
      );
    }
    const startSpend = (await spend.spentToday(budget.timeZone)).spentUsd;
    const rows: Row[] = [];

    for (const item of golden) {
      const started = Date.now();
      const row: Row = {
        golden: item,
        answered: false,
        answer: "",
        totalMs: 0,
        markers: 0,
        matchedQuotes: 0,
      };
      let sources: AnswerSource[] = [];
      let markerQuotes: (string | null)[] = [];
      await useCase.execute(
        values.owner,
        scope,
        item.question,
        (event) => {
          if (event.event === "sources") sources = event.data.sources;
          if (event.event === "delta") {
            row.firstTextMs ??= Date.now() - started;
            row.answer += event.data.text;
          }
          if (event.event === "done") {
            row.answered = event.data.answered;
            markerQuotes = event.data.markerQuotes;
          }
          if (event.event === "error") row.error = event.data.code;
        },
        { skipCache: true },
      );
      row.totalMs = Date.now() - started;
      row.markers = markerQuotes.length;
      row.matchedQuotes = markerQuotes.filter(Boolean).length;

      if (row.answered && !row.error) {
        const passages = await ask.passages(
          values.owner,
          sources.map((source) => source.sourceSpanId),
          values.book,
        );
        const contents = new Map(
          passages.map((passage) => [passage.sourceSpanId, passage.content]),
        );
        row.judgement = await judgeAnswer(
          generator,
          item,
          row.answer,
          sources.map((source) => ({
            n: source.n,
            content: contents.get(source.sourceSpanId) ?? "",
          })),
        );
        await usage.record({
          ownerId: values.owner,
          bookId: values.book,
          operation: "evaluation",
          provider: generator.provider,
          model: generator.model,
          inputTokens: row.judgement.inputTokens,
          outputTokens: row.judgement.outputTokens,
        });
      }
      rows.push(row);
      console.log(
        `${rows.length}/${golden.length} ${row.error ?? (row.answered ? "answered" : "not in book")}`,
      );
    }

    const endSpend = (await spend.spentToday(budget.timeZone)).spentUsd;
    writeFileSync(
      values.out,
      report(rows, endSpend - startSpend, generator.model),
    );
    console.log(`Report written to ${values.out}`);
  } finally {
    await pool.end();
  }
}

function report(rows: Row[], costUsd: number, model: string): string {
  const expectedRight = rows.filter(
    (row) => !row.error && row.answered === (row.golden.expect === "answer"),
  ).length;
  const judged = rows.filter((row) => row.judgement);
  const factsTotal = judged.reduce(
    (sum, row) => sum + row.golden.keyFacts.length,
    0,
  );
  const factsCovered = judged.reduce(
    (sum, row) => sum + (row.judgement?.coveredFacts.length ?? 0),
    0,
  );
  const traps = judged.reduce(
    (sum, row) => sum + (row.judgement?.trapsTriggered.length ?? 0),
    0,
  );
  const faithfulness = judged.length
    ? judged.reduce((sum, row) => sum + (row.judgement?.faithfulness ?? 0), 0) /
      judged.length
    : 0;
  const markers = rows.reduce((sum, row) => sum + row.markers, 0);
  const matched = rows.reduce((sum, row) => sum + row.matchedQuotes, 0);
  const firstTexts = rows
    .flatMap((row) => (row.firstTextMs ? [row.firstTextMs] : []))
    .sort((a, b) => a - b);
  const median = firstTexts.length
    ? firstTexts[Math.floor(firstTexts.length / 2)]
    : 0;

  const lines = [
    `# Ask-a-book evaluation (${new Date().toISOString().slice(0, 10)})`,
    "",
    `Model: \`${model}\`. Answers were generated fresh (cache skipped) and graded by the same model.`,
    "",
    "## Scores",
    "",
    "| Metric | Result |",
    "| --- | --- |",
    `| Answered or declined as expected | ${expectedRight} / ${rows.length} |`,
    `| Faithfulness (mean share of supported claims) | ${percent(faithfulness)} |`,
    `| Key facts covered | ${factsCovered} / ${factsTotal} |`,
    `| Trap claims stated as true | ${traps} |`,
    `| Markers with a claim-matched quote | ${matched} / ${markers} |`,
    `| Median time to first text | ${(median / 1000).toFixed(1)} s |`,
    `| Estimated spend (answers, embeddings, judging) | $${costUsd.toFixed(4)} |`,
    "",
    "## Questions",
    "",
  ];
  for (const row of rows) {
    const judgement = row.judgement;
    lines.push(`### ${row.golden.question}`, "");
    lines.push(
      `- Expected: ${row.golden.expect === "answer" ? "an answer" : "not in book"}. Got: ${row.error ? `error (${row.error})` : row.answered ? "an answer" : "not in book"}.`,
    );
    if (judgement) {
      lines.push(
        `- Faithfulness ${percent(judgement.faithfulness)}; key facts ${judgement.coveredFacts.length} / ${row.golden.keyFacts.length}; traps ${judgement.trapsTriggered.length}.`,
      );
      const missed = row.golden.keyFacts.filter(
        (_, index) => !judgement.coveredFacts.includes(index),
      );
      if (missed.length) lines.push(`- Missed: ${missed.join("; ")}.`);
      for (const index of judgement.trapsTriggered)
        lines.push(`- Trap stated: ${row.golden.traps[index]}.`);
      for (const claim of judgement.unsupportedClaims)
        lines.push(`- Unsupported: ${claim}`);
    }
    if (row.answer) lines.push("", `> ${row.answer.replace(/\n+/g, " ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
