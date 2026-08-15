import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import {
  IdentityRejectedError,
  InvalidTokenError,
  type AuthPrincipal,
} from "../../domain/identity/auth-principal";
import {
  SYNC_IDENTITY_USE_CASE,
  SyncIdentityUseCase,
} from "../../application/identity/sync-identity.use-case";

export interface AuthenticatedRequest extends FastifyRequest {
  principal?: AuthPrincipal;
}

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.principal) {
      throw new UnauthorizedException();
    }

    return request.principal;
  },
);

@Injectable()
export class AuthenticatedPrincipalGuard implements CanActivate {
  constructor(
    @Inject(SYNC_IDENTITY_USE_CASE)
    private readonly syncIdentity: SyncIdentityUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    try {
      request.principal = await this.syncIdentity.execute(
        this.bearerToken(request.headers.authorization),
      );

      return true;
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

  private bearerToken(authorization?: string | string[]): string {
    if (Array.isArray(authorization)) {
      if (authorization.length !== 1) {
        throw new InvalidTokenError();
      }

      return this.bearerToken(authorization[0]);
    }

    const match = /^Bearer\s+([^,\s]+)$/i.exec(authorization?.trim() ?? "");

    if (!match) {
      throw new InvalidTokenError();
    }

    return match[1];
  }
}
