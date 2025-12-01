import { Router } from 'express';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { pool } from '../config/database';
import jwt from 'jsonwebtoken';
import { auditLog } from '../services/auditLog';
import bcrypt from 'bcryptjs';

const router = Router();

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
    const { mfaToken, code } = req.body;

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

    // Get user
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this is a recovery code (8 uppercase alphanumeric characters)
    const isRecoveryCode = /^[A-Z0-9]{8}$/.test(code);

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
        return res.status(400).json({ error: 'Invalid recovery code' });
      }

      // Remove used recovery code
      recoveryCodes.splice(usedCodeIndex, 1);
      await pool.query(
        'UPDATE users SET mfa_recovery_codes = $1 WHERE id = $2',
        [JSON.stringify(recoveryCodes), user.id]
      );

      console.log(`🔐 MFA: Recovery code used for user "${user.username}" (${recoveryCodes.length} remaining)`);
    } else {
      // Verify TOTP code
      const isValid = authenticator.verify({
        token: code,
        secret: user.mfa_secret
      });

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [new Date().toISOString(), user.id]);

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.login',
      details: JSON.stringify({
        username: user.username,
        email: user.email,
        mfa: true,
        recoveryCode: isRecoveryCode
      }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    // Generate full session token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
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

export default router;
