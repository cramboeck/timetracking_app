import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import { logTicketActivity } from './tickets';

const router = Router();

// Validation schemas
const createEntrySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().min(0),
  projectId: z.string().uuid(),
  activityId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
  isRunning: z.boolean().default(false)
});

const updateEntrySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().min(0).optional(),
  projectId: z.string().uuid().optional(),
  activityId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional().nullable(),
  description: z.string().max(1000).optional(),
  isRunning: z.boolean().optional()
});

// GET /api/entries - Get all entries for current organization
router.get('/', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query('SELECT * FROM time_entries WHERE organization_id = $1', [organizationId]);
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
router.get('/:id', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM time_entries WHERE id = $1 AND organization_id = $2', [id, organizationId]);
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

// POST /api/entries - Create new entry (requires member role)
router.post('/', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createEntrySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { startTime, endTime, duration, projectId, activityId, ticketId, description, isRunning } = req.body;

    // Verify project belongs to organization
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId]);
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project not found or does not belong to your organization' });
    }

    // Verify activity belongs to organization (if provided)
    if (activityId) {
      const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1 AND organization_id = $2', [activityId, organizationId]);
      if (activityResult.rows.length === 0) {
        return res.status(400).json({ error: 'Activity not found or does not belong to your organization' });
      }
    }

    // Verify ticket belongs to organization (if provided)
    if (ticketId) {
      const ticketResult = await pool.query('SELECT * FROM tickets WHERE id = $1 AND organization_id = $2', [ticketId, organizationId]);
      if (ticketResult.rows.length === 0) {
        return res.status(400).json({ error: 'Ticket not found or does not belong to your organization' });
      }
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO time_entries (id, user_id, organization_id, project_id, activity_id, ticket_id, start_time, end_time, duration, description, is_running, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        userId,
        organizationId,
        projectId,
        activityId || null,
        ticketId || null,
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

    // Log ticket activity if time was logged to a ticket
    if (ticketId) {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      logTicketActivity(
        ticketId,
        userId,
        null,
        'time_logged',
        null,
        durationStr,
        { timeEntryId: id, duration, description: description || null }
      ).catch(err => console.error('Failed to log ticket time activity:', err));

      // Update ticket's updated_at
      await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);
    }

    res.status(201).json({
      success: true,
      data: newEntry
    });
  } catch (error) {
    console.error('Create entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/entries/:id - Update entry (requires member role)
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateEntrySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    // Verify entry belongs to organization
    const entryResult = await pool.query('SELECT * FROM time_entries WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Verify project belongs to organization (if updating projectId)
    if (updates.projectId) {
      const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND organization_id = $2', [updates.projectId, organizationId]);
      if (projectResult.rows.length === 0) {
        return res.status(400).json({ error: 'Project not found or does not belong to your organization' });
      }
    }

    // Verify activity belongs to organization (if updating activityId)
    if (updates.activityId) {
      const activityResult = await pool.query('SELECT * FROM activities WHERE id = $1 AND organization_id = $2', [updates.activityId, organizationId]);
      if (activityResult.rows.length === 0) {
        return res.status(400).json({ error: 'Activity not found or does not belong to your organization' });
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
    if (updates.ticketId !== undefined) {
      fields.push(`ticket_id = $${paramCount++}`);
      values.push(updates.ticketId);
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

    // Log ticket activity if time entry was newly linked to a ticket
    const originalTicketId = entryResult.rows[0].ticket_id;
    const newTicketId = updatedEntry.ticketId;

    if (newTicketId && newTicketId !== originalTicketId) {
      const duration = updatedEntry.duration || 0;
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      logTicketActivity(
        newTicketId,
        userId,
        null,
        'time_logged',
        null,
        durationStr,
        { timeEntryId: id, duration, description: updatedEntry.description || null }
      ).catch(err => console.error('Failed to log ticket time activity:', err));

      // Update ticket's updated_at
      await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [newTicketId]);
    }

    res.json({
      success: true,
      data: updatedEntry
    });
  } catch (error) {
    console.error('Update entry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/entries/:id - Delete entry (requires member role)
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify entry belongs to organization
    const entryResult = await pool.query('SELECT * FROM time_entries WHERE id = $1 AND organization_id = $2', [id, organizationId]);
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
