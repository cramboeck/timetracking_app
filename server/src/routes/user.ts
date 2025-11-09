import { Router } from 'express';
import { db } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schema for user settings
const updateSettingsSchema = z.object({
  accentColor: z.string().optional(),
  grayTone: z.string().optional(),
  timeRoundingInterval: z.number().int().min(1).optional(),
  organizationName: z.string().max(200).optional()
});

// GET /api/user/me - Get current user profile
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const user = db.prepare(`
      SELECT id, username, email, account_type, organization_name, team_id, team_role,
             mfa_enabled, accent_color, gray_tone, time_rounding_interval, created_at, last_login
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/user/settings - Update user settings
router.put('/settings', authenticateToken, validate(updateSettingsSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const updates = req.body;

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.accentColor !== undefined) {
      fields.push('accent_color = ?');
      values.push(updates.accentColor);
    }
    if (updates.grayTone !== undefined) {
      fields.push('gray_tone = ?');
      values.push(updates.grayTone);
    }
    if (updates.timeRoundingInterval !== undefined) {
      fields.push('time_rounding_interval = ?');
      values.push(updates.timeRoundingInterval);
    }
    if (updates.organizationName !== undefined) {
      fields.push('organization_name = ?');
      values.push(updates.organizationName || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);

    const updatedUser = db.prepare(`
      SELECT id, username, email, account_type, organization_name, team_id, team_role,
             mfa_enabled, accent_color, gray_tone, time_rounding_interval, created_at, last_login
      FROM users WHERE id = ?
    `).get(userId);

    auditLog.log({
      userId,
      action: 'settings.update',
      resource: `user:${userId}`,
      details: JSON.stringify(updates),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/user/company - Get company information
router.get('/company', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const company = db.prepare('SELECT * FROM company_info WHERE user_id = ?').get(userId);

    res.json({
      success: true,
      data: company || null
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/user/company - Create or update company information
router.post('/company', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, address, city, zipCode, country, email, phone, website, taxId, logo } = req.body;

    // Check if company info already exists
    const existing = db.prepare('SELECT * FROM company_info WHERE user_id = ?').get(userId);

    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE company_info
        SET name = ?, address = ?, city = ?, zip_code = ?, country = ?, email = ?,
            phone = ?, website = ?, tax_id = ?, logo = ?
        WHERE user_id = ?
      `).run(name, address, city, zipCode, country, email, phone || null, website || null, taxId || null, logo || null, userId);
    } else {
      // Create new
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO company_info (id, user_id, name, address, city, zip_code, country, email, phone, website, tax_id, logo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, name, address, city, zipCode, country, email, phone || null, website || null, taxId || null, logo || null);
    }

    const company = db.prepare('SELECT * FROM company_info WHERE user_id = ?').get(userId);

    auditLog.log({
      userId,
      action: 'settings.update',
      resource: `company:${userId}`,
      details: JSON.stringify({ name }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/user/export - Export user data (GDPR Article 20)
router.post('/export', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Gather all user data
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const customers = db.prepare('SELECT * FROM customers WHERE user_id = ?').all(userId);
    const projects = db.prepare('SELECT * FROM projects WHERE user_id = ?').all(userId);
    const activities = db.prepare('SELECT * FROM activities WHERE user_id = ?').all(userId);
    const entries = db.prepare('SELECT * FROM time_entries WHERE user_id = ?').all(userId);
    const company = db.prepare('SELECT * FROM company_info WHERE user_id = ?').get(userId);

    const exportData = {
      user,
      customers,
      projects,
      activities,
      timeEntries: entries,
      companyInfo: company,
      exportDate: new Date().toISOString()
    };

    auditLog.log({
      userId,
      action: 'data.export',
      resource: `user:${userId}`,
      details: JSON.stringify({ exportDate: exportData.exportDate }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/user/account - Delete user account (GDPR Article 17)
router.delete('/account', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    auditLog.log({
      userId,
      action: 'user.delete',
      resource: `user:${userId}`,
      details: JSON.stringify({ deletedAt: new Date().toISOString() }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    // Delete user (cascades to all related data due to foreign keys)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({
      success: true,
      message: 'Account and all associated data deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
