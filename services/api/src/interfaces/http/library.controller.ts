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
  GetBookStatusUseCase,
  GET_BOOK_STATUS_USE_CASE,
} from "../../application/books/get-book-status.use-case";
import {
  ListLibraryUseCase,
  LIST_LIBRARY_USE_CASE,
} from "../../application/books/list-library.use-case";
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
export class LibraryController {
  constructor(
    @Inject(LIST_LIBRARY_USE_CASE)
    private readonly listLibrary: ListLibraryUseCase,
    @Inject(GET_BOOK_STATUS_USE_CASE)
    private readonly getBookStatus: GetBookStatusUseCase,
  ) {}

  @Get()
  list(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.listLibrary.execute(principal.userId);
  }

  @Get(":bookId/processing")
  async processing(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    const status = await this.getBookStatus.execute(
      principal.userId,
      params.bookId,
    );

    if (!status) {
      throw new NotFoundException();
    }

    return status;
  }
}
