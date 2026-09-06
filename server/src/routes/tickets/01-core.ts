/**
 * Kern-Routen: Liste/Stats/Dashboard/Template-Liste, GET/POST/PUT/DELETE Ticket, Bulk-Delete, Merge
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import crypto from 'crypto';
import { query, getClient } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../../middleware/organization';
import { emailService } from '../../services/emailService';
import { sendTicketNotification, sendPortalTicketNotification } from '../../services/pushNotifications';
import { auditLog } from '../../services/auditLog';
import { logger } from '../../utils/logger';
import {
  createTicketSchema,
  updateTicketSchema,
  mergeTicketsSchema,
  bulkDeleteSchema,
  TICKET_TEMPLATE_COLUMNS,
  PORTAL_URL,
  sendAssignedNotifications,
  isOrgMember,
  generateTicketNumber,
  transformTicket,
  transformComment,
  verifyTicketsInOrganization,
  transformTemplate,
  logTicketActivity,
  calculateSlaDeadlines,
} from './shared';

const router = express.Router();

// ============================================================================
// TICKET ROUTES
// ============================================================================

// GET /api/tickets - Get all tickets for organization
// Supports pagination (?page=1&limit=50) and filters:
//   ?status=open|in_progress|waiting|resolved|closed
//   ?customerId=UUID  ?priority=low|normal|high|critical
//   ?searchText=foo   (case-insensitive on title/description)
// Backward-compatible: ?all=true returns all tickets without pagination (legacy)
router.get('/', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { status, customerId, priority, searchText, assignedTo, category } = req.query;

    // Legacy support: ?all=true bypasses pagination
    const returnAll = req.query.all === 'true';

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    logger.info(`📋 Fetching tickets for organization_id: ${organizationId}, page: ${page}, limit: ${limit}`);

    // Build WHERE clause
    const params: any[] = [organizationId];
    let whereClause = 'WHERE t.organization_id = $1';

    if (status) {
      params.push(status);
      whereClause += ` AND t.status = $${params.length}`;
    }

    // 'none' = interne Tickets (ohne Kunde)
    if (customerId === 'none') {
      whereClause += ` AND t.customer_id IS NULL`;
    } else if (customerId) {
      params.push(customerId);
      whereClause += ` AND t.customer_id = $${params.length}`;
    }

    if (category && typeof category === 'string') {
      params.push(category);
      whereClause += ` AND t.category = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      whereClause += ` AND t.priority = $${params.length}`;
    }

    // Bearbeiter-Filter: 'none' = unzugewiesen, sonst User-ID
    if (assignedTo === 'none') {
      whereClause += ` AND t.assigned_to IS NULL`;
    } else if (assignedTo && typeof assignedTo === 'string') {
      params.push(assignedTo);
      whereClause += ` AND t.assigned_to = $${params.length}`;
    }

    if (searchText && typeof searchText === 'string' && searchText.trim()) {
      params.push(`%${searchText.trim()}%`);
      whereClause += ` AND (t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`;
    }

    // Explicit column list (no SELECT *)
    const baseQuery = `
      SELECT t.id, t.ticket_number, t.organization_id, t.user_id, t.customer_id, t.project_id,
             t.assigned_to, t.title, t.description, t.status, t.priority, t.source, t.category,
             t.due_date, t.first_response_at, t.resolved_at, t.closed_at,
             t.sla_policy_id, t.sla_response_due, t.sla_resolution_due,
             t.sla_response_breached, t.sla_resolution_breached,
             t.created_at, t.updated_at, t.created_by_contact_id,
             t.device_id, t.ninja_alert_id,
             c.name as customer_name, p.name as project_name,
             d.display_name as device_name,
             COALESCE(assignee.display_name, assignee.username) as assignee_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN ninjarmm_devices d ON t.device_id = d.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      ${whereClause}
      ORDER BY t.created_at DESC`;

    if (returnAll) {
      // Legacy path: return all matching tickets without pagination
      const result = await query(baseQuery, params);
      logger.info(`📋 Found ${result.rows.length} tickets (all) for organization_id: ${organizationId}`);
      return res.json({ success: true, data: result.rows.map(transformTicket) });
    }

    // Count total for pagination metadata
    const countResult = await query(
      `SELECT COUNT(*) FROM tickets t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch page
    params.push(limit, offset);
    const result = await query(
      `${baseQuery} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    logger.info(`📋 Found ${result.rows.length}/${total} tickets for organization_id: ${organizationId}`);
    res.json({
      success: true,
      data: result.rows.map(transformTicket),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    logger.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
});

// GET /api/tickets/stats - Get ticket statistics
router.get('/stats', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'waiting') as waiting_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('resolved', 'closed')) as critical_count,
        COUNT(*) FILTER (WHERE priority = 'high' AND status NOT IN ('resolved', 'closed')) as high_priority_count,
        COUNT(*) as total_count
      FROM tickets
      WHERE organization_id = $1
    `, [organizationId]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching ticket stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket stats' });
  }
});

// GET /api/tickets/dashboard - Get comprehensive dashboard data
router.get('/dashboard', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Basic counts by status
    const statusCounts = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'waiting') as waiting,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'closed') as closed,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed', 'archived')) as active_total,
        COUNT(*) as total
      FROM tickets
      WHERE organization_id = $1 AND status != 'archived'
    `, [organizationId]);

    // Priority distribution (only active tickets)
    const priorityCounts = await query(`
      SELECT
        COUNT(*) FILTER (WHERE priority = 'critical') as critical,
        COUNT(*) FILTER (WHERE priority = 'high') as high,
        COUNT(*) FILTER (WHERE priority = 'normal') as normal,
        COUNT(*) FILTER (WHERE priority = 'low') as low
      FROM tickets
      WHERE organization_id = $1 AND status NOT IN ('resolved', 'closed', 'archived')
    `, [organizationId]);

    // SLA statistics
    const slaStats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE sla_first_response_breached = true) as response_breached,
        COUNT(*) FILTER (WHERE sla_resolution_breached = true) as resolution_breached,
        COUNT(*) FILTER (WHERE first_response_due_at IS NOT NULL AND first_response_at IS NULL AND first_response_due_at < NOW()) as response_overdue,
        COUNT(*) FILTER (WHERE resolution_due_at IS NOT NULL AND status NOT IN ('resolved', 'closed') AND resolution_due_at < NOW()) as resolution_overdue,
        COUNT(*) FILTER (WHERE first_response_due_at IS NOT NULL AND first_response_at IS NOT NULL AND first_response_at <= first_response_due_at) as response_met,
        COUNT(*) FILTER (WHERE resolution_due_at IS NOT NULL AND status IN ('resolved', 'closed') AND resolved_at <= resolution_due_at) as resolution_met,
        COUNT(*) FILTER (WHERE first_response_due_at IS NOT NULL) as with_response_sla,
        COUNT(*) FILTER (WHERE resolution_due_at IS NOT NULL) as with_resolution_sla
      FROM tickets
      WHERE organization_id = $1 AND status != 'archived'
    `, [organizationId]);

    // Tickets requiring attention (SLA at risk - due within 2 hours)
    const urgentTickets = await query(`
      SELECT t.id, t.ticket_number, t.title, t.status, t.priority,
             t.first_response_due_at, t.resolution_due_at, t.first_response_at,
             c.name as customer_name,
             CASE
               WHEN first_response_at IS NULL AND first_response_due_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (first_response_due_at - NOW())) / 60
               ELSE NULL
             END as response_minutes_remaining,
             CASE
               WHEN status NOT IN ('resolved', 'closed') AND resolution_due_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (resolution_due_at - NOW())) / 60
               ELSE NULL
             END as resolution_minutes_remaining
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.organization_id = $1
        AND t.status NOT IN ('resolved', 'closed', 'archived')
        AND (
          (t.first_response_at IS NULL AND t.first_response_due_at IS NOT NULL AND t.first_response_due_at <= NOW() + INTERVAL '2 hours')
          OR (t.resolution_due_at IS NOT NULL AND t.resolution_due_at <= NOW() + INTERVAL '2 hours')
        )
      ORDER BY
        LEAST(
          COALESCE(t.first_response_due_at, '9999-12-31'::timestamp),
          COALESCE(t.resolution_due_at, '9999-12-31'::timestamp)
        )
      LIMIT 10
    `, [organizationId]);

    // Recent activity
    const recentActivity = await query(`
      SELECT ta.id, ta.ticket_id, ta.action_type as action, ta.old_value, ta.new_value, ta.created_at,
             t.ticket_number, t.title,
             COALESCE(u.display_name, u.username) as actor_name,
             COALESCE(cc.first_name || ' ' || cc.last_name, cc.last_name) as contact_name
      FROM ticket_activities ta
      JOIN tickets t ON ta.ticket_id = t.id
      LEFT JOIN users u ON ta.user_id = u.id
      LEFT JOIN customer_contacts cc ON ta.customer_contact_id = cc.id
      WHERE t.organization_id = $1
      ORDER BY ta.created_at DESC
      LIMIT 15
    `, [organizationId]);

    // Tickets created this week vs last week
    const weeklyComparison = await query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', NOW())) as this_week,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '1 week' AND created_at < DATE_TRUNC('week', NOW())) as last_week,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed') AND updated_at >= DATE_TRUNC('week', NOW())) as resolved_this_week
      FROM tickets
      WHERE organization_id = $1
    `, [organizationId]);

    // Average response time (in minutes) for resolved tickets this month
    const avgTimes = await query(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60)) as avg_first_response_minutes,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60)) as avg_resolution_minutes
      FROM tickets
      WHERE organization_id = $1
        AND first_response_at IS NOT NULL
        AND resolved_at IS NOT NULL
        AND created_at >= DATE_TRUNC('month', NOW())
    `, [organizationId]);

    // Top customers by ticket count (active tickets)
    const topCustomers = await query(`
      SELECT c.id, c.name, c.color, COUNT(t.id) as ticket_count
      FROM tickets t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.organization_id = $1 AND t.status NOT IN ('resolved', 'closed', 'archived')
      GROUP BY c.id, c.name, c.color
      ORDER BY ticket_count DESC
      LIMIT 5
    `, [organizationId]);

    // Namen fuer Zuweisungs-Aktivitaeten aufloesen (new_value = User-ID)
    const activityAssigneeIds = recentActivity.rows
      .filter(a => a.action === 'assigned' && a.new_value)
      .map(a => a.new_value);
    const activityAssigneeNames = new Map<string, string>();
    if (activityAssigneeIds.length > 0) {
      const nameResult = await query(
        `SELECT id, COALESCE(display_name, username) as name FROM users WHERE id = ANY($1)`,
        [activityAssigneeIds]
      );
      for (const row of nameResult.rows) activityAssigneeNames.set(row.id, row.name);
    }

    // Calculate SLA compliance percentage
    const sla = slaStats.rows[0];
    const responseCompliance = sla.with_response_sla > 0
      ? Math.round((parseInt(sla.response_met) / parseInt(sla.with_response_sla)) * 100)
      : 100;
    const resolutionCompliance = sla.with_resolution_sla > 0
      ? Math.round((parseInt(sla.resolution_met) / parseInt(sla.with_resolution_sla)) * 100)
      : 100;

    res.json({
      success: true,
      data: {
        overview: {
          ...statusCounts.rows[0],
          ...priorityCounts.rows[0],
        },
        sla: {
          responseCompliance,
          resolutionCompliance,
          responseBreached: parseInt(sla.response_breached) || 0,
          resolutionBreached: parseInt(sla.resolution_breached) || 0,
          responseOverdue: parseInt(sla.response_overdue) || 0,
          resolutionOverdue: parseInt(sla.resolution_overdue) || 0,
        },
        urgentTickets: urgentTickets.rows.map(t => ({
          id: t.id,
          ticketNumber: t.ticket_number,
          title: t.title,
          status: t.status,
          priority: t.priority,
          customerName: t.customer_name,
          responseMinutesRemaining: t.response_minutes_remaining ? Math.round(parseFloat(t.response_minutes_remaining)) : null,
          resolutionMinutesRemaining: t.resolution_minutes_remaining ? Math.round(parseFloat(t.resolution_minutes_remaining)) : null,
        })),
        recentActivity: recentActivity.rows.map(a => ({
          id: a.id,
          ticketId: a.ticket_id,
          action: a.action,
          oldValue: a.old_value,
          newValue: a.new_value,
          // Bei Zuweisungen: Name statt User-ID fuer die Anzeige
          newValueLabel: (a.action === 'assigned' && a.new_value)
            ? (activityAssigneeNames.get(a.new_value) || a.new_value)
            : undefined,
          createdAt: a.created_at,
          ticketNumber: a.ticket_number,
          ticketTitle: a.title,
          actorName: a.actor_name || a.contact_name || 'System',
        })),
        trends: {
          ticketsThisWeek: parseInt(weeklyComparison.rows[0].this_week) || 0,
          ticketsLastWeek: parseInt(weeklyComparison.rows[0].last_week) || 0,
          resolvedThisWeek: parseInt(weeklyComparison.rows[0].resolved_this_week) || 0,
          avgFirstResponseMinutes: parseInt(avgTimes.rows[0].avg_first_response_minutes) || null,
          avgResolutionMinutes: parseInt(avgTimes.rows[0].avg_resolution_minutes) || null,
        },
        topCustomers: topCustomers.rows.map(c => ({
          id: c.id,
          name: c.name,
          color: c.color,
          ticketCount: parseInt(c.ticket_count),
        })),
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/tickets/templates - Get all templates for organization.
// MUSS vor GET /:id registriert sein, sonst matcht Express 'templates' als
// Ticket-ID und die Template-Liste liefert immer 404 (war der Grund, warum
// die Ticket-Templates nie im Frontend ankamen).
router.get('/templates', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { category, activeOnly } = req.query;

    let queryText = `
      SELECT ${TICKET_TEMPLATE_COLUMNS} FROM ticket_templates
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (activeOnly === 'true') {
      queryText += ` AND is_active = true`;
    }

    if (category) {
      queryText += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    queryText += ' ORDER BY usage_count DESC, name ASC';

    const result = await query(queryText, params);
    res.json({ success: true, data: result.rows.map(transformTemplate) });
  } catch (error) {
    logger.error('Error fetching ticket templates:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket templates' });
  }
});

// GET /api/tickets/:id - Get single ticket with comments
router.get('/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Get ticket
    const ticketResult = await query(`
      SELECT t.*, c.name as customer_name, p.name as project_name,
             COALESCE(creator.display_name, creator.username) as creator_name,
             COALESCE(assignee.display_name, assignee.username) as assignee_name,
             d.display_name as device_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users creator ON t.user_id = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      LEFT JOIN ninjarmm_devices d ON t.device_id = d.id
      WHERE t.id = $1 AND t.organization_id = $2
    `, [id, organizationId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get comments
    const commentsResult = await query(`
      SELECT tc.*,
        COALESCE(u.display_name, u.username) as author_name
      FROM ticket_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      LEFT JOIN customer_contacts cc ON tc.customer_contact_id = cc.id
      WHERE tc.ticket_id = $1
      ORDER BY tc.created_at ASC
    `, [id]);

    // Get time entries linked to this ticket
    const timeEntriesResult = await query(`
      SELECT te.*, p.name as project_name
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE te.ticket_id = $1
      ORDER BY te.start_time DESC
    `, [id]);

    const ticket = transformTicket(ticketResult.rows[0]);

    // Transform time entries to camelCase
    const timeEntries = timeEntriesResult.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      activityId: row.activity_id,
      ticketId: row.ticket_id,
      startTime: row.start_time?.toISOString?.() || row.start_time,
      endTime: row.end_time?.toISOString?.() || row.end_time,
      duration: row.duration,
      description: row.description,
      isRunning: row.is_running,
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      projectName: row.project_name,
    }));

    res.json({
      success: true,
      data: {
        ...ticket,
        comments: commentsResult.rows.map(transformComment),
        timeEntries,
      }
    });
  } catch (error) {
    logger.error('Error fetching ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
  }
});

// POST /api/tickets - Create new ticket (requires member role)
router.post('/', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createTicketSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, projectId, title, description, priority = 'normal', assignedToUserId, category } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    if (assignedToUserId && !(await isOrgMember(organizationId, assignedToUserId))) {
      return res.status(400).json({ success: false, error: 'Der Bearbeiter ist kein Mitglied dieser Organisation' });
    }

    const id = crypto.randomUUID();
    const ticketNumber = await generateTicketNumber(organizationId);

    const result = await query(`
      INSERT INTO tickets (id, ticket_number, user_id, organization_id, customer_id, project_id, title, description, priority, status, assigned_to, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10, $11)
      RETURNING *
    `, [id, ticketNumber, userId, organizationId, customerId || null, projectId || null, title, description || '', priority, assignedToUserId || null, category || null]);

    // Apply SLA if available
    const slaDeadlines = await calculateSlaDeadlines(organizationId, priority);
    if (slaDeadlines) {
      await query(`
        UPDATE tickets SET
          sla_policy_id = $1,
          first_response_due_at = $2,
          resolution_due_at = $3
        WHERE id = $4
      `, [slaDeadlines.policyId, slaDeadlines.firstResponseDueAt, slaDeadlines.resolutionDueAt, id]);
    }

    // Log activity
    await logTicketActivity(id, userId, null, 'created', null, null, { ticketNumber, title, priority });

    // Direkt-Zuweisung beim Erstellen: Aktivitaet + Benachrichtigung
    if (assignedToUserId) {
      await logTicketActivity(id, userId, null, 'assigned', null, assignedToUserId);
      if (assignedToUserId !== userId) {
        sendAssignedNotifications(id, assignedToUserId, userId)
          .catch(err => logger.error('Error sending assignment notifications (create):', err));
      }
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.create',
      details: JSON.stringify({ ticketId: id, ticketNumber, title, customerId, priority }),
    });

    // Get with joined data
    const ticketResult = await query(`
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);

    // Send push notifications to organization members (async, non-blocking)
    (async () => {
      try {
        // Get all organization members except the creator
        const members = await query(
          `SELECT user_id FROM organization_members WHERE organization_id = $1 AND user_id != $2`,
          [organizationId, userId]
        );

        for (const member of members.rows) {
          sendTicketNotification(
            member.user_id,
            { id, ticketNumber, title },
            'push_on_new_ticket',
            `Neues Ticket erstellt: ${title}`
          ).catch(err => logger.error('Push notification error:', err));
        }
      } catch (err) {
        logger.error('Error sending push notifications:', err);
      }
    })();

    res.status(201).json({ success: true, data: transformTicket(ticketResult.rows[0]) });
  } catch (error) {
    logger.error('Error creating ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to create ticket' });
  }
});

// PUT /api/tickets/:id - Update ticket (requires member role)
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateTicketSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { customerId, projectId, title, description, status, priority, assignedToUserId, solution, resolutionType, deviceId, category } = req.body;

    // Get current ticket values for activity logging
    const currentTicket = await query(
      'SELECT status, priority, title, description, assigned_to FROM tickets WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (currentTicket.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const oldValues = currentTicket.rows[0];

    // Require solution and resolutionType when closing a ticket
    if (status === 'closed' && oldValues.status !== 'closed') {
      if (!solution || !resolutionType) {
        return res.status(400).json({
          success: false,
          error: 'Lösung und Lösungstyp sind beim Schließen eines Tickets erforderlich',
          requiresSolution: true
        });
      }
    }

    // Build dynamic update query
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (customerId !== undefined) {
      updates.push(`customer_id = $${paramIndex}`);
      params.push(customerId);
      paramIndex++;
    }
    if (projectId !== undefined) {
      updates.push(`project_id = $${paramIndex}`);
      params.push(projectId || null);
      paramIndex++;
    }
    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (solution !== undefined) {
      updates.push(`solution = $${paramIndex}`);
      params.push(solution);
      paramIndex++;
    }
    if (resolutionType !== undefined) {
      updates.push(`resolution_type = $${paramIndex}`);
      params.push(resolutionType);
      paramIndex++;
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;

      // Set resolved_at or closed_at timestamps
      if (status === 'resolved') {
        updates.push('resolved_at = NOW()');
      } else if (status === 'closed') {
        updates.push('closed_at = NOW()');
      }
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }
    if (assignedToUserId !== undefined) {
      if (assignedToUserId && !(await isOrgMember(organizationId, assignedToUserId))) {
        return res.status(400).json({ success: false, error: 'Der Bearbeiter ist kein Mitglied dieser Organisation' });
      }
      updates.push(`assigned_to = $${paramIndex}`);
      params.push(assignedToUserId || null);
      paramIndex++;
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(category || null);
      paramIndex++;
    }
    if (deviceId !== undefined) {
      updates.push(`device_id = $${paramIndex}`);
      params.push(deviceId || null);
      paramIndex++;
    }

    params.push(id, organizationId);

    const result = await query(`
      UPDATE tickets SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Log activities for each change
    if (status !== undefined && status !== oldValues.status) {
      let actionType = 'status_changed';
      if (status === 'resolved') actionType = 'resolved';
      else if (status === 'closed') actionType = 'closed';
      else if (status === 'archived') actionType = 'archived';
      else if (oldValues.status === 'closed' || oldValues.status === 'resolved') actionType = 'reopened';
      await logTicketActivity(id, userId, null, actionType, oldValues.status, status);

      // Audit log for status change
      const auditAction = status === 'closed' ? 'ticket.close' :
                          (oldValues.status === 'closed' || oldValues.status === 'resolved') ? 'ticket.reopen' :
                          'ticket.status_change';
      await auditLog.log({
        userId,
        action: auditAction,
        details: JSON.stringify({ ticketId: id, oldStatus: oldValues.status, newStatus: status }),
      });

      // Send email and push notification for status change (except archived)
      if (status !== 'archived') {
        // Try direct contact first, then fallback to customer's primary contact
        const contactInfo = await query(`
          SELECT t.title, t.ticket_number, t.created_by_contact_id as contact_id, t.customer_id,
                 COALESCE(creator.email, primary_contact.email) as email,
                 COALESCE(creator.first_name || ' ' || creator.last_name, creator.last_name, primary_contact.first_name || ' ' || primary_contact.last_name, primary_contact.last_name) as name,
                 COALESCE(creator.notify_ticket_status_changed, primary_contact.notify_ticket_status_changed, true) as notify_ticket_status_changed,
                 COALESCE(creator.id, primary_contact.id) as resolved_contact_id
          FROM tickets t
          LEFT JOIN customer_contacts creator ON (creator.id = t.created_by_contact_id OR creator.portal_user_id = t.created_by_contact_id)
          LEFT JOIN customer_contacts primary_contact ON t.customer_id = primary_contact.customer_id AND primary_contact.is_primary = true
          WHERE t.id = $1
        `, [id]);

        const contactData = contactInfo.rows[0];
        logger.info(`[Ticket ${id}] Status change notification check:`, {
          hasRow: contactInfo.rows.length > 0,
          hasDirectContactId: contactData?.contact_id || null,
          hasResolvedContactId: contactData?.resolved_contact_id || null,
          hasEmail: !!contactData?.email,
          notifyEnabled: contactData?.notify_ticket_status_changed,
        });

        if (contactInfo.rows.length > 0 && contactData.email && contactData.notify_ticket_status_changed !== false) {
          const portalTicketUrl = `${PORTAL_URL}/portal/tickets/${id}`;
          logger.info(`[Ticket ${id}] Sending status change email to: ${contactData.email}`);
          emailService.sendTicketStatusChangeNotification({
            to: contactData.email,
            customerName: contactData.name || 'Kunde',
            ticketNumber: contactData.ticket_number,
            ticketTitle: contactData.title,
            oldStatus: oldValues.status,
            newStatus: status,
            portalUrl: portalTicketUrl,
          }).catch(err => logger.error('Failed to send status change notification:', err));

          // Send push notification for status change
          if (contactData.resolved_contact_id) {
            const statusNames: Record<string, string> = {
              'open': 'Offen',
              'in_progress': 'In Bearbeitung',
              'waiting': 'Wartend',
              'resolved': 'Gelöst',
              'closed': 'Geschlossen',
            };
            sendPortalTicketNotification(
              contactData.resolved_contact_id,
              { id, ticketNumber: contactData.ticket_number, title: contactData.title },
              'push_on_status_change',
              `Status geändert: ${statusNames[status] || status}`
            ).catch(err => logger.error('Failed to send portal status change push:', err));
          }
        } else {
          logger.info(`[Ticket ${id}] Skipping status change notification:`, {
            reason: !contactInfo.rows.length ? 'no_ticket_found' :
                    !contactData?.email ? 'no_contact_email' :
                    contactData?.notify_ticket_status_changed === false ? 'notification_disabled' : 'unknown',
          });
        }
      }
    }
    if (priority !== undefined && priority !== oldValues.priority) {
      await logTicketActivity(id, userId, null, 'priority_changed', oldValues.priority, priority);
      await auditLog.log({
        userId,
        action: 'ticket.priority_change',
        details: JSON.stringify({ ticketId: id, oldPriority: oldValues.priority, newPriority: priority }),
      });
    }
    if (title !== undefined && title !== oldValues.title) {
      await logTicketActivity(id, userId, null, 'title_changed', oldValues.title, title);
    }
    if (description !== undefined && description !== oldValues.description) {
      await logTicketActivity(id, userId, null, 'description_changed', null, null);
    }
    if (assignedToUserId !== undefined && assignedToUserId !== oldValues.assigned_to) {
      if (assignedToUserId) {
        await logTicketActivity(id, userId, null, 'assigned', oldValues.assigned_to, assignedToUserId);
        // Send notification to the newly assigned user (async, don't block response)
        sendAssignedNotifications(id, assignedToUserId, userId)
          .catch(err => logger.error('Error sending assignment notifications:', err));
      } else {
        await logTicketActivity(id, userId, null, 'unassigned', oldValues.assigned_to, null);
      }
      await auditLog.log({
        userId,
        action: 'ticket.assign',
        details: JSON.stringify({ ticketId: id, oldAssignee: oldValues.assigned_to, newAssignee: assignedToUserId }),
      });
    }

    // General update audit log (for other changes like title, description)
    if (title !== undefined || description !== undefined) {
      await auditLog.log({
        userId,
        action: 'ticket.update',
        details: JSON.stringify({ ticketId: id, fieldsUpdated: { title: title !== undefined, description: description !== undefined } }),
      });
    }

    // Get with joined data
    const ticketResult = await query(`
      SELECT t.*, c.name as customer_name, p.name as project_name,
             COALESCE(assignee.display_name, assignee.username) as assignee_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      WHERE t.id = $1
    `, [id]);

    res.json({ success: true, data: transformTicket(ticketResult.rows[0]) });
  } catch (error) {
    logger.error('Error updating ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to update ticket' });
  }
});

// DELETE /api/tickets/bulk - Delete multiple tickets (requires admin role).
// MUSS vor DELETE /:id registriert sein, sonst matcht Express 'bulk' als
// Ticket-ID und die Route ist unerreichbar (war der Grund, warum Bulk-Delete
// nie funktioniert hat).
router.delete('/bulk', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(bulkDeleteSchema), async (req, res) => {
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

    // Get ticket info for audit log before deleting
    const ticketInfo = await query(
      'SELECT id, ticket_number, title FROM tickets WHERE id = ANY($1)',
      [ticketIds]
    );
    const deletedTickets = ticketInfo.rows.map(r => ({ id: r.id, ticketNumber: r.ticket_number, title: r.title }));

    await query('DELETE FROM tickets WHERE id = ANY($1) AND organization_id = $2', [ticketIds, organizationId]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.bulk_delete',
      details: JSON.stringify({ deletedTickets, count: ticketIds.length }),
    });

    logger.info(`Bulk delete: ${ticketIds.length} tickets`);
    res.json({ success: true, message: `${ticketIds.length} Tickets geloescht`, count: ticketIds.length });
  } catch (error) {
    logger.error('Error bulk deleting tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to delete tickets' });
  }
});

// DELETE /api/tickets/:id - Delete ticket (requires admin role)
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Get ticket info for audit log before deleting
    const ticketInfo = await query(
      'SELECT ticket_number, title FROM tickets WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (ticketInfo.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const { ticket_number, title } = ticketInfo.rows[0];

    await query('DELETE FROM tickets WHERE id = $1', [id]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket.delete',
      details: JSON.stringify({ ticketId: id, ticketNumber: ticket_number, title }),
    });

    res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    logger.error('Error deleting ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to delete ticket' });
  }
});

// POST /api/tickets/:id/merge - Merge source tickets into target ticket (requires admin role)
router.post('/:id/merge', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(mergeTicketsSchema), async (req, res) => {
  const client = await getClient();

  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: targetId } = req.params;
    const { sourceTicketIds } = req.body;

    if (!sourceTicketIds || !Array.isArray(sourceTicketIds) || sourceTicketIds.length === 0) {
      client.release();
      return res.status(400).json({ success: false, error: 'sourceTicketIds array is required' });
    }

    // Verify target ticket belongs to organization and is not closed/archived
    const targetCheck = await client.query(
      `SELECT id, ticket_number, title, customer_id, status
       FROM tickets WHERE id = $1 AND organization_id = $2`,
      [targetId, organizationId]
    );

    if (targetCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, error: 'Target ticket not found' });
    }

    const targetTicket = targetCheck.rows[0];

    // Don't allow merging into closed or archived tickets
    if (targetTicket.status === 'closed' || targetTicket.status === 'archived') {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'Kann nicht in geschlossene oder archivierte Tickets zusammenführen'
      });
    }

    // Verify all source tickets belong to org and are different from target
    const filteredSourceIds = sourceTicketIds.filter((id: string) => id !== targetId);
    if (filteredSourceIds.length === 0) {
      client.release();
      return res.status(400).json({ success: false, error: 'No valid source tickets to merge' });
    }

    const sourceCheck = await client.query(
      `SELECT id, ticket_number, title, customer_id, status
       FROM tickets WHERE id = ANY($1) AND organization_id = $2`,
      [filteredSourceIds, organizationId]
    );

    if (sourceCheck.rows.length !== filteredSourceIds.length) {
      client.release();
      return res.status(404).json({ success: false, error: 'Some source tickets not found' });
    }

    const sourceTickets = sourceCheck.rows;

    // Verify all tickets belong to the same customer
    const differentCustomer = sourceTickets.find(t => t.customer_id !== targetTicket.customer_id);
    if (differentCustomer) {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'Tickets von unterschiedlichen Kunden können nicht zusammengeführt werden'
      });
    }

    // Don't allow merging closed or archived source tickets
    const invalidSource = sourceTickets.find(t => t.status === 'closed' || t.status === 'archived');
    if (invalidSource) {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'Geschlossene oder archivierte Tickets können nicht zusammengeführt werden'
      });
    }

    const mergedCount = sourceTickets.length;

    // Start transaction for atomic merge operation
    await client.query('BEGIN');

    try {
      for (const sourceTicket of sourceTickets) {
        // Move comments from source to target (add merge note to each)
        await client.query(`
          UPDATE ticket_comments
          SET ticket_id = $1,
              content = content || E'\n\n---\n_[Zusammengeführt aus ' || $3 || ']_'
          WHERE ticket_id = $2
        `, [targetId, sourceTicket.id, sourceTicket.ticket_number]);

        // Move attachments from source to target
        await client.query(`
          UPDATE ticket_attachments SET ticket_id = $1 WHERE ticket_id = $2
        `, [targetId, sourceTicket.id]);

        // Move email history from source to target — sonst zeigen Folgemails
        // (conversationId-Match) weiter auf das geschlossene Quell-Ticket
        await client.query(`
          UPDATE ticket_emails SET ticket_id = $1 WHERE ticket_id = $2
        `, [targetId, sourceTicket.id]);
        await client.query(`
          UPDATE tickets target SET
            email_conversation_id = COALESCE(target.email_conversation_id, source.email_conversation_id),
            email_from = COALESCE(target.email_from, source.email_from)
          FROM tickets source
          WHERE target.id = $1 AND source.id = $2
        `, [targetId, sourceTicket.id]);

        // Copy activities from source to target (with merge reference)
        await client.query(`
          INSERT INTO ticket_activities (id, ticket_id, user_id, customer_contact_id, action_type, old_value, new_value, metadata, created_at)
          SELECT gen_random_uuid(), $1, user_id, customer_contact_id, action_type, old_value, new_value,
                 jsonb_set(COALESCE(metadata, '{}'::jsonb), '{merged_from}', to_jsonb($3::text)),
                 created_at
          FROM ticket_activities WHERE ticket_id = $2
        `, [targetId, sourceTicket.id, sourceTicket.ticket_number]);

        // Move tags from source to target (if not already present)
        await client.query(`
          INSERT INTO ticket_tag_assignments (ticket_id, tag_id)
          SELECT $1, tag_id
          FROM ticket_tag_assignments
          WHERE ticket_id = $2
          AND tag_id NOT IN (SELECT tag_id FROM ticket_tag_assignments WHERE ticket_id = $1)
        `, [targetId, sourceTicket.id]);

        // Update time entries to point to target ticket
        await client.query(`
          UPDATE time_entries SET ticket_id = $1 WHERE ticket_id = $2
        `, [targetId, sourceTicket.id]);

        // Add merge reference comment to source ticket before closing
        const mergeNoteId = crypto.randomUUID();
        await client.query(`
          INSERT INTO ticket_comments (id, ticket_id, user_id, content, is_internal)
          VALUES ($1, $2, $3, $4, true)
        `, [
          mergeNoteId,
          sourceTicket.id,
          userId,
          `Dieses Ticket wurde mit ${targetTicket.ticket_number} zusammengeführt.\n\nAlle Kommentare, Anhänge und Aktivitäten wurden übertragen.`
        ]);

        // Close source ticket with reference
        await client.query(`
          UPDATE tickets
          SET status = 'closed',
              closed_at = NOW(),
              merged_into_id = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [targetId, sourceTicket.id]);

        // Log merge activity on source ticket
        const activityId1 = crypto.randomUUID();
        await client.query(`
          INSERT INTO ticket_activities (id, ticket_id, user_id, action_type, new_value, metadata)
          VALUES ($1, $2, $3, 'merged', $4, $5)
        `, [activityId1, sourceTicket.id, userId, targetTicket.ticket_number, JSON.stringify({
          merged_into: targetId,
          merged_into_number: targetTicket.ticket_number
        })]);
      }

      // Add merge comment to target ticket
      const summaryId = crypto.randomUUID();
      const sourceNumbers = sourceTickets.map((t: any) => t.ticket_number).join(', ');
      await client.query(`
        INSERT INTO ticket_comments (id, ticket_id, user_id, content, is_internal)
        VALUES ($1, $2, $3, $4, true)
      `, [
        summaryId,
        targetId,
        userId,
        `${mergedCount} Ticket${mergedCount > 1 ? 's' : ''} zusammengeführt: ${sourceNumbers}\n\nAlle Kommentare, Anhänge und Aktivitäten wurden in dieses Ticket übertragen.`
      ]);

      // Log merge activity on target ticket
      const activityId2 = crypto.randomUUID();
      await client.query(`
        INSERT INTO ticket_activities (id, ticket_id, user_id, action_type, new_value, metadata)
        VALUES ($1, $2, $3, 'tickets_merged', $4, $5)
      `, [activityId2, targetId, userId, sourceNumbers, JSON.stringify({
        merged_tickets: sourceTickets.map((t: any) => ({ id: t.id, number: t.ticket_number, title: t.title })),
        merged_count: mergedCount
      })]);

      // Commit transaction
      await client.query('COMMIT');

      // Audit log for merge (outside transaction)
      await auditLog.log({
        userId,
        action: 'ticket.merge',
        details: JSON.stringify({
          targetTicketId: targetId,
          targetTicketNumber: targetTicket.ticket_number,
          sourceTickets: sourceTickets.map((t: any) => ({ id: t.id, ticketNumber: t.ticket_number })),
          mergedCount
        }),
      });

      // Return updated target ticket
      const ticketResult = await query(`
        SELECT t.*, c.name as customer_name, p.name as project_name
        FROM tickets t
        LEFT JOIN customers c ON t.customer_id = c.id
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1
      `, [targetId]);

      res.json({
        success: true,
        message: `${mergedCount} Ticket${mergedCount > 1 ? 's' : ''} zusammengeführt`,
        data: transformTicket(ticketResult.rows[0]),
        mergedCount
      });
    } catch (txError) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    logger.error('Error merging tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to merge tickets' });
  } finally {
    client.release();
  }
});

export default router;
