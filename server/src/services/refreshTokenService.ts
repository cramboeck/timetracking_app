import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// Refresh tokens are 32 random bytes encoded base64url (~43 chars). They live
// in the DB only as SHA-256 hashes — the plaintext is returned to the client
// exactly once and never logged.
//
// Rotation: every call to verifyAndRotate() revokes the consumed token and
// issues a fresh one, recording the successor's hash on the old row
// (rotated_to_hash). If an already-revoked token is presented, it is either a
// legitimate retry whose rotation response never reached the client (common on
// mobile — the app is suspended between the network round-trip and the token
// write, so the rotated successor is never stored and never used) or genuine
// theft. We tell them apart by the successor: if it is still unconsumed and
// unexpired, nobody ever used the rotation → re-issue. If it was already
// consumed (or the revoked token has no successor at all), a second party is
// advancing the chain → theft → revoke the user's entire active token set.

const REFRESH_TOKEN_TTL_DAYS = 30;

const hash = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const generatePlainToken = (): string =>
  crypto.randomBytes(32).toString('base64url');

export interface DeviceInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshTokenResult {
  token: string;        // plaintext, return to client once
  expiresAt: Date;
}

export const refreshTokenService = {
  /**
   * Issue a brand-new refresh token for a user (after successful login /
   * MFA / register). Returns the plaintext token + its expiry.
   */
  async create(userId: string, deviceInfo?: DeviceInfo): Promise<RefreshTokenResult> {
    const token = generatePlainToken();
    const tokenHash = hash(token);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, tokenHash, deviceInfo ? JSON.stringify(deviceInfo) : null, expiresAt]
    );

    return { token, expiresAt };
  },

  /**
   * Verify a refresh token, revoke it, and issue a new one (rotation).
   * Returns the user id + new token, or null if the token is invalid or
   * expired.
   *
   * If an already-revoked token is presented, its rotation successor decides:
   * an unconsumed successor means the client never received the rotation
   * (lost response) and we re-issue; a consumed/missing successor means a
   * second party is using the chain (theft) and all active tokens are revoked.
   */
  async verifyAndRotate(
    presentedToken: string,
    deviceInfo?: DeviceInfo
  ): Promise<{ userId: string; newToken: RefreshTokenResult } | null> {
    const presentedHash = hash(presentedToken);

    const row = await pool.query(
      `SELECT id, user_id, expires_at, revoked_at, rotated_to_hash
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [presentedHash]
    );

    if (row.rows.length === 0) {
      // Unknown token — nothing to do.
      return null;
    }

    const record = row.rows[0];

    // Revoked token presented — distinguish a lost-response retry from theft
    // by looking one hop ahead at its rotation successor.
    if (record.revoked_at) {
      const successorHash: string | null = record.rotated_to_hash;

      if (successorHash) {
        const succ = await pool.query(
          `SELECT id, expires_at, revoked_at
           FROM refresh_tokens
           WHERE token_hash = $1`,
          [successorHash]
        );
        const successor = succ.rows[0];

        if (successor && !successor.revoked_at && new Date(successor.expires_at) > new Date()) {
          // The successor was issued but never used → the client never
          // received this rotation (app suspended / lost response on mobile).
          // Re-issue idempotently: mint a fresh token, repoint the presented
          // token at it, and retire the orphaned successor. A repeated retry
          // re-presents the same (still-revoked) token and lands here again,
          // so a chain of lost responses keeps resolving without a logout.
          const newToken = await this.create(record.user_id, deviceInfo);
          const newHash = hash(newToken.token);
          await pool.query(
            `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
            [successor.id]
          );
          await pool.query(
            `UPDATE refresh_tokens SET rotated_to_hash = $1 WHERE id = $2`,
            [newHash, record.id]
          );
          return { userId: record.user_id, newToken };
        }
      }

      // No successor (token was revoked by logout / password change), or the
      // successor was already consumed or has expired → a second party is
      // advancing the chain (theft) or the token is simply dead. Revoke every
      // active token for the user as a precaution.
      logger.warn(
        `⚠️  Refresh-token reuse detected for user ${record.user_id}; revoking all sessions`
      );
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [record.user_id]
      );
      return null;
    }

    if (new Date(record.expires_at) <= new Date()) {
      // Expired — silent reject; client should re-login.
      return null;
    }

    // Issue the replacement first so we can store its hash on the old row.
    const newToken = await this.create(record.user_id, deviceInfo);
    const newHash = hash(newToken.token);

    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), rotated_to_hash = $1
       WHERE id = $2`,
      [newHash, record.id]
    );

    return { userId: record.user_id, newToken };
  },

  /**
   * Logout: revoke a single refresh token without rotating. Idempotent —
   * unknown / already-revoked tokens are silently ignored.
   */
  async revoke(presentedToken: string): Promise<void> {
    const presentedHash = hash(presentedToken);
    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [presentedHash]
    );
  },

  /**
   * Revoke every active refresh token for a user. Used by the change-password
   * flow (force re-login on all devices) and by the theft-detection path.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  },
};
