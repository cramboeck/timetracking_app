import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  rateType: z.enum(['hourly', 'daily']),
  hourlyRate: z.number().min(0),
  isActive: z.boolean().default(true)
});

const updateProjectSchema = z.object({
  customerId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  rateType: z.enum(['hourly', 'daily']).optional(),
  hourlyRate: z.number().min(0).optional(),
  isActive: z.boolean().optional()
});

// GET /api/projects - Get all projects for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await pool.query('SELECT * FROM projects WHERE user_id = $1 ORDER BY name', [userId]);
    const projects = result.rows;

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects - Create new project
router.post('/', authenticateToken, validate(createProjectSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { customerId, name, rateType, hourlyRate, isActive } = req.body;

    // Verify customer belongs to user
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [customerId, userId]);
    if (customerResult.rows.length === 0) {
      return res.status(400).json({ error: 'Customer not found or does not belong to you' });
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO projects (id, user_id, customer_id, name, rate_type, hourly_rate, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId, customerId, name, rateType, hourlyRate, isActive, createdAt]
    );

    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    const newProject = projectResult.rows[0];

    auditLog.log({
      userId,
      action: 'project.create',
      details: `project:${id}`,
      details: JSON.stringify({ name, customerId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: newProject
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', authenticateToken, validate(updateProjectSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const updates = req.body;

    // Verify project belongs to user
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify customer belongs to user (if updating customerId)
    if (updates.customerId) {
      const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [updates.customerId, userId]);
      if (customerResult.rows.length === 0) {
        return res.status(400).json({ error: 'Customer not found or does not belong to you' });
      }
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.customerId !== undefined) {
      fields.push(`customer_id = $${paramCount++}`);
      values.push(updates.customerId);
    }
    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.rateType !== undefined) {
      fields.push(`rate_type = $${paramCount++}`);
      values.push(updates.rateType);
    }
    if (updates.hourlyRate !== undefined) {
      fields.push(`hourly_rate = $${paramCount++}`);
      values.push(updates.hourlyRate);
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(updates.isActive); // PostgreSQL uses boolean
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE projects SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    const updatedProject = updatedResult.rows[0];

    auditLog.log({
      userId,
      action: 'project.update',
      details: `project:${id}`,
      details: JSON.stringify(updates),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedProject
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id - Delete project
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify project belongs to user
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if project has time entries
    const countResult = await pool.query('SELECT COUNT(*) as count FROM time_entries WHERE project_id = $1', [id]);
    const entryCount = countResult.rows[0];
    if (entryCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete project with existing time entries. Please delete entries first or mark project as inactive.' });
    }

    await pool.query('DELETE FROM projects WHERE id = $1', [id]);

    auditLog.log({
      userId,
      action: 'project.delete',
      details: `project:${id}`,
      details: JSON.stringify({ id }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
