import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import { logTicketActivity } from './tickets';
import { logger } from '../utils/logger';

const router = Router();

// Explicit column lists (no SELECT *)
const TIME_ENTRY_COLUMNS = `
  id, organization_id, user_id, project_id, activity_id, ticket_id,
  start_time, end_time, duration, description, is_running, is_billable,
  external_id, external_source, created_at,
  entry_scope, internal_category, customer_visibility
`;

const PROJECT_COLUMNS = `
  id, organization_id, user_id, customer_id, name, is_active, rate_type,
  hourly_rate, created_at, deleted_at
`;

const ACTIVITY_COLUMNS = `
  id, organization_id, user_id, name, is_billable, created_at
`;

const TICKET_COLUMNS_BASIC = `
  id, organization_id, ticket_number, title, status, priority, customer_id
`;

// Validation schemas
const entryScopeSchema = z.enum(['customer_project', 'internal', 'absence']);
const customerVisibilitySchema = z.enum(['hidden', 'summary', 'detailed']);

const createEntrySchema = z.object({
  clientId: z.string().uuid().optional(), // Client-generated ID for idempotency
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().min(0),
  projectId: z.string().uuid().optional().nullable(), // Optional for internal/absence entries
  activityId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  description: z.string().max(1000).optional(),
  isRunning: z.boolean().default(false),
  isBillable: z.boolean().default(true),
  entryScope: entryScopeSchema.default('customer_project'),
  internalCategory: z.string().max(100).optional().nullable(),
  customerVisibility: customerVisibilitySchema.default('hidden')
}).refine(
  (data) => data.entryScope !== 'customer_project' || data.projectId,
  { message: 'projectId is required for customer_project entries', path: ['projectId'] }
);

const updateEntrySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  duration: z.number().int().min(0).optional(),
  projectId: z.string().uuid().optional().nullable(),
  activityId: z.string().uuid().optional().nullable(),
  ticketId: z.string().uuid().optional().nullable(),
  description: z.string().max(1000).optional(),
  isRunning: z.boolean().optional(),
  isBillable: z.boolean().optional(),
  entryScope: entryScopeSchema.optional(),
  internalCategory: z.string().max(100).optional().nullable(),
  customerVisibility: customerVisibilitySchema.optional()
});

