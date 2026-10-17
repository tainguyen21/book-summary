import { Pool } from "pg";

import type {
  DailySpend,
  UsageReadRepository as UsageReadRepositoryPort,
} from "../../domain/usage/daily-usage";

interface DailySpendRow {
  spent_usd: string;
  resets_at: Date;
}

export class UsageReadRepository implements UsageReadRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async spentToday(timeZone: string): Promise<DailySpend> {
    // Same day boundary and total as the worker's daily budget check.
    const result = await this.pool.query<DailySpendRow>(
      `WITH bounds AS (
         SELECT date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1 AS day_start
       )
       SELECT
         data.model_usage_spent_since(day_start)::text AS spent_usd,
         (date_trunc('day', now() AT TIME ZONE $1) + interval '1 day')
           AT TIME ZONE $1 AS resets_at
       FROM bounds`,
      [timeZone],
    );
    const row = result.rows[0];

    return { spentUsd: Number(row.spent_usd), resetsAt: row.resets_at };
  }
}
