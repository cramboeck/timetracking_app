import { Router } from 'express';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { pool } from '../config/database';
import jwt from 'jsonwebtoken';
import { auditLog } from '../services/auditLog';
import { securityService } from '../services/securityService';
import bcrypt from 'bcryptjs';
import { UAParser } from 'ua-parser-js';

const router = Router();

// Trusted device settings
const TRUST_DURATION_DAYS = 30;

// Helper to parse user agent
function parseUserAgent(userAgent?: string): { browser: string; os: string; deviceName: string } {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', deviceName: 'Unknown Device' };
  }
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const browser = result.browser.name || 'Unknown';
  const browserVersion = result.browser.version?.split('.')[0] || '';
  const os = result.os.name || 'Unknown';
  const osVersion = result.os.version || '';

  return {
    browser: browserVersion ? `${browser} ${browserVersion}` : browser,
    os: osVersion ? `${os} ${osVersion}` : os,
    deviceName: `${browser} on ${os}`
  };
}

// Generate secure device token
function generateDeviceToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Check if device is trusted
async function checkTrustedDevice(userId: string, deviceToken: string): Promise<boolean> {
  if (!deviceToken) return false;

  try {
    const result = await pool.query(
      `SELECT id FROM trusted_devices
       WHERE user_id = $1 AND device_token = $2 AND expires_at > NOW()`,
      [userId, deviceToken]
    );

    if (result.rows.length > 0) {
      // Update last used timestamp
      await pool.query(
        'UPDATE trusted_devices SET last_used_at = NOW() WHERE id = $1',
        [result.rows[0].id]
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking trusted device:', error);
    return false;
  }
}

// Create trusted device
async function createTrustedDevice(
  userId: string,
  userAgent: string | undefined,
  ipAddress: string
): Promise<string> {
  const deviceToken = generateDeviceToken();
  const { browser, os, deviceName } = parseUserAgent(userAgent);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TRUST_DURATION_DAYS);

  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO trusted_devices (id, user_id, device_token, device_name, browser, os, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, userId, deviceToken, deviceName, browser, os, ipAddress, expiresAt.toISOString()]
  );

  return deviceToken;
}

// MFA verification rate limiting (in-memory, per IP+userId)
interface MfaAttempt {
  count: number;
  firstAttempt: Date;
  lockedUntil?: Date;
}
const mfaAttempts = new Map<string, MfaAttempt>();

const MFA_MAX_ATTEMPTS = 5;
const MFA_WINDOW_MINUTES = 15;
const MFA_LOCKOUT_MINUTES = 15;

function getMfaRateLimitKey(ip: string, userId: string): string {
  return `${ip}:${userId}`;
}

function checkMfaRateLimit(ip: string, userId: string): { allowed: boolean; retryAfter?: number; attemptsLeft?: number } {
  const key = getMfaRateLimitKey(ip, userId);
  const now = new Date();
  const attempt = mfaAttempts.get(key);

  if (!attempt) {
    return { allowed: true, attemptsLeft: MFA_MAX_ATTEMPTS };
  }

  // Check if locked out
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const retryAfter = Math.ceil((attempt.lockedUntil.getTime() - now.getTime()) / 1000);
    return { allowed: false, retryAfter };
  }

  // Check if window has expired (reset counter)
  const windowExpiry = new Date(attempt.firstAttempt.getTime() + MFA_WINDOW_MINUTES * 60 * 1000);
  if (now > windowExpiry) {
    mfaAttempts.delete(key);
    return { allowed: true, attemptsLeft: MFA_MAX_ATTEMPTS };
  }

  // Check attempts within window
  if (attempt.count >= MFA_MAX_ATTEMPTS) {
    // Lock the user out
    attempt.lockedUntil = new Date(now.getTime() + MFA_LOCKOUT_MINUTES * 60 * 1000);
    const retryAfter = MFA_LOCKOUT_MINUTES * 60;
    return { allowed: false, retryAfter };
  }

  return { allowed: true, attemptsLeft: MFA_MAX_ATTEMPTS - attempt.count };
}

function recordMfaAttempt(ip: string, userId: string, success: boolean): void {
  const key = getMfaRateLimitKey(ip, userId);

  if (success) {
    // Clear on successful verification
    mfaAttempts.delete(key);
    return;
  }

  const now = new Date();
  const attempt = mfaAttempts.get(key);

  if (!attempt) {
    mfaAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    // Check if window expired
    const windowExpiry = new Date(attempt.firstAttempt.getTime() + MFA_WINDOW_MINUTES * 60 * 1000);
    if (now > windowExpiry) {
      mfaAttempts.set(key, { count: 1, firstAttempt: now });
    } else {
      attempt.count++;
    }
  }
}

