import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/database';
import { emailService } from '../services/emailService';
import { auditLog } from '../services/auditLog';
import { securityService } from '../services/securityService';
import { authLimiter } from '../middleware/rateLimiter';
import { validate, registerSchema, loginSchema } from '../middleware/validation';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { checkTrustedDevice } from './mfa';

const router = Router();

// Helper to generate slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const client = await pool.connect();

  try {
    const { username, email, password, accountType, organizationName, inviteCode } = req.body;

    // Check if user exists
    const existingUsername = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingEmail = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Check for valid invitation code
    let invitation = null;
    if (inviteCode) {
      const inviteResult = await client.query(
        `SELECT oi.*, o.name as organization_name
         FROM organization_invitations oi
         JOIN organizations o ON o.id = oi.organization_id
         WHERE oi.invitation_code = $1
         AND oi.accepted_at IS NULL
         AND oi.expires_at > NOW()`,
        [inviteCode]
      );

      if (inviteResult.rows.length > 0) {
        invitation = inviteResult.rows[0];
      }
    }

    await client.query('BEGIN');

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate unique customer number
    const customerNumber = `C-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().substring(0, 4).toUpperCase()}`;

    // Create user
    const userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users (id, username, email, password_hash, account_type, organization_name,
       team_id, team_role, mfa_enabled, accent_color, gray_tone, time_rounding_interval,
       created_at, last_login, customer_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        userId,
        username,
        email,
        passwordHash,
        accountType,
        organizationName || null,
        null, // teamId
        null, // teamRole
        false, // mfaEnabled
        'blue', // accentColor
        'medium', // grayTone
        15, // timeRoundingInterval
        new Date().toISOString(),
        new Date().toISOString(),
        customerNumber
      ]
    );

    let joinedOrganizationId = null;
    let joinedOrganizationName = null;

    if (invitation) {
      // User is joining via invitation - add them to the existing organization
      const memberId = crypto.randomUUID();
      await client.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [memberId, invitation.organization_id, userId, invitation.role]
      );

      // Mark invitation as used
      await client.query(
        `UPDATE organization_invitations SET accepted_at = NOW(), accepted_by = $1 WHERE id = $2`,
        [userId, invitation.id]
      );

      joinedOrganizationId = invitation.organization_id;
      joinedOrganizationName = invitation.organization_name;

      console.log(`✅ User ${username} joined organization ${invitation.organization_name} via invitation`);
    } else {
      // No invitation - create a new organization for the user
      const orgId = crypto.randomUUID();
      const orgName = organizationName || username;
      let orgSlug = generateSlug(orgName);

      // Ensure slug is unique
      const existingSlug = await client.query('SELECT 1 FROM organizations WHERE slug = $1', [orgSlug]);
      if (existingSlug.rows.length > 0) {
        orgSlug = `${orgSlug}-${crypto.randomUUID().substring(0, 4)}`;
      }

      await client.query(
        `INSERT INTO organizations (id, name, slug, owner_user_id)
         VALUES ($1, $2, $3, $4)`,
        [orgId, orgName, orgSlug, userId]
      );

      // Add user as owner
      const memberId = crypto.randomUUID();
      await client.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [memberId, orgId, userId, 'owner']
      );

      joinedOrganizationId = orgId;
      joinedOrganizationName = orgName;

      console.log(`✅ Created new organization "${orgName}" for user ${username}`);
    }

    await client.query('COMMIT');

    // Audit log
    auditLog.log({
      userId,
      action: 'user.register',
      details: JSON.stringify({
        username,
        email,
        accountType,
        joinedViaInvitation: !!invitation,
        organizationId: joinedOrganizationId
      }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    // Send welcome email
    await emailService.sendWelcomeEmail({
      userId,
      userName: username,
      userEmail: email
    });

    // Generate token
    const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: userId,
          username,
          email,
          accountType
        },
        organization: {
          id: joinedOrganizationId,
          name: joinedOrganizationName,
          joinedViaInvitation: !!invitation
        }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get client IP (handle proxy)
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    // Try to find user by email (case-insensitive) or username (case-insensitive)
    const userResult = await pool.query(
      `SELECT id, username, email, password_hash, account_type, role, mfa_enabled, mfa_secret,
              accent_color, gray_tone, dark_mode, time_rounding_interval, time_format
       FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
      [username]
    );
    const user = userResult.rows[0] as any;

    if (!user) {
      // Log failed login attempt (user not found)
      securityService.logFailedLogin(clientIP, username, userAgent);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      // Log failed login attempt (wrong password)
      securityService.logFailedLogin(clientIP, username, userAgent);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if MFA is enabled
    if (user.mfa_enabled && user.mfa_secret) {
      // Check if this is a trusted device
      const deviceToken = req.headers['x-device-token'] as string;
      const isTrusted = deviceToken ? await checkTrustedDevice(user.id, deviceToken) : false;

      if (isTrusted) {
        console.log(`🔐 MFA skipped for trusted device for user "${user.username}"`);
        // Skip MFA for trusted device - continue with login
      } else {
        // Generate a temporary token for MFA verification (short-lived)
        const mfaToken = jwt.sign(
          { userId: user.id, mfaPending: true },
          process.env.JWT_SECRET!,
          { expiresIn: '5m' } // 5 minutes to complete MFA
        );

        console.log(`🔐 MFA required for user "${user.username}"`);

        return res.json({
          success: true,
          mfaRequired: true,
          mfaToken,
          user: {
            id: user.id,
            username: user.username
          }
        });
      }
    }

    // Determine if this was a trusted device login (MFA enabled but skipped)
    const wasTrustedDevice = user.mfa_enabled && user.mfa_secret;

    // Log successful login (no MFA or trusted device)
    securityService.logSuccessfulLogin(clientIP, user.username, user.id);

    // Update last login
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [new Date().toISOString(), user.id]);

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.login',
      details: JSON.stringify({
        username: user.username,
        email: user.email,
        ip: clientIP,
        mfa: false,
        trustedDevice: wasTrustedDevice
      }),
      ipAddress: clientIP,
      userAgent: userAgent
    });

    // Generate token
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password endpoint
router.post('/change-password', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.userId!;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain uppercase, lowercase and a number' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);

    // Audit log
    auditLog.log({
      userId,
      action: 'user.change_password',
      details: JSON.stringify({ success: true }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile endpoint (username and/or email)
router.patch('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { username, email } = req.body;
    const userId = req.userId!;

    // Get current user
    const userResult = await pool.query(
      'SELECT id, username, email, account_type FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new username is taken (case-insensitive)
    if (username && username.toLowerCase() !== (user.username || '').toLowerCase()) {
      const existingUsername = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
        [username, userId]
      );
      if (existingUsername.rows.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Check if new email is taken (case-insensitive)
    if (email && email.toLowerCase() !== (user.email || '').toLowerCase()) {
      const existingEmail = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
        [email, userId]
      );
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Update user profile
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (username) {
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }

    if (email) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    // Audit log
    auditLog.log({
      userId,
      action: 'user.update_profile',
      details: JSON.stringify({ username, email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    // Get updated user (only select needed fields, never expose password_hash)
    const updatedUser = await pool.query(
      'SELECT id, username, email, account_type FROM users WHERE id = $1',
      [userId]
    );
    const updated = updatedUser.rows[0];

    res.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        accountType: updated.account_type
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
