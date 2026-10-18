import { Pool } from "pg";

import type { DailyBudgetSettings } from "../usage/get-daily-usage.use-case";

const RUN_LIMIT = 50;
const FAILED = new Set(["retryable_failed", "permanent_failed"]);

export interface ActivityRun {
  runId: string;
  bookId: string;
  bookTitle: string;
  commandType: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  latestEventType: string | null;
  errorCode: string | null;
}

export interface Activity {
  queue: { mine: number; ahead: number };
  runs: ActivityRun[];
  spendToday: {
    totalUsd: number;
    byOperation: { operation: string; usd: number; calls: number }[];
  };
}

/**
 * The owner's processing activity: recent runs with failure codes, how many of
 * their commands wait and how many commands (anyone's) are ahead, and today's
 * model spend by operation. Reads the owner-filtered data views directly.
 */
export class ActivityUseCase {
  constructor(
    private readonly pool: Pool,
    private readonly budget: DailyBudgetSettings,
  ) {}

  async execute(ownerId: string): Promise<Activity> {
    const [runs, queue, spend] = await Promise.all([
      this.pool.query<{
        run_id: string;
        book_id: string;
        book_title: string;
        command_type: string;
        status: string;
        started_at: Date;
        completed_at: Date | null;
        latest_event_type: string | null;
        error_code: string | null;
      }>(
        `SELECT run.run_id, run.book_id, coalesce(book.title, book.filename) AS book_title,
                run.command_type, run.status, run.started_at, run.completed_at,
                run.latest_event_type, run.error_code
         FROM data.book_processing_runs AS run
         JOIN app.books AS book ON book.id = run.book_id AND book.owner_id = run.owner_id
         WHERE run.owner_id = $1
         ORDER BY run.updated_at DESC
         LIMIT $2`,
        [ownerId, RUN_LIMIT],
      ),
      // Pending: no run yet, or a run still running or waiting to retry.
      this.pool.query<{ mine: string; ahead: string }>(
        `WITH pending AS (
           SELECT command.owner_id, command.created_at
           FROM app.processing_commands AS command
           JOIN app.books AS book ON book.id = command.book_id
           LEFT JOIN data.book_processing_status AS status ON status.command_id = command.id
           WHERE book.status <> 'pending_upload'
             AND (status.run_status IS NULL OR status.run_status IN ('running', 'retryable_failed'))
         )
         SELECT
           count(*) FILTER (WHERE owner_id = $1) AS mine,
           count(*) FILTER (
             WHERE owner_id <> $1
               AND created_at < coalesce((SELECT min(created_at) FROM pending WHERE owner_id = $1), now())
           ) AS ahead
         FROM pending`,
        [ownerId],
      ),
      this.pool.query<{ operation: string; usd: string; calls: string }>(
        `SELECT operation, coalesce(sum(estimated_cost_usd), 0) AS usd, count(*) AS calls
         FROM data.app_model_usage
         WHERE owner_id = $1
           AND created_at >= date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2
         GROUP BY operation
         ORDER BY usd DESC`,
        [ownerId, this.budget.timeZone],
      ),
    ]);

    const byOperation = spend.rows.map((row) => ({
      operation: row.operation,
      usd: Number(row.usd),
      calls: Number(row.calls),
    }));
    return {
      queue: {
        mine: Number(queue.rows[0]?.mine ?? 0),
        ahead: Number(queue.rows[0]?.ahead ?? 0),
      },
      runs: runs.rows.map((row) => ({
        runId: row.run_id,
        bookId: row.book_id,
        bookTitle: row.book_title,
        commandType: row.command_type,
        status: row.status,
        startedAt: row.started_at.toISOString(),
        completedAt: row.completed_at?.toISOString() ?? null,
        latestEventType: row.latest_event_type,
        // A completed run may carry codes from earlier failed attempts; show only current failures.
        errorCode: FAILED.has(row.status) ? row.error_code : null,
      })),
      spendToday: {
        totalUsd: byOperation.reduce((sum, row) => sum + row.usd, 0),
        byOperation,
      },
    };
  }
}

export const ACTIVITY_USE_CASE = Symbol("ActivityUseCase");
