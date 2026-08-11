export interface AuthPrincipal {
  userId: string;
  email: string;
  isAdmin: boolean;
}

export interface OidcIdentity {
  subject: string;
  email: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<OidcIdentity>;
}

export interface UserRepository {
  syncInvitedIdentity(identity: OidcIdentity): Promise<AuthPrincipal>;
}

export const TOKEN_VERIFIER = Symbol("TokenVerifier");
export const USER_REPOSITORY = Symbol("UserRepository");

export class InvalidTokenError extends Error {
  constructor() {
    super("The bearer token is invalid.");
  }
}

export class InvitationRejectedError extends Error {
  constructor() {
    super("The identity does not have an active invitation.");
  }
}
