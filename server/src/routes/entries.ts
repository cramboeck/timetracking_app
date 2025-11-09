import { Router } from 'express';
import { db, queries } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';

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

    const entries = queries.getEntriesByUserId.all(userId);

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

    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(id, userId);

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
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId);
    if (!project) {
      return res.status(400).json({ error: 'Project not found or does not belong to you' });
    }

    // Verify activity belongs to user (if provided)
    if (activityId) {
      const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(activityId, userId);
      if (!activity) {
        return res.status(400).json({ error: 'Activity not found or does not belong to you' });
      }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    queries.createTimeEntry.run(
      id,
      userId,
      projectId,
      startTime,
      endTime || null,
      duration,
      description || '',
      isRunning ? 1 : 0,
      createdAt
    );

    // If there's an activityId, update the entry (workaround since createTimeEntry doesn't have activityId yet)
    if (activityId) {
      db.prepare('UPDATE time_entries SET activity_id = ? WHERE id = ?').run(activityId, id);
    }

    const newEntry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);

    auditLog.log({
      userId,
      action: 'time_entry.create',
      resource: `entry:${id}`,
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
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(id, userId);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Verify project belongs to user (if updating projectId)
    if (updates.projectId) {
      const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(updates.projectId, userId);
      if (!project) {
        return res.status(400).json({ error: 'Project not found or does not belong to you' });
      }
    }

    // Verify activity belongs to user (if updating activityId)
    if (updates.activityId) {
      const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(updates.activityId, userId);
      if (!activity) {
        return res.status(400).json({ error: 'Activity not found or does not belong to you' });
      }
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.startTime !== undefined) {
      fields.push('start_time = ?');
      values.push(updates.startTime);
    }
    if (updates.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.endTime);
    }
    if (updates.duration !== undefined) {
      fields.push('duration = ?');
      values.push(updates.duration);
    }
    if (updates.projectId !== undefined) {
      fields.push('project_id = ?');
      values.push(updates.projectId);
    }
    if (updates.activityId !== undefined) {
      fields.push('activity_id = ?');
      values.push(updates.activityId);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.isRunning !== undefined) {
      fields.push('is_running = ?');
      values.push(updates.isRunning ? 1 : 0);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE time_entries SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);

    const updatedEntry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);

    auditLog.log({
      userId,
      action: 'time_entry.update',
      resource: `entry:${id}`,
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
    const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(id, userId);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    queries.deleteTimeEntry.run(id);

    auditLog.log({
      userId,
      action: 'time_entry.delete',
      resource: `entry:${id}`,
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
