import { Pool, type PoolClient } from "pg";

import {
  IdentityRejectedError,
  type AuthPrincipal,
  type OidcIdentity,
  type UserRepository,
} from "../../domain/identity/auth-principal";

interface UserRow {
  id: string;
  email: string;
  oidc_subject: string | null;
  is_admin: boolean;
  is_active: boolean;
}

export class AppUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async syncIdentity(identity: OidcIdentity): Promise<AuthPrincipal> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await this.lockIdentityKeys(client, identity);
      const user = await this.syncUser(client, identity);

      if (!user.is_active) {
        throw new IdentityRejectedError();
      }

      await client.query("COMMIT");

      return {
        userId: user.id,
        email: user.email,
        isAdmin: user.is_admin,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockIdentityKeys(
    client: PoolClient,
    identity: OidcIdentity,
  ): Promise<void> {
    const lockKeys = [
      `email:${identity.email}`,
      `subject:${identity.subject}`,
    ].sort();

    for (const key of lockKeys) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    }
  }

  private async syncUser(
    client: PoolClient,
    identity: OidcIdentity,
  ): Promise<UserRow> {
    const existing = await client.query<UserRow>(
      `SELECT id, email, oidc_subject, is_admin, is_active
       FROM app.users
       WHERE oidc_subject = $1 OR lower(email) = $2
       FOR UPDATE`,
      [identity.subject, identity.email],
    );

    if (existing.rows.length > 1) {
      throw new IdentityRejectedError();
    }

    const user = existing.rows[0];

    if (!user) {
      return this.insertUser(client, identity);
    }

    if (user.oidc_subject !== null && user.oidc_subject !== identity.subject) {
      throw new IdentityRejectedError();
    }

    const updated = await client.query<UserRow>(
      `UPDATE app.users
       SET oidc_subject = $1,
           email = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING id, email, oidc_subject, is_admin, is_active`,
      [identity.subject, identity.email, user.id],
    );

    return updated.rows[0];
  }

  private async insertUser(
    client: PoolClient,
    identity: OidcIdentity,
  ): Promise<UserRow> {
    const result = await client.query<UserRow>(
      `INSERT INTO app.users (oidc_subject, email)
       VALUES ($1, $2)
       RETURNING id, email, oidc_subject, is_admin, is_active`,
      [identity.subject, identity.email],
    );

    return result.rows[0];
  }
}
