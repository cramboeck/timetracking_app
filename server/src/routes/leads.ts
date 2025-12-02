import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import crypto from 'crypto';

const router = Router();

// Validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  website: z.string().url().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']).optional(),
  source: z.enum(['website', 'referral', 'cold_call', 'email', 'event', 'social_media', 'advertising', 'other']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'hot']).optional(),
  estimatedValue: z.number().min(0).optional(),
  probability: z.number().min(0).max(100).optional(),
  assignedTo: z.string().uuid().optional(),
  expectedCloseDate: z.string().optional(),
  nextFollowUp: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customerId: z.string().uuid().optional(),
});

const updateLeadSchema = createLeadSchema.partial();

const createActivitySchema = z.object({
  activityType: z.enum(['call', 'email', 'meeting', 'note', 'task', 'status_change', 'demo', 'proposal_sent']),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  scheduledAt: z.string().optional(),
  outcome: z.string().optional(),
  durationMinutes: z.number().int().min(0).optional(),
});

// GET /api/leads - Get all leads for organization
router.get('/', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { status, assignedTo, priority, source } = req.query;

    let query = `
      SELECT l.*,
             u.username as assigned_to_name,
             c.name as customer_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE l.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramCount = 2;

    if (status) {
      query += ` AND l.status = $${paramCount++}`;
      params.push(status);
    }
    if (assignedTo) {
      query += ` AND l.assigned_to = $${paramCount++}`;
      params.push(assignedTo);
    }
    if (priority) {
      query += ` AND l.priority = $${paramCount++}`;
      params.push(priority);
    }
    if (source) {
      query += ` AND l.source = $${paramCount++}`;
      params.push(source);
    }

    query += ' ORDER BY l.created_at DESC';

    const result = await pool.query(query, params);
    const leads = transformRows(result.rows);

    res.json({ success: true, data: leads });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/pipeline - Get lead pipeline statistics
router.get('/pipeline', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        COALESCE(SUM(estimated_value), 0) as total_value,
        COALESCE(AVG(probability), 0) as avg_probability
      FROM leads
      WHERE organization_id = $1
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'qualified' THEN 3
          WHEN 'proposal' THEN 4
          WHEN 'negotiation' THEN 5
          WHEN 'won' THEN 6
          WHEN 'lost' THEN 7
        END
    `, [organizationId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get pipeline error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leads/:id - Get single lead with activities
router.get('/:id', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const leadResult = await pool.query(`
      SELECT l.*,
             u.username as assigned_to_name,
             cb.username as created_by_name,
             c.name as customer_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users cb ON l.created_by = cb.id
      LEFT JOIN customers c ON l.customer_id = c.id
      WHERE l.id = $1 AND l.organization_id = $2
    `, [id, organizationId]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = transformRow(leadResult.rows[0]);

    // Get activities
    const activitiesResult = await pool.query(`
      SELECT la.*, u.username as user_name
      FROM lead_activities la
      LEFT JOIN users u ON la.user_id = u.id
      WHERE la.lead_id = $1
      ORDER BY la.created_at DESC
    `, [id]);

    const activities = transformRows(activitiesResult.rows);

    res.json({
      success: true,
      data: { ...lead, activities }
    });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads - Create new lead (requires member role)
router.post('/', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createLeadSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      name, company, email, phone, website, status, source, priority,
      estimatedValue, probability, assignedTo, expectedCloseDate, nextFollowUp,
      description, notes, tags, customerId
    } = req.body;

    const id = crypto.randomUUID();

    await pool.query(`
      INSERT INTO leads (
        id, organization_id, customer_id, name, company, email, phone, website,
        status, source, priority, estimated_value, probability, assigned_to,
        expected_close_date, next_follow_up, description, notes, tags, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )
    `, [
      id, organizationId, customerId || null, name, company || null, email || null,
      phone || null, website || null, status || 'new', source || null, priority || 'normal',
      estimatedValue || null, probability || null, assignedTo || null,
      expectedCloseDate || null, nextFollowUp || null, description || null, notes || null,
      tags || null, userId
    ]);

    const result = await pool.query(`
      SELECT l.*, u.username as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.id = $1
    `, [id]);

    const newLead = transformRow(result.rows[0]);

    auditLog.log({
      userId,
      action: 'lead.create',
      details: JSON.stringify({ id, name, organizationId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, data: newLead });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/leads/:id - Update lead (requires member role)
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateLeadSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    // Verify lead belongs to organization
    const existingLead = await pool.query(
      'SELECT * FROM leads WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existingLead.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      company: 'company',
      email: 'email',
      phone: 'phone',
      website: 'website',
      status: 'status',
      source: 'source',
      priority: 'priority',
      estimatedValue: 'estimated_value',
      probability: 'probability',
      assignedTo: 'assigned_to',
      expectedCloseDate: 'expected_close_date',
      nextFollowUp: 'next_follow_up',
      description: 'description',
      notes: 'notes',
      tags: 'tags',
      customerId: 'customer_id',
      lostReason: 'lost_reason',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${paramCount++}`);
        values.push(updates[key] || null);
      }
    }

    // Track status changes
    const oldStatus = existingLead.rows[0].status;
    const newStatus = updates.status;

    if (newStatus && newStatus !== oldStatus) {
      // Add status change to activities
      const activityId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO lead_activities (id, lead_id, user_id, activity_type, title, description)
        VALUES ($1, $2, $3, 'status_change', $4, $5)
      `, [activityId, id, userId, `Status geändert: ${oldStatus} → ${newStatus}`, null]);

      if (newStatus === 'won') {
        fields.push(`converted_at = $${paramCount++}`);
        values.push(new Date().toISOString());
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = $${paramCount++}`);
    values.push(new Date().toISOString());

    values.push(id);
    const query = `UPDATE leads SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const result = await pool.query(`
      SELECT l.*, u.username as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.id = $1
    `, [id]);

    const updatedLead = transformRow(result.rows[0]);

    auditLog.log({
      userId,
      action: 'lead.update',
      details: JSON.stringify({ id, updates }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, data: updatedLead });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/leads/:id - Delete lead (requires admin role)
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING name',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    auditLog.log({
      userId,
      action: 'lead.delete',
      details: JSON.stringify({ id, name: result.rows[0].name }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/:id/activities - Add activity to lead (requires member role)
router.post('/:id/activities', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createActivitySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: leadId } = req.params;
    const { activityType, title, description, scheduledAt, outcome, durationMinutes } = req.body;

    // Verify lead belongs to organization
    const leadCheck = await pool.query(
      'SELECT id FROM leads WHERE id = $1 AND organization_id = $2',
      [leadId, organizationId]
    );

    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const activityId = crypto.randomUUID();

    await pool.query(`
      INSERT INTO lead_activities (id, lead_id, user_id, activity_type, title, description, scheduled_at, outcome, duration_minutes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [activityId, leadId, userId, activityType, title, description || null, scheduledAt || null, outcome || null, durationMinutes || null]);

    // Update last_contact_date on lead
    await pool.query(
      'UPDATE leads SET last_contact_date = NOW(), updated_at = NOW() WHERE id = $1',
      [leadId]
    );

    const result = await pool.query(`
      SELECT la.*, u.username as user_name
      FROM lead_activities la
      LEFT JOIN users u ON la.user_id = u.id
      WHERE la.id = $1
    `, [activityId]);

    const activity = transformRow(result.rows[0]);

    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/leads/:leadId/activities/:activityId/complete - Mark activity as completed
router.put('/:leadId/activities/:activityId/complete', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { leadId, activityId } = req.params;
    const { outcome } = req.body;

    // Verify lead belongs to organization
    const leadCheck = await pool.query(
      'SELECT id FROM leads WHERE id = $1 AND organization_id = $2',
      [leadId, organizationId]
    );

    if (leadCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await pool.query(`
      UPDATE lead_activities
      SET is_completed = true, completed_at = NOW(), outcome = COALESCE($1, outcome)
      WHERE id = $2 AND lead_id = $3
    `, [outcome || null, activityId, leadId]);

    res.json({ success: true, message: 'Activity marked as completed' });
  } catch (error) {
    console.error('Complete activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leads/:id/convert - Convert lead to customer
router.post('/:id/convert', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { createCustomer, customerColor } = req.body;

    // Get lead
    const leadResult = await pool.query(
      'SELECT * FROM leads WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];

    let customerId = lead.customer_id;

    // Create customer if requested
    if (createCustomer && !customerId) {
      customerId = crypto.randomUUID();
      await pool.query(`
        INSERT INTO customers (id, user_id, organization_id, name, email, color, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [customerId, userId, organizationId, lead.company || lead.name, lead.email, customerColor || '#3b82f6']);
    }

    // Update lead to won status
    await pool.query(`
      UPDATE leads
      SET status = 'won', converted_at = NOW(), customer_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [customerId, id]);

    // Add activity
    const activityId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO lead_activities (id, lead_id, user_id, activity_type, title)
      VALUES ($1, $2, $3, 'status_change', 'Lead konvertiert zu Kunde')
    `, [activityId, id, userId]);

    auditLog.log({
      userId,
      action: 'lead.convert',
      details: JSON.stringify({ leadId: id, customerId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Lead successfully converted',
      customerId
    });
  } catch (error) {
    console.error('Convert lead error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
