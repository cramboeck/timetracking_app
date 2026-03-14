import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, getClient } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { validate } from '../middleware/validation';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const slaPolicySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),

  // Response times in hours
  responseTimeLow: z.number().int().min(1).max(720).default(24),
  responseTimeNormal: z.number().int().min(1).max(720).default(8),
  responseTimeHigh: z.number().int().min(1).max(720).default(4),
  responseTimeCritical: z.number().int().min(1).max(720).default(1),

  // Resolution times in hours
  resolutionTimeLow: z.number().int().min(1).max(2160).default(120),
  resolutionTimeNormal: z.number().int().min(1).max(2160).default(48),
  resolutionTimeHigh: z.number().int().min(1).max(2160).default(24),
  resolutionTimeCritical: z.number().int().min(1).max(2160).default(8),

  // Business hours
  businessHoursOnly: z.boolean().default(true),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)').default('08:00'),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)').default('18:00'),
  businessDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),

  // Escalation settings
  escalationEnabled: z.boolean().default(false),
  escalationAfterPercent: z.number().int().min(1).max(100).default(80),
  escalationNotifyUsers: z.array(z.string()).optional().nullable(),

  // Status
  isActive: z.boolean().default(true),
});

const updateSlaPolicySchema = slaPolicySchema.partial();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function transformPolicy(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,

    // Response times
    responseTimeLow: row.response_time_low,
    responseTimeNormal: row.response_time_normal,
    responseTimeHigh: row.response_time_high,
    responseTimeCritical: row.response_time_critical,

    // Resolution times
    resolutionTimeLow: row.resolution_time_low,
    resolutionTimeNormal: row.resolution_time_normal,
    resolutionTimeHigh: row.resolution_time_high,
    resolutionTimeCritical: row.resolution_time_critical,

    // Business hours
    businessHoursOnly: row.business_hours_only,
    businessHoursStart: row.business_hours_start?.substring(0, 5) || '08:00',
    businessHoursEnd: row.business_hours_end?.substring(0, 5) || '18:00',
    businessDays: row.business_days || [1, 2, 3, 4, 5],

    // Escalation
    escalationEnabled: row.escalation_enabled,
    escalationAfterPercent: row.escalation_after_percent,
    escalationNotifyUsers: row.escalation_notify_users || [],

    // Status and timestamps
    isActive: row.is_active,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

// ============================================================================
// ROUTES
// ============================================================================

// GET /api/sla-policies - Get all SLA policies for the organization
router.get('/', authenticateToken, attachOrganization, async (req, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const { isActive } = req.query;

    let queryText = `
      SELECT sp.*,
             (SELECT COUNT(*) FROM customers c WHERE c.sla_policy_id = sp.id) as customer_count
      FROM sla_policies sp
      WHERE sp.organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (isActive !== undefined) {
      queryText += ` AND sp.is_active = $2`;
      params.push(isActive === 'true');
    }

    queryText += ' ORDER BY sp.is_default DESC, sp.name ASC';

    const result = await query(queryText, params);

    const policies = result.rows.map(row => ({
      ...transformPolicy(row),
      customerCount: parseInt(row.customer_count) || 0,
    }));

    res.json({ success: true, data: policies });
  } catch (error) {
    console.error('Error fetching SLA policies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SLA policies' });
  }
});

// GET /api/sla-policies/:id - Get a specific SLA policy
router.get('/:id', authenticateToken, attachOrganization, async (req, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      `SELECT sp.*,
              (SELECT COUNT(*) FROM customers c WHERE c.sla_policy_id = sp.id) as customer_count
       FROM sla_policies sp
       WHERE sp.id = $1 AND sp.organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    const policy = {
      ...transformPolicy(result.rows[0]),
      customerCount: parseInt(result.rows[0].customer_count) || 0,
    };

    res.json({ success: true, data: policy });
  } catch (error) {
    console.error('Error fetching SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SLA policy' });
  }
});

