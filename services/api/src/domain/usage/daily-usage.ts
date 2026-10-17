/** Shared daily model budget, measured exactly as the worker measures it. */
export interface DailyUsage {
  spentUsd: number;
  /** 0 means budgeting is disabled. */
  capUsd: number;
  paused: boolean;
  /** Next local midnight in the budget time zone, as an ISO timestamp. */
  resetsAt: string;
}

export interface DailySpend {
  spentUsd: number;
  resetsAt: Date;
}

export interface UsageReadRepository {
  /** Global estimated spend since local midnight in `timeZone`. */
  spentToday(timeZone: string): Promise<DailySpend>;
}

export const USAGE_READ_REPOSITORY = Symbol("UsageReadRepository");
