import type {
  AuthPrincipal,
  TokenVerifier,
  UserRepository,
} from "../../domain/identity/auth-principal";

export class SyncIdentityUseCase {
  constructor(
    private readonly tokenVerifier: TokenVerifier,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(token: string): Promise<AuthPrincipal> {
    const identity = await this.tokenVerifier.verify(token);

    return this.userRepository.syncInvitedIdentity(identity);
  }
}

export const SYNC_IDENTITY_USE_CASE = Symbol("SyncIdentityUseCase");
