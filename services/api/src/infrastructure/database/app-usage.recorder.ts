import { Pool } from "pg";

import type { AppUsageRecorder as AppUsageRecorderPort } from "../../domain/search/search";
import {
  estimateCostUsd,
  type ModelPricing,
} from "../../domain/search/model-pricing";

/** Writes API model spend to the shared ledger through the narrow DB function. */
export class AppUsageRecorder implements AppUsageRecorderPort {
  constructor(
    private readonly pool: Pool,
    private readonly pricing: ModelPricing,
  ) {}

  async record(
    input: Parameters<AppUsageRecorderPort["record"]>[0],
  ): Promise<void> {
    await this.pool.query(
      `SELECT data.record_app_model_usage($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.ownerId,
        input.bookId ?? null,
        input.operation,
        input.provider,
        input.model,
        input.inputTokens,
        input.outputTokens,
        estimateCostUsd(
          this.pricing,
          input.model,
          input.inputTokens,
          input.outputTokens,
        ),
      ],
    );
  }
}
