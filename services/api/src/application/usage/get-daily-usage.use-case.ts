import type {
  DailyUsage,
  UsageReadRepository,
} from "../../domain/usage/daily-usage";

export interface DailyBudgetSettings {
  capUsd: number;
  timeZone: string;
}

export class GetDailyUsageUseCase {
  constructor(
    private readonly usage: UsageReadRepository,
    private readonly settings: DailyBudgetSettings,
  ) {}

  async execute(): Promise<DailyUsage> {
    const { spentUsd, resetsAt } = await this.usage.spentToday(
      this.settings.timeZone,
    );
    const { capUsd } = this.settings;

    return {
      spentUsd,
      capUsd,
      paused: capUsd > 0 && spentUsd >= capUsd,
      resetsAt: resetsAt.toISOString(),
    };
  }
}

export const GET_DAILY_USAGE_USE_CASE = Symbol("GetDailyUsageUseCase");
