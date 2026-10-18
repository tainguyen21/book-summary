import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

import {
  HIGHLIGHTS_USE_CASE,
  HighlightNoteError,
  HighlightsUseCase,
} from "../../application/highlights/highlights.use-case";
import type { Highlight } from "../../domain/highlights/highlights";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

class HighlightIdParams {
  @IsUUID()
  highlightId!: string;
}

class SaveHighlightDto {
  @IsUUID()
  summaryId!: string;

  @IsInt()
  @Min(0)
  paragraph!: number;

  @IsInt()
  @Min(0)
  sentence!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

function highlightResponse(highlight: Highlight) {
  return {
    id: highlight.id,
    summaryId: highlight.summaryId,
    paragraph: highlight.paragraph,
    sentence: highlight.sentence,
    text: highlight.text,
    note: highlight.note ?? null,
    createdAt: highlight.createdAt.toISOString(),
    updatedAt: highlight.updatedAt.toISOString(),
  };
}

/** The owner's highlights and notes on summary sentences. */
@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1")
export class HighlightsController {
  constructor(
    @Inject(HIGHLIGHTS_USE_CASE) private readonly highlights: HighlightsUseCase,
  ) {}

  @Get("books/:bookId/highlights")
  async list(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    const highlights = await this.highlights.list(
      principal.userId,
      params.bookId,
    );
    return { highlights: highlights.map(highlightResponse) };
  }

  /** Highlights a sentence, or updates its note when already highlighted. */
  @Put("books/:bookId/highlights")
  async save(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
    @Body() body: SaveHighlightDto,
  ) {
    try {
      const highlight = await this.highlights.save(
        principal.userId,
        params.bookId,
        body,
      );
      if (!highlight) {
        throw new NotFoundException();
      }
      return highlightResponse(highlight);
    } catch (error) {
      if (error instanceof HighlightNoteError) {
        throw new UnprocessableEntityException(error.publicMessage);
      }
      throw error;
    }
  }

  @Delete("highlights/:highlightId")
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: HighlightIdParams,
  ): Promise<void> {
    if (!(await this.highlights.remove(principal.userId, params.highlightId))) {
      throw new NotFoundException();
    }
  }
}
