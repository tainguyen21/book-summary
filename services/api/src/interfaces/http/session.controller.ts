import {
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import {
  IdentityRejectedError,
  InvalidTokenError,
  type AuthPrincipal,
} from "../../domain/identity/auth-principal";
import {
  SYNC_IDENTITY_USE_CASE,
  SyncIdentityUseCase,
} from "../../application/identity/sync-identity.use-case";

@Controller("v1/session")
export class SessionController {
  constructor(
    @Inject(SYNC_IDENTITY_USE_CASE)
    private readonly syncIdentity: SyncIdentityUseCase,
  ) {}

  @Post("sync")
  async sync(
    @Headers("authorization") authorization?: string,
  ): Promise<AuthPrincipal> {
    try {
      return await this.syncIdentity.execute(this.bearerToken(authorization));
    } catch (error) {
      if (error instanceof IdentityRejectedError) {
        throw new ForbiddenException(error.message);
      }

      if (error instanceof InvalidTokenError) {
        throw new UnauthorizedException(error.message);
      }

      throw error;
    }
  }

  private bearerToken(authorization?: string): string {
    const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");

    if (!match) {
      throw new InvalidTokenError();
    }

    return match[1];
  }
}
