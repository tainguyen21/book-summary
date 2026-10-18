import { Module } from "@nestjs/common";
import { Pool } from "pg";

import {
  TOKEN_VERIFIER,
  USER_REPOSITORY,
} from "./domain/identity/auth-principal";
import {
  BOOK_REPOSITORY,
  BOOK_READ_REPOSITORY,
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
  GetBookStatusUseCase,
  GET_BOOK_STATUS_USE_CASE,
} from "./application/books/get-book-status.use-case";
import {
  GetBookSummaryUseCase,
  GET_BOOK_SUMMARY_USE_CASE,
} from "./application/books/get-book-summary.use-case";
import {
  GetSourcePassageUseCase,
  GET_SOURCE_PASSAGE_USE_CASE,
} from "./application/books/get-source-passage.use-case";
import {
  ListLibraryUseCase,
  LIST_LIBRARY_USE_CASE,
} from "./application/books/list-library.use-case";
import { SOURCE_PASSAGE_REPOSITORY } from "./domain/books/source-passage";
import {
  ManageBookUseCase,
  MANAGE_BOOK_USE_CASE,
} from "./application/books/manage-book.use-case";
import { BOOK_MANAGEMENT_REPOSITORY } from "./domain/books/book-management";
import {
  SyncIdentityUseCase,
  SYNC_IDENTITY_USE_CASE,
} from "./application/identity/sync-identity.use-case";
import {
  GetDailyUsageUseCase,
  GET_DAILY_USAGE_USE_CASE,
  type DailyBudgetSettings,
} from "./application/usage/get-daily-usage.use-case";
import { USAGE_READ_REPOSITORY } from "./domain/usage/daily-usage";
import {
  SEARCH_USE_CASE,
  SearchUseCase,
} from "./application/search/search.use-case";
import { parseModelPricing } from "./domain/search/model-pricing";
import {
  APP_USAGE_RECORDER,
  QUERY_EMBEDDER,
  SEARCH_REPOSITORY,
  type QueryEmbedder,
} from "./domain/search/search";
import { AppUsageRecorder } from "./infrastructure/database/app-usage.recorder";
import { SearchRepository } from "./infrastructure/database/search.repository";
import { VertexEmbeddingClient } from "./infrastructure/model/vertex-embedding.client";
import { SearchController } from "./interfaces/http/search.controller";
import { ASK_USE_CASE, AskUseCase } from "./application/ask/ask.use-case";
import {
  ANSWER_GENERATOR,
  ASK_REPOSITORY,
  type AnswerGenerator,
} from "./domain/ask/ask";
import { AskRepository } from "./infrastructure/database/ask.repository";
import { VertexGenerationClient } from "./infrastructure/model/vertex-generation.client";
import {
  FLASHCARDS_USE_CASE,
  FlashcardsUseCase,
} from "./application/flashcards/flashcards.use-case";
import { FLASHCARD_REPOSITORY } from "./domain/flashcards/flashcards";
import { FlashcardRepository } from "./infrastructure/database/flashcard.repository";
import { FlashcardsController } from "./interfaces/http/flashcards.controller";
import {
  AskController,
  LibraryAskController,
} from "./interfaces/http/ask.controller";
import { AppUserRepository } from "./infrastructure/database/app-user.repository";
import { BookManagementRepository } from "./infrastructure/database/book-management.repository";
import { BookReadRepository } from "./infrastructure/database/book-read.repository";
import { BookRepository } from "./infrastructure/database/book.repository";
import { ProcessingCommandRepository } from "./infrastructure/database/processing-command.repository";
import { SourcePassageRepository } from "./infrastructure/database/source-passage.repository";
import { UsageReadRepository } from "./infrastructure/database/usage-read.repository";
import { OidcTokenVerifier } from "./infrastructure/identity/oidc-token-verifier";
import { GcsObjectStorage } from "./infrastructure/storage/gcs-object-storage";
import { S3ObjectStorage } from "./infrastructure/storage/s3-object-storage";
import { AuthenticatedPrincipalGuard } from "./interfaces/http/authenticated-principal";
import { BookManagementController } from "./interfaces/http/book-management.controller";
import { BooksController } from "./interfaces/http/books.controller";
import { HealthController } from "./interfaces/http/health.controller";
import { ReadinessController } from "./interfaces/http/readiness.controller";
import { APP_DATABASE_POOL } from "./infrastructure/database/database.tokens";
import { LibraryController } from "./interfaces/http/library.controller";
import { SessionController } from "./interfaces/http/session.controller";
import { SummaryController } from "./interfaces/http/summary.controller";
import { UsageController } from "./interfaces/http/usage.controller";

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

