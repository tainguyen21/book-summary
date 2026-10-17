import {
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsUUID } from "class-validator";
import type { FastifyReply } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";

import {
  ASK_BOOK_USE_CASE,
  AskBookUseCase,
  AskQuestionError,
} from "../../application/ask/ask-book.use-case";
import type { AskEvent } from "../../domain/ask/ask";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

class AskDto {
  @IsString()
  question!: string;
}

@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/books")
export class AskController {
  constructor(
    @Inject(ASK_BOOK_USE_CASE) private readonly askBook: AskBookUseCase,
  ) {}

  /**
   * Streams an answer as server-sent events: `sources`, `delta`..., then
   * `done` (or `error`). Validation and ownership fail with normal HTTP errors
   * before the stream starts.
   */
  @Post(":bookId/ask")
  async ask(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
    @Body() body: AskDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    let question: string;
    try {
      question = this.askBook.validate(body.question);
    } catch (error) {
      if (error instanceof AskQuestionError) {
        throw new UnprocessableEntityException(error.publicMessage);
      }
      throw error;
    }
    const sourceDocumentId = await this.askBook.findSourceDocument(
      principal.userId,
      params.bookId,
    );
    if (!sourceDocumentId) {
      throw new NotFoundException();
    }

    // Keep headers Fastify already prepared (CORS) on the raw streaming response.
    reply.hijack();
    const prepared = Object.fromEntries(
      Object.entries(reply.getHeaders()).filter(
        ([, value]) => value !== undefined,
      ),
    ) as OutgoingHttpHeaders;
    reply.raw.writeHead(200, {
      ...prepared,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const emit = (event: AskEvent) => {
      reply.raw.write(
        `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
      );
    };
    try {
      await this.askBook.execute(
        principal.userId,
        params.bookId,
        sourceDocumentId,
        question,
        emit,
      );
    } catch {
      emit({
        event: "error",
        data: {
          code: "unavailable",
          message: "Something went wrong. Try again.",
        },
      });
    } finally {
      reply.raw.end();
    }
  }
}
