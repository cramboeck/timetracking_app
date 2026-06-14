import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query, getClient } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { upload, getFileUrl, deleteFile } from '../middleware/upload';
import { emailService } from '../services/emailService';
import { sendTicketNotification, sendPortalTicketNotification } from '../services/pushNotifications';
import { auditLog } from '../services/auditLog';
import { logger } from '../utils/logger';

const router = express.Router();

// ============================================================================
// Zod validation schemas
// ============================================================================

const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
const ticketStatusSchema = z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed', 'archived']);

const createTicketSchema = z.object({
  customerId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional(),
  priority: ticketPrioritySchema.optional(),
});

const updateTicketSchema = z.object({
  customerId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(50_000).optional().nullable(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  solution: z.string().max(50_000).optional().nullable(),
  resolutionType: z.string().max(100).optional().nullable(),
  deviceId: z.string().max(200).optional().nullable(),
});

const mergeTicketsSchema = z.object({
  sourceTicketIds: z.array(z.string().uuid()).min(1).max(50),
});

const createCommentSchema = z.object({
  content: z.string().min(1).max(50_000),
  isInternal: z.boolean().optional(),
  notifyCustomer: z.boolean().optional(),
  replyViaEmail: z.boolean().optional(),
});

const createContactSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  canCreateTickets: z.boolean().optional(),
  canViewAllTickets: z.boolean().optional(),
  notifyTicketCreated: z.boolean().optional(),
  notifyTicketStatusChanged: z.boolean().optional(),
  notifyTicketReply: z.boolean().optional(),
});

const updateContactSchema = createContactSchema.partial();

const cannedResponseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(50_000),
  shortcut: z.string().trim().max(50).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
});

const tagSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #RRGGBB color').optional(),
});

const slaPolicySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).optional().nullable(),
  priority: ticketPrioritySchema,
  firstResponseMinutes: z.number().int().positive().max(525_600), // ≤ 1 year
  resolutionMinutes: z.number().int().positive().max(525_600),
  businessHoursOnly: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const updateSlaPolicySchema = slaPolicySchema.partial();

const ticketTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional().nullable(),
  visibleToCustomer: z.boolean().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

const updateTicketTaskSchema = ticketTaskSchema.extend({
  completed: z.boolean().optional(),
}).partial();

const reorderTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(500),
});

// Bulk action schemas
const bulkStatusSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  status: ticketStatusSchema,
});

const bulkPrioritySchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  priority: ticketPrioritySchema,
});

const bulkAssignSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  assignedToUserId: z.string().uuid().nullable(),
});

const bulkArchiveSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
});

const bulkDeleteSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
});

// Ticket Template schemas
const ticketTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  titleTemplate: z.string().max(500).optional().nullable(),
  descriptionTemplate: z.string().max(50_000).optional().nullable(),
  defaultPriority: ticketPrioritySchema.optional().nullable(),
  defaultCustomerId: z.string().uuid().optional().nullable(),
  defaultProjectId: z.string().uuid().optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateTicketTemplateSchema = ticketTemplateSchema.partial();

// ============================================================================
// Explicit column lists (no SELECT *)
// ============================================================================

const NOTIFICATION_PREFS_COLUMNS = `
  id, user_id, organization_id,
  push_enabled, push_on_new_ticket, push_on_ticket_assigned, push_on_ticket_comment,
  push_on_status_change, push_on_sla_warning, push_on_mention,
  email_enabled, email_on_new_ticket, email_on_ticket_assigned, email_on_ticket_comment,
  email_on_status_change, email_on_sla_warning, email_on_mention, email_daily_digest
`;

const TICKET_ATTACHMENT_COLUMNS = `
  id, ticket_id, filename, file_url, file_size, mime_type, uploaded_by_user_id, created_at
`;

const CANNED_RESPONSE_COLUMNS = `
  id, user_id, organization_id, title, content, shortcut, category, usage_count, created_at, updated_at
`;

const TICKET_TEMPLATE_COLUMNS = `
  id, organization_id, name, title_template, description_template, default_priority,
  default_customer_id, default_project_id, category, is_active, usage_count, created_at, updated_at
`;

const SLA_POLICY_COLUMNS = `
  id, organization_id, user_id, name, description, priority,
  first_response_minutes, resolution_minutes, business_hours_only,
  is_active, is_default, created_at, updated_at
`;

const TICKET_TASK_COLUMNS = `
  id, ticket_id, title, description, completed, sort_order, visible_to_customer,
  assigned_to, due_date, created_at, completed_at
`;

const TICKET_BASIC_COLUMNS = `id, priority, created_at`;

// Portal URL for email links
const PORTAL_URL = process.env.FRONTEND_URL || 'https://app.ramboeck.it';

// Helper function to generate ticket number
async function generateTicketNumber(organizationId: string): Promise<string> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get or create sequence for organization
    const result = await client.query(
      `INSERT INTO ticket_sequences (organization_id, last_number)
       VALUES ($1, 0)
       ON CONFLICT (organization_id) DO UPDATE SET last_number = ticket_sequences.last_number + 1
       RETURNING last_number`,
      [organizationId]
    );

    // If it was an insert, we need to increment
    let number = result.rows[0].last_number;
    if (number === 0) {
      const updateResult = await client.query(
        'UPDATE ticket_sequences SET last_number = 1 WHERE organization_id = $1 RETURNING last_number',
        [organizationId]
      );
      number = updateResult.rows[0].last_number;
    }

    await client.query('COMMIT');
    return `TKT-${String(number).padStart(6, '0')}`;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Transform database row to API response
function transformTicket(row: any) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    userId: row.user_id,
    customerId: row.customer_id,
    projectId: row.project_id,
    createdByContactId: row.created_by_contact_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignedToUserId: row.assigned_to,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    resolvedAt: row.resolved_at?.toISOString(),
    closedAt: row.closed_at?.toISOString(),
    // Solution fields
    solution: row.solution,
    resolutionType: row.resolution_type,
    // SLA fields
    slaPolicyId: row.sla_policy_id,
    firstResponseDueAt: row.first_response_due_at?.toISOString(),
    resolutionDueAt: row.resolution_due_at?.toISOString(),
    firstResponseAt: row.first_response_at?.toISOString(),
    slaFirstResponseBreached: row.sla_first_response_breached,
    slaResolutionBreached: row.sla_resolution_breached,
    // Source & Email tracking
    source: row.source,
    emailConversationId: row.email_conversation_id,
    emailFrom: row.email_from,
    contactId: row.contact_id,
    // Include related data if joined
    customerName: row.customer_name,
    projectName: row.project_name,
    creatorName: row.creator_name,
    assigneeName: row.assignee_name,
  };
}

