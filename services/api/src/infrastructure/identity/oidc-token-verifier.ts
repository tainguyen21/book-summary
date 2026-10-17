import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import {
  InvalidTokenError,
  type OidcIdentity,
  type TokenVerifier,
} from "../../domain/identity/auth-principal";

const AUTH0_EMAIL_CLAIM = "https://bookwise.local/email";
const AUTH0_EMAIL_VERIFIED_CLAIM = "https://bookwise.local/email_verified";

interface OidcDiscoveryDocument {
  issuer: string;
  jwks_uri: string;
}

export interface OidcTokenVerifierConfig {
  issuer: string;
  audience: string;
}

export class OidcTokenVerifier implements TokenVerifier {
  private jwks: Promise<JWTVerifyGetKey> | undefined;

  constructor(private readonly config: OidcTokenVerifierConfig) {}

  async verify(token: string): Promise<OidcIdentity> {
    try {
      const { payload } = await jwtVerify(token, await this.getJwks(), {
        audience: this.config.audience,
        issuer: this.config.issuer,
      });

      const subject = this.requiredClaim(payload.sub);
      const email = this.normalizeEmail(payload[AUTH0_EMAIL_CLAIM]);
      const exp = payload.exp;

      if (payload[AUTH0_EMAIL_VERIFIED_CLAIM] !== true) {
        throw new InvalidTokenError();
      }

      if (typeof exp !== "number" || !Number.isFinite(exp)) {
        throw new InvalidTokenError();
      }

      return { subject, email };
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw error;
      }

      throw new InvalidTokenError();
    }
  }

  /**
   * Concurrent first requests share one discovery lookup and one key set, so
   * a cold start fetches the keys once. A failed lookup is not cached, which
   * lets the next request try again.
   */
  private getJwks(): Promise<JWTVerifyGetKey> {
    this.jwks ??= this.discoverJwks().catch((error: unknown) => {
      this.jwks = undefined;
      throw error;
    });

    return this.jwks;
  }

  private async discoverJwks(): Promise<JWTVerifyGetKey> {
    const discoveryUrl = new URL(
      ".well-known/openid-configuration",
      `${this.config.issuer.replace(/\/$/, "")}/`,
    );
    const response = await fetch(discoveryUrl);

    if (!response.ok) {
      throw new InvalidTokenError();
    }

    const document = (await response.json()) as Partial<OidcDiscoveryDocument>;

    if (
      document.issuer !== this.config.issuer ||
      typeof document.jwks_uri !== "string"
    ) {
      throw new InvalidTokenError();
    }

    return createRemoteJWKSet(new URL(document.jwks_uri));
  }

  private requiredClaim(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new InvalidTokenError();
    }

    return value;
  }

  private normalizeEmail(value: unknown): string {
    if (typeof value !== "string") {
      throw new InvalidTokenError();
    }

    const email = value.trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new InvalidTokenError();
    }

    return email;
  }
}
