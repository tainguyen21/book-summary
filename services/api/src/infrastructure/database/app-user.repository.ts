import { Pool, type PoolClient } from "pg";

import {
  InvitationRejectedError,
  type AuthPrincipal,
  type OidcIdentity,
  type UserRepository,
} from "../../domain/identity/auth-principal";

interface InvitationRow {
  id: string;
  expires_at: Date;
  accepted_subject: string | null;
}

interface UserRow {
  id: string;
  email: string;
  oidc_subject: string | null;
  is_admin: boolean;
  is_active: boolean;
}

export class AppUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async syncInvitedIdentity(identity: OidcIdentity): Promise<AuthPrincipal> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const invitation = await this.lockInvitation(client, identity);
      const user = await this.syncUser(client, identity);

      if (!user.is_active) {
        throw new InvitationRejectedError();
      }

      await client.query(
        `UPDATE app.invitations
         SET accepted_at = COALESCE(accepted_at, now()),
             accepted_subject = COALESCE(accepted_subject, $2),
             updated_at = now()
         WHERE id = $1`,
        [invitation.id, identity.subject],
      );
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

  private async lockInvitation(
    client: PoolClient,
    identity: OidcIdentity,
  ): Promise<InvitationRow> {
    const result = await client.query<InvitationRow>(
      `SELECT id, expires_at, accepted_subject
       FROM app.invitations
       WHERE lower(email) = $1
       FOR UPDATE`,
      [identity.email],
    );
    if (result.rows.length !== 1) {
      throw new InvitationRejectedError();
    }

    const invitation = result.rows[0];

    if (
      (invitation.accepted_subject !== null &&
        invitation.accepted_subject !== identity.subject) ||
      (invitation.accepted_subject === null &&
        invitation.expires_at.getTime() <= Date.now())
    ) {
      throw new InvitationRejectedError();
    }

    return invitation;
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
      throw new InvitationRejectedError();
    }

    const user = existing.rows[0];

    if (!user) {
      return this.insertUser(client, identity);
    }

    if (user.oidc_subject !== null && user.oidc_subject !== identity.subject) {
      throw new InvitationRejectedError();
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