function transformComment(row: any) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userId: row.user_id,
    customerContactId: row.customer_contact_id,
    isInternal: row.is_internal,
    content: row.content,
    createdAt: row.created_at?.toISOString(),
    // Include author info if joined
    authorName: row.author_name,
    authorType: row.user_id ? 'user' : 'customer',
  };
}

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
    const { status, customerId, priority, searchText } = req.query;

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

    if (customerId) {
      params.push(customerId);
      whereClause += ` AND t.customer_id = $${params.length}`;
    }

    if (priority) {
      params.push(priority);
      whereClause += ` AND t.priority = $${params.length}`;
    }

    if (searchText && typeof searchText === 'string' && searchText.trim()) {
      params.push(`%${searchText.trim()}%`);
      whereClause += ` AND (t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`;
    }

    // Explicit column list (no SELECT *)
    const baseQuery = `
      SELECT t.id, t.ticket_number, t.organization_id, t.user_id, t.customer_id, t.project_id,
             t.assigned_to, t.title, t.description, t.status, t.priority, t.source,
             t.due_date, t.first_response_at, t.resolved_at, t.closed_at,
             t.sla_policy_id, t.sla_response_due, t.sla_resolution_due,
             t.sla_response_breached, t.sla_resolution_breached,
             t.created_at, t.updated_at, t.created_by_contact_id,
             c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
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
             COALESCE(assignee.display_name, assignee.username) as assignee_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users creator ON t.user_id = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
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
    const { customerId, projectId, title, description, priority = 'normal' } = req.body;

    if (!customerId || !title) {
      return res.status(400).json({ success: false, error: 'Customer and title are required' });
    }

    const id = crypto.randomUUID();
    const ticketNumber = await generateTicketNumber(organizationId);

    const result = await query(`
      INSERT INTO tickets (id, ticket_number, user_id, organization_id, customer_id, project_id, title, description, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
      RETURNING *
    `, [id, ticketNumber, userId, organizationId, customerId, projectId || null, title, description || '', priority]);

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
    const { customerId, projectId, title, description, status, priority, assignedToUserId, solution, resolutionType, deviceId } = req.body;

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
      updates.push(`assigned_to = $${paramIndex}`);
      params.push(assignedToUserId || null);
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
        const contactInfo = await query(`
          SELECT t.title, t.ticket_number, t.contact_id, cc.email, COALESCE(cc.first_name || ' ' || cc.last_name, cc.last_name) as name, cc.notify_ticket_status_changed
          FROM tickets t
          LEFT JOIN customer_contacts cc ON t.contact_id = cc.id
          WHERE t.id = $1
        `, [id]);

        const contactData = contactInfo.rows[0];
        logger.info(`[Ticket ${id}] Status change notification check:`, {
          hasRow: contactInfo.rows.length > 0,
          hasContactId: contactData?.contact_id || null,
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
          if (contactData.contact_id) {
            const statusNames: Record<string, string> = {
              'open': 'Offen',
              'in_progress': 'In Bearbeitung',
              'waiting': 'Wartend',
              'resolved': 'Gelöst',
              'closed': 'Geschlossen',
            };
            sendPortalTicketNotification(
              contactData.contact_id,
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
        (async () => {
          try {
            // Get assignee info
            const assigneeResult = await query(
              'SELECT id, username, email FROM users WHERE id = $1',
              [assignedToUserId]
            );
            if (assigneeResult.rows.length === 0) return;
            const assignee = assigneeResult.rows[0];

            // Get assigner (current user) info
            const assignerResult = await query(
              'SELECT username FROM users WHERE id = $1',
              [userId]
            );
            const assignerName = assignerResult.rows[0]?.username || 'Ein Teammitglied';

            // Get ticket details with customer name
            const ticketDetails = await query(`
              SELECT t.ticket_number, t.title, t.description, t.priority, c.name as customer_name
              FROM tickets t
              LEFT JOIN customers c ON t.customer_id = c.id
              WHERE t.id = $1
            `, [id]);
            if (ticketDetails.rows.length === 0) return;
            const ticket = ticketDetails.rows[0];

            // Check notification preferences for assignee
            const prefsResult = await query(
              `SELECT ${NOTIFICATION_PREFS_COLUMNS} FROM notification_preferences WHERE user_id = $1`,
              [assignedToUserId]
            );
            // Default preferences if not set
            const prefs = prefsResult.rows[0] || {
              push_enabled: true,
              push_on_ticket_assigned: true,
              email_enabled: true,
              email_on_ticket_assigned: true
            };

            // Send push notification
            if (prefs.push_enabled !== false && prefs.push_on_ticket_assigned !== false) {
              sendTicketNotification(
                assignedToUserId,
                { id, ticketNumber: ticket.ticket_number, title: ticket.title },
                'push_on_ticket_assigned',
                `${assignerName} hat Ihnen Ticket #${ticket.ticket_number} zugewiesen`
              ).catch(err => logger.error('Push notification error (assigned):', err));
            }

            // Send email notification
            if (prefs.email_enabled !== false && prefs.email_on_ticket_assigned !== false && assignee.email) {
              const ticketUrl = `${PORTAL_URL}/?ticket=${id}`;
              emailService.sendTicketAssignedNotification({
                to: assignee.email,
                assigneeName: assignee.username,
                assignedByName: assignerName,
                ticketNumber: ticket.ticket_number,
                ticketTitle: ticket.title,
                ticketDescription: ticket.description || '',
                customerName: ticket.customer_name || 'Unbekannt',
                priority: ticket.priority,
                ticketUrl
              }).catch(err => logger.error('Email notification error (assigned):', err));
            }
          } catch (err) {
            logger.error('Error sending assignment notifications:', err);
          }
        })();
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
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);

    res.json({ success: true, data: transformTicket(ticketResult.rows[0]) });
  } catch (error) {
    logger.error('Error updating ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to update ticket' });
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
          INSERT INTO ticket_tag_assignments (id, ticket_id, tag_id)
          SELECT gen_random_uuid(), $1, tag_id
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
          INSERT INTO ticket_comments (id, ticket_id, user_id, content, is_internal, is_system)
          VALUES ($1, $2, $3, $4, false, true)
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
        INSERT INTO ticket_comments (id, ticket_id, user_id, content, is_internal, is_system)
        VALUES ($1, $2, $3, $4, false, true)
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

// ============================================================================
// BULK ACTION ROUTES
// ============================================================================

// Helper function to verify tickets belong to organization
async function verifyTicketsInOrganization(ticketIds: string[], organizationId: string): Promise<{ valid: boolean; foundIds: string[]; notFoundIds: string[] }> {
  const result = await query(
    'SELECT id FROM tickets WHERE id = ANY($1) AND organization_id = $2',
    [ticketIds, organizationId]
  );
  const foundIds = result.rows.map(r => r.id);
  const notFoundIds = ticketIds.filter(id => !foundIds.includes(id));
  return { valid: notFoundIds.length === 0, foundIds, notFoundIds };
}

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

// DELETE /api/tickets/bulk - Delete multiple tickets (requires admin role)
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

// ============================================================================
// TICKET COMMENT ROUTES
// ============================================================================

