import {
  Body,
  ConflictException,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import {
  CreateUploadUseCase,
  CREATE_UPLOAD_USE_CASE,
} from "../../application/books/create-upload.use-case";
import {
  FinalizeUploadUseCase,
  FINALIZE_UPLOAD_USE_CASE,
  UploadNotFoundError,
} from "../../application/books/finalize-upload.use-case";
import {
  InvalidUploadInputError,
  UploadConflictError,
} from "../../domain/books/book";
import type { AuthPrincipal } from "../../domain/identity/auth-principal";
import {
  AuthenticatedPrincipalGuard,
  CurrentPrincipal,
} from "./authenticated-principal";

class CreateBookUploadDto {
  @IsString()
  @MinLength(1)
  filename!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

class BookIdParams {
  @IsUUID()
  bookId!: string;
}

@UseGuards(AuthenticatedPrincipalGuard)
@Controller("v1/books")
export class BooksController {
  constructor(
    @Inject(CREATE_UPLOAD_USE_CASE)
    private readonly createUpload: CreateUploadUseCase,
    @Inject(FINALIZE_UPLOAD_USE_CASE)
    private readonly finalizeUpload: FinalizeUploadUseCase,
  ) {}

  @Post("uploads")
  async create(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() body: CreateBookUploadDto,
  ) {
    try {
      return await this.createUpload.execute({
        ownerId: principal.userId,
        filename: body.filename,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        title: body.title,
      });
    } catch (error) {
      this.translateError(error);
    }
  }

  @Post(":bookId/uploads/finalize")
  async finalize(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param() params: BookIdParams,
  ) {
    try {
      return await this.finalizeUpload.execute({
        ownerId: principal.userId,
        bookId: params.bookId,
      });
    } catch (error) {
      this.translateError(error);
    }
  }

  private translateError(error: unknown): never {
    if (error instanceof InvalidUploadInputError) {
      throw new UnprocessableEntityException(error.publicMessage);
    }

    if (error instanceof UploadConflictError) {
      throw new ConflictException(error.publicMessage);
    }

    if (error instanceof UploadNotFoundError) {
      throw new NotFoundException();
    }

    throw error;
  }
}
