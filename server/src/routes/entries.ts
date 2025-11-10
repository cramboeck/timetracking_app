import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';

const router = Router();

// Validation schemas
const createEntrySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().min(0),
  projectId: z.string().uuid(),
  activityId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
  isRunning: z.boolean().default(false)
});

const updateEntrySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().min(0).optional(),
  projectId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
  isRunning: z.boolean().optional()
});

// GET /api/entries - Get all entries for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await pool.query('SELECT * FROM time_entries WHERE user_id = $1', [userId]);
    const entries = transformRows(result.rows);

    res.json({
      success: true,
      data: entries
    });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/entries/:id - Get single entry
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM time_entries WHERE id = $1 AND user_id = $2', [id, userId]);
    const entry = transformRow(result.rows[0]);

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Get entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/entries - Create new entry
router.post('/', authenticateToken, validate(createEntrySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { startTime, endTime, duration, projectId, activityId, description, isRunning } = req.body;

    // Verify project belongs to user
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project not found or does not belong to you' });
    }

    // Verify activity belongs to user (if provided)
    if (activityId) {
      const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1 AND user_id = $2', [activityId, userId]);
      if (activityResult.rows.length === 0) {
        return res.status(400).json({ error: 'Activity not found or does not belong to you' });
      }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO time_entries (id, user_id, project_id, activity_id, start_time, end_time, duration, description, is_running, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        userId,
        projectId,
        activityId || null,
        startTime,
        endTime || null,
        duration,
        description || '',
        isRunning, // PostgreSQL uses boolean, not 0/1
        createdAt
      ]
    );

    const entryResult = await pool.query('SELECT * FROM time_entries WHERE id = $1', [id]);
    const newEntry = transformRow(entryResult.rows[0]);

    auditLog.log({
      userId,
      action: 'time_entry.create',
      details: JSON.stringify({ projectId, duration }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: newEntry
    });
  } catch (error) {
    console.error('Create entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/entries/:id - Update entry
router.put('/:id', authenticateToken, validate(updateEntrySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const updates = req.body;

    // Verify entry belongs to user
    const entryResult = await pool.query('SELECT * FROM time_entries WHERE id = $1 AND user_id = $2', [id, userId]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Verify project belongs to user (if updating projectId)
    if (updates.projectId) {
      const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [updates.projectId, userId]);
      if (projectResult.rows.length === 0) {
        return res.status(400).json({ error: 'Project not found or does not belong to you' });
      }
    }

    // Verify activity belongs to user (if updating activityId)
    if (updates.activityId) {
      const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1 AND user_id = $2', [updates.activityId, userId]);
      if (activityResult.rows.length === 0) {
        return res.status(400).json({ error: 'Activity not found or does not belong to you' });
      }
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.startTime !== undefined) {
      fields.push(`start_time = $${paramCount++}`);
      values.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      fields.push(`end_time = $${paramCount++}`);
      values.push(updates.endTime);
    }
    if (updates.duration !== undefined) {
      fields.push(`duration = $${paramCount++}`);
      values.push(updates.duration);
    }
    if (updates.projectId !== undefined) {
      fields.push(`project_id = $${paramCount++}`);
      values.push(updates.projectId);
    }
    if (updates.activityId !== undefined) {
      fields.push(`activity_id = $${paramCount++}`);
      values.push(updates.activityId);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.isRunning !== undefined) {
      fields.push(`is_running = $${paramCount++}`);
      values.push(updates.isRunning); // PostgreSQL uses boolean
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE time_entries SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query('SELECT * FROM time_entries WHERE id = $1', [id]);
    const updatedEntry = transformRow(updatedResult.rows[0]);

    auditLog.log({
      userId,
      action: 'time_entry.update',
      details: JSON.stringify(updates),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedEntry
    });
  } catch (error) {
    console.error('Update entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/entries/:id - Delete entry
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify entry belongs to user
    const entryResult = await pool.query('SELECT * FROM time_entries WHERE id = $1 AND user_id = $2', [id, userId]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);

    auditLog.log({
      userId,
      action: 'time_entry.delete',
      details: JSON.stringify({ id }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Entry deleted successfully'
    });
  } catch (error) {
    console.error('Delete entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