// POST /api/tickets/:id/comments - Add comment to ticket (requires member role)
router.post('/:id/comments', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createCommentSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: ticketId } = req.params;
    const {
      content,
      isInternal = false,
      notifyCustomer = true,  // Default: send email notification
      replyViaEmail = false   // If true, reply in original email thread
    } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const commentId = crypto.randomUUID();

    await query(`
      INSERT INTO ticket_comments (id, ticket_id, user_id, is_internal, content)
      VALUES ($1, $2, $3, $4, $5)
    `, [commentId, ticketId, userId, isInternal, content]);

    // Update ticket's updated_at and set first_response_at if not already set (for non-internal comments)
    if (!isInternal) {
      await query(`
        UPDATE tickets
        SET updated_at = NOW(),
            first_response_at = COALESCE(first_response_at, NOW())
        WHERE id = $1
      `, [ticketId]);

      // Only send email notification if notifyCustomer is true
      if (notifyCustomer) {
        try {
          // Get ticket info with contact - try direct contact first, then fallback to customer's primary contact
          const ticketInfo = await query(`
            SELECT t.title, t.ticket_number, t.contact_id, t.customer_id, t.email_conversation_id, t.email_from, t.source,
                   COALESCE(cc.email, primary_contact.email) as contact_email,
                   COALESCE(cc.first_name || ' ' || cc.last_name, cc.last_name, primary_contact.first_name || ' ' || primary_contact.last_name, primary_contact.last_name) as contact_name,
                   COALESCE(cc.notify_ticket_reply, primary_contact.notify_ticket_reply, true) as notify_ticket_reply,
                   COALESCE(cc.id, primary_contact.id) as resolved_contact_id,
                   COALESCE(u.display_name, u.username) as replier_name
            FROM tickets t
            LEFT JOIN customer_contacts cc ON t.contact_id = cc.id
            LEFT JOIN customer_contacts primary_contact ON t.customer_id = primary_contact.customer_id AND primary_contact.is_primary = true
            LEFT JOIN users u ON u.id = $2
            WHERE t.id = $1
          `, [ticketId, userId]);

          if (ticketInfo.rows.length > 0) {
            const ticket = ticketInfo.rows[0];
            const recipientEmail = ticket.contact_email || ticket.email_from;
            const recipientName = ticket.contact_name || (ticket.email_from ? ticket.email_from.split('@')[0] : 'Kunde');

            // Only send if we have an email and customer hasn't disabled notifications
            if (recipientEmail && ticket.notify_ticket_reply !== false) {

              // If replyViaEmail is true and ticket has email conversation, reply via Graph API
              if (replyViaEmail && ticket.source === 'email' && ticket.email_conversation_id) {
                // Reply via email thread (Graph API) - handled by mailboxMonitorService
                const { mailboxMonitorService } = await import('../services/mailboxMonitorService');
                mailboxMonitorService.replyToTicketEmail(organizationId, ticketId, content, ticket.replier_name || 'Support')
                  .catch(err => logger.error('Failed to send email reply via Graph API:', err));
              } else {
                // Send standard notification email via SMTP
                const portalTicketUrl = `${PORTAL_URL}/portal/tickets/${ticketId}`;
                emailService.sendTicketReplyNotification({
                  to: recipientEmail,
                  customerName: recipientName,
                  ticketNumber: ticket.ticket_number,
                  ticketTitle: ticket.title,
                  replyContent: content,
                  replierName: ticket.replier_name || 'Support',
                  portalUrl: portalTicketUrl,
                }).catch(err => logger.error('Failed to send ticket reply notification:', err));
              }

              // Send push notification to customer (async, non-blocking)
              const contactIdForPush = ticket.resolved_contact_id || ticket.contact_id;
              if (contactIdForPush) {
                sendPortalTicketNotification(
                  contactIdForPush,
                  { id: ticketId, ticketNumber: ticket.ticket_number, title: ticket.title },
                  'push_on_ticket_reply',
                  `Neue Antwort von ${ticket.replier_name || 'Support'}`
                ).catch(err => logger.error('Failed to send portal push notification:', err));
              }
            }
          }
        } catch (emailErr) {
          logger.error('Error preparing ticket notification email:', emailErr);
          // Don't fail the comment creation if email fails
        }
      }
    } else {
      await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);
    }

    // Send notification to assignee (if not the commenter) - async, non-blocking
    (async () => {
      try {
        // Get ticket with assignee info
        const ticketWithAssignee = await query(`
          SELECT t.ticket_number, t.title, t.assigned_to, t.customer_id,
                 c.name as customer_name, u.email as assignee_email, u.username as assignee_name
          FROM tickets t
          LEFT JOIN customers c ON t.customer_id = c.id
          LEFT JOIN users u ON t.assigned_to = u.id
          WHERE t.id = $1
        `, [ticketId]);

        if (ticketWithAssignee.rows.length === 0) return;
        const ticket = ticketWithAssignee.rows[0];

        // Only notify if there's an assignee and it's not the commenter
        if (!ticket.assigned_to || ticket.assigned_to === userId) return;

        // Get commenter name
        const commenterResult = await query(
          "SELECT COALESCE(display_name, username) as name FROM users WHERE id = $1",
          [userId]
        );
        const commenterName = commenterResult.rows[0]?.name || 'Ein Teammitglied';

        // Check notification preferences for assignee
        const prefsResult = await query(
          `SELECT ${NOTIFICATION_PREFS_COLUMNS} FROM notification_preferences WHERE user_id = $1`,
          [ticket.assigned_to]
        );
        const prefs = prefsResult.rows[0] || {
          push_enabled: true,
          push_on_ticket_comment: true,
          email_enabled: true,
          email_on_ticket_comment: true
        };

        // Send push notification
        if (prefs.push_enabled !== false && prefs.push_on_ticket_comment !== false) {
          sendTicketNotification(
            ticket.assigned_to,
            { id: ticketId, ticketNumber: ticket.ticket_number, title: ticket.title },
            'push_on_ticket_comment',
            `${commenterName}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
          ).catch(err => logger.error('Push notification error (comment to assignee):', err));
        }

        // Send email notification
        if (prefs.email_enabled !== false && prefs.email_on_ticket_comment !== false && ticket.assignee_email) {
          const ticketUrl = `${PORTAL_URL}/?ticket=${ticketId}`;
          emailService.sendTicketCommentNotificationToAssignee({
            to: ticket.assignee_email,
            assigneeName: ticket.assignee_name,
            commenterName,
            ticketNumber: ticket.ticket_number,
            ticketTitle: ticket.title,
            commentContent: content,
            customerName: ticket.customer_name || 'Unbekannt',
            isFromCustomer: false, // Internal comment
            ticketUrl
          }).catch(err => logger.error('Email notification error (comment to assignee):', err));
        }
      } catch (err) {
        logger.error('Error sending comment notification to assignee:', err);
      }
    })();

    // Log activity
    await logTicketActivity(
      ticketId,
      userId,
      null,
      isInternal ? 'internal_comment_added' : 'comment_added',
      null,
      null,
      { commentId }
    );

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket_comment.create',
      details: JSON.stringify({ ticketId, commentId, isInternal }),
    });

    // Get comment with author info
    const result = await query(`
      SELECT tc.*, COALESCE(u.display_name, u.username) as author_name
      FROM ticket_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.id = $1
    `, [commentId]);

    res.status(201).json({ success: true, data: transformComment(result.rows[0]) });
  } catch (error) {
    logger.error('Error adding comment:', error);
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

// ============================================================================
// TICKET ATTACHMENTS ROUTES
// ============================================================================

// GET /api/tickets/:ticketId/attachments - Get all attachments for a ticket
router.get('/:ticketId/attachments', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;

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
        ta.id,
        ta.filename,
        ta.file_url,
        ta.file_size,
        ta.mime_type,
        ta.created_at,
        COALESCE(u.display_name, u.username, cc.first_name || ' ' || cc.last_name, cc.last_name) as uploaded_by_name,
        CASE WHEN ta.uploaded_by_user_id IS NOT NULL THEN 'user' ELSE 'customer' END as uploaded_by_type
      FROM ticket_attachments ta
      LEFT JOIN users u ON ta.uploaded_by_user_id = u.id
      LEFT JOIN customer_contacts cc ON ta.uploaded_by_contact_id = cc.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at ASC
    `, [ticketId]);

    const attachments = result.rows.map(a => ({
      id: a.id,
      filename: a.filename,
      fileUrl: a.file_url,
      fileSize: a.file_size,
      mimeType: a.mime_type,
      uploadedByName: a.uploaded_by_name || 'Unbekannt',
      uploadedByType: a.uploaded_by_type,
      createdAt: a.created_at?.toISOString(),
    }));

    res.json({ success: true, data: attachments });
  } catch (error) {
    logger.error('Get attachments error:', error);
    res.status(500).json({ success: false, error: 'Failed to get attachments' });
  }
});

// POST /api/tickets/:ticketId/attachments - Upload attachments (requires member role)
router.post('/:ticketId/attachments', authenticateToken, attachOrganization, requireOrgRole('member'), upload.array('files', 10), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Save attachments to database
    const attachments = [];
    for (const file of files) {
      const attachmentId = crypto.randomUUID();
      const fileUrl = getFileUrl(file.filename);

      await query(
        `INSERT INTO ticket_attachments (id, ticket_id, filename, file_url, file_size, mime_type, uploaded_by_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [attachmentId, ticketId, file.originalname, fileUrl, file.size, file.mimetype, userId]
      );

      attachments.push({
        id: attachmentId,
        filename: file.originalname,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedByName: (req as any).user.displayName || (req as any).user.username,
        uploadedByType: 'user',
        createdAt: new Date().toISOString(),
      });
    }

    // Update ticket's updated_at
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    // Log activity
    await logTicketActivity(ticketId, userId, null, 'attachment_added', null, null, { count: files.length });

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket_attachment.upload',
      details: JSON.stringify({ ticketId, attachmentCount: files.length, filenames: files.map(f => f.originalname) }),
    });

    res.status(201).json({ success: true, data: attachments });
  } catch (error) {
    logger.error('Upload attachments error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload attachments' });
  }
});

// DELETE /api/tickets/:ticketId/attachments/:attachmentId - Delete attachment (requires admin role)
router.delete('/:ticketId/attachments/:attachmentId', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, attachmentId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get attachment to delete the file
    const attachmentResult = await query(
      `SELECT ${TICKET_ATTACHMENT_COLUMNS} FROM ticket_attachments WHERE id = $1 AND ticket_id = $2`,
      [attachmentId, ticketId]
    );

    if (attachmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const attachment = attachmentResult.rows[0];

    // Delete file from disk
    deleteFile(attachment.file_url);

    // Delete from database
    await query('DELETE FROM ticket_attachments WHERE id = $1', [attachmentId]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket_attachment.delete',
      details: JSON.stringify({ ticketId, attachmentId, filename: attachment.filename }),
    });

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    logger.error('Delete attachment error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete attachment' });
  }
});

// ============================================================================
// DEBUG ROUTE - Check ticket ownership
// ============================================================================

// GET /api/tickets/debug - Debug endpoint to check ticket data
router.get('/debug/check', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    logger.info(`🔍 Debug check for organization_id: ${organizationId}`);

    // Get user info
    const userResult = await query('SELECT id, username FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Get all customers for this organization
    const customersResult = await query('SELECT id, name, organization_id FROM customers WHERE organization_id = $1', [organizationId]);

    // Get all tickets (without organization filter) to see what's there
    const allTicketsResult = await query(`
      SELECT t.id, t.ticket_number, t.user_id, t.organization_id, t.customer_id, t.title, c.name as customer_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY t.created_at DESC
      LIMIT 20
    `);

    // Get tickets for this organization
    const orgTicketsResult = await query(`
      SELECT t.id, t.ticket_number, t.user_id, t.organization_id, t.customer_id, t.title
      FROM tickets t
      WHERE t.organization_id = $1
      ORDER BY t.created_at DESC
    `, [organizationId]);

    res.json({
      success: true,
      debug: {
        currentUser: user,
        currentOrganization: organizationId,
        customersCount: customersResult.rows.length,
        customers: customersResult.rows.map(c => ({ id: c.id, name: c.name, organizationId: c.organization_id })),
        allTicketsCount: allTicketsResult.rowCount,
        allTickets: allTicketsResult.rows.map(t => ({
          id: t.id,
          ticketNumber: t.ticket_number,
          userId: t.user_id,
          organizationId: t.organization_id,
          customerId: t.customer_id,
          customerName: t.customer_name,
          title: t.title,
          matchesCurrentOrg: t.organization_id === organizationId
        })),
        orgTicketsCount: orgTicketsResult.rowCount,
      }
    });
  } catch (error) {
    logger.error('Debug check error:', error);
    res.status(500).json({ success: false, error: 'Debug check failed' });
  }
});

// ============================================================================
// CUSTOMER CONTACTS ROUTES (for managing portal access)
// ============================================================================

// GET /api/tickets/contacts/:customerId - Get contacts for a customer
router.get('/contacts/:customerId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2',
      [customerId, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const result = await query(`
      SELECT id, customer_id, last_name as name, email, is_primary, can_create_tickets, can_view_all_tickets,
             notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
             last_login, created_at
      FROM customer_contacts
      WHERE customer_id = $1
      ORDER BY is_primary DESC, last_name ASC
    `, [customerId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching contacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

// POST /api/tickets/contacts - Create customer contact
router.post('/contacts', authenticateToken, attachOrganization, validate(createContactSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      customerId, name, email,
      canCreateTickets = true, canViewAllTickets = false,
      notifyTicketCreated = true, notifyTicketStatusChanged = true, notifyTicketReply = true
    } = req.body;

    if (!customerId || !name || !email) {
      return res.status(400).json({ success: false, error: 'Customer ID, name and email are required' });
    }

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2',
      [customerId, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const id = crypto.randomUUID();

    // Check if this is the first contact for this customer (make it primary)
    const existingContacts = await query(
      'SELECT COUNT(*) as count FROM customer_contacts WHERE customer_id = $1',
      [customerId]
    );
    const isPrimary = parseInt(existingContacts.rows[0].count) === 0;

    const result = await query(`
      INSERT INTO customer_contacts (id, customer_id, organization_id, last_name, email, is_primary, can_create_tickets, can_view_all_tickets,
                                     notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply)
      VALUES ($1, $2, (SELECT organization_id FROM customers WHERE id = $2), $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, customer_id, last_name as name, email, is_primary, can_create_tickets, can_view_all_tickets,
                notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, created_at
    `, [id, customerId, name, email, isPrimary, canCreateTickets, canViewAllTickets,
        notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ success: false, error: 'Email already exists for this customer' });
    }
    logger.error('Error creating contact:', error);
    res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

// PUT /api/tickets/contacts/:id - Update customer contact
router.put('/contacts/:id', authenticateToken, attachOrganization, validate(updateContactSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const {
      name, email, canCreateTickets, canViewAllTickets,
      notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply
    } = req.body;

    // Verify contact belongs to organization through customer
    const contactCheck = await query(`
      SELECT cc.id FROM customer_contacts cc
      JOIN customers c ON cc.customer_id = c.id
      WHERE cc.id = $1 AND c.organization_id = $2
    `, [id, organizationId]);

    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const result = await query(`
      UPDATE customer_contacts SET
        last_name = COALESCE($1, last_name),
        email = COALESCE($2, email),
        can_create_tickets = COALESCE($3, can_create_tickets),
        can_view_all_tickets = COALESCE($4, can_view_all_tickets),
        notify_ticket_created = COALESCE($5, notify_ticket_created),
        notify_ticket_status_changed = COALESCE($6, notify_ticket_status_changed),
        notify_ticket_reply = COALESCE($7, notify_ticket_reply)
      WHERE id = $8
      RETURNING id, customer_id, last_name as name, email, is_primary, can_create_tickets, can_view_all_tickets,
                notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, created_at
    `, [name, email, canCreateTickets, canViewAllTickets,
        notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply, id]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Email already exists for this customer' });
    }
    logger.error('Error updating contact:', error);
    res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

// ============================================================================
// CANNED RESPONSES (Textbausteine) ROUTES
// ============================================================================

// GET /api/tickets/canned-responses - Get all canned responses for organization
router.get('/canned-responses/list', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { category } = req.query;

    let queryText = `
      SELECT ${CANNED_RESPONSE_COLUMNS} FROM canned_responses
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (category) {
      queryText += ' AND category = $2';
      params.push(category);
    }

    queryText += ' ORDER BY usage_count DESC, title ASC';

    const result = await query(queryText, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching canned responses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch canned responses' });
  }
});

// POST /api/tickets/canned-responses - Create canned response
router.post('/canned-responses', authenticateToken, attachOrganization, validate(cannedResponseSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { title, content, shortcut, category } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO canned_responses (id, user_id, organization_id, title, content, shortcut, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, userId, organizationId, title, content, shortcut || null, category || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to create canned response' });
  }
});

// PUT /api/tickets/canned-responses/:id - Update canned response
router.put('/canned-responses/:id', authenticateToken, attachOrganization, validate(cannedResponseSchema.partial()), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { title, content, shortcut, category } = req.body;

    const result = await query(`
      UPDATE canned_responses
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          shortcut = $3,
          category = $4,
          updated_at = NOW()
      WHERE id = $5 AND organization_id = $6
      RETURNING *
    `, [title, content, shortcut || null, category || null, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to update canned response' });
  }
});

// DELETE /api/tickets/canned-responses/:id - Delete canned response
router.delete('/canned-responses/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM canned_responses WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, message: 'Canned response deleted' });
  } catch (error) {
    logger.error('Error deleting canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to delete canned response' });
  }
});