// POST /api/sla-policies - Create a new SLA policy
router.post('/', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(slaPolicySchema), async (req, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const {
      name,
      description,
      responseTimeLow,
      responseTimeNormal,
      responseTimeHigh,
      responseTimeCritical,
      resolutionTimeLow,
      resolutionTimeNormal,
      resolutionTimeHigh,
      resolutionTimeCritical,
      businessHoursOnly,
      businessHoursStart,
      businessHoursEnd,
      businessDays,
      escalationEnabled,
      escalationAfterPercent,
      escalationNotifyUsers,
      isActive,
    } = req.body;

    const id = crypto.randomUUID();

    // Check if this is the first policy for the organization (will be default)
    const existingCheck = await query(
      'SELECT COUNT(*) as count FROM sla_policies WHERE organization_id = $1',
      [organizationId]
    );
    const isFirstPolicy = parseInt(existingCheck.rows[0].count) === 0;

    const result = await query(
      `INSERT INTO sla_policies (
        id, organization_id, name, description, is_default,
        response_time_low, response_time_normal, response_time_high, response_time_critical,
        resolution_time_low, resolution_time_normal, resolution_time_high, resolution_time_critical,
        business_hours_only, business_hours_start, business_hours_end, business_days,
        escalation_enabled, escalation_after_percent, escalation_notify_users,
        is_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20,
        $21, NOW(), NOW()
      ) RETURNING *`,
      [
        id, organizationId, name, description || null, isFirstPolicy,
        responseTimeLow || 24, responseTimeNormal || 8, responseTimeHigh || 4, responseTimeCritical || 1,
        resolutionTimeLow || 120, resolutionTimeNormal || 48, resolutionTimeHigh || 24, resolutionTimeCritical || 8,
        businessHoursOnly !== false, businessHoursStart || '08:00', businessHoursEnd || '18:00', businessDays || [1, 2, 3, 4, 5],
        escalationEnabled || false, escalationAfterPercent || 80, escalationNotifyUsers || null,
        isActive !== false,
      ]
    );

    res.status(201).json({ success: true, data: transformPolicy(result.rows[0]) });
  } catch (error) {
    console.error('Error creating SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to create SLA policy' });
  }
});

// PUT /api/sla-policies/:id - Update an SLA policy
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(updateSlaPolicySchema), async (req, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify policy exists and belongs to organization
    const existingResult = await query(
      'SELECT * FROM sla_policies WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    const {
      name,
      description,
      responseTimeLow,
      responseTimeNormal,
      responseTimeHigh,
      responseTimeCritical,
      resolutionTimeLow,
      resolutionTimeNormal,
      resolutionTimeHigh,
      resolutionTimeCritical,
      businessHoursOnly,
      businessHoursStart,
      businessHoursEnd,
      businessDays,
      escalationEnabled,
      escalationAfterPercent,
      escalationNotifyUsers,
      isActive,
    } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const addUpdate = (column: string, value: any) => {
      if (value !== undefined) {
        updates.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    };

    addUpdate('name', name);
    addUpdate('description', description);
    addUpdate('response_time_low', responseTimeLow);
    addUpdate('response_time_normal', responseTimeNormal);
    addUpdate('response_time_high', responseTimeHigh);
    addUpdate('response_time_critical', responseTimeCritical);
    addUpdate('resolution_time_low', resolutionTimeLow);
    addUpdate('resolution_time_normal', resolutionTimeNormal);
    addUpdate('resolution_time_high', resolutionTimeHigh);
    addUpdate('resolution_time_critical', resolutionTimeCritical);
    addUpdate('business_hours_only', businessHoursOnly);
    addUpdate('business_hours_start', businessHoursStart);
    addUpdate('business_hours_end', businessHoursEnd);
    addUpdate('business_days', businessDays);
    addUpdate('escalation_enabled', escalationEnabled);
    addUpdate('escalation_after_percent', escalationAfterPercent);
    addUpdate('escalation_notify_users', escalationNotifyUsers);
    addUpdate('is_active', isActive);

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);

    const queryText = `
      UPDATE sla_policies
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;
    values.push(id, organizationId);

    const result = await query(queryText, values);

    res.json({ success: true, data: transformPolicy(result.rows[0]) });
  } catch (error) {
    console.error('Error updating SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to update SLA policy' });
  }
});

// DELETE /api/sla-policies/:id - Delete an SLA policy
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify policy exists and belongs to organization
    const existingResult = await query(
      'SELECT * FROM sla_policies WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    const policy = existingResult.rows[0];

    // Prevent deletion of default policy
    if (policy.is_default) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the default SLA policy. Set another policy as default first.'
      });
    }

    // Check if policy is assigned to any customers
    const customerCheck = await query(
      'SELECT COUNT(*) as count FROM customers WHERE sla_policy_id = $1',
      [id]
    );

    if (parseInt(customerCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete SLA policy. It is assigned to ${customerCheck.rows[0].count} customer(s). Remove the assignment first.`
      });
    }

    await query(
      'DELETE FROM sla_policies WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    res.json({ success: true, message: 'SLA policy deleted successfully' });
  } catch (error) {
    console.error('Error deleting SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to delete SLA policy' });
  }
});

// PUT /api/sla-policies/:id/set-default - Set a policy as the default
router.put('/:id/set-default', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req, res: Response) => {
  const client = await getClient();

  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    await client.query('BEGIN');

    // Verify policy exists and belongs to organization
    const existingResult = await client.query(
      'SELECT * FROM sla_policies WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    // Verify policy is active
    if (!existingResult.rows[0].is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Cannot set an inactive policy as default. Activate the policy first.'
      });
    }

    // Remove default from all other policies in the organization
    await client.query(
      'UPDATE sla_policies SET is_default = false, updated_at = NOW() WHERE organization_id = $1',
      [organizationId]
    );

    // Set this policy as default
    const result = await client.query(
      'UPDATE sla_policies SET is_default = true, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');

    res.json({ success: true, data: transformPolicy(result.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error setting default SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to set default SLA policy' });
  } finally {
    client.release();
  }
});

export default router;
