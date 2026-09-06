/**
 * Gemeinsame Zod-Schemas, Spaltenlisten, Transformer und Helfer der
 * Ticket-Routen. Mechanisch aus routes/tickets.ts extrahiert
 * (Schichtenarchitektur-Pilot, 6.9.2026) — Logik unveraendert.
 */
import crypto from 'crypto';
import { z } from 'zod';
import { query, getClient } from '../../config/database';
import { emailService } from '../../services/emailService';
import { sendTicketNotification } from '../../services/pushNotifications';
import { logger } from '../../utils/logger';

// ============================================================================
// Zod validation schemas
// ============================================================================

export const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export const ticketStatusSchema = z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed', 'archived']);

export const createTicketSchema = z.object({
  // optional: interne Tickets (IT-intern, Infrastruktur, ...) haben keinen Kunden
  customerId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional(),
  priority: ticketPrioritySchema.optional(),
  // users.id ist TEXT (nicht zwingend UUID) — kein .uuid() erzwingen
  assignedToUserId: z.string().min(1).max(100).optional().nullable(),
  // Bereich/Queue (frei definierbar, nutzt tickets.category)
  category: z.string().trim().max(100).optional().nullable(),
});

export const updateTicketSchema = z.object({
  customerId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(50_000).optional().nullable(),
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  // users.id ist TEXT (nicht zwingend UUID) — kein .uuid() erzwingen
  assignedToUserId: z.string().min(1).max(100).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  solution: z.string().max(50_000).optional().nullable(),
  resolutionType: z.string().max(100).optional().nullable(),
  deviceId: z.string().max(200).optional().nullable(),
});

export const mergeTicketsSchema = z.object({
  sourceTicketIds: z.array(z.string().uuid()).min(1).max(50),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(50_000),
  isInternal: z.boolean().optional(),
  notifyCustomer: z.boolean().optional(),
  replyViaEmail: z.boolean().optional(),
});

export const createContactSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  canCreateTickets: z.boolean().optional(),
  canViewAllTickets: z.boolean().optional(),
  notifyTicketCreated: z.boolean().optional(),
  notifyTicketStatusChanged: z.boolean().optional(),
  notifyTicketReply: z.boolean().optional(),
});

export const updateContactSchema = createContactSchema.partial();

export const cannedResponseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(50_000),
  shortcut: z.string().trim().max(50).optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
});

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #RRGGBB color').optional(),
});

export const slaPolicySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).optional().nullable(),
  // 'all' = Policy gilt für alle Prioritäten (Default im TicketSettings-Formular)
  priority: z.enum(['all', 'low', 'normal', 'high', 'critical']),
  firstResponseMinutes: z.number().int().positive().max(525_600), // ≤ 1 year
  resolutionMinutes: z.number().int().positive().max(525_600),
  businessHoursOnly: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const updateSlaPolicySchema = slaPolicySchema.partial();

export const ticketTaskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional().nullable(),
  visibleToCustomer: z.boolean().optional(),
  // users.id ist TEXT (nicht zwingend UUID-Format) — kein .uuid() erzwingen
  assignedTo: z.string().min(1).max(100).optional().nullable(),
  // Das Formular nutzt <input type="date"> → "YYYY-MM-DD"; volles ISO-Datetime
  // bleibt erlaubt. z.string().datetime() allein lehnte jedes Fälligkeitsdatum ab.
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/).optional().nullable(),
});

export const updateTicketTaskSchema = ticketTaskSchema.extend({
  completed: z.boolean().optional(),
}).partial();

export const reorderTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(500),
});

// Bulk action schemas
export const bulkStatusSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  status: ticketStatusSchema,
});

export const bulkPrioritySchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  priority: ticketPrioritySchema,
});

export const bulkAssignSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
  // users.id ist TEXT (nicht zwingend UUID)
  assignedToUserId: z.string().min(1).max(100).nullable(),
});

export const bulkArchiveSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
});

export const bulkDeleteSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(100),
});

// Ticket Template schemas
export const ticketTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  titleTemplate: z.string().max(500).optional().nullable(),
  descriptionTemplate: z.string().max(50_000).optional().nullable(),
  defaultPriority: ticketPrioritySchema.optional().nullable(),
  defaultCustomerId: z.string().uuid().optional().nullable(),
  defaultProjectId: z.string().uuid().optional().nullable(),
  category: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateTicketTemplateSchema = ticketTemplateSchema.partial();

// ============================================================================
// Explicit column lists (no SELECT *)
// ============================================================================

export const NOTIFICATION_PREFS_COLUMNS = `
  id, user_id, organization_id,
  push_enabled, push_on_new_ticket, push_on_ticket_assigned, push_on_ticket_comment,
  push_on_status_change, push_on_sla_warning, push_on_mention,
  email_enabled, email_on_new_ticket, email_on_ticket_assigned, email_on_ticket_comment,
  email_on_status_change, email_on_sla_warning, email_on_mention, email_daily_digest
`;

export const TICKET_ATTACHMENT_COLUMNS = `
  id, ticket_id, filename, file_url, file_size, mime_type, uploaded_by_user_id, created_at
`;

export const CANNED_RESPONSE_COLUMNS = `
  id, user_id, organization_id, title, content, shortcut, category, usage_count, created_at, updated_at
`;

export const TICKET_TEMPLATE_COLUMNS = `
  id, organization_id, name, title_template, description_template, default_priority,
  default_customer_id, default_project_id, category, is_active, usage_count, created_at, updated_at
`;

