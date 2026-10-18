import { Controller, Get, Inject, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import {
  BOOK_READ_REPOSITORY,
  type BookReadRepository,
} from "../../domain/books/book";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  BOOK_STATUS_FEED,
  type BookStatusFeed,
} from "../../domain/live/book-status-feed";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";
import { openEventStream } from "./server-sent-events";

// The load balancer ends responses after 60 s; close first and let the page reconnect.
const STREAM_LIFETIME_MS = 50_000;
const PING_INTERVAL_MS = 20_000;

/**
 * Pushes the owner's book status changes as server-sent `status` events
 * (the same shape as GET /v1/books/:bookId/processing), replacing fast polling.
 */
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/live")
export class LiveStatusController {
  constructor(
    @Inject(BOOK_STATUS_FEED) private readonly feed: BookStatusFeed,
    @Inject(BOOK_READ_REPOSITORY) private readonly books: BookReadRepository,
  ) {}

  @Get("books")
  streamBooks(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() reply: FastifyReply,
  ): void {
    const stream = openEventStream(reply);
    stream.send("ready", { lifetimeMs: STREAM_LIFETIME_MS });

    const unsubscribe = this.feed.subscribe((change) => {
      if (change.ownerId !== principal.userId) {
        return;
      }
      void this.books
        .getProcessingStatus(principal.userId, change.bookId)
        .then((status) => status && stream.send("status", status))
        .catch(() => undefined);
    });
    const ping = setInterval(() => stream.ping(), PING_INTERVAL_MS);
    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      unsubscribe();
      clearInterval(ping);
      clearTimeout(lifetime);
      stream.end();
    };
    const lifetime = setTimeout(close, STREAM_LIFETIME_MS);
    reply.raw.on("close", close);
  }
}
