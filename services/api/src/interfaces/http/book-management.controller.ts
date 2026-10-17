import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsUUID, MaxLength } from "class-validator";

import {
  InvalidTitleError,
  MANAGE_BOOK_USE_CASE,
  MAX_TITLE_LENGTH,
  ManageBookUseCase,
} from "../../application/books/manage-book.use-case";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

class RenameBookDto {
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title!: string;
}

@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/books")
export class BookManagementController {
  constructor(
    @Inject(MANAGE_BOOK_USE_CASE)
    private readonly manageBook: ManageBookUseCase,
  ) {}

  // Declared before ":bookId" so "incomplete" is not parsed as a book id.
  @Delete("incomplete")
  clearIncomplete(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.manageBook.clearIncomplete(principal.userId);
  }

  @Patch(":bookId")
  async rename(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
    @Body() body: RenameBookDto,
  ) {
    let book;
    try {
      book = await this.manageBook.rename(
        principal.userId,
        params.bookId,
        body.title,
      );
    } catch (error) {
      if (error instanceof InvalidTitleError) {
        throw new UnprocessableEntityException(error.publicMessage);
      }
      throw error;
    }

    if (!book) {
      throw new NotFoundException();
    }
    return book;
  }

  @Delete(":bookId")
  @HttpCode(204)
  async delete(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ): Promise<void> {
    const outcome = await this.manageBook.delete(
      principal.userId,
      params.bookId,
    );

    if (outcome.kind === "not_found") {
      throw new NotFoundException();
    }
    if (outcome.kind === "processing") {
      throw new ConflictException(
        "This book is being summarized. Delete it after it finishes.",
      );
    }
  }

  @Post(":bookId/retry")
  @HttpCode(202)
  async retry(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    const outcome = await this.manageBook.retry(
      principal.userId,
      params.bookId,
    );

    if (outcome.kind === "not_found") {
      throw new NotFoundException();
    }
    if (outcome.kind === "not_failed") {
      throw new ConflictException("Only failed books can be retried.");
    }
    return { requested: outcome.commandCount };
  }
}