// POST /api/tickets/canned-responses/:id/use - Increment usage count
router.post('/canned-responses/:id/use', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(`
      UPDATE canned_responses
      SET usage_count = usage_count + 1
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating canned response usage:', error);
    res.status(500).json({ success: false, error: 'Failed to update usage count' });
  }
});

// POST /api/tickets/canned-responses/seed-defaults - Create default canned responses
router.post('/canned-responses/seed-defaults', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Check if organization already has canned responses
    const existing = await query('SELECT COUNT(*) as count FROM canned_responses WHERE organization_id = $1', [organizationId]);
    if (parseInt(existing.rows[0].count) > 0) {
      return res.json({ success: true, message: 'Vorlagen bereits vorhanden', seeded: false });
    }

    const defaultResponses = [
      // Begrüßung & Eingangsbestätigung
      {
        title: 'Ticket-Eingangsbestätigung',
        content: `Guten Tag,

vielen Dank für Ihre Anfrage ({{ticket_number}}).

Wir haben Ihr Anliegen erhalten und werden uns schnellstmöglich darum kümmern. Sie erhalten eine Benachrichtigung, sobald es Neuigkeiten gibt.

Bei dringenden Fragen können Sie uns jederzeit kontaktieren.

Mit freundlichen Grüßen`,
        shortcut: 'ack',
        category: 'Begrüßung'
      },
      {
        title: 'Persönliche Begrüßung',
        content: `Hallo,

vielen Dank für Ihre Nachricht zu "{{ticket_title}}".

Ich schaue mir das Thema an und melde mich zeitnah bei Ihnen.

Viele Grüße`,
        shortcut: 'hi',
        category: 'Begrüßung'
      },

      // Status-Updates
      {
        title: 'Bearbeitung gestartet',
        content: `Guten Tag,

ich habe mit der Bearbeitung Ihres Anliegens begonnen.

Aktueller Status: {{status}}
Priorität: {{priority}}

Ich halte Sie auf dem Laufenden.

Mit freundlichen Grüßen`,
        shortcut: 'start',
        category: 'Status'
      },
      {
        title: 'Rückfrage an Kunden',
        content: `Guten Tag,

für die weitere Bearbeitung benötige ich noch folgende Informationen:

- [Ihre Frage hier]

Sobald ich die Informationen habe, kann ich fortfahren.

Mit freundlichen Grüßen`,
        shortcut: 'ask',
        category: 'Status'
      },
      {
        title: 'Warten auf Rückmeldung',
        content: `Guten Tag,

ich warte noch auf Ihre Rückmeldung zu meiner letzten Anfrage.

Falls Sie keine weiteren Informationen benötigen oder das Problem gelöst ist, können Sie das Ticket gerne schließen.

Mit freundlichen Grüßen`,
        shortcut: 'wait',
        category: 'Status'
      },

      // Lösungen
      {
        title: 'Problem gelöst',
        content: `Guten Tag,

das Problem wurde behoben. Hier ist eine kurze Zusammenfassung:

**Ursache:**
[Beschreibung der Ursache]

**Lösung:**
[Beschreibung der Lösung]

Bitte testen Sie, ob alles wie gewünscht funktioniert. Falls noch Fragen bestehen, können Sie einfach auf diese Nachricht antworten.

Mit freundlichen Grüßen`,
        shortcut: 'solved',
        category: 'Lösung'
      },
      {
        title: 'Workaround bereitgestellt',
        content: `Guten Tag,

ich habe einen Workaround für Ihr Problem gefunden:

**Vorgehensweise:**
1. [Schritt 1]
2. [Schritt 2]
3. [Schritt 3]

Dies ist eine temporäre Lösung. Ich arbeite an einer dauerhaften Behebung und halte Sie auf dem Laufenden.

Mit freundlichen Grüßen`,
        shortcut: 'workaround',
        category: 'Lösung'
      },

      // Abschluss
      {
        title: 'Ticket abschließen',
        content: `Guten Tag,

da ich keine Rückmeldung erhalten habe, schließe ich dieses Ticket.

Falls das Problem weiterhin besteht oder neue Fragen auftauchen, können Sie jederzeit ein neues Ticket erstellen oder auf diese Nachricht antworten.

Mit freundlichen Grüßen`,
        shortcut: 'close',
        category: 'Abschluss'
      },
      {
        title: 'Feedback-Bitte',
        content: `Guten Tag,

Ihr Anliegen wurde bearbeitet. Ich hoffe, ich konnte Ihnen weiterhelfen.

Falls Sie mit der Lösung zufrieden sind, würde ich mich über eine kurze Rückmeldung freuen.

Vielen Dank für Ihr Vertrauen!

Mit freundlichen Grüßen`,
        shortcut: 'feedback',
        category: 'Abschluss'
      },

      // Technisch
      {
        title: 'Remote-Zugang benötigt',
        content: `Guten Tag,

zur Analyse des Problems benötige ich einen Remote-Zugang zu Ihrem System.

Bitte teilen Sie mir mit, wann ich mich verbinden kann und senden Sie mir die Zugangsdaten über einen sicheren Kanal.

Mit freundlichen Grüßen`,
        shortcut: 'remote',
        category: 'Technisch'
      },
      {
        title: 'Neustart empfohlen',
        content: `Guten Tag,

bitte versuchen Sie folgende Schritte:

1. Speichern Sie alle offenen Arbeiten
2. Starten Sie das betroffene Programm/System neu
3. Testen Sie, ob das Problem weiterhin besteht

Falls das Problem nach dem Neustart weiterhin auftritt, melden Sie sich bitte erneut.

Mit freundlichen Grüßen`,
        shortcut: 'restart',
        category: 'Technisch'
      },
      {
        title: 'Log-Dateien anfordern',
        content: `Guten Tag,

für die Fehleranalyse benötige ich die Log-Dateien des Systems.

Bitte senden Sie mir folgende Dateien:
- [Log-Datei 1]
- [Log-Datei 2]

Alternativ können Sie die Dateien als Anhang zu diesem Ticket hochladen.

Mit freundlichen Grüßen`,
        shortcut: 'logs',
        category: 'Technisch'
      }
    ];

    // Insert all default responses
    for (const response of defaultResponses) {
      const id = crypto.randomUUID();
      await query(`
        INSERT INTO canned_responses (id, user_id, organization_id, title, content, shortcut, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, userId, organizationId, response.title, response.content, response.shortcut, response.category]);
    }

    res.json({ success: true, message: `${defaultResponses.length} Standard-Vorlagen erstellt`, seeded: true, count: defaultResponses.length });
  } catch (error) {
    logger.error('Error seeding canned responses:', error);
    res.status(500).json({ success: false, error: 'Failed to seed canned responses' });
  }
});

