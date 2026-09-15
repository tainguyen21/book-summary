import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import { IsUUID } from "class-validator";

import {
  GetBookSummaryUseCase,
  GET_BOOK_SUMMARY_USE_CASE,
} from "../../application/books/get-book-summary.use-case";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/books")
export class SummaryController {
  constructor(
    @Inject(GET_BOOK_SUMMARY_USE_CASE)
    private readonly getBookSummary: GetBookSummaryUseCase,
  ) {}

  @Get(":bookId/summary")
  async get(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    const summary = await this.getBookSummary.execute(
      principal.userId,
      params.bookId,
    );

    if (!summary) {
      throw new NotFoundException();
    }

    return summary;
  }
}
