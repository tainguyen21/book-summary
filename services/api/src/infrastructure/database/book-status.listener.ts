import { Logger } from "@nestjs/common";
import { Client } from "pg";

import type {
  BookStatusChange,
  BookStatusFeed,
} from "../../domain/live/book-status-feed";

const CHANNEL = "bookwise_book_status";
const RECONNECT_DELAY_MS = 5_000;

/**
 * One dedicated Postgres connection per API process that LISTENs for book
 * status notifications and fans them out to open streams. It connects on the
 * first subscriber and reconnects after errors; notifications sent while it
 * is disconnected are missed, which the pages' slow polling covers.
 */
export class PostgresBookStatusListener implements BookStatusFeed {
  private readonly logger = new Logger(PostgresBookStatusListener.name);
  private readonly listeners = new Set<(change: BookStatusChange) => void>();
  private client?: Client;
  private connecting = false;

  constructor(private readonly connectionString: string) {}

  subscribe(listener: (change: BookStatusChange) => void): () => void {
    this.listeners.add(listener);
    void this.connect();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async connect(): Promise<void> {
    if (this.client || this.connecting) {
      return;
    }
    this.connecting = true;
    const client = new Client({ connectionString: this.connectionString });
    client.on("notification", (message) => this.dispatch(message.payload));
    client.on("error", (error) => {
      this.logger.warn(`Status listener lost its connection (${error.name}).`);
      this.reset(client);
    });
    client.on("end", () => this.reset(client));
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
    } catch (error) {
      this.logger.warn(
        `Status listener could not connect (${error instanceof Error ? error.name : "unknown error"}).`,
      );
      this.reset(client);
    } finally {
      this.connecting = false;
    }
  }

  private reset(client: Client) {
    if (this.client === client) {
      this.client = undefined;
    }
    void client.end().catch(() => undefined);
    if (this.listeners.size > 0) {
      setTimeout(() => void this.connect(), RECONNECT_DELAY_MS).unref();
    }
  }

  private dispatch(payload: string | undefined) {
    let change: BookStatusChange;
    try {
      const parsed = JSON.parse(payload ?? "") as {
        owner_id?: unknown;
        book_id?: unknown;
      };
      if (
        typeof parsed.owner_id !== "string" ||
        typeof parsed.book_id !== "string"
      ) {
        return;
      }
      change = { ownerId: parsed.owner_id, bookId: parsed.book_id };
    } catch {
      return;
    }
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