/** Must match the worker: BOOKWISE_DAILY_BUDGET_USD (default 2, 0 disables). */
export function dailyBudgetFromEnvironment(): DailyBudgetSettings {
  const rawCap = process.env.BOOKWISE_DAILY_BUDGET_USD?.trim() || "2";
  const capUsd = Number(rawCap);
  if (!Number.isFinite(capUsd) || capUsd < 0) {
    throw new Error("BOOKWISE_DAILY_BUDGET_USD must be zero or positive.");
  }

  const timeZone =
    process.env.BOOKWISE_BUDGET_TIMEZONE?.trim() || "Asia/Saigon";
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new Error("BOOKWISE_BUDGET_TIMEZONE must be an IANA time zone name.");
  }

  return { capUsd, timeZone };
}

/**
 * Meaning search needs Vertex embeddings in the same 768-dimension space as
 * the worker's evidence embeddings; otherwise search runs keyword-only.
 */
export function queryEmbedderFromEnvironment(): QueryEmbedder | undefined {
  const provider = process.env.BOOKWISE_MODEL_PROVIDER?.trim().toLowerCase();
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const model = process.env.BOOKWISE_EMBEDDING_MODEL?.trim();
  const dimensions = Number(process.env.BOOKWISE_EMBEDDING_DIMENSIONS);
  if (provider !== "vertex" || !project || !model || dimensions !== 768) {
    return undefined;
  }

  return new VertexEmbeddingClient({
    project,
    // Interactive calls use a regional endpoint: the global one measured ~11s
    // per embedding versus ~1-2s regionally, with identical vectors.
    location:
      process.env.BOOKWISE_EMBEDDING_LOCATION?.trim() ||
      process.env.GOOGLE_CLOUD_LOCATION?.trim() ||
      "global",
    model,
    dimensions,
  });
}

/** Answers use the summary model, which Vertex serves only from the global endpoint. */
/** Flashcard decks are longer than answers, so they get a larger output cap. */
function flashcardGeneratorFromEnvironment(): AnswerGenerator | undefined {
  const answers = answerGeneratorFromEnvironment();
  return answers
    ? new VertexGenerationClient({
        project: process.env.GOOGLE_CLOUD_PROJECT!.trim(),
        location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
        model: answers.model,
        maxOutputTokens: 4096,
        timeoutMs: 90_000,
      })
    : undefined;
}

export function answerGeneratorFromEnvironment(): AnswerGenerator | undefined {
  const provider = process.env.BOOKWISE_MODEL_PROVIDER?.trim().toLowerCase();
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const model = process.env.BOOKWISE_SUMMARY_MODEL?.trim();
  if (provider !== "vertex" || !project || !model) {
    return undefined;
  }

  return new VertexGenerationClient({
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
    model,
  });
}

