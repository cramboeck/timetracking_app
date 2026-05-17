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
    const userResult = await pool.query('SELECT id, username, email FROM users WHERE email = $1', [email]);

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
      subject: 'Passwort zurücksetzen - RamboFlow',
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
    <html lang="de">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Passwort zurücksetzen</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; -webkit-font-smoothing: antialiased;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background-color: #F27024; padding: 32px 40px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">RamboFlow</h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">Hallo ${userName},</h2>
                    <p style="color: #4b5563; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
                      Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.
                      Klicken Sie auf den Button unten, um ein neues Passwort zu vergeben.
                    </p>

                    <div style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 24px 0;">
                      <p style="color: #92400e; font-size: 15px; line-height: 1.6; margin: 0;">
                        <strong>Dieser Link ist nur 1 Stunde gültig!</strong><br>
                        Gültig bis: ${expiresAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr
                      </p>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${resetUrl}" style="display: inline-block; background-color: #F27024; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 15px;">
                        Passwort zurücksetzen
                      </a>
                    </div>

                    <div style="background-color: #f9fafb; border-left: 4px solid #F27024; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
                        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:
                      </p>
                      <p style="color: #F27024; font-size: 12px; word-break: break-all; margin: 0;">
                        <a href="${resetUrl}" style="color: #F27024; text-decoration: none;">${resetUrl}</a>
                      </p>
                    </div>

                    <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0 0; line-height: 1.6;">
                      <strong>Sie haben diese E-Mail nicht angefordert?</strong><br>
                      Falls Sie keine Passwort-Zurücksetzung angefordert haben, ignorieren Sie diese E-Mail einfach.
                      Ihr Passwort bleibt unverändert.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 24px 40px; border-top: 1px solid #e5e7eb;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5;">
                            <strong>ramboeck.IT</strong><br>
                            IT-Dienstleistungen & Consulting
                          </p>
                          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                            Diese E-Mail wurde automatisch von RamboFlow generiert.<br>
                            Bei Fragen wenden Sie sich an <a href="mailto:support@ramboeck-it.com" style="color: #F27024; text-decoration: none;">support@ramboeck-it.com</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Legal Footer -->
              <table width="600" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 20px 0; text-align: center;">
                    <p style="color: #9ca3af; font-size: 11px; margin: 0;">
                      © ${new Date().getFullYear()} ramboeck.IT - Alle Rechte vorbehalten
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

Hallo ${userName},

Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.
Klicken Sie auf den Link unten, um ein neues Passwort zu vergeben.

Dieser Link ist nur 1 Stunde gültig!
Gültig bis: ${expiresAt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} Uhr

Passwort zurücksetzen:
${resetUrl}

Sie haben diese E-Mail nicht angefordert?
Falls Sie keine Passwort-Zurücksetzung angefordert haben, ignorieren Sie diese E-Mail einfach.
Ihr Passwort bleibt unverändert.

--
RamboFlow von ramboeck.IT
  `.trim();
}

export default router;
