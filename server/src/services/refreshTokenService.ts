import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// Refresh tokens are 32 random bytes encoded base64url (~43 chars). They live
// in the DB only as SHA-256 hashes — the plaintext is returned to the client
// exactly once and never logged.
//
// Rotation: every call to verifyAndRotate() revokes the consumed token and
// issues a fresh one. If a token that is already revoked is presented, we
// treat that as a possible theft attempt and revoke the user's entire active
// refresh-token set.

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
   * Returns the user id + new token, or null if the token is invalid,
   * expired, or already revoked.
   *
   * On a revoked-token reuse attempt, all active refresh tokens of the
   * affected user are revoked as a precaution.
   */
  async verifyAndRotate(
    presentedToken: string,
    deviceInfo?: DeviceInfo
  ): Promise<{ userId: string; newToken: RefreshTokenResult } | null> {
    const presentedHash = hash(presentedToken);

    const row = await pool.query(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [presentedHash]
    );

    if (row.rows.length === 0) {
      // Unknown token — nothing to do.
      return null;
    }

    const record = row.rows[0];

    // Revoked-token reuse → likely theft. Revoke ALL active tokens for the
    // user; legitimate sessions will fall back to a fresh login.
    if (record.revoked_at) {
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