function objectStorageFromEnvironment(): ObjectStorage {
  const provider =
    process.env.OBJECT_STORAGE_PROVIDER?.trim().toLowerCase() || "minio";
  if (provider === "gcs") {
    return new GcsObjectStorage({
      bucket: requiredEnvironment("GCS_BUCKET"),
      projectId: process.env.GOOGLE_CLOUD_PROJECT?.trim() || undefined,
    });
  }
  if (provider !== "minio") {
    throw new Error("OBJECT_STORAGE_PROVIDER must be either minio or gcs.");
  }

  return new S3ObjectStorage({
    endpoint: process.env.S3_ENDPOINT_URL?.trim() || undefined,
    region: requiredEnvironment("S3_REGION"),
    accessKeyId: requiredEnvironment("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnvironment("S3_SECRET_ACCESS_KEY"),
    bucket: requiredEnvironment("S3_BUCKET"),
  });
}

@Module({
  controllers: [
    HealthController,
    ReadinessController,
    SessionController,
    BooksController,
    LibraryController,
    SummaryController,
    UsageController,
    BookManagementController,
    SearchController,
    AskController,
    LibraryAskController,
    FlashcardsController,
  ],
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
      provide: BOOK_READ_REPOSITORY,
      useFactory: (pool: Pool) => new BookReadRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: OBJECT_STORAGE,
      useFactory: objectStorageFromEnvironment,
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
    {
      provide: LIST_LIBRARY_USE_CASE,
      useFactory: (books: BookReadRepository) => new ListLibraryUseCase(books),
      inject: [BOOK_READ_REPOSITORY],
    },
    {
      provide: GET_BOOK_STATUS_USE_CASE,
      useFactory: (books: BookReadRepository) =>
        new GetBookStatusUseCase(books),
      inject: [BOOK_READ_REPOSITORY],
    },
    {
      provide: GET_BOOK_SUMMARY_USE_CASE,
      useFactory: (books: BookReadRepository) =>
        new GetBookSummaryUseCase(books),
      inject: [BOOK_READ_REPOSITORY],
    },
    {
      provide: SEARCH_REPOSITORY,
      useFactory: (pool: Pool) => new SearchRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: QUERY_EMBEDDER,
      useFactory: queryEmbedderFromEnvironment,
    },
    {
      provide: APP_USAGE_RECORDER,
      useFactory: (pool: Pool) =>
        new AppUsageRecorder(
          pool,
          parseModelPricing(process.env.BOOKWISE_MODEL_PRICING_JSON),
        ),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: ASK_REPOSITORY,
      useFactory: (pool: Pool) => new AskRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: ANSWER_GENERATOR,
      useFactory: answerGeneratorFromEnvironment,
    },
    {
      provide: FLASHCARD_REPOSITORY,
      useFactory: (pool: Pool) => new FlashcardRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: FLASHCARDS_USE_CASE,
      useFactory: (
        cards: FlashcardRepository,
        books: BookReadRepository,
        ask: AskRepository,
        usage: AppUsageRecorder,
        spend: UsageReadRepository,
      ) =>
        new FlashcardsUseCase(
          cards,
          books,
          ask,
          flashcardGeneratorFromEnvironment(),
          usage,
          spend,
          dailyBudgetFromEnvironment(),
        ),
      inject: [
        FLASHCARD_REPOSITORY,
        BOOK_READ_REPOSITORY,
        ASK_REPOSITORY,
        APP_USAGE_RECORDER,
        USAGE_READ_REPOSITORY,
      ],
    },
    {
      provide: ASK_USE_CASE,
      useFactory: (
        ask: AskRepository,
        search: SearchRepository,
        embedder: QueryEmbedder | undefined,
        generator: AnswerGenerator | undefined,
        usage: AppUsageRecorder,
        spend: UsageReadRepository,
      ) =>
        new AskUseCase(
          ask,
          search,
          embedder,
          generator,
          usage,
          spend,
          dailyBudgetFromEnvironment(),
        ),
      inject: [
        ASK_REPOSITORY,
        SEARCH_REPOSITORY,
        QUERY_EMBEDDER,
        ANSWER_GENERATOR,
        APP_USAGE_RECORDER,
        USAGE_READ_REPOSITORY,
      ],
    },
    {
      provide: SEARCH_USE_CASE,
      useFactory: (
        search: SearchRepository,
        embedder: QueryEmbedder | undefined,
        usage: AppUsageRecorder,
        spend: UsageReadRepository,
      ) =>
        new SearchUseCase(
          search,
          embedder,
          usage,
          spend,
          dailyBudgetFromEnvironment(),
        ),
      inject: [
        SEARCH_REPOSITORY,
        QUERY_EMBEDDER,
        APP_USAGE_RECORDER,
        USAGE_READ_REPOSITORY,
      ],
    },
    {
      provide: SOURCE_PASSAGE_REPOSITORY,
      useFactory: (pool: Pool) => new SourcePassageRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: GET_SOURCE_PASSAGE_USE_CASE,
      useFactory: (passages: SourcePassageRepository) =>
        new GetSourcePassageUseCase(passages),
      inject: [SOURCE_PASSAGE_REPOSITORY],
    },
    {
      provide: BOOK_MANAGEMENT_REPOSITORY,
      useFactory: (pool: Pool) => new BookManagementRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: MANAGE_BOOK_USE_CASE,
      useFactory: (books: BookManagementRepository, storage: ObjectStorage) =>
        new ManageBookUseCase(books, storage),
      inject: [BOOK_MANAGEMENT_REPOSITORY, OBJECT_STORAGE],
    },
    {
      provide: USAGE_READ_REPOSITORY,
      useFactory: (pool: Pool) => new UsageReadRepository(pool),
      inject: [APP_DATABASE_POOL],
    },
    {
      provide: GET_DAILY_USAGE_USE_CASE,
      useFactory: (usage: UsageReadRepository) =>
        new GetDailyUsageUseCase(usage, dailyBudgetFromEnvironment()),
      inject: [USAGE_READ_REPOSITORY],
    },
    AuthenticatedPrincipalGuard,
  ],
})
export class AppModule {}