// ============================================================================
// TICKET TEMPLATES ROUTES
// ============================================================================

// Helper function to transform template row to API response
function transformTemplate(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    titleTemplate: row.title_template,
    descriptionTemplate: row.description_template,
    defaultPriority: row.default_priority,
    defaultCustomerId: row.default_customer_id,
    defaultProjectId: row.default_project_id,
    category: row.category,
    isActive: row.is_active,
    usageCount: row.usage_count,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

// GET /api/tickets/templates - Get all templates for organization
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

// GET /api/tickets/templates/:id - Get single template
router.get('/templates/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      `SELECT ${TICKET_TEMPLATE_COLUMNS} FROM ticket_templates WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error fetching ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket template' });
  }
});

// POST /api/tickets/templates - Create template
router.post('/templates', authenticateToken, attachOrganization, validate(ticketTemplateSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      name, titleTemplate, descriptionTemplate, defaultPriority,
      defaultCustomerId, defaultProjectId, category, isActive
    } = req.body;

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO ticket_templates (
        id, organization_id, name, title_template, description_template,
        default_priority, default_customer_id, default_project_id, category, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${TICKET_TEMPLATE_COLUMNS}
    `, [
      id, organizationId, name, titleTemplate || null, descriptionTemplate || null,
      defaultPriority || null, defaultCustomerId || null, defaultProjectId || null,
      category || null, isActive !== false
    ]);

    res.status(201).json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error creating ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to create ticket template' });
  }
});

// PUT /api/tickets/templates/:id - Update template
router.put('/templates/:id', authenticateToken, attachOrganization, validate(updateTicketTemplateSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const {
      name, titleTemplate, descriptionTemplate, defaultPriority,
      defaultCustomerId, defaultProjectId, category, isActive
    } = req.body;

    const result = await query(`
      UPDATE ticket_templates
      SET name = COALESCE($1, name),
          title_template = COALESCE($2, title_template),
          description_template = COALESCE($3, description_template),
          default_priority = COALESCE($4, default_priority),
          default_customer_id = $5,
          default_project_id = $6,
          category = $7,
          is_active = COALESCE($8, is_active),
          updated_at = NOW()
      WHERE id = $9 AND organization_id = $10
      RETURNING ${TICKET_TEMPLATE_COLUMNS}
    `, [
      name || null, titleTemplate, descriptionTemplate, defaultPriority,
      defaultCustomerId || null, defaultProjectId || null, category || null,
      isActive, id, organizationId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error updating ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to update ticket template' });
  }
});

// DELETE /api/tickets/templates/:id - Delete template
router.delete('/templates/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM ticket_templates WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    logger.error('Error deleting ticket template:', error);
    res.status(500).json({ success: false, error: 'Failed to delete ticket template' });
  }
});

// POST /api/tickets/templates/:id/use - Increment usage count
router.post('/templates/:id/use', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(`
      UPDATE ticket_templates
      SET usage_count = usage_count + 1
      WHERE id = $1 AND organization_id = $2
      RETURNING ${TICKET_TEMPLATE_COLUMNS}
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: transformTemplate(result.rows[0]) });
  } catch (error) {
    logger.error('Error updating template usage:', error);
    res.status(500).json({ success: false, error: 'Failed to update usage count' });
  }
});

