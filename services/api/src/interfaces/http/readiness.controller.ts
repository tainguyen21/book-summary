import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Pool } from "pg";

import { OBJECT_STORAGE, type ObjectStorage } from "../../domain/books/book";
import { APP_DATABASE_POOL } from "../../infrastructure/database/database.tokens";

const CHECK_TIMEOUT_MS = 3_000;

type CheckResult = "ok" | "failed";

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Readiness: the pod can serve requests only when Postgres and object storage
 * answer. Kubernetes stops routing to a pod that fails it; liveness stays on
 * /v1/health, so a database outage does not restart every pod. Model access
 * is not probed: it costs money and the app degrades without it.
 */
@Controller("v1/ready")
export class ReadinessController {
  constructor(
    @Inject(APP_DATABASE_POOL) private readonly pool: Pool,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Get()
  async ready(): Promise<{
    status: "ready";
    checks: Record<string, CheckResult>;
  }> {
    const [database, storage] = await Promise.all([
      this.check(() => this.pool.query("SELECT 1")),
      // A missing key answers "not found" when storage is reachable.
      this.check(() => this.storage.head("readiness/probe")),
    ]);
    const checks = { database, storage };
    if (database !== "ok" || storage !== "ok") {
      throw new ServiceUnavailableException({ status: "not_ready", checks });
    }
    return { status: "ready", checks };
  }

  private async check(run: () => Promise<unknown>): Promise<CheckResult> {
    try {
      await withTimeout(run());
      return "ok";
    } catch {
      return "failed";
    }
  }
}
