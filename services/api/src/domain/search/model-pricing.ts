/** USD per 1M tokens per model, from BOOKWISE_MODEL_PRICING_JSON (same as the worker). */
export type ModelPricing = Record<
  string,
  { inputPerMtok: number; outputPerMtok: number }
>;

export function parseModelPricing(raw: string | undefined): ModelPricing {
  if (!raw?.trim()) {
    return {};
  }
  const document: unknown = JSON.parse(raw);
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(
      "BOOKWISE_MODEL_PRICING_JSON must be a JSON object keyed by model.",
    );
  }

  const pricing: ModelPricing = {};
  for (const [model, entry] of Object.entries(
    document as Record<string, unknown>,
  )) {
    const price = entry as {
      input_per_mtok?: unknown;
      output_per_mtok?: unknown;
    };
    const inputPerMtok = Number(price.input_per_mtok);
    const outputPerMtok = Number(price.output_per_mtok);
    if (!(inputPerMtok >= 0) || !(outputPerMtok >= 0)) {
      throw new Error(
        `BOOKWISE_MODEL_PRICING_JSON needs non-negative prices for ${model}.`,
      );
    }
    pricing[model] = { inputPerMtok, outputPerMtok };
  }
  return pricing;
}

/** Rounded to 6 decimals like the worker's ledger; unpriced models cost 0. */
export function estimateCostUsd(
  pricing: ModelPricing,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = pricing[model];
  if (!price) {
    return 0;
  }
  const cost =
    (inputTokens * price.inputPerMtok + outputTokens * price.outputPerMtok) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
