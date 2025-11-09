import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createActivitySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isBillable: z.boolean().default(true),
  pricingType: z.enum(['hourly', 'flat']).default('hourly'),
  flatRate: z.number().min(0).optional()
});

const updateActivitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isBillable: z.boolean().optional(),
  pricingType: z.enum(['hourly', 'flat']).optional(),
  flatRate: z.number().min(0).optional()
});

// GET /api/activities - Get all activities for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await pool.query('SELECT * FROM activities WHERE user_id = $1 ORDER BY name', [userId]);
    const activities = result.rows;

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/activities - Create new activity
router.post('/', authenticateToken, validate(createActivitySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, description, isBillable, pricingType, flatRate } = req.body;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO activities (id, user_id, name, description, is_billable, pricing_type, flat_rate, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId, name, description || null, isBillable, pricingType, flatRate || null, createdAt]
    );

    const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1', [id]);
    const newActivity = activityResult.rows[0];

    auditLog.log({
      userId,
      action: 'activity.create',
      details: JSON.stringify({ name }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: newActivity
    });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/activities/:id - Update activity
router.put('/:id', authenticateToken, validate(updateActivitySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const updates = req.body;

    // Verify activity belongs to user
    const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1 AND user_id = $2', [id, userId]);
    if (activityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description || null);
    }
    if (updates.isBillable !== undefined) {
      fields.push(`is_billable = $${paramCount++}`);
      values.push(updates.isBillable); // PostgreSQL uses boolean
    }
    if (updates.pricingType !== undefined) {
      fields.push(`pricing_type = $${paramCount++}`);
      values.push(updates.pricingType);
    }
    if (updates.flatRate !== undefined) {
      fields.push(`flat_rate = $${paramCount++}`);
      values.push(updates.flatRate || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE activities SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query('SELECT * FROM activities WHERE id = $1', [id]);
    const updatedActivity = updatedResult.rows[0];

    auditLog.log({
      userId,
      action: 'activity.update',
      details: JSON.stringify(updates),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedActivity
    });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/activities/:id - Delete activity
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify activity belongs to user
    const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1 AND user_id = $2', [id, userId]);
    if (activityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Check if activity is used in time entries
    const countResult = await pool.query('SELECT COUNT(*) as count FROM time_entries WHERE activity_id = $1', [id]);
    const entryCount = countResult.rows[0];
    if (entryCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete activity with existing time entries. Time entries will be updated to have no activity.' });
    }

    await pool.query('DELETE FROM activities WHERE id = $1', [id]);

    auditLog.log({
      userId,
      action: 'activity.delete',
      details: JSON.stringify({ id }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