// Cleanup old entries every 30 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, attempt] of mfaAttempts.entries()) {
    const windowExpiry = new Date(attempt.firstAttempt.getTime() + MFA_WINDOW_MINUTES * 60 * 1000);
    if (now > windowExpiry && (!attempt.lockedUntil || now > attempt.lockedUntil)) {
      mfaAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

// Middleware to get user from token
async function getUserFromToken(req: any): Promise<any | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/mfa/status
 * Check if MFA is enabled for the current user
 */
router.get('/status', async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
      enabled: user.mfa_enabled || false
    });
  } catch (error) {
    console.error('MFA status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/mfa/setup
 * Generate a new MFA secret and QR code for setup
 */
router.post('/setup', async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }

    // Generate a new secret
    const secret = authenticator.generateSecret();

    // Store the secret temporarily (not enabled yet)
    await pool.query(
      'UPDATE users SET mfa_secret = $1 WHERE id = $2',
      [secret, user.id]
    );

    // Generate OTP Auth URL for authenticator apps
    const appName = process.env.APP_NAME || 'TimeTracking';
    const otpAuthUrl = authenticator.keyuri(user.email || user.username, appName, secret);

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Generate recovery codes (8 codes, 8 characters each)
    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
    );

    // Store recovery codes (hashed)
    const hashedCodes = await Promise.all(
      recoveryCodes.map(code => bcrypt.hash(code, 10))
    );
    await pool.query(
      'UPDATE users SET mfa_recovery_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), user.id]
    );

    res.json({
      secret,
      qrCode: qrCodeDataUrl,
      recoveryCodes,
      manualEntryKey: secret // For manual entry if QR code doesn't work
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/mfa/verify-setup
 * Verify the TOTP code and enable MFA
 */
router.post('/verify-setup', async (req, res) => {
  try {
    const { code } = req.body;
    const user = await getUserFromToken(req);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!user.mfa_secret) {
      return res.status(400).json({ error: 'MFA setup not started' });
    }

    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }

    // Verify the code
    const isValid = authenticator.verify({
      token: code,
      secret: user.mfa_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Enable MFA
    await pool.query(
      'UPDATE users SET mfa_enabled = true WHERE id = $1',
      [user.id]
    );

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.update',
      details: JSON.stringify({ mfa_enabled: true }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'MFA enabled successfully'
    });
  } catch (error) {
    console.error('MFA verify-setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/mfa/disable
 * Disable MFA (requires password confirmation)
 */
router.post('/disable', async (req, res) => {
  try {
    const { password, code } = req.body;
    const user = await getUserFromToken(req);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify TOTP code
    const isValid = authenticator.verify({
      token: code,
      secret: user.mfa_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Disable MFA and clear secret
    await pool.query(
      'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_recovery_codes = NULL WHERE id = $1',
      [user.id]
    );

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.update',
      details: JSON.stringify({ mfa_enabled: false }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'MFA disabled successfully'
    });
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/mfa/verify
 * Verify TOTP code during login (called after password verification)
 */
router.post('/verify', async (req, res) => {
  try {
    const { mfaToken, code, trustDevice } = req.body;
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'Missing MFA token or code' });
    }

    // Verify the temporary MFA token
    let decoded: any;
    try {
      decoded = jwt.verify(mfaToken, process.env.JWT_SECRET!) as any;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired MFA token' });
    }

    if (!decoded.mfaPending) {
      return res.status(400).json({ error: 'Invalid MFA token' });
    }

    // Check rate limit BEFORE attempting verification
    const rateLimit = checkMfaRateLimit(clientIP, decoded.userId);
    if (!rateLimit.allowed) {
      console.log(`🚫 MFA rate limit exceeded for user ${decoded.userId} from ${clientIP}`);
      securityService.logFailedLogin(clientIP, `mfa:${decoded.userId}`, userAgent);
      return res.status(429).json({
        error: 'Zu viele Fehlversuche. Bitte warte bevor du es erneut versuchst.',
        retryAfter: rateLimit.retryAfter
      });
    }

    // Get user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this is a recovery code (8 uppercase alphanumeric characters)
    const isRecoveryCode = /^[A-Z0-9]{8}$/.test(code);
    let verificationSuccess = false;

    if (isRecoveryCode) {
      // Try to use recovery code
      const recoveryCodes: string[] = user.mfa_recovery_codes ? JSON.parse(user.mfa_recovery_codes) : [];
      let usedCodeIndex = -1;

      for (let i = 0; i < recoveryCodes.length; i++) {
        const isMatch = await bcrypt.compare(code, recoveryCodes[i]);
        if (isMatch) {
          usedCodeIndex = i;
          break;
        }
      }

      if (usedCodeIndex === -1) {
        // Record failed attempt
        recordMfaAttempt(clientIP, decoded.userId, false);
        const updatedLimit = checkMfaRateLimit(clientIP, decoded.userId);
        console.log(`🔐 MFA: Invalid recovery code for user "${user.username}" (${updatedLimit.attemptsLeft} attempts left)`);
        return res.status(400).json({
          error: 'Ungültiger Wiederherstellungscode',
          attemptsLeft: updatedLimit.attemptsLeft
        });
      }

      // Remove used recovery code
      recoveryCodes.splice(usedCodeIndex, 1);
      await pool.query(
        'UPDATE users SET mfa_recovery_codes = $1 WHERE id = $2',
        [JSON.stringify(recoveryCodes), user.id]
      );

      console.log(`🔐 MFA: Recovery code used for user "${user.username}" (${recoveryCodes.length} remaining)`);
      verificationSuccess = true;
    } else {
      // Verify TOTP code
      const isValid = authenticator.verify({
        token: code,
        secret: user.mfa_secret
      });

      if (!isValid) {
        // Record failed attempt
        recordMfaAttempt(clientIP, decoded.userId, false);
        const updatedLimit = checkMfaRateLimit(clientIP, decoded.userId);
        console.log(`🔐 MFA: Invalid code for user "${user.username}" (${updatedLimit.attemptsLeft} attempts left)`);
        return res.status(400).json({
          error: 'Ungültiger Code',
          attemptsLeft: updatedLimit.attemptsLeft
        });
      }

      verificationSuccess = true;
    }

    // Record successful attempt (clears rate limit)
    recordMfaAttempt(clientIP, decoded.userId, true);

    // Log successful MFA login
    securityService.logSuccessfulLogin(clientIP, user.username, user.id);

    // Update last login
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [new Date().toISOString(), user.id]);

    // Create trusted device if requested
    let deviceToken: string | undefined;
    if (trustDevice) {
      deviceToken = await createTrustedDevice(user.id, userAgent, clientIP);
      console.log(`🔐 MFA: Trusted device created for user "${user.username}"`);

      // Audit log for device trust
      auditLog.log({
        userId: user.id,
        action: 'mfa.device_trusted',
        details: JSON.stringify({
          deviceName: parseUserAgent(userAgent).deviceName,
          ipAddress: clientIP
        }),
        ipAddress: clientIP,
        userAgent: userAgent
      });
    }

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.login',
      details: JSON.stringify({
        username: user.username,
        email: user.email,
        mfa: true,
        recoveryCode: isRecoveryCode,
        deviceTrusted: !!trustDevice
      }),
      ipAddress: clientIP,
      userAgent: userAgent
    });

    // Generate full session token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      deviceToken, // Will be undefined if not requested
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        accountType: user.account_type
      }
    });
  } catch (error) {
    console.error('MFA verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/mfa/recovery-codes
 * Get remaining recovery codes count
 */
router.get('/recovery-codes', async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }

    const recoveryCodes: string[] = user.mfa_recovery_codes ? JSON.parse(user.mfa_recovery_codes) : [];

    res.json({
      remaining: recoveryCodes.length
    });
  } catch (error) {
    console.error('MFA recovery codes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/mfa/regenerate-recovery-codes
 * Generate new recovery codes (requires password and TOTP)
 */
router.post('/regenerate-recovery-codes', async (req, res) => {
  try {
    const { password, code } = req.body;
    const user = await getUserFromToken(req);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify TOTP code
    const isValid = authenticator.verify({
      token: code,
      secret: user.mfa_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate new recovery codes
    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
    );

    // Store recovery codes (hashed)
    const hashedCodes = await Promise.all(
      recoveryCodes.map(code => bcrypt.hash(code, 10))
    );
    await pool.query(
      'UPDATE users SET mfa_recovery_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), user.id]
    );

    res.json({
      success: true,
      recoveryCodes
    });
  } catch (error) {
    console.error('MFA regenerate recovery codes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/mfa/trusted-devices
 * List all trusted devices for the current user
 */
router.get('/trusted-devices', async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await pool.query(
      `SELECT id, device_name, browser, os, ip_address, created_at, last_used_at, expires_at
       FROM trusted_devices
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_used_at DESC`,
      [user.id]
    );

    res.json({
      devices: result.rows.map(row => ({
        id: row.id,
        deviceName: row.device_name,
        browser: row.browser,
        os: row.os,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at
      }))
    });
  } catch (error) {
    console.error('List trusted devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/mfa/trusted-devices/:id
 * Remove a trusted device
 */
router.delete('/trusted-devices/:id', async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    // Make sure the device belongs to this user
    const result = await pool.query(
      'DELETE FROM trusted_devices WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'mfa.device_revoked',
      details: JSON.stringify({ deviceId: id }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete trusted device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/mfa/trusted-devices
 * Remove all trusted devices for the current user
 */
router.delete('/trusted-devices', async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await pool.query(
      'DELETE FROM trusted_devices WHERE user_id = $1',
      [user.id]
    );

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'mfa.all_devices_revoked',
      details: JSON.stringify({ count: result.rowCount }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, count: result.rowCount });
  } catch (error) {
    console.error('Delete all trusted devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export checkTrustedDevice for use in auth.ts
export { checkTrustedDevice };

export default router;