// ============================================================================
// TICKET TAGS ROUTES
// ============================================================================

// GET /api/tickets/tags/list - Get all tags for organization
router.get('/tags/list', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await query(`
      SELECT t.*, COUNT(tta.ticket_id) as ticket_count
      FROM ticket_tags t
      LEFT JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE t.organization_id = $1
      GROUP BY t.id
      ORDER BY t.name ASC
    `, [organizationId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
});

// POST /api/tickets/tags - Create tag
router.post('/tags', authenticateToken, attachOrganization, validate(tagSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, color = '#6b7280' } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO ticket_tags (id, user_id, organization_id, name, color)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, userId, organizationId, name.trim(), color]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Tag with this name already exists' });
    }
    logger.error('Error creating tag:', error);
    res.status(500).json({ success: false, error: 'Failed to create tag' });
  }
});

// PUT /api/tickets/tags/:id - Update tag
router.put('/tags/:id', authenticateToken, attachOrganization, validate(tagSchema.partial()), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { name, color } = req.body;

    const result = await query(`
      UPDATE ticket_tags
      SET name = COALESCE($1, name),
          color = COALESCE($2, color)
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `, [name?.trim(), color, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Tag with this name already exists' });
    }
    logger.error('Error updating tag:', error);
    res.status(500).json({ success: false, error: 'Failed to update tag' });
  }
});

// DELETE /api/tickets/tags/:id - Delete tag
router.delete('/tags/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM ticket_tags WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    res.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    logger.error('Error deleting tag:', error);
    res.status(500).json({ success: false, error: 'Failed to delete tag' });
  }
});

// GET /api/tickets/:ticketId/tags - Get tags for a ticket
router.get('/:ticketId/tags', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const result = await query(`
      SELECT t.*
      FROM ticket_tags t
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE tta.ticket_id = $1
      ORDER BY t.name ASC
    `, [ticketId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching ticket tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket tags' });
  }
});

