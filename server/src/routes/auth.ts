import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { emailService } from '../services/emailService';
import { auditLog } from '../services/auditLog';
import { authLimiter } from '../middleware/rateLimiter';
import { validate, registerSchema, loginSchema } from '../middleware/validation';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { username, email, password, accountType, organizationName, inviteCode } = req.body;

    // Check if user exists
    const existingUsername = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUsername.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, account_type, organization_name,
       team_id, team_role, mfa_enabled, accent_color, gray_tone, time_rounding_interval,
       created_at, last_login)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        userId,
        username,
        email,
        passwordHash,
        accountType,
        organizationName || null,
        null, // teamId
        null, // teamRole
        false, // mfaEnabled (changed from 0 to false)
        'blue', // accentColor
        'medium', // grayTone
        15, // timeRoundingInterval
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    // Audit log
    auditLog.log({
      userId,
      action: 'user.register',
      details: JSON.stringify({ username, email, accountType }),
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
      token,
      user: {
        id: userId,
        username,
        email,
        accountType
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userResult.rows[0] as any;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [new Date().toISOString(), user.id]);

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.login',
      details: JSON.stringify({ username }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
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

export default router;
