import { Router } from 'express';
import { pool } from '../config/database';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import bcrypt from 'bcryptjs';

const router = Router();

// Validation schemas
const requestResetSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(100)
});

// POST /api/password-reset/request - Request password reset
router.post('/request', validate(requestResetSchema), async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'Wenn ein Account mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.'
      });
    }

    const user = userResult.rows[0];

    // Generate reset token
    const token = crypto.randomUUID() + crypto.randomUUID(); // Long unique token
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    // Store token in database
    const tokenId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [tokenId, user.id, token, expiresAt.toISOString()]
    );

    // For development: Log token to console instead of sending email
    console.log('\n==============================================');
    console.log('🔑 PASSWORD RESET TOKEN (DEV MODE)');
    console.log('==============================================');
    console.log(`User: ${user.email}`);
    console.log(`Token: ${token}`);
    console.log(`Expires: ${expiresAt.toISOString()}`);
    console.log('Reset URL:', `http://localhost:5173/reset-password?token=${token}`);
    console.log('==============================================\n');

    // TODO: In production, send email with reset link
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    // await sendPasswordResetEmail(user.email, resetUrl);

    res.json({
      success: true,
      message: 'Wenn ein Account mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.',
      // Development only - remove in production!
      devToken: process.env.NODE_ENV === 'development' ? token : undefined
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/password-reset/reset - Reset password with token
router.post('/reset', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find valid token
    const tokenResult = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Ungültiger oder abgelaufener Reset-Token'
      });
    }

    const resetToken = tokenResult.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, resetToken.user_id]
    );

    // Mark token as used
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
      [resetToken.id]
    );

    console.log(`✅ Password reset successful for user ID: ${resetToken.user_id}`);

    res.json({
      success: true,
      message: 'Passwort erfolgreich zurückgesetzt'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/password-reset/verify/:token - Verify token is valid
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const tokenResult = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND used = FALSE AND expires_at > NOW()`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        valid: false,
        error: 'Ungültiger oder abgelaufener Reset-Token'
      });
    }

    res.json({
      valid: true,
      message: 'Token ist gültig'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
