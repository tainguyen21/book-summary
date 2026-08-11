import { Module } from "@nestjs/common";
import { Pool } from "pg";

import {
  TOKEN_VERIFIER,
  USER_REPOSITORY,
} from "./domain/identity/auth-principal";
import {
  SyncIdentityUseCase,
  SYNC_IDENTITY_USE_CASE,
} from "./application/identity/sync-identity.use-case";
import { AppUserRepository } from "./infrastructure/database/app-user.repository";
import { OidcTokenVerifier } from "./infrastructure/identity/oidc-token-verifier";
import { SessionController } from "./interfaces/http/session.controller";

const APP_DATABASE_POOL = Symbol("AppDatabasePool");

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

@Module({
  controllers: [SessionController],
  providers: [
    {
      provide: APP_DATABASE_POOL,
      useFactory: () =>
        new Pool({
          connectionString: requiredEnvironment("APP_DATABASE_URL"),
        }),
    },
    {
      provide: TOKEN_VERIFIER,
      useFactory: () =>
        new OidcTokenVerifier({
          issuer: requiredEnvironment("OIDC_ISSUER"),
          audience: requiredEnvironment("OIDC_AUDIENCE"),
        }),
    },
    {
      provide: USER_REPOSITORY,
      useFactory: (pool: Pool) => new AppUserRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: SYNC_IDENTITY_USE_CASE,
      useFactory: (
        tokenVerifier: OidcTokenVerifier,
        userRepository: AppUserRepository,
      ) => new SyncIdentityUseCase(tokenVerifier, userRepository),
      inject: [TOKEN_VERIFIER, USER_REPOSITORY],
    },
  ],
})
export class AppModule {}