// POST /api/tickets/:ticketId/tags/:tagId - Add tag to ticket
router.post('/:ticketId/tags/:tagId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, tagId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Verify tag belongs to organization
    const tagCheck = await query(
      'SELECT id FROM ticket_tags WHERE id = $1 AND organization_id = $2',
      [tagId, organizationId]
    );

    if (tagCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    // Get tag name for activity log
    const tagNameResult = await query('SELECT name FROM ticket_tags WHERE id = $1', [tagId]);
    const tagName = tagNameResult.rows[0]?.name;

    await query(`
      INSERT INTO ticket_tag_assignments (ticket_id, tag_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [ticketId, tagId]);

    // Log activity
    if (tagName) {
      await logTicketActivity(ticketId, userId, null, 'tag_added', null, tagName, { tagId });

      // Audit log
      await auditLog.log({
        userId,
        action: 'ticket_tag.add',
        details: JSON.stringify({ ticketId, tagId, tagName }),
      });
    }

    // Return all tags for this ticket
    const result = await query(`
      SELECT t.*
      FROM ticket_tags t
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE tta.ticket_id = $1
      ORDER BY t.name ASC
    `, [ticketId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error adding tag to ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to add tag to ticket' });
  }
});

// DELETE /api/tickets/:ticketId/tags/:tagId - Remove tag from ticket
router.delete('/:ticketId/tags/:tagId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, tagId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get tag name before deleting for activity log
    const tagResult = await query('SELECT name FROM ticket_tags WHERE id = $1', [tagId]);
    const tagName = tagResult.rows[0]?.name;

    await query(
      'DELETE FROM ticket_tag_assignments WHERE ticket_id = $1 AND tag_id = $2',
      [ticketId, tagId]
    );

    // Log activity
    if (tagName) {
      await logTicketActivity(ticketId, userId, null, 'tag_removed', tagName, null, { tagId });

      // Audit log
      await auditLog.log({
        userId,
        action: 'ticket_tag.remove',
        details: JSON.stringify({ ticketId, tagId, tagName }),
      });
    }

    // Return remaining tags for this ticket
    const result = await query(`
      SELECT t.*
      FROM ticket_tags t
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE tta.ticket_id = $1
      ORDER BY t.name ASC
    `, [ticketId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error removing tag from ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to remove tag from ticket' });
  }
});

// ============================================================================
// TICKET ACTIVITIES ROUTES (Activity Timeline)
// ============================================================================

// Helper function to log ticket activities (exported for use in other modules)
export async function logTicketActivity(
  ticketId: string,
  userId: string | null,
  customerContactId: string | null,
  actionType: string,
  oldValue: string | null,
  newValue: string | null,
  metadata?: Record<string, any>
) {
  try {
    const id = crypto.randomUUID();
    await query(`
      INSERT INTO ticket_activities (id, ticket_id, user_id, customer_contact_id, action_type, old_value, new_value, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, ticketId, userId, customerContactId, actionType, oldValue, newValue, metadata ? JSON.stringify(metadata) : null]);
  } catch (error) {
    logger.error('Error logging ticket activity:', error);
    // Don't throw - activity logging should not break main operations
  }
}

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
    const activities = result.rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      customerContactId: row.customer_contact_id,
      actionType: row.action_type,
      oldValue: row.old_value,
      newValue: row.new_value,
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

// ============================================================================
// SLA POLICIES ROUTES
// ============================================================================

// Transform SLA policy row to camelCase
function transformSlaPolicy(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    priority: row.priority,
    firstResponseMinutes: row.first_response_minutes,
    resolutionMinutes: row.resolution_minutes,
    businessHoursOnly: row.business_hours_only,
    isActive: row.is_active,
    isDefault: row.is_default,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

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

// Helper function to calculate SLA deadlines
async function calculateSlaDeadlines(organizationId: string, priority: string, createdAt: Date = new Date()) {
  // Find applicable SLA policy
  const policyResult = await query(`
    SELECT ${SLA_POLICY_COLUMNS} FROM sla_policies
    WHERE organization_id = $1 AND is_active = TRUE
      AND (priority = $2 OR priority = 'all')
    ORDER BY
      CASE WHEN priority = $2 THEN 0 ELSE 1 END,
      is_default DESC
    LIMIT 1
  `, [organizationId, priority]);

  if (policyResult.rows.length === 0) {
    return null;
  }

  const policy = policyResult.rows[0];
  const firstResponseDue = new Date(createdAt.getTime() + policy.first_response_minutes * 60 * 1000);
  const resolutionDue = new Date(createdAt.getTime() + policy.resolution_minutes * 60 * 1000);

  return {
    policyId: policy.id,
    firstResponseDueAt: firstResponseDue,
    resolutionDueAt: resolutionDue
  };
}

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

// Export the calculateSlaDeadlines function for use in ticket creation
export { calculateSlaDeadlines };

// ============================================================================
// TICKET TASKS ROUTES
// ============================================================================

// Helper function to transform task
function transformTask(row: any): any {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    title: row.title,
    completed: row.completed,
    sortOrder: row.sort_order,
    visibleToCustomer: row.visible_to_customer,
    createdAt: row.created_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name || null,
    dueDate: row.due_date?.toISOString() || null,
    description: row.description || null,
  };
}

