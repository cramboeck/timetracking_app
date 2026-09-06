/**
 * SLA-Policies (CRUD) + SLA-Anwendung
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import crypto from 'crypto';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../../middleware/organization';
import { auditLog } from '../../services/auditLog';
import { logger } from '../../utils/logger';
import {
  slaPolicySchema,
  updateSlaPolicySchema,
  SLA_POLICY_COLUMNS,
  TICKET_BASIC_COLUMNS,
  transformSlaPolicy,
  calculateSlaDeadlines,
} from './shared';

const router = express.Router();

// ============================================================================
// SLA POLICIES ROUTES
// ============================================================================


// GET /api/tickets/sla/policies - Get all SLA policies for organization
router.get('/sla/policies', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await query(`
      SELECT ${SLA_POLICY_COLUMNS} FROM sla_policies
      WHERE organization_id = $1
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          WHEN 'all' THEN 5
        END
    `, [organizationId]);

    res.json({ success: true, data: result.rows.map(transformSlaPolicy) });
  } catch (error) {
    logger.error('Error fetching SLA policies:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch SLA policies' });
  }
});

// POST /api/tickets/sla/policies - Create SLA policy (requires admin role)
router.post('/sla/policies', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(slaPolicySchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      name,
      description,
      priority,
      firstResponseMinutes,
      resolutionMinutes,
      businessHoursOnly = false,
      isDefault = false
    } = req.body;

    if (!name || !priority || !firstResponseMinutes || !resolutionMinutes) {
      return res.status(400).json({
        success: false,
        error: 'Name, priority, firstResponseMinutes and resolutionMinutes are required'
      });
    }

    const id = crypto.randomUUID();

    // If this is set as default, unset other defaults for this priority
    if (isDefault) {
      await query(
        'UPDATE sla_policies SET is_default = FALSE WHERE organization_id = $1 AND (priority = $2 OR priority = \'all\')',
        [organizationId, priority]
      );
    }

    const result = await query(`
      INSERT INTO sla_policies (id, user_id, organization_id, name, description, priority, first_response_minutes, resolution_minutes, business_hours_only, is_default)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [id, userId, organizationId, name, description || null, priority, firstResponseMinutes, resolutionMinutes, businessHoursOnly, isDefault]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'sla_policy.create',
      details: JSON.stringify({ policyId: id, name, priority, firstResponseMinutes, resolutionMinutes }),
    });

    res.status(201).json({ success: true, data: transformSlaPolicy(result.rows[0]) });
  } catch (error) {
    logger.error('Error creating SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to create SLA policy' });
  }
});

// PUT /api/tickets/sla/policies/:id - Update SLA policy (requires admin role)
router.put('/sla/policies/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(updateSlaPolicySchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const {
      name,
      description,
      priority,
      firstResponseMinutes,
      resolutionMinutes,
      businessHoursOnly,
      isActive,
      isDefault
    } = req.body;

    // If setting as default, unset other defaults
    if (isDefault) {
      const currentPolicy = await query('SELECT priority FROM sla_policies WHERE id = $1', [id]);
      const policyPriority = priority || currentPolicy.rows[0]?.priority;
      await query(
        'UPDATE sla_policies SET is_default = FALSE WHERE organization_id = $1 AND (priority = $2 OR priority = \'all\') AND id != $3',
        [organizationId, policyPriority, id]
      );
    }

    const result = await query(`
      UPDATE sla_policies SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        priority = COALESCE($3, priority),
        first_response_minutes = COALESCE($4, first_response_minutes),
        resolution_minutes = COALESCE($5, resolution_minutes),
        business_hours_only = COALESCE($6, business_hours_only),
        is_active = COALESCE($7, is_active),
        is_default = COALESCE($8, is_default),
        updated_at = NOW()
      WHERE id = $9 AND organization_id = $10
      RETURNING *
    `, [name, description, priority, firstResponseMinutes, resolutionMinutes, businessHoursOnly, isActive, isDefault, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'sla_policy.update',
      details: JSON.stringify({ policyId: id, updatedFields: { name, description, priority, firstResponseMinutes, resolutionMinutes, isActive, isDefault } }),
    });

    res.json({ success: true, data: transformSlaPolicy(result.rows[0]) });
  } catch (error) {
    logger.error('Error updating SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to update SLA policy' });
  }
});

// DELETE /api/tickets/sla/policies/:id - Delete SLA policy (requires admin role)
router.delete('/sla/policies/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Get policy info for audit log before deleting
    const policyInfo = await query(
      'SELECT name FROM sla_policies WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (policyInfo.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SLA policy not found' });
    }

    const policyName = policyInfo.rows[0].name;

    await query('DELETE FROM sla_policies WHERE id = $1', [id]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'sla_policy.delete',
      details: JSON.stringify({ policyId: id, policyName }),
    });

    res.json({ success: true, message: 'SLA policy deleted' });
  } catch (error) {
    logger.error('Error deleting SLA policy:', error);
    res.status(500).json({ success: false, error: 'Failed to delete SLA policy' });
  }
});


// POST /api/tickets/sla/apply/:ticketId - Apply SLA to existing ticket
router.post('/sla/apply/:ticketId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;

    // Get ticket
    const ticketResult = await query(
      `SELECT ${TICKET_BASIC_COLUMNS} FROM tickets WHERE id = $1 AND organization_id = $2`,
      [ticketId, organizationId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const deadlines = await calculateSlaDeadlines(organizationId, ticket.priority, new Date(ticket.created_at));

    if (!deadlines) {
      return res.status(400).json({ success: false, error: 'No SLA policy found for this priority' });
    }

    // Update ticket with SLA
    await query(`
      UPDATE tickets SET
        sla_policy_id = $1,
        first_response_due_at = $2,
        resolution_due_at = $3
      WHERE id = $4
    `, [deadlines.policyId, deadlines.firstResponseDueAt, deadlines.resolutionDueAt, ticketId]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'sla_policy.apply',
      details: JSON.stringify({ ticketId, policyId: deadlines.policyId }),
    });

    res.json({ success: true, data: deadlines });
  } catch (error) {
    logger.error('Error applying SLA:', error);
    res.status(500).json({ success: false, error: 'Failed to apply SLA' });
  }
});

export default router;
