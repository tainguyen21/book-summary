import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import {
  ACTIVITY_USE_CASE,
  ActivityUseCase,
} from "../../application/activity/activity.use-case";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

/** The owner's processing runs, queue position, and today's spend. */
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/activity")
export class ActivityController {
  constructor(
    @Inject(ACTIVITY_USE_CASE) private readonly activity: ActivityUseCase,
  ) {}

  @Get()
  get(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.activity.execute(principal.userId);
  }
}