// GET /api/tickets/tasks/all - Get all tasks across all tickets (for task overview)
router.get('/tasks/all', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { status, customerId, dueDate } = req.query;

    let whereConditions = ['t.organization_id = $1'];
    const params: any[] = [organizationId];
    let paramIndex = 2;

    // Filter by completion status
    if (status === 'open') {
      whereConditions.push('tt.completed = false');
    } else if (status === 'completed') {
      whereConditions.push('tt.completed = true');
    }

    // Filter by customer
    if (customerId) {
      whereConditions.push(`t.customer_id = $${paramIndex}`);
      params.push(customerId);
      paramIndex++;
    }

    // Filter by ticket status (exclude archived by default)
    whereConditions.push("t.status != 'archived'");

    const result = await query(`
      SELECT
        tt.*,
        t.ticket_number,
        t.title as ticket_title,
        t.status as ticket_status,
        t.priority as ticket_priority,
        t.customer_id,
        c.name as customer_name
      FROM ticket_tasks tt
      JOIN tickets t ON tt.ticket_id = t.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY
        tt.completed ASC,
        t.priority = 'critical' DESC,
        t.priority = 'high' DESC,
        t.priority = 'normal' DESC,
        tt.sort_order ASC,
        tt.created_at ASC
    `, params);

    const tasks = result.rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      title: row.title,
      completed: row.completed,
      sortOrder: row.sort_order,
      visibleToCustomer: row.visible_to_customer,
      createdAt: row.created_at?.toISOString(),
      completedAt: row.completed_at?.toISOString(),
      // Ticket info
      ticketNumber: row.ticket_number,
      ticketTitle: row.ticket_title,
      ticketStatus: row.ticket_status,
      ticketPriority: row.ticket_priority,
      customerId: row.customer_id,
      customerName: row.customer_name,
    }));

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching all tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// GET /api/tickets/:id/tasks - Get all tasks for a ticket
router.get('/:id/tasks', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: ticketId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const result = await query(`
      SELECT tt.*, u.username as assigned_to_name
      FROM ticket_tasks tt
      LEFT JOIN users u ON tt.assigned_to = u.id
      WHERE tt.ticket_id = $1
      ORDER BY tt.sort_order ASC, tt.created_at ASC
    `, [ticketId]);

    const tasks = result.rows.map(row => {
      const task = transformTask(row);
      if (row.assigned_to_name) {
        task.assignedToName = row.assigned_to_name;
      }
      return task;
    });

    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('Error fetching ticket tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// POST /api/tickets/:id/tasks - Create a new task (requires member role)
router.post('/:id/tasks', authenticateToken, attachOrganization, requireOrgRole('member'), validate(ticketTaskSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: ticketId } = req.params;
    const { title, visibleToCustomer = false, assignedTo, dueDate, description } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get max sort_order
    const maxOrderResult = await query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM ticket_tasks WHERE ticket_id = $1',
      [ticketId]
    );
    const sortOrder = maxOrderResult.rows[0].next_order;

    const taskId = crypto.randomUUID();
    const result = await query(`
      INSERT INTO ticket_tasks (id, ticket_id, title, visible_to_customer, sort_order, assigned_to, due_date, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [taskId, ticketId, title.trim(), visibleToCustomer, sortOrder, assignedTo || null, dueDate || null, description || null]);

    // Update ticket's updated_at
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    // Log activity
    await logTicketActivity(ticketId, userId, null, 'task_added', null, title.trim(), { taskId, assignedTo });

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket_task.create',
      details: JSON.stringify({ ticketId, taskId, title: title.trim(), assignedTo }),
    });

    // Get assigned user name if assigned
    let taskData = transformTask(result.rows[0]);
    if (assignedTo) {
      const userResult = await query('SELECT username FROM users WHERE id = $1', [assignedTo]);
      if (userResult.rows.length > 0) {
        taskData.assignedToName = userResult.rows[0].username;
      }
    }

    res.status(201).json({ success: true, data: taskData });
  } catch (error) {
    logger.error('Error creating ticket task:', error);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

// PUT /api/tickets/:ticketId/tasks/:taskId - Update a task (requires member role)
router.put('/:ticketId/tasks/:taskId', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateTicketTaskSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, taskId } = req.params;
    const { title, completed, visibleToCustomer, assignedTo, dueDate, description } = req.body;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get current task state
    const currentTask = await query(
      `SELECT ${TICKET_TASK_COLUMNS} FROM ticket_tasks WHERE id = $1 AND ticket_id = $2`,
      [taskId, ticketId]
    );

    if (currentTask.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const oldTask = currentTask.rows[0];

    // Build update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(title.trim());
      paramIndex++;
    }
    if (completed !== undefined) {
      updates.push(`completed = $${paramIndex}`);
      params.push(completed);
      paramIndex++;

      // Set completed_at timestamp
      if (completed && !oldTask.completed) {
        updates.push('completed_at = NOW()');
      } else if (!completed && oldTask.completed) {
        updates.push('completed_at = NULL');
      }
    }
    if (visibleToCustomer !== undefined) {
      updates.push(`visible_to_customer = $${paramIndex}`);
      params.push(visibleToCustomer);
      paramIndex++;
    }
    if (assignedTo !== undefined) {
      updates.push(`assigned_to = $${paramIndex}`);
      params.push(assignedTo || null);
      paramIndex++;
    }
    if (dueDate !== undefined) {
      updates.push(`due_date = $${paramIndex}`);
      params.push(dueDate || null);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description || null);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    params.push(taskId, ticketId);

    const result = await query(`
      UPDATE ticket_tasks SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND ticket_id = $${paramIndex + 1}
      RETURNING *
    `, params);

    // Update ticket's updated_at
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    // Log activity for completion changes
    if (completed !== undefined && completed !== oldTask.completed) {
      await logTicketActivity(
        ticketId,
        userId,
        null,
        completed ? 'task_completed' : 'task_uncompleted',
        null,
        oldTask.title,
        { taskId }
      );

      // Audit log for task completion
      await auditLog.log({
        userId,
        action: completed ? 'ticket_task.complete' : 'ticket_task.update',
        details: JSON.stringify({ ticketId, taskId, taskTitle: oldTask.title, completed }),
      });
    } else if (assignedTo !== undefined && assignedTo !== oldTask.assigned_to) {
      // Log assignment change
      await logTicketActivity(
        ticketId,
        userId,
        null,
        'task_assigned',
        null,
        oldTask.title,
        { taskId, assignedTo }
      );

      await auditLog.log({
        userId,
        action: 'ticket_task.assign',
        details: JSON.stringify({ ticketId, taskId, assignedTo }),
      });
    } else if (title !== undefined) {
      // Audit log for other updates
      await auditLog.log({
        userId,
        action: 'ticket_task.update',
        details: JSON.stringify({ ticketId, taskId, oldTitle: oldTask.title, newTitle: title }),
      });
    }

    // Get assigned user name if assigned
    let taskData = transformTask(result.rows[0]);
    if (result.rows[0].assigned_to) {
      const userResult = await query('SELECT username FROM users WHERE id = $1', [result.rows[0].assigned_to]);
      if (userResult.rows.length > 0) {
        taskData.assignedToName = userResult.rows[0].username;
      }
    }

    res.json({ success: true, data: taskData });
  } catch (error) {
    logger.error('Error updating ticket task:', error);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

// PUT /api/tickets/:ticketId/tasks/reorder - Reorder tasks (requires member role)
router.put('/:ticketId/tasks/reorder', authenticateToken, attachOrganization, requireOrgRole('member'), validate(reorderTasksSchema), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;
    const { taskIds } = req.body; // Array of task IDs in new order

    if (!Array.isArray(taskIds)) {
      return res.status(400).json({ success: false, error: 'taskIds array is required' });
    }

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Update sort_order for each task
    for (let i = 0; i < taskIds.length; i++) {
      await query(
        'UPDATE ticket_tasks SET sort_order = $1 WHERE id = $2 AND ticket_id = $3',
        [i, taskIds[i], ticketId]
      );
    }

    // Get updated tasks
    const result = await query(
      `SELECT ${TICKET_TASK_COLUMNS} FROM ticket_tasks WHERE ticket_id = $1 ORDER BY sort_order ASC`,
      [ticketId]
    );

    res.json({ success: true, data: result.rows.map(transformTask) });
  } catch (error) {
    logger.error('Error reordering ticket tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder tasks' });
  }
});

// DELETE /api/tickets/:ticketId/tasks/:taskId - Delete a task (requires member role)
router.delete('/:ticketId/tasks/:taskId', authenticateToken, attachOrganization, requireOrgRole('member'), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, taskId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get task info for logging
    const taskInfo = await query(
      'SELECT title FROM ticket_tasks WHERE id = $1 AND ticket_id = $2',
      [taskId, ticketId]
    );

    if (taskInfo.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    await query('DELETE FROM ticket_tasks WHERE id = $1 AND ticket_id = $2', [taskId, ticketId]);

    // Update ticket's updated_at
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    // Log activity
    await logTicketActivity(ticketId, userId, null, 'task_deleted', null, taskInfo.rows[0].title, { taskId });

    // Audit log
    await auditLog.log({
      userId,
      action: 'ticket_task.delete',
      details: JSON.stringify({ ticketId, taskId, taskTitle: taskInfo.rows[0].title }),
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting ticket task:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

export default router;