// GET /api/entries - Get entries for current organization
// Supports pagination (?page=1&limit=100) and filters:
//   ?startDate=ISO  ?endDate=ISO   ?projectId=UUID
//   ?customerId=UUID                 (joins via projects.customer_id)
//   ?searchText=foo                  (case-insensitive ILIKE on description)
// Backward-compatible: ?all=true returns all entries without pagination (legacy behaviour)
router.get('/', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Legacy support: ?all=true bypasses pagination for existing clients
    const returnAll = req.query.all === 'true';

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
    const offset = (page - 1) * limit;

    const startDate  = req.query.startDate  as string | undefined;
    const endDate    = req.query.endDate    as string | undefined;
    const projectId  = req.query.projectId  as string | undefined;
    const customerId = req.query.customerId as string | undefined;
    const searchText = (req.query.searchText as string | undefined)?.trim();

    const params: unknown[] = [organizationId];
    let whereClause = 'WHERE organization_id = $1';

    if (startDate) {
      params.push(startDate);
      whereClause += ` AND start_time >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      whereClause += ` AND start_time <= $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      whereClause += ` AND project_id = $${params.length}`;
    }
    if (customerId) {
      // Subquery is scoped to the same organization, so cross-org customer
      // IDs return zero matching projects → zero entries (safe by design).
      params.push(customerId);
      whereClause += ` AND project_id IN (
        SELECT id FROM projects
        WHERE customer_id = $${params.length}
          AND organization_id = $1
          AND deleted_at IS NULL
      )`;
    }
    if (searchText) {
      // Use ILIKE on the description for case-insensitive substring search.
      // The wildcards are added server-side so the client can't inject them.
      params.push(`%${searchText}%`);
      whereClause += ` AND description ILIKE $${params.length}`;
    }

    // Explicit column list – never expose internal fields accidentally
    const baseQuery = `
      SELECT id, organization_id, user_id, project_id, activity_id, ticket_id,
             start_time, end_time, duration, description, is_running, is_billable,
             created_at
      FROM time_entries
      ${whereClause}
      ORDER BY start_time DESC`;

    if (returnAll) {
      // Legacy path: return all matching entries without pagination
      const result = await pool.query(baseQuery, params);
      return res.json({ success: true, data: transformRows(result.rows) });
    }

    // Count total for pagination metadata
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM time_entries ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch page
    params.push(limit, offset);
    const result = await pool.query(
      `${baseQuery} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: transformRows(result.rows),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/entries/bulk-update - Bulk update multiple entries (requires member role)
// IMPORTANT: This route must be defined BEFORE /:id routes to avoid matching "bulk-update" as an ID
router.put('/bulk-update', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { entryIds, updates } = req.body;

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return res.status(400).json({ error: 'Entry IDs are required' });
    }

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Updates are required' });
    }

    // Verify all entries belong to organization
    const placeholders = entryIds.map((_, i) => `$${i + 2}`).join(', ');
    const verifyResult = await pool.query(
      `SELECT id FROM time_entries WHERE id IN (${placeholders}) AND organization_id = $1`,
      [organizationId, ...entryIds]
    );

    if (verifyResult.rows.length !== entryIds.length) {
      return res.status(400).json({ error: 'Some entries were not found or do not belong to your organization' });
    }

    // If updating projectId, verify project belongs to organization
    if (updates.projectId) {
      const projectResult = await pool.query(
        `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1 AND organization_id = $2`,
        [updates.projectId, organizationId]
      );
      if (projectResult.rows.length === 0) {
        return res.status(400).json({ error: 'Project not found or does not belong to your organization' });
      }
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.projectId !== undefined) {
      fields.push(`project_id = $${paramCount++}`);
      values.push(updates.projectId);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }
    if (updates.isBillable !== undefined) {
      fields.push(`is_billable = $${paramCount++}`);
      values.push(updates.isBillable);
    }
    if (updates.activityId !== undefined) {
      // Empty string means remove the activity
      fields.push(`activity_id = $${paramCount++}`);
      values.push(updates.activityId || null);
    }
    if (updates.entryScope !== undefined) {
      fields.push(`entry_scope = $${paramCount++}`);
      values.push(updates.entryScope);
    }
    if (updates.internalCategory !== undefined) {
      fields.push(`internal_category = $${paramCount++}`);
      values.push(updates.internalCategory);
    }
    if (updates.customerVisibility !== undefined) {
      fields.push(`customer_visibility = $${paramCount++}`);
      values.push(updates.customerVisibility);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Create placeholders for entry IDs
    const idPlaceholders = entryIds.map((_, i) => `$${paramCount + i}`).join(', ');
    values.push(...entryIds);

    const updateQuery = `UPDATE time_entries SET ${fields.join(', ')} WHERE id IN (${idPlaceholders})`;
    await pool.query(updateQuery, values);

    auditLog.log({
      userId,
      action: 'time_entry.bulk_update',
      details: JSON.stringify({ entryIds, updates }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: { updatedCount: entryIds.length }
    });
  } catch (error) {
    console.error('Bulk update entries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/entries/timeframes - Distinct (year, month) pairs in which the
// current organization has time entries. Used to populate filter dropdowns
// in TimeEntriesList without depending on the currently-paginated page.
router.get('/timeframes', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT
         EXTRACT(YEAR  FROM start_time)::int AS year,
         EXTRACT(MONTH FROM start_time)::int AS month
       FROM time_entries
       WHERE organization_id = $1
       GROUP BY year, month
       ORDER BY year DESC, month DESC`,
      [organizationId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Get entries timeframes error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/entries/:id - Get single entry
router.get('/:id', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await pool.query(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entries WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
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
    const {
      clientId, startTime, endTime, duration, projectId, activityId, ticketId,
      description, isRunning, isBillable = true,
      entryScope = 'customer_project', internalCategory = null, customerVisibility = 'hidden'
    } = req.body;

    // Idempotency: If clientId is provided, check if entry already exists
    if (clientId) {
      const existingResult = await pool.query(
        `SELECT ${TIME_ENTRY_COLUMNS} FROM time_entries WHERE id = $1 AND organization_id = $2`,
        [clientId, organizationId]
      );
      if (existingResult.rows.length > 0) {
        // Entry already exists - return it (idempotent response)
        const existingEntry = transformRow(existingResult.rows[0]);
        return res.status(200).json({
          success: true,
          data: existingEntry
        });
      }
    }

    // Verify project belongs to organization
    const projectResult = await pool.query(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1 AND organization_id = $2`, [projectId, organizationId]);
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project not found or does not belong to your organization' });
    }

    // Verify activity belongs to organization (if provided)
    if (activityId) {
      const activityResult = await pool.query(`SELECT ${ACTIVITY_COLUMNS} FROM activities WHERE id = $1 AND organization_id = $2`, [activityId, organizationId]);
      if (activityResult.rows.length === 0) {
        return res.status(400).json({ error: 'Activity not found or does not belong to your organization' });
      }
    }

    // Verify ticket belongs to organization (if provided)
    if (ticketId) {
      const ticketResult = await pool.query(`SELECT ${TICKET_COLUMNS_BASIC} FROM tickets WHERE id = $1 AND organization_id = $2`, [ticketId, organizationId]);
      if (ticketResult.rows.length === 0) {
        return res.status(400).json({ error: 'Ticket not found or does not belong to your organization' });
      }
    }

    // Use client-provided ID for idempotency, or generate a new one
    const id = clientId || crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Prevent overlapping running timers: if the new entry is running, auto-stop
    // any other running timer the user might have left open (forgotten timer).
    // Returns metadata about the stopped timer so the frontend can show a toast.
    let autoStoppedTimer: { id: string; duration: number } | null = null;
    if (isRunning) {
      const runningResult = await pool.query(
        `SELECT id FROM time_entries
         WHERE user_id = $1 AND organization_id = $2 AND is_running = true AND id != $3`,
        [userId, organizationId, id]
      );

      for (const row of runningResult.rows) {
        const stopResult = await pool.query(
          `UPDATE time_entries
           SET is_running = false,
               end_time = NOW(),
               duration = GREATEST(EXTRACT(EPOCH FROM (NOW() - start_time))::int, 0)
           WHERE id = $1
           RETURNING id, duration`,
          [row.id]
        );

        if (stopResult.rows.length > 0) {
          const stopped = stopResult.rows[0];
          autoStoppedTimer = { id: stopped.id, duration: stopped.duration };
          logger.info(`Auto-stopped previous running timer for user ${userId}`, {
            previousTimerId: stopped.id,
            durationSeconds: stopped.duration
          });

          auditLog.log({
            userId,
            action: 'time_entry.auto_stop',
            details: JSON.stringify({ previousTimerId: stopped.id, durationSeconds: stopped.duration, reason: 'new_timer_started' }),
            ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
            userAgent: req.headers['user-agent']
          });
        }
      }
    }

    await pool.query(
      `INSERT INTO time_entries (id, user_id, organization_id, project_id, activity_id, ticket_id, start_time, end_time, duration, description, is_running, is_billable, created_at, entry_scope, internal_category, customer_visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        userId,
        organizationId,
        projectId || null, // Can be null for internal/absence entries
        activityId || null,
        ticketId || null,
        startTime,
        endTime || null,
        duration,
        description || '',
        isRunning, // PostgreSQL uses boolean, not 0/1
        isBillable,
        createdAt,
        entryScope,
        internalCategory,
        customerVisibility
      ]
    );

    const entryResult = await pool.query(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entries WHERE id = $1`, [id]);
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
      await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
    }

    res.status(201).json({
      success: true,
      data: newEntry,
      ...(autoStoppedTimer && { autoStoppedTimer })
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
    const entryResult = await pool.query(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entries WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Verify project belongs to organization (if updating projectId)
    if (updates.projectId) {
      const projectResult = await pool.query(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1 AND organization_id = $2`, [updates.projectId, organizationId]);
      if (projectResult.rows.length === 0) {
        return res.status(400).json({ error: 'Project not found or does not belong to your organization' });
      }
    }

    // Verify activity belongs to organization (if updating activityId)
    if (updates.activityId) {
      const activityResult = await pool.query(`SELECT ${ACTIVITY_COLUMNS} FROM activities WHERE id = $1 AND organization_id = $2`, [updates.activityId, organizationId]);
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
      values.push(updates.activityId || null);
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
    if (updates.isBillable !== undefined) {
      fields.push(`is_billable = $${paramCount++}`);
      values.push(updates.isBillable);
    }
    if (updates.entryScope !== undefined) {
      fields.push(`entry_scope = $${paramCount++}`);
      values.push(updates.entryScope);
    }
    if (updates.internalCategory !== undefined) {
      fields.push(`internal_category = $${paramCount++}`);
      values.push(updates.internalCategory);
    }
    if (updates.customerVisibility !== undefined) {
      fields.push(`customer_visibility = $${paramCount++}`);
      values.push(updates.customerVisibility);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE time_entries SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entries WHERE id = $1`, [id]);
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
      await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [newTicketId]);
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
    const entryResult = await pool.query(`SELECT ${TIME_ENTRY_COLUMNS} FROM time_entries WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await pool.query('DELETE FROM time_entries WHERE id = $1`, [id]);

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
