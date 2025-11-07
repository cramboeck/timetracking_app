import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queries } from '../config/database';
import { emailService } from '../services/emailService';
import { auditLog } from '../services/auditLog';
import { authLimiter } from '../middleware/rateLimiter';
import { validate, registerSchema, loginSchema } from '../middleware/validation';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { username, email, password, accountType, organizationName, inviteCode } = req.body;

    // Check if user exists
    if (queries.getUserByUsername.get(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    if (queries.getUserByEmail.get(email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = crypto.randomUUID();
    queries.createUser.run(
      userId,
      username,
      email,
      passwordHash,
      accountType,
      organizationName || null,
      null, // teamId
      null, // teamRole
      0, // mfaEnabled
      'blue', // accentColor
      'medium', // grayTone
      15, // timeRoundingInterval
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Audit log
    auditLog.log({
      userId,
      action: 'user.register',
      resource: `user:${userId}`,
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

    const user = queries.getUserByUsername.get(username) as any;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    queries.updateUserLastLogin.run(new Date().toISOString(), user.id);

    // Audit log
    auditLog.log({
      userId: user.id,
      action: 'user.login',
      resource: `user:${user.id}`,
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
