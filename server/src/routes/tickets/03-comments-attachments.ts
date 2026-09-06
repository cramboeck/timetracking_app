/**
 * Kommentare (inkl. E-Mail-Reply), Attachments (Upload/Delete), Debug-Check, Kontakte
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import crypto from 'crypto';
import { MulterError } from 'multer';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../../middleware/organization';
import { upload, getFileUrl, deleteFile } from '../../middleware/upload';
import { emailService } from '../../services/emailService';
import { sendTicketNotification, sendPortalTicketNotification } from '../../services/pushNotifications';
import { auditLog } from '../../services/auditLog';
import { logger } from '../../utils/logger';
import {
  createCommentSchema,
  createContactSchema,
  updateContactSchema,
  NOTIFICATION_PREFS_COLUMNS,
  TICKET_ATTACHMENT_COLUMNS,
  PORTAL_URL,
  transformComment,
  logTicketActivity,
} from './shared';

const router = express.Router();

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
    // undefined = kein Mail-Versand angefordert; true/false = Graph-Reply-Ergebnis
    let emailReplySent: boolean | undefined;

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
            SELECT t.title, t.ticket_number, t.created_by_contact_id as contact_id, t.customer_id, t.email_conversation_id, t.email_from, t.source,
                   COALESCE(creator.email, primary_contact.email) as contact_email,
                   COALESCE(creator.first_name || ' ' || creator.last_name, creator.last_name, primary_contact.first_name || ' ' || primary_contact.last_name, primary_contact.last_name) as contact_name,
                   COALESCE(creator.notify_ticket_reply, primary_contact.notify_ticket_reply, true) as notify_ticket_reply,
                   COALESCE(creator.id, primary_contact.id) as resolved_contact_id,
                   COALESCE(u.display_name, u.username) as replier_name
            FROM tickets t
            LEFT JOIN customer_contacts creator ON (creator.id = t.created_by_contact_id OR creator.portal_user_id = t.created_by_contact_id)
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
                // Reply via email thread (Graph API). Ergebnis abwarten, damit
                // ein Fehlschlag im UI sichtbar wird (vorher fire-and-forget:
                // Kommentar gespeichert, Mail ging still nie raus).
                const { mailboxMonitorService } = await import('../../services/mailboxMonitorService');
                try {
                  emailReplySent = await mailboxMonitorService.replyToTicketEmail(organizationId, ticketId, content, ticket.replier_name || 'Support');
                } catch (err) {
                  logger.error('Failed to send email reply via Graph API:', err);
                  emailReplySent = false;
                }
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

    res.status(201).json({ success: true, data: transformComment(result.rows[0]), emailReplySent });
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
      source: 'upload' as const,
      createdAt: a.created_at?.toISOString(),
    }));

    // Locally stored attachments from inbound emails belong to the ticket
    // too — surface them alongside the uploads (read-only, no delete route).
    const emailAttachmentsResult = await query(`
      SELECT
        tea.id,
        tea.name,
        tea.local_path,
        tea.size,
        tea.content_type,
        tea.created_at,
        COALESCE(te.from_name, te.from_email) AS sender_name
      FROM ticket_email_attachments tea
      JOIN ticket_emails te ON te.id = tea.ticket_email_id
      WHERE te.ticket_id = $1 AND te.organization_id = $2
        AND tea.stored_locally = true AND tea.local_path IS NOT NULL
      ORDER BY tea.created_at ASC
    `, [ticketId, organizationId]);

    const emailAttachments = emailAttachmentsResult.rows.map(a => ({
      id: a.id,
      filename: a.name,
      fileUrl: a.local_path,
      fileSize: a.size,
      mimeType: a.content_type,
      uploadedByName: a.sender_name || 'E-Mail',
      uploadedByType: 'customer' as const,
      source: 'email' as const,
      createdAt: a.created_at?.toISOString(),
    }));

    const combined = [...attachments, ...emailAttachments].sort(
      (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')
    );

    res.json({ success: true, data: combined });
  } catch (error) {
    logger.error('Get attachments error:', error);
    res.status(500).json({ success: false, error: 'Failed to get attachments' });
  }
});

// Multer wrapper that turns upload rejections (file too large, too many
// files, disallowed MIME type) into a 400 with a readable German message —
// previously these bubbled to a generic 500 "Failed to upload attachments".
const uploadTicketFiles = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  upload.array('files', 10)(req, res, (err: any) => {
    if (!err) return next();

    let message = 'Upload fehlgeschlagen';
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') message = 'Datei zu groß — maximal 10 MB pro Datei';
      else if (err.code === 'LIMIT_FILE_COUNT') message = 'Zu viele Dateien — maximal 10 pro Upload';
      else message = `Upload fehlgeschlagen (${err.code})`;
    } else if (err?.message) {
      // fileFilter rejection ("Dateityp ... ist nicht erlaubt")
      message = err.message;
    }

    logger.warn(`Attachment upload rejected: ${message}`);
    return res.status(400).json({ success: false, error: message });
  });
};

// POST /api/tickets/:ticketId/attachments - Upload attachments (requires member role)
router.post('/:ticketId/attachments', authenticateToken, attachOrganization, requireOrgRole('member'), uploadTicketFiles, async (req, res) => {
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

export default router;
