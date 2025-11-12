import { Router } from 'express';
import { pool } from '../config/database';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import bcrypt from 'bcryptjs';
import { emailService } from '../services/emailService';

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

    // Send password reset email
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

    const emailSent = await emailService.sendEmail({
      to: user.email,
      subject: '🔑 Passwort zurücksetzen - RamboFlow',
      html: generatePasswordResetEmailHTML(user.username || user.email, resetUrl, expiresAt),
      text: generatePasswordResetEmailText(user.username || user.email, resetUrl, expiresAt)
    });

    // Log to console in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('\n==============================================');
      console.log('🔑 PASSWORD RESET TOKEN (DEV MODE)');
      console.log('==============================================');
      console.log(`User: ${user.email}`);
      console.log(`Token: ${token}`);
      console.log(`Expires: ${expiresAt.toISOString()}`);
      console.log('Reset URL:', resetUrl);
      console.log('==============================================\n');
    }

    console.log(`📧 Password reset email ${emailSent ? 'sent' : 'failed'} for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Wenn ein Account mit dieser E-Mail existiert, wurde ein Reset-Link gesendet.'
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

// Email templates
function generatePasswordResetEmailHTML(userName: string, resetUrl: string, expiresAt: Date): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Passwort zurücksetzen</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 20px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🔑 Passwort zurücksetzen</h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <h2 style="color: #1f2937; margin-top: 0;">Hallo ${userName}!</h2>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.
                      Klicke auf den Button unten, um ein neues Passwort zu vergeben.
                    </p>

                    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                      <p style="color: #92400e; margin: 0; font-size: 14px;">
                        ⚠️ <strong>Dieser Link ist nur 1 Stunde gültig!</strong><br>
                        Gültig bis: ${expiresAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr
                      </p>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${resetUrl}" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                        Passwort zurücksetzen →
                      </a>
                    </div>

                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin: 20px 0;">
                      <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
                      </p>
                      <p style="color: #3b82f6; font-size: 12px; word-break: break-all; margin: 0;">
                        ${resetUrl}
                      </p>
                    </div>

                    <p style="color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                      <strong>Du hast diese E-Mail nicht angefordert?</strong><br>
                      Falls du keine Passwort-Zurücksetzung angefordert hast, ignoriere diese E-Mail einfach.
                      Dein Passwort bleibt unverändert.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                      RamboFlow - Professionelle Zeiterfassung<br>
                      © ${new Date().getFullYear()} Alle Rechte vorbehalten
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function generatePasswordResetEmailText(userName: string, resetUrl: string, expiresAt: Date): string {
  return `
Passwort zurücksetzen

Hallo ${userName}!

Du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.
Klicke auf den Link unten, um ein neues Passwort zu vergeben.

⚠️ Dieser Link ist nur 1 Stunde gültig!
Gültig bis: ${expiresAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr

Passwort zurücksetzen:
${resetUrl}

Du hast diese E-Mail nicht angefordert?
Falls du keine Passwort-Zurücksetzung angefordert hast, ignoriere diese E-Mail einfach.
Dein Passwort bleibt unverändert.

--
RamboFlow - Professionelle Zeiterfassung
© ${new Date().getFullYear()} Alle Rechte vorbehalten
  `;
}

export default router;
