import { Module } from "@nestjs/common";
import { Pool } from "pg";

import {
  TOKEN_VERIFIER,
  USER_REPOSITORY,
} from "./domain/identity/auth-principal";
import {
  BOOK_REPOSITORY,
  OBJECT_STORAGE,
  PROCESSING_COMMAND_REPOSITORY,
  type ObjectStorage,
} from "./domain/books/book";
import {
  CreateUploadUseCase,
  CREATE_UPLOAD_USE_CASE,
} from "./application/books/create-upload.use-case";
import {
  FinalizeUploadUseCase,
  FINALIZE_UPLOAD_USE_CASE,
} from "./application/books/finalize-upload.use-case";
import {
  SyncIdentityUseCase,
  SYNC_IDENTITY_USE_CASE,
} from "./application/identity/sync-identity.use-case";
import { AppUserRepository } from "./infrastructure/database/app-user.repository";
import { BookRepository } from "./infrastructure/database/book.repository";
import { ProcessingCommandRepository } from "./infrastructure/database/processing-command.repository";
import { OidcTokenVerifier } from "./infrastructure/identity/oidc-token-verifier";
import { S3ObjectStorage } from "./infrastructure/storage/s3-object-storage";
import { AuthenticatedPrincipalGuard } from "./interfaces/http/authenticated-principal";
import { BooksController } from "./interfaces/http/books.controller";
import { SessionController } from "./interfaces/http/session.controller";

const APP_DATABASE_POOL = Symbol("AppDatabasePool");

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

function positiveIntegerEnvironment(name: string): number {
  const value = Number.parseInt(requiredEnvironment(name), 10);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

@Module({
  controllers: [SessionController, BooksController],
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
      provide: PROCESSING_COMMAND_REPOSITORY,
      useFactory: () => new ProcessingCommandRepository(),
    },
    {
      provide: BOOK_REPOSITORY,
      useFactory: (
        pool: Pool,
        processingCommands: ProcessingCommandRepository,
      ) => new BookRepository(pool, processingCommands),
      inject: [APP_DATABASE_POOL, PROCESSING_COMMAND_REPOSITORY],
    },
    {
      provide: OBJECT_STORAGE,
      useFactory: (): ObjectStorage =>
        new S3ObjectStorage({
          endpoint: process.env.S3_ENDPOINT_URL?.trim() || undefined,
          region: requiredEnvironment("S3_REGION"),
          accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID"),
          secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY"),
          bucket: requiredEnvironment("S3_BUCKET"),
        }),
    },
    {
      provide: SYNC_IDENTITY_USE_CASE,
      useFactory: (
        tokenVerifier: OidcTokenVerifier,
        userRepository: AppUserRepository,
      ) => new SyncIdentityUseCase(tokenVerifier, userRepository),
      inject: [TOKEN_VERIFIER, USER_REPOSITORY],
    },
    {
      provide: CREATE_UPLOAD_USE_CASE,
      useFactory: (books: BookRepository, storage: ObjectStorage) =>
        new CreateUploadUseCase(
          books,
          storage,
          positiveIntegerEnvironment("S3_PRESIGNED_URL_EXPIRY_SECONDS"),
        ),
      inject: [BOOK_REPOSITORY, OBJECT_STORAGE],
    },
    {
      provide: FINALIZE_UPLOAD_USE_CASE,
      useFactory: (books: BookRepository, storage: ObjectStorage) =>
        new FinalizeUploadUseCase(books, storage),
      inject: [BOOK_REPOSITORY, OBJECT_STORAGE],
    },
    AuthenticatedPrincipalGuard,
  ],
})
export class AppModule {}
