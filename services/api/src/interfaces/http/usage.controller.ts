import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import {
  GetDailyUsageUseCase,
  GET_DAILY_USAGE_USE_CASE,
} from "../../application/usage/get-daily-usage.use-case";
import { AuthenticatedPrincipalGuard } from "./authenticated-principal";

@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/usage")
export class UsageController {
  constructor(
    @Inject(GET_DAILY_USAGE_USE_CASE)
    private readonly getDailyUsage: GetDailyUsageUseCase,
  ) {}

  /** Today's shared AI spend against the daily cap (signed-in users only). */
  @Get("today")
  today() {
    return this.getDailyUsage.execute();
  }
}
