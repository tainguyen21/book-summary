import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import {
  InvalidTokenError,
  type OidcIdentity,
  type TokenVerifier,
} from "../../domain/identity/auth-principal";

interface OidcDiscoveryDocument {
  issuer: string;
  jwks_uri: string;
}

export interface OidcTokenVerifierConfig {
  issuer: string;
  audience: string;
}

export class OidcTokenVerifier implements TokenVerifier {
  private jwks: JWTVerifyGetKey | undefined;

  constructor(private readonly config: OidcTokenVerifierConfig) {}

  async verify(token: string): Promise<OidcIdentity> {
    try {
      const { payload } = await jwtVerify(token, await this.getJwks(), {
        audience: this.config.audience,
        issuer: this.config.issuer,
      });

      const subject = this.requiredClaim(payload.sub);
      const email = this.normalizeEmail(payload.email);
      const exp = payload.exp;

      if (payload.email_verified === false) {
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

  private async getJwks(): Promise<JWTVerifyGetKey> {
    if (this.jwks) {
      return this.jwks;
    }

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

    this.jwks = createRemoteJWKSet(new URL(document.jwks_uri));

    return this.jwks;
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
