import {
  Controller,
  Get,
  Inject,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import { IsString } from "class-validator";

import {
  SEARCH_USE_CASE,
  SearchQueryError,
  SearchUseCase,
} from "../../application/search/search.use-case";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class SearchQueryDto {
  @IsString()
  q!: string;
}

@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/search")
export class SearchController {
  constructor(
    @Inject(SEARCH_USE_CASE) private readonly searchBooks: SearchUseCase,
  ) {}

  /** Hybrid keyword + meaning search across the signed-in owner's books. */
  @Get()
  async search(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query() query: SearchQueryDto,
  ) {
    try {
      return await this.searchBooks.execute(principal.userId, query.q);
    } catch (error) {
      if (error instanceof SearchQueryError) {
        throw new UnprocessableEntityException(error.publicMessage);
      }
      throw error;
    }
  }
}
