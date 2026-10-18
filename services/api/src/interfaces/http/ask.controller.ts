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

import {
  ASK_USE_CASE,
  AskQuestionError,
  AskUseCase,
} from "../../application/ask/ask.use-case";
import type { AskEvent, AskScope } from "../../domain/ask/ask";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";
import { openEventStream } from "./server-sent-events";

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

class AskDto {
  @IsString()
  question!: string;
}

/**
 * Validates the question and resolves the scope with normal HTTP errors, then
 * streams the answer as server-sent events: `sources`, `delta`..., then `done`
 * (or `error`).
 */
async function streamAnswer(
  askUseCase: AskUseCase,
  ownerId: string,
  rawQuestion: string,
  resolveScope: () => Promise<AskScope | undefined>,
  reply: FastifyReply,
): Promise<void> {
  let question: string;
  try {
    question = askUseCase.validate(rawQuestion);
  } catch (error) {
    if (error instanceof AskQuestionError) {
      throw new UnprocessableEntityException(error.publicMessage);
    }
    throw error;
  }
  const scope = await resolveScope();
  if (!scope) {
    throw new NotFoundException();
  }

  const stream = openEventStream(reply);
  const emit = (event: AskEvent) => stream.send(event.event, event.data);
  try {
    await askUseCase.execute(ownerId, scope, question, emit);
  } catch {
    emit({
      event: "error",
      data: {
        code: "unavailable",
        message: "Something went wrong. Try again.",
      },
    });
  } finally {
    stream.end();
  }
}

/** Ask one book. 404 when the book is not the owner's or has no summary yet. */
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/books")
export class AskController {
  constructor(@Inject(ASK_USE_CASE) private readonly askUseCase: AskUseCase) {}

  @Post(":bookId/ask")
  ask(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
    @Body() body: AskDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    return streamAnswer(
      this.askUseCase,
      principal.userId,
      body.question,
      () => this.askUseCase.bookScope(principal.userId, params.bookId),
      reply,
    );
  }
}

/** Ask across every ready book of the owner. 404 when none is ready. */
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1")
export class LibraryAskController {
  constructor(@Inject(ASK_USE_CASE) private readonly askUseCase: AskUseCase) {}

  @Post("ask")
  ask(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: AskDto,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    return streamAnswer(
      this.askUseCase,
      principal.userId,
      body.question,
      () => this.askUseCase.libraryScope(principal.userId),
      reply,
    );
  }
}
