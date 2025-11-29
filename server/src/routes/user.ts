import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';

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

    const result = await pool.query(
      `SELECT id, username, email, account_type, organization_name, customer_number, display_name,
              team_id, team_role, mfa_enabled, accent_color, gray_tone, time_rounding_interval,
              time_format, has_ticket_access, created_at, last_login
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = transformRow(result.rows[0]);

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
    let paramCount = 1;

    if (updates.accentColor !== undefined) {
      fields.push(`accent_color = $${paramCount++}`);
      values.push(updates.accentColor);
    }
    if (updates.grayTone !== undefined) {
      fields.push(`gray_tone = $${paramCount++}`);
      values.push(updates.grayTone);
    }
    if (updates.timeRoundingInterval !== undefined) {
      fields.push(`time_rounding_interval = $${paramCount++}`);
      values.push(updates.timeRoundingInterval);
    }
    if (updates.organizationName !== undefined) {
      fields.push(`organization_name = $${paramCount++}`);
      values.push(updates.organizationName || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const userResult = await pool.query(
      `SELECT id, username, email, account_type, organization_name, customer_number, display_name,
              team_id, team_role, mfa_enabled, accent_color, gray_tone, time_rounding_interval,
              time_format, has_ticket_access, created_at, last_login
       FROM users WHERE id = $1`,
      [userId]
    );
    const updatedUser = transformRow(userResult.rows[0]);

    auditLog.log({
      userId,
      action: 'settings.update',
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

    const result = await pool.query('SELECT * FROM company_info WHERE user_id = $1', [userId]);
    const company = result.rows.length > 0 ? transformRow(result.rows[0]) : null;

    res.json({
      success: true,
      data: company
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
    const existingResult = await pool.query('SELECT * FROM company_info WHERE user_id = $1', [userId]);
    const existing = existingResult.rows[0];

    if (existing) {
      // Update existing
      await pool.query(
        `UPDATE company_info
         SET name = $1, address = $2, city = $3, zip_code = $4, country = $5, email = $6,
             phone = $7, website = $8, tax_id = $9, logo = $10
         WHERE user_id = $11`,
        [name, address, city, zipCode, country, email, phone || null, website || null, taxId || null, logo || null, userId]
      );
    } else {
      // Create new
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO company_info (id, user_id, name, address, city, zip_code, country, email, phone, website, tax_id, logo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, userId, name, address, city, zipCode, country, email, phone || null, website || null, taxId || null, logo || null]
      );
    }

    const companyResult = await pool.query('SELECT * FROM company_info WHERE user_id = $1', [userId]);
    const company = transformRow(companyResult.rows[0]);

    auditLog.log({
      userId,
      action: 'settings.update',
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
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = transformRow(userResult.rows[0]);

    const customersResult = await pool.query('SELECT * FROM customers WHERE user_id = $1', [userId]);
    const customers = transformRows(customersResult.rows);

    const projectsResult = await pool.query('SELECT * FROM projects WHERE user_id = $1', [userId]);
    const projects = transformRows(projectsResult.rows);

    const activitiesResult = await pool.query('SELECT * FROM activities WHERE user_id = $1', [userId]);
    const activities = transformRows(activitiesResult.rows);

    const entriesResult = await pool.query('SELECT * FROM time_entries WHERE user_id = $1', [userId]);
    const entries = transformRows(entriesResult.rows);

    const companyResult = await pool.query('SELECT * FROM company_info WHERE user_id = $1', [userId]);
    const company = companyResult.rows.length > 0 ? transformRow(companyResult.rows[0]) : null;

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
      details: JSON.stringify({ deletedAt: new Date().toISOString() }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    // Delete user (cascades to all related data due to foreign keys)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

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
