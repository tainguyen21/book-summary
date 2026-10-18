import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsUUID } from "class-validator";

import {
  FLASHCARDS_USE_CASE,
  FlashcardsBudgetError,
  FlashcardsUnavailableError,
  FlashcardsUseCase,
} from "../../application/flashcards/flashcards.use-case";
import type {
  Flashcard,
  ReviewRating,
} from "../../domain/flashcards/flashcards";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

class CardIdParams {
  @IsUUID()
  cardId!: string;
}

class ReviewDto {
  @IsIn([1, 2, 3, 4])
  rating!: ReviewRating;
}

function cardResponse(card: Flashcard) {
  return {
    id: card.id,
    bookId: card.bookId,
    bookTitle: card.bookTitle,
    front: card.front,
    back: card.back,
    sourceSpanIds: card.sourceSpanIds,
    due: card.schedule.due.toISOString(),
    state: card.schedule.state,
    reps: card.schedule.reps,
  };
}

/** Flashcards made from a book's summary, reviewed with spaced repetition. */
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1")
export class FlashcardsController {
  constructor(
    @Inject(FLASHCARDS_USE_CASE) private readonly flashcards: FlashcardsUseCase,
  ) {}

  @Get("books/:bookId/flashcards")
  async bookDeck(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    const cards = await this.flashcards.bookDeck(
      principal.userId,
      params.bookId,
    );
    return { cards: cards.map(cardResponse) };
  }

  /** Makes (or remakes) the book's deck; spends tokens under the daily budget. */
  @Post("books/:bookId/flashcards")
  async generate(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    try {
      const cards = await this.flashcards.generate(
        principal.userId,
        params.bookId,
      );
      if (!cards) {
        throw new NotFoundException();
      }
      return { cards: cards.map(cardResponse) };
    } catch (error) {
      if (error instanceof FlashcardsBudgetError) {
        throw new HttpException(
          { code: "budget", message: "Today’s AI budget is used up." },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof FlashcardsUnavailableError) {
        throw new ServiceUnavailableException({
          code: "unavailable",
          message: "Flashcards couldn’t be made right now.",
        });
      }
      throw error;
    }
  }

  @Get("flashcards/due")
  async due(@CurrentPrincipal() principal: AuthPrincipal) {
    const { cards, dueCount } = await this.flashcards.due(principal.userId);
    return { dueCount, cards: cards.map(cardResponse) };
  }

  @Post("flashcards/:cardId/review")
  async review(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: CardIdParams,
    @Body() body: ReviewDto,
  ) {
    const next = await this.flashcards.review(
      principal.userId,
      params.cardId,
      body.rating,
    );
    if (!next) {
      throw new NotFoundException();
    }
    return { due: next.due.toISOString(), scheduledDays: next.scheduledDays };
  }
}
