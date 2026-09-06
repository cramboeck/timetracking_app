/**
 * Aktivitaets-Timeline + Volltextsuche
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { attachOrganization, OrganizationRequest } from '../../middleware/organization';
import { logger } from '../../utils/logger';
import {
  transformTicket,
} from './shared';

const router = express.Router();

// ============================================================================
// TICKET ACTIVITIES ROUTES (Activity Timeline)
// ============================================================================


// GET /api/tickets/:ticketId/activities - Get activity timeline for a ticket
router.get('/:ticketId/activities', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const result = await query(`
      SELECT
        ta.*,
        COALESCE(u.display_name, u.username) as user_name,
        COALESCE(cc.first_name || ' ' || cc.last_name, cc.last_name) as contact_name
      FROM ticket_activities ta
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN customer_contacts cc ON ta.customer_contact_id = cc.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at DESC
      LIMIT $2 OFFSET $3
    `, [ticketId, Number(limit), Number(offset)]);

    // Transform to camelCase
    // Bei Zuweisungs-Aktivitaeten stehen User-IDs in old_value/new_value —
    // fuer die Anzeige in Namen aufloesen (vorher zeigte der Feed rohe UUIDs)
    const assigneeIds = new Set<string>();
    for (const row of result.rows) {
      if (row.action_type === 'assigned' || row.action_type === 'unassigned') {
        if (row.old_value) assigneeIds.add(row.old_value);
        if (row.new_value) assigneeIds.add(row.new_value);
      }
    }
    const nameById = new Map<string, string>();
    if (assigneeIds.size > 0) {
      const nameResult = await query(
        `SELECT id, COALESCE(display_name, username) as name FROM users WHERE id = ANY($1)`,
        [Array.from(assigneeIds)]
      );
      for (const row of nameResult.rows) nameById.set(row.id, row.name);
    }
    const resolveLabel = (row: any, value: string | null) =>
      (row.action_type === 'assigned' || row.action_type === 'unassigned') && value
        ? nameById.get(value) || value
        : undefined;

    const activities = result.rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      customerContactId: row.customer_contact_id,
      actionType: row.action_type,
      oldValue: row.old_value,
      newValue: row.new_value,
      // Anzeige-Labels fuer Zuweisungen (Name statt User-ID)
      oldValueLabel: resolveLabel(row, row.old_value),
      newValueLabel: resolveLabel(row, row.new_value),
      metadata: row.metadata,
      createdAt: row.created_at?.toISOString(),
      userName: row.user_name,
      contactName: row.contact_name,
    }));

    res.json({ success: true, data: activities });
  } catch (error) {
    logger.error('Error fetching ticket activities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket activities' });
  }
});

// ============================================================================
// TICKET SEARCH ROUTES
// ============================================================================

// GET /api/tickets/search - Search tickets by keyword
router.get('/search/query', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { q, status, priority, customerId, limit = 50 } = req.query;

    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = `%${String(q).trim().toLowerCase()}%`;

    let queryText = `
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.organization_id = $1
        AND (
          LOWER(t.title) LIKE $2
          OR LOWER(t.description) LIKE $2
          OR LOWER(t.ticket_number) LIKE $2
          OR LOWER(c.name) LIKE $2
        )
    `;
    const params: any[] = [organizationId, searchTerm];
    let paramIndex = 3;

    if (status) {
      queryText += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      queryText += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (customerId) {
      queryText += ` AND t.customer_id = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    queryText += ` ORDER BY t.updated_at DESC LIMIT $${paramIndex}`;
    params.push(Number(limit));

    const result = await query(queryText, params);

    // Also search in comments
    const commentSearchResult = await query(`
      SELECT DISTINCT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      INNER JOIN ticket_comments tc ON t.id = tc.ticket_id
      WHERE t.organization_id = $1
        AND LOWER(tc.content) LIKE $2
        AND t.id NOT IN (SELECT id FROM tickets WHERE organization_id = $1 AND (
          LOWER(title) LIKE $2
          OR LOWER(description) LIKE $2
          OR LOWER(ticket_number) LIKE $2
        ))
      ORDER BY t.updated_at DESC
      LIMIT $3
    `, [organizationId, searchTerm, Number(limit)]);

    // Combine results
    const allTickets = [...result.rows, ...commentSearchResult.rows];

    // Search in tags as well
    const tagSearchResult = await query(`
      SELECT DISTINCT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.ticket_id
      INNER JOIN ticket_tags tt ON tta.tag_id = tt.id
      WHERE t.organization_id = $1
        AND LOWER(tt.name) LIKE $2
      ORDER BY t.updated_at DESC
      LIMIT $3
    `, [organizationId, searchTerm, Number(limit)]);

    // Add tag results if not already in list
    const existingIds = new Set(allTickets.map(t => t.id));
    tagSearchResult.rows.forEach(row => {
      if (!existingIds.has(row.id)) {
        allTickets.push(row);
      }
    });

    res.json({ success: true, data: allTickets.map(transformTicket) });
  } catch (error) {
    logger.error('Error searching tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to search tickets' });
  }
});

export default router;
