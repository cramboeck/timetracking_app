/**
 * Bulk-Aktionen: Status/Prioritaet/Zuweisung/Archivieren
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../../middleware/organization';
import { auditLog } from '../../services/auditLog';
import { logger } from '../../utils/logger';
import {
  bulkStatusSchema,
  bulkPrioritySchema,
  bulkAssignSchema,
  bulkArchiveSchema,
  sendAssignedNotifications,
  verifyTicketsInOrganization,
  logTicketActivity,
} from './shared';

const router = express.Router();

// ============================================================================
// BULK ACTION ROUTES
// ============================================================================


// POST /api/tickets/bulk/status - Update status for multiple tickets (requires member role)
router.post('/bulk/status', authenticateToken, attachOrganization, requireOrgRole('member'), validate(bulkStatusSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketIds, status } = req.body;

    // Verify all tickets belong to organization
    const verification = await verifyTicketsInOrganization(ticketIds, organizationId);
    if (!verification.valid) {
      return res.status(404).json({
        success: false,
        error: `Tickets not found: ${verification.notFoundIds.join(', ')}`
      });
    }

    // Get current statuses for activity logging
    const currentTickets = await query(
      'SELECT id, status FROM tickets WHERE id = ANY($1)',
      [ticketIds]
    );
    const oldStatuses = new Map(currentTickets.rows.map(r => [r.id, r.status]));

    // Build update query with timestamps
    let updateQuery = `
      UPDATE tickets SET
        status = $1,
        updated_at = NOW()
    `;
    if (status === 'resolved') {
      updateQuery += ', resolved_at = NOW()';
    } else if (status === 'closed') {
      updateQuery += ', closed_at = NOW()';
    }
    updateQuery += ' WHERE id = ANY($2) AND organization_id = $3';

    await query(updateQuery, [status, ticketIds, organizationId]);

    // Log activities for each ticket
    for (const ticketId of ticketIds) {
      const oldStatus = oldStatuses.get(ticketId);
      if (oldStatus !== status) {
        let actionType = 'status_changed';
        if (status === 'resolved') actionType = 'resolved';
        else if (status === 'closed') actionType = 'closed';
        else if (status === 'archived') actionType = 'archived';
        else if (oldStatus === 'closed' || oldStatus === 'resolved') actionType = 'reopened';
        await logTicketActivity(ticketId, userId, null, actionType, oldStatus, status, { bulk: true });
      }
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.bulk_status',
      details: JSON.stringify({ ticketIds, newStatus: status, count: ticketIds.length }),
    });

    logger.info(`Bulk status update: ${ticketIds.length} tickets to ${status}`);
    res.json({ success: true, message: `${ticketIds.length} Tickets aktualisiert`, count: ticketIds.length });
  } catch (error) {
    logger.error('Error bulk updating ticket status:', error);
    res.status(500).json({ success: false, error: 'Failed to update tickets' });
  }
});

// POST /api/tickets/bulk/priority - Update priority for multiple tickets (requires member role)
router.post('/bulk/priority', authenticateToken, attachOrganization, requireOrgRole('member'), validate(bulkPrioritySchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketIds, priority } = req.body;

    // Verify all tickets belong to organization
    const verification = await verifyTicketsInOrganization(ticketIds, organizationId);
    if (!verification.valid) {
      return res.status(404).json({
        success: false,
        error: `Tickets not found: ${verification.notFoundIds.join(', ')}`
      });
    }

    // Get current priorities for activity logging
    const currentTickets = await query(
      'SELECT id, priority FROM tickets WHERE id = ANY($1)',
      [ticketIds]
    );
    const oldPriorities = new Map(currentTickets.rows.map(r => [r.id, r.priority]));

    await query(
      'UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = ANY($2) AND organization_id = $3',
      [priority, ticketIds, organizationId]
    );

    // Log activities for each ticket
    for (const ticketId of ticketIds) {
      const oldPriority = oldPriorities.get(ticketId);
      if (oldPriority !== priority) {
        await logTicketActivity(ticketId, userId, null, 'priority_changed', oldPriority, priority, { bulk: true });
      }
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.bulk_priority',
      details: JSON.stringify({ ticketIds, newPriority: priority, count: ticketIds.length }),
    });

    logger.info(`Bulk priority update: ${ticketIds.length} tickets to ${priority}`);
    res.json({ success: true, message: `${ticketIds.length} Tickets aktualisiert`, count: ticketIds.length });
  } catch (error) {
    logger.error('Error bulk updating ticket priority:', error);
    res.status(500).json({ success: false, error: 'Failed to update tickets' });
  }
});

// POST /api/tickets/bulk/assign - Assign multiple tickets (requires member role)
router.post('/bulk/assign', authenticateToken, attachOrganization, requireOrgRole('member'), validate(bulkAssignSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketIds, assignedToUserId } = req.body;

    // Verify all tickets belong to organization
    const verification = await verifyTicketsInOrganization(ticketIds, organizationId);
    if (!verification.valid) {
      return res.status(404).json({
        success: false,
        error: `Tickets not found: ${verification.notFoundIds.join(', ')}`
      });
    }

    // If assigning to someone, verify they're in the organization
    if (assignedToUserId) {
      const memberCheck = await query(
        'SELECT user_id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [organizationId, assignedToUserId]
      );
      if (memberCheck.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'User is not a member of this organization' });
      }
    }

    // Get current assignees for activity logging
    const currentTickets = await query(
      'SELECT id, assigned_to FROM tickets WHERE id = ANY($1)',
      [ticketIds]
    );
    const oldAssignees = new Map(currentTickets.rows.map(r => [r.id, r.assigned_to]));

    await query(
      'UPDATE tickets SET assigned_to = $1, updated_at = NOW() WHERE id = ANY($2) AND organization_id = $3',
      [assignedToUserId, ticketIds, organizationId]
    );

    // Log activities for each ticket
    for (const ticketId of ticketIds) {
      const oldAssignee = oldAssignees.get(ticketId);
      if (oldAssignee !== assignedToUserId) {
        if (assignedToUserId) {
          await logTicketActivity(ticketId, userId, null, 'assigned', oldAssignee, assignedToUserId, { bulk: true });
        } else {
          await logTicketActivity(ticketId, userId, null, 'unassigned', oldAssignee, null, { bulk: true });
        }
      }
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.bulk_assign',
      details: JSON.stringify({ ticketIds, assignedToUserId, count: ticketIds.length }),
    });

    // Benachrichtigen — eine Push/Mail mit "+N weitere" statt pro Ticket
    // (vorher benachrichtigte der Bulk-Pfad ueberhaupt nicht, und das war
    // der einzige im UI erreichbare Zuweisungsweg)
    const actuallyChanged = ticketIds.filter((tid: string) => oldAssignees.get(tid) !== assignedToUserId);
    if (assignedToUserId && assignedToUserId !== userId && actuallyChanged.length > 0) {
      sendAssignedNotifications(actuallyChanged[0], assignedToUserId, userId, { bulkCount: actuallyChanged.length })
        .catch(err => logger.error('Error sending assignment notifications (bulk):', err));
    }

    logger.info(`Bulk assign: ${ticketIds.length} tickets to ${assignedToUserId || 'unassigned'}`);
    res.json({ success: true, message: `${ticketIds.length} Tickets zugewiesen`, count: ticketIds.length });
  } catch (error) {
    logger.error('Error bulk assigning tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to assign tickets' });
  }
});

// POST /api/tickets/bulk/archive - Archive multiple tickets (requires member role)
router.post('/bulk/archive', authenticateToken, attachOrganization, requireOrgRole('member'), validate(bulkArchiveSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketIds } = req.body;

    // Verify all tickets belong to organization
    const verification = await verifyTicketsInOrganization(ticketIds, organizationId);
    if (!verification.valid) {
      return res.status(404).json({
        success: false,
        error: `Tickets not found: ${verification.notFoundIds.join(', ')}`
      });
    }

    // Get current statuses for activity logging
    const currentTickets = await query(
      'SELECT id, status FROM tickets WHERE id = ANY($1)',
      [ticketIds]
    );
    const oldStatuses = new Map(currentTickets.rows.map(r => [r.id, r.status]));

    await query(
      "UPDATE tickets SET status = 'archived', updated_at = NOW() WHERE id = ANY($1) AND organization_id = $2",
      [ticketIds, organizationId]
    );

    // Log activities for each ticket
    for (const ticketId of ticketIds) {
      const oldStatus = oldStatuses.get(ticketId);
      if (oldStatus !== 'archived') {
        await logTicketActivity(ticketId, userId, null, 'archived', oldStatus, 'archived', { bulk: true });
      }
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.bulk_archive',
      details: JSON.stringify({ ticketIds, count: ticketIds.length }),
    });

    logger.info(`Bulk archive: ${ticketIds.length} tickets`);
    res.json({ success: true, message: `${ticketIds.length} Tickets archiviert`, count: ticketIds.length });
  } catch (error) {
    logger.error('Error bulk archiving tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to archive tickets' });
  }
});

// ============================================================================
// TICKET COMMENT ROUTES
// ============================================================================

// POST /api/tickets/:id/comments - Add comment to ticket (requires member role)

export default router;