export const SLA_POLICY_COLUMNS = `
  id, organization_id, user_id, name, description, priority,
  first_response_minutes, resolution_minutes, business_hours_only,
  is_active, is_default, created_at, updated_at
`;

export const TICKET_TASK_COLUMNS = `
  id, ticket_id, title, description, completed, sort_order, visible_to_customer,
  assigned_to, due_date, created_at, completed_at
`;

export const TICKET_BASIC_COLUMNS = `id, priority, created_at`;

// Portal URL for email links
export const PORTAL_URL = process.env.FRONTEND_URL || 'https://app.ramboeck.it';

// Benachrichtigt den neu zugewiesenen Bearbeiter (Push + E-Mail, gemaess
// notification_preferences). Von Einzel-Update, Bulk-Zuweisung und
// Ticket-Erstellung genutzt — vorher benachrichtigte nur der (im UI
// unerreichbare) Einzel-Pfad. Fire-and-forget beim Aufrufer.
export async function sendAssignedNotifications(
  ticketId: string,
  assignedToUserId: string,
  assignerUserId: string,
  options: { bulkCount?: number } = {}
): Promise<void> {
  try {
    const assigneeResult = await query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [assignedToUserId]
    );
    if (assigneeResult.rows.length === 0) return;
    const assignee = assigneeResult.rows[0];

    const assignerResult = await query(
      'SELECT COALESCE(display_name, username) as name FROM users WHERE id = $1',
      [assignerUserId]
    );
    const assignerName = assignerResult.rows[0]?.name || 'Ein Teammitglied';

    const ticketDetails = await query(`
      SELECT t.ticket_number, t.title, t.description, t.priority, c.name as customer_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.id = $1
    `, [ticketId]);
    if (ticketDetails.rows.length === 0) return;
    const ticket = ticketDetails.rows[0];

    const prefsResult = await query(
      `SELECT ${NOTIFICATION_PREFS_COLUMNS} FROM notification_preferences WHERE user_id = $1`,
      [assignedToUserId]
    );
    const prefs = prefsResult.rows[0] || {
      push_enabled: true,
      push_on_ticket_assigned: true,
      email_enabled: true,
      email_on_ticket_assigned: true
    };

    const bulkSuffix = options.bulkCount && options.bulkCount > 1
      ? ` (+${options.bulkCount - 1} weitere)`
      : '';

    if (prefs.push_enabled !== false && prefs.push_on_ticket_assigned !== false) {
      sendTicketNotification(
        assignedToUserId,
        { id: ticketId, ticketNumber: ticket.ticket_number, title: ticket.title },
        'push_on_ticket_assigned',
        `${assignerName} hat dir Ticket #${ticket.ticket_number} zugewiesen${bulkSuffix}`
      ).catch(err => logger.error('Push notification error (assigned):', err));
    }

    if (prefs.email_enabled !== false && prefs.email_on_ticket_assigned !== false && assignee.email) {
      const ticketUrl = `${PORTAL_URL}/?ticket=${ticketId}`;
      emailService.sendTicketAssignedNotification({
        to: assignee.email,
        assigneeName: assignee.username,
        assignedByName: assignerName,
        ticketNumber: ticket.ticket_number,
        ticketTitle: ticket.title + bulkSuffix,
        ticketDescription: ticket.description || '',
        customerName: ticket.customer_name || 'Unbekannt',
        priority: ticket.priority,
        ticketUrl
      }).catch(err => logger.error('Email notification error (assigned):', err));
    }
  } catch (err) {
    logger.error('Error sending assignment notifications:', err);
  }
}

// Prueft, ob ein User Mitglied der Organisation ist (Zuweisungs-Validierung)
export async function isOrgMember(organizationId: string, targetUserId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [organizationId, targetUserId]
  );
  return result.rows.length > 0;
}

// Helper function to generate ticket number (zentrale Sequenz; auch von
// microsoft365.ts fuer Mail-Tickets genutzt — frueher zwei Generatoren mit
// Kollisionsrisiko)
export async function generateTicketNumber(organizationId: string): Promise<string> {
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
export function transformTicket(row: any) {
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
    category: row.category ?? null,
    assignedToUserId: row.assigned_to,
    dueDate: row.due_date?.toISOString() || null,
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
    // NinjaRMM fields
    deviceId: row.device_id,
    ninjaAlertId: row.ninja_alert_id,
    // Include related data if joined
    customerName: row.customer_name,
    projectName: row.project_name,
    creatorName: row.creator_name,
    assigneeName: row.assignee_name,
    deviceName: row.device_name,
  };
}

export function transformComment(row: any) {
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

// Helper function to verify tickets belong to organization
export async function verifyTicketsInOrganization(ticketIds: string[], organizationId: string): Promise<{ valid: boolean; foundIds: string[]; notFoundIds: string[] }> {
  const result = await query(
    'SELECT id FROM tickets WHERE id = ANY($1) AND organization_id = $2',
    [ticketIds, organizationId]
  );
  const foundIds = result.rows.map(r => r.id);
  const notFoundIds = ticketIds.filter(id => !foundIds.includes(id));
  return { valid: notFoundIds.length === 0, foundIds, notFoundIds };
}

// Helper function to transform template row to API response
export function transformTemplate(row: any) {
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

// Transform SLA policy row to camelCase
export function transformSlaPolicy(row: any) {
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

// Helper function to calculate SLA deadlines
export async function calculateSlaDeadlines(organizationId: string, priority: string, createdAt: Date = new Date()) {
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

// Helper function to transform task
export function transformTask(row: any): any {
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
