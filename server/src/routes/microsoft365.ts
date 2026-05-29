import { Router, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { attachOrganization, requireOrgRole } from '../middleware/organization';
import * as microsoft365Service from '../services/microsoft365ConfigService';
import { mailboxMonitorService } from '../services/mailboxMonitorService';
import { invoiceProcessorService } from '../services/invoiceProcessorService';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import multer from 'multer';

// In-memory multer fuer Manual-Receipt-Upload. Wir schreiben die Datei
// selbst in den org-spezifischen Storage (analog zum Email-Pfad), deshalb
// kein diskStorage. 15 MB Limit weil Scans groesser sein koennen als die
// 10 MB der Tickets-Anhaenge.
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Dateityp ${file.mimetype} ist fuer Belege nicht erlaubt (nur PDF/JPG/PNG/WebP)`));
  },
});

interface OrganizationRequest extends AuthRequest {
  organization: {
    id: string;
    name: string;
    role: string;
  };
}

const router = Router();

// Apply auth and organization middleware to all routes
router.use(authenticateToken);
router.use(attachOrganization);

// GET /api/microsoft365/config - Get Microsoft 365 config
router.get('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const config = await microsoft365Service.getConfig(organizationId);

    if (!config) {
      return res.json({
        success: true,
        data: {
          configured: false,
          tenantId: '',
          clientId: '',
          hasClientSecret: false,
          mailFrom: '',
          supportMailbox: '',
          featuresEnabled: { email: false, inboxMonitoring: false, calendar: false },
        },
      });
    }

    // Don't return the actual client secret
    res.json({
      success: true,
      data: {
        configured: config.isConfigured,
        tenantId: config.tenantId || '',
        clientId: config.clientId || '',
        hasClientSecret: !!config.clientSecret,
        mailFrom: config.mailFrom || '',
        supportMailbox: config.supportMailbox || '',
        invoiceMailbox: config.invoiceMailbox || '',
        featuresEnabled: config.featuresEnabled,
        lastConnectionTest: config.lastConnectionTest,
        lastConnectionStatus: config.lastConnectionStatus,
      },
    });
  } catch (error) {
    logger.error('Get Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// POST /api/microsoft365/config - Save Microsoft 365 config
router.post('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { tenantId, clientId, clientSecret, mailFrom, supportMailbox, invoiceMailbox, featuresEnabled } = req.body;

    const config = await microsoft365Service.saveConfig(organizationId, {
      tenantId,
      clientId,
      clientSecret,
      mailFrom,
      supportMailbox,
      invoiceMailbox,
      featuresEnabled,
    });

    res.json({
      success: true,
      data: {
        configured: config.isConfigured,
        tenantId: config.tenantId || '',
        clientId: config.clientId || '',
        hasClientSecret: !!config.clientSecret,
        mailFrom: config.mailFrom || '',
        supportMailbox: config.supportMailbox || '',
        invoiceMailbox: config.invoiceMailbox || '',
        featuresEnabled: config.featuresEnabled,
      },
    });
  } catch (error) {
    logger.error('Save Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /api/microsoft365/test - Test Microsoft 365 connection
router.post('/test', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    let { tenantId, clientId, clientSecret, mailFrom } = req.body;

    // If clientSecret is placeholder, get it from database
    if (clientSecret === '__USE_STORED__') {
      const storedConfig = await microsoft365Service.getConfig(organizationId);
      if (storedConfig?.clientSecret) {
        clientSecret = storedConfig.clientSecret;
        logger.info('Using stored client secret from database');
      } else {
        return res.status(400).json({
          success: false,
          error: 'Kein Client Secret gespeichert. Bitte geben Sie ein neues Secret ein.',
        });
      }
    }

    // Debug logging
    logger.info('=== Microsoft 365 Test Debug ===');
    logger.info('Tenant ID:', tenantId);
    logger.info('Client ID:', clientId);
    logger.info('Client Secret Length:', clientSecret?.length);
    logger.info('Client Secret First 4:', clientSecret?.substring(0, 4));
    logger.info('Client Secret Last 4:', clientSecret?.substring(clientSecret.length - 4));
    logger.info('================================');

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID, Client ID und Client Secret sind erforderlich',
      });
    }

    const result = await microsoft365Service.testConnection(
      tenantId,
      clientId,
      clientSecret,
      mailFrom
    );

    // Update test result in database
    await microsoft365Service.updateConnectionTestResult(
      organizationId,
      result.success,
      result.error
    );

    if (result.success) {
      res.json({
        success: true,
        data: result.userInfo,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error('Microsoft 365 connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

// DELETE /api/microsoft365/config - Remove Microsoft 365 config
router.delete('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    await microsoft365Service.deleteConfig(organizationId);

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

// ========================================
// Mailbox Monitoring Endpoints
// ========================================

// POST /api/microsoft365/mailbox/test - Test mailbox access
router.post('/mailbox/test', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { mailbox, mailboxType } = req.body;

    const result = await mailboxMonitorService.testMailboxAccess(organizationId, mailbox, mailboxType || 'support');

    if (result.success) {
      res.json({
        success: true,
        data: result.mailboxInfo,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error('Mailbox test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Mailbox test failed',
    });
  }
});

// GET /api/microsoft365/mailbox/emails - Get unread emails
router.get('/mailbox/emails', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const maxResults = parseInt(req.query.maxResults as string) || 50;
    const mailboxType = (req.query.mailboxType as string) || 'support';

    const result = await mailboxMonitorService.getUnreadEmails(organizationId, {
      maxResults,
      mailboxType: mailboxType as 'support' | 'invoice',
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.emails,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error('Get emails error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get emails',
    });
  }
});

// GET /api/microsoft365/mailbox/emails/:id - Get specific email
router.get('/mailbox/emails/:id', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const mailboxType = (req.query.mailboxType as string) || 'support';

    const email = await mailboxMonitorService.getEmail(organizationId, messageId, mailboxType as 'support' | 'invoice');

    if (email) {
      res.json({
        success: true,
        data: email,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }
  } catch (error: any) {
    logger.error('Get email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get email',
    });
  }
});

// GET /api/microsoft365/mailbox/emails/:id/attachments - Get email attachments
router.get('/mailbox/emails/:id/attachments', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const mailboxType = (req.query.mailboxType as string) || 'support';

    const attachments = await mailboxMonitorService.getAttachments(organizationId, messageId, mailboxType as 'support' | 'invoice');

    res.json({
      success: true,
      data: attachments,
    });
  } catch (error: any) {
    logger.error('Get attachments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get attachments',
    });
  }
});

// POST /api/microsoft365/mailbox/emails/:id/read - Mark email as read
router.post('/mailbox/emails/:id/read', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const { mailboxType } = req.body;

    const success = await mailboxMonitorService.markAsRead(organizationId, messageId, mailboxType || 'support');

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte E-Mail nicht als gelesen markieren',
      });
    }
  } catch (error: any) {
    logger.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark email as read',
    });
  }
});

// POST /api/microsoft365/mailbox/emails/:id/reply - Reply to email
router.post('/mailbox/emails/:id/reply', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const { content, replyAll, mailboxType } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Antwort-Inhalt erforderlich',
      });
    }

    const success = await mailboxMonitorService.replyToEmail(
      organizationId,
      messageId,
      content,
      replyAll || false,
      mailboxType || 'support'
    );

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte Antwort nicht senden',
      });
    }
  } catch (error: any) {
    logger.error('Reply to email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send reply',
    });
  }
});

// ========================================
// Support Email to Ticket Endpoints
// ========================================

// Helper function to generate ticket number
async function generateTicketNumber(organizationId: string): Promise<string> {
  const result = await query(`
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5) AS INTEGER)), 0) + 1 as next_number
    FROM tickets WHERE organization_id = $1
  `, [organizationId]);
  const nextNumber = result.rows[0]?.next_number || 1;
  return `TKT-${String(nextNumber).padStart(6, '0')}`;
}

// Helper function to extract domain from email address
function extractDomainFromEmail(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  return match ? match[1].toLowerCase() : null;
}

// Helper function to find customer by email
async function findCustomerByEmail(organizationId: string, email: string): Promise<{ id: string; name: string; matchType: string } | null> {
  // 1. First check customer contacts (exact email match)
  const contactResult = await query(`
    SELECT c.id, c.name FROM customers c
    JOIN customer_contacts cc ON c.id = cc.customer_id
    WHERE c.organization_id = $1 AND LOWER(cc.email) = LOWER($2)
    LIMIT 1
  `, [organizationId, email]);

  if (contactResult.rows.length > 0) {
    return { ...contactResult.rows[0], matchType: 'contact_email' };
  }

  // 2. Then check customer email field (exact email match)
  const customerResult = await query(`
    SELECT id, name FROM customers
    WHERE organization_id = $1 AND LOWER(email) = LOWER($2)
    LIMIT 1
  `, [organizationId, email]);

  if (customerResult.rows.length > 0) {
    return { ...customerResult.rows[0], matchType: 'customer_email' };
  }

  // 3. Extract domain and check customer_email_domains table
  const domain = extractDomainFromEmail(email);
  if (domain) {
    const domainResult = await query(`
      SELECT c.id, c.name, ced.domain FROM customers c
      JOIN customer_email_domains ced ON c.id = ced.customer_id
      WHERE ced.organization_id = $1 AND LOWER(ced.domain) = $2
      LIMIT 1
    `, [organizationId, domain]);

    if (domainResult.rows.length > 0) {
      return { ...domainResult.rows[0], matchType: 'domain_mapping' };
    }

    // 4. Finally check vendor_domain field (legacy support)
    const vendorResult = await query(`
      SELECT id, name FROM customers
      WHERE organization_id = $1 AND LOWER(vendor_domain) = $2
      LIMIT 1
    `, [organizationId, domain]);

    if (vendorResult.rows.length > 0) {
      return { ...vendorResult.rows[0], matchType: 'vendor_domain' };
    }
  }

  return null;
}

// Helper to save email to ticket_emails table
async function saveEmailToTicket(
  organizationId: string,
  ticketId: string,
  email: any,
  messageId: string,
  direction: 'inbound' | 'outbound'
): Promise<string> {
  const emailRecordId = crypto.randomUUID();

  // Extract plain text from HTML if needed
  let bodyText = email.body.content;
  if (email.body.contentType === 'html') {
    bodyText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  await query(`
    INSERT INTO ticket_emails (
      id, ticket_id, organization_id, message_id, conversation_id,
      direction, subject, body_preview, body_html, body_text,
      from_name, from_email, to_recipients, cc_recipients,
      is_read, importance, has_attachments, received_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    ON CONFLICT (organization_id, message_id) DO NOTHING
  `, [
    emailRecordId,
    ticketId,
    organizationId,
    messageId,
    email.conversationId,
    direction,
    email.subject || '(Kein Betreff)',
    email.bodyPreview || '',
    email.body.contentType === 'html' ? email.body.content : null,
    bodyText,
    email.from.name,
    email.from.email,
    JSON.stringify(email.toRecipients || []),
    JSON.stringify(email.ccRecipients || []),
    email.isRead,
    email.importance,
    email.hasAttachments,
    email.receivedDateTime
  ]);

  return emailRecordId;
}

// Helper to find ticket by conversation ID
async function findTicketByConversationId(
  organizationId: string,
  conversationId: string
): Promise<{ id: string; ticketNumber: string } | null> {
  const result = await query(`
    SELECT id, ticket_number
    FROM tickets
    WHERE organization_id = $1 AND email_conversation_id = $2
    LIMIT 1
  `, [organizationId, conversationId]);

  if (result.rows.length > 0) {
    return {
      id: result.rows[0].id,
      ticketNumber: result.rows[0].ticket_number
    };
  }
  return null;
}

// GET /api/microsoft365/support/emails/:id/customer-lookup - Check if customer exists for email
router.get('/support/emails/:id/customer-lookup', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;

    // Get the email
    const emailResult = await mailboxMonitorService.getEmailById(organizationId, messageId, 'support');

    if (!emailResult.success || !emailResult.email) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }

    const email = emailResult.email;
    const senderEmail = email.from.email;

    // Extract domain from email
    const domainMatch = senderEmail.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : null;

    // Try to find customer by email
    const customer = await findCustomerByEmail(organizationId, senderEmail);

    if (customer) {
      return res.json({
        success: true,
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          matchType: customer.matchType,
        },
        sender: {
          email: senderEmail,
          name: email.from.name,
          domain: senderDomain,
        },
      });
    }

    // No customer found - return info for dialog
    return res.json({
      success: true,
      found: false,
      customer: null,
      sender: {
        email: senderEmail,
        name: email.from.name,
        domain: senderDomain,
      },
    });
  } catch (error) {
    logger.error('Customer lookup error:', error);
    res.status(500).json({
      success: false,
      error: 'Interner Serverfehler',
    });
  }
});

// POST /api/microsoft365/support/emails/:id/create-ticket - Create ticket from email
router.post('/support/emails/:id/create-ticket', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const messageId = req.params.id;
    const { priority = 'normal', customerId: providedCustomerId } = req.body;

    // Get the email
    const emailResult = await mailboxMonitorService.getEmailById(organizationId, messageId, 'support');

    if (!emailResult.success || !emailResult.email) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }

    const email = emailResult.email;

    // Check if ticket already exists for this conversation
    if (email.conversationId) {
      const existingTicket = await findTicketByConversationId(organizationId, email.conversationId);
      if (existingTicket) {
        // Link email to existing ticket instead
        await saveEmailToTicket(organizationId, existingTicket.id, email, messageId, 'inbound');
        await mailboxMonitorService.markAsRead(organizationId, messageId, 'support');

        return res.json({
          success: true,
          data: {
            ticketId: existingTicket.id,
            ticketNumber: existingTicket.ticketNumber,
            title: email.subject,
            linkedToExisting: true,
          },
        });
      }
    }

    // Find or use provided customer
    let customerId = providedCustomerId;
    let customerName = null;

    if (!customerId && email.from.email) {
      const customer = await findCustomerByEmail(organizationId, email.from.email);
      if (customer) {
        customerId = customer.id;
        customerName = customer.name;
      }
    }

    // Generate ticket number
    const ticketNumber = await generateTicketNumber(organizationId);
    const ticketId = crypto.randomUUID();

    // Create description from email body
    let description = email.body.content;
    if (email.body.contentType === 'html') {
      // Strip HTML tags for plain text description
      description = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Create ticket with email tracking fields
    await query(`
      INSERT INTO tickets (
        id, ticket_number, user_id, organization_id, customer_id,
        title, description, priority, status, source,
        email_conversation_id, email_from, email_subject, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', 'email', $9, $10, $11, NOW())
      RETURNING *
    `, [
      ticketId,
      ticketNumber,
      userId,
      organizationId,
      customerId || null,
      email.subject || '(Kein Betreff)',
      description,
      priority,
      email.conversationId,
      email.from.email,
      email.subject
    ]);

    // Save email to ticket_emails table
    await saveEmailToTicket(organizationId, ticketId, email, messageId, 'inbound');

    // Mark email as read
    await mailboxMonitorService.markAsRead(organizationId, messageId, 'support');

    // Send notifications to team members (async, non-blocking)
    (async () => {
      try {
        const { sendTicketNotification, getNotificationPreferences } = await import('../services/pushNotifications');
        const { emailService } = await import('../services/emailService');

        // Get all organization members with notification preferences
        const membersResult = await query(`
          SELECT u.id, u.email, u.username, COALESCE(u.display_name, u.username) as display_name
          FROM users u
          JOIN organization_members om ON u.id = om.user_id
          WHERE om.organization_id = $1
        `, [organizationId]);

        const ticketUrl = `${process.env.FRONTEND_URL || 'https://app.ramboeck.it'}/?ticket=${ticketId}`;
        const senderName = email.from.name || email.from.email.split('@')[0];

        for (const member of membersResult.rows) {
          // Skip the user who created the ticket (they already know)
          if (member.id === userId) continue;

          // Get notification preferences (with defaults)
          const prefs = await getNotificationPreferences(member.id) || {
            push_enabled: true,
            push_on_new_ticket: true,
            email_enabled: true,
            email_on_new_ticket: true
          };

          // Send push notification if enabled
          if (prefs.push_enabled && prefs.push_on_new_ticket) {
            sendTicketNotification(
              member.id,
              { id: ticketId, ticketNumber, title: email.subject || '(Kein Betreff)' },
              'push_on_new_ticket',
              `Neues Ticket von ${senderName}${customerName ? ` (${customerName})` : ''}`
            ).catch(err => logger.error('Push notification error (new ticket):', err));
          }

          // Send email notification if enabled
          if (prefs.email_enabled && (prefs as any).email_on_new_ticket !== false && member.email) {
            emailService.sendNewTicketAdminNotification({
              to: member.email,
              customerName: customerName || 'Unbekannt',
              contactName: senderName,
              ticketNumber,
              ticketTitle: email.subject || '(Kein Betreff)',
              ticketDescription: description.substring(0, 500),
              priority,
              adminUrl: ticketUrl,
            }).catch(err => logger.error('Email notification error (new ticket):', err));
          }
        }
      } catch (notifyErr) {
        logger.error('Error sending new ticket notifications:', notifyErr);
      }
    })();

    res.json({
      success: true,
      data: {
        ticketId,
        ticketNumber,
        title: email.subject,
        customerId,
        customerName,
        linkedToExisting: false,
      },
    });
  } catch (error: any) {
    logger.error('Create ticket from email error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create ticket from email',
    });
  }
});

// GET /api/microsoft365/support/emails - Get support emails
router.get('/support/emails', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const includeRead = req.query.includeRead === 'true';
    const maxResults = parseInt(req.query.limit as string) || 50;

    logger.info(`📧 Fetching support emails for org ${organizationId}, includeRead=${includeRead}, limit=${maxResults}`);

    const result = await mailboxMonitorService.getUnreadEmails(organizationId, {
      mailboxType: 'support',
      includeRead,
      maxResults,
    });

    logger.info(`📧 Support emails result: success=${result.success}, count=${result.emails?.length || 0}, error=${result.error || 'none'}`);

    if (result.success) {
      res.json({
        success: true,
        data: result.emails,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error('Get support emails error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get support emails',
    });
  }
});

// POST /api/microsoft365/support/emails/:id/link-ticket - Link email to existing ticket
router.post('/support/emails/:id/link-ticket', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;
    const { ticketId } = req.body;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        error: 'Ticket ID erforderlich',
      });
    }

    // Verify ticket exists and belongs to organization
    const ticketResult = await query(`
      SELECT id, ticket_number FROM tickets
      WHERE id = $1 AND organization_id = $2
    `, [ticketId, organizationId]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ticket nicht gefunden',
      });
    }

    // Get the email
    const emailResult = await mailboxMonitorService.getEmailById(organizationId, messageId, 'support');

    if (!emailResult.success || !emailResult.email) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }

    const email = emailResult.email;

    // Save email to ticket_emails table
    await saveEmailToTicket(organizationId, ticketId, email, messageId, 'inbound');

    // Update ticket with conversation ID if not set
    if (email.conversationId) {
      await query(`
        UPDATE tickets
        SET email_conversation_id = COALESCE(email_conversation_id, $1),
            email_from = COALESCE(email_from, $2)
        WHERE id = $3
      `, [email.conversationId, email.from.email, ticketId]);
    }

    // Mark email as read
    await mailboxMonitorService.markAsRead(organizationId, messageId, 'support');

    res.json({
      success: true,
      data: {
        ticketId,
        ticketNumber: ticketResult.rows[0].ticket_number,
      },
    });
  } catch (error: any) {
    logger.error('Link email to ticket error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to link email to ticket',
    });
  }
});

// GET /api/microsoft365/support/emails/:id/ticket-info - Check if email is linked to ticket
router.get('/support/emails/:id/ticket-info', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const messageId = req.params.id;

    // Check if email is already in ticket_emails
    const existingResult = await query(`
      SELECT te.ticket_id, t.ticket_number, t.title, t.status
      FROM ticket_emails te
      JOIN tickets t ON t.id = te.ticket_id
      WHERE te.organization_id = $1 AND te.message_id = $2
    `, [organizationId, messageId]);

    if (existingResult.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          linked: true,
          ticket: existingResult.rows[0],
        },
      });
    }

    // Check if we can find a ticket by conversation ID
    const emailResult = await mailboxMonitorService.getEmailById(organizationId, messageId, 'support');
    if (emailResult.success && emailResult.email?.conversationId) {
      const ticketResult = await query(`
        SELECT id as ticket_id, ticket_number, title, status
        FROM tickets
        WHERE organization_id = $1 AND email_conversation_id = $2
        LIMIT 1
      `, [organizationId, emailResult.email.conversationId]);

      if (ticketResult.rows.length > 0) {
        return res.json({
          success: true,
          data: {
            linked: false,
            suggestedTicket: ticketResult.rows[0],
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        linked: false,
        suggestedTicket: null,
      },
    });
  } catch (error: any) {
    logger.error('Get email ticket info error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get email ticket info',
    });
  }
});

// GET /api/microsoft365/tickets/:id/emails - Get emails for a ticket
router.get('/tickets/:id/emails', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const ticketId = req.params.id;

    const result = await query(`
      SELECT
        id,
        message_id,
        conversation_id,
        direction,
        subject,
        body_preview,
        body_html,
        body_text,
        from_name,
        from_email,
        to_recipients,
        cc_recipients,
        is_read,
        importance,
        has_attachments,
        received_at,
        sent_at,
        created_at
      FROM ticket_emails
      WHERE ticket_id = $1 AND organization_id = $2
      ORDER BY received_at ASC
    `, [ticketId, organizationId]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    logger.error('Get ticket emails error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get ticket emails',
    });
  }
});

// ========================================
// Invoice Processing Endpoints
// ========================================

// POST /api/microsoft365/invoices/process - Process invoice mailbox
// Set includeRead=true to also process already read emails (for re-processing after clear all)
router.post('/invoices/process', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { includeRead = false } = req.body;

    const result = await invoiceProcessorService.processInvoiceMailbox(organizationId, { includeRead });

    res.json({
      success: result.success,
      data: {
        processedCount: result.processedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        results: result.results,
      },
    });
  } catch (error: any) {
    logger.error('Process invoice mailbox error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process invoice mailbox',
    });
  }
});

// GET /api/microsoft365/invoices - Get processed invoices
router.get('/invoices', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const status = req.query.status as string | undefined;
    const source = req.query.source as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await invoiceProcessorService.getProcessedInvoices(organizationId, {
      status,
      source,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: result.invoices,
      total: result.total,
    });
  } catch (error: any) {
    logger.error('Get processed invoices error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get processed invoices',
    });
  }
});

// GET /api/microsoft365/invoices/search - Full-text search over processed invoices.
// Mirrors the sevdesk_documents search pattern (German tsvector, prefix-match
// per term). Searches email metadata + the PDF-extracted text that's stored
// in processed_invoices.full_text by invoiceProcessorService.extractInvoiceData.
router.get('/invoices/search', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const q = req.query.q as string | undefined;
    const status = req.query.status as string | undefined;
    const vendorId = req.query.vendorId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    const results = await invoiceProcessorService.searchProcessedInvoices(
      organizationId,
      q,
      { status, vendorId, limit, offset }
    );

    res.json({ success: true, data: results });
  } catch (error: any) {
    logger.error('Search processed invoices error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search invoices',
    });
  }
});

// POST /api/microsoft365/invoices/backfill-search - One-off backfill of full_text
// + search_vector for already-stored invoices that pre-date the FTS migration.
router.post('/invoices/backfill-search', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const limit = parseInt(req.query.limit as string) || 200;

    const result = await invoiceProcessorService.backfillSearchIndex(organizationId, limit);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Backfill search index error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to backfill search index',
    });
  }
});

// GET /api/microsoft365/invoices/:id/documents - Get documents for a processed invoice
router.get('/invoices/:id/documents', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const processedInvoiceId = req.params.id;

    const documents = await invoiceProcessorService.getInvoiceDocuments(processedInvoiceId);

    res.json({
      success: true,
      data: documents,
    });
  } catch (error: any) {
    logger.error('Get invoice documents error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get invoice documents',
    });
  }
});

// GET /api/microsoft365/documents/:id/download - Download a document file
router.get('/documents/:id/download', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const documentId = req.params.id;

    const document = await invoiceProcessorService.getDocument(documentId, organizationId);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Dokument nicht gefunden',
      });
    }

    // Check if file exists
    if (!fs.existsSync(document.storagePath)) {
      logger.error(`Document file not found: ${document.storagePath}`);
      return res.status(404).json({
        success: false,
        error: 'Datei nicht gefunden',
      });
    }

    // Read file into memory to avoid HTTP/2 streaming issues with nginx
    const fileBuffer = fs.readFileSync(document.storagePath);

    // Set appropriate headers for file download/display
    const inline = req.query.inline === 'true';
    const disposition = inline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(document.originalFilename)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    // Prevent caching by browsers and service workers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send the entire file at once
    res.send(fileBuffer);
  } catch (error: any) {
    logger.error('Download document error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download document',
    });
  }
});

// POST /api/microsoft365/invoices/:id/retry - Retry processing a failed invoice
router.post('/invoices/:id/retry', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const success = await invoiceProcessorService.retryProcessing(organizationId, processedInvoiceId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte Verarbeitung nicht wiederholen',
      });
    }
  } catch (error: any) {
    logger.error('Retry invoice processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retry invoice processing',
    });
  }
});

// DELETE /api/microsoft365/invoices/failed - Clear all failed invoice entries
// IMPORTANT: This route must be defined BEFORE /invoices/:id to avoid "failed" being matched as an id
router.delete('/invoices/failed', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const deletedCount = await invoiceProcessorService.clearFailedEntries(organizationId);

    res.json({
      success: true,
      deletedCount,
    });
  } catch (error: any) {
    logger.error('Clear failed entries error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear failed entries',
    });
  }
});

// DELETE /api/microsoft365/invoices/all - Clear ALL invoice entries (for reset/testing)
router.delete('/invoices/all', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const deletedCount = await invoiceProcessorService.clearAllEntries(organizationId);

    res.json({
      success: true,
      deletedCount,
    });
  } catch (error: any) {
    logger.error('Clear all entries error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to clear all entries',
    });
  }
});

// POST /api/microsoft365/invoices/sync-sevdesk-vouchers - manueller
// Trigger fuer den sevDesk-Voucher-Sync (laeuft sonst per Cron alle 30
// Minuten). Admin-only.
router.post('/invoices/sync-sevdesk-vouchers', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const stats = await invoiceProcessorService.syncSevdeskVouchers(organizationId);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    logger.error('sevDesk-Voucher sync error:', error);
    res.status(500).json({ success: false, error: error.message || 'Sync fehlgeschlagen' });
  }
});

// POST /api/microsoft365/invoices/upload - Manual-Upload: PDF direkt
// hochladen, wird als Beleg mit source='manual' angelegt und sofort
// extrahiert. Antwort enthaelt die fertig extrahierten Daten, sodass das
// Frontend direkt das Bestaetigungs-Modal oeffnen kann.
router.post('/invoices/upload', requireOrgRole('member'), receiptUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen' });
    }

    const result = await invoiceProcessorService.createManualReceipt(
      organizationId,
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    res.json({
      success: true,
      data: {
        processedInvoiceId: result.processedInvoiceId,
        extracted: result.extracted,
      },
    });
  } catch (error: any) {
    logger.error('Manual receipt upload error:', error);
    res.status(500).json({ success: false, error: error.message || 'Upload fehlgeschlagen' });
  }
});

// GET /api/microsoft365/invoices/:id/extract - Extract invoice data from PDF
router.get('/invoices/:id/extract', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const force = req.query.force === '1' || req.query.force === 'true';
    const extractedData = await invoiceProcessorService.extractInvoiceData(organizationId, processedInvoiceId, { force });

    if (extractedData) {
      res.json({
        success: true,
        data: extractedData,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Keine Daten zum Extrahieren gefunden',
      });
    }
  } catch (error: any) {
    logger.error('Extract invoice data error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract invoice data',
    });
  }
});

// POST /api/microsoft365/invoices/:id/approve - Approve a draft invoice
router.post('/invoices/:id/approve', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;
    const { extractedData } = req.body;

    // If extracted data is provided, use the new approval flow
    let success: boolean;
    if (extractedData) {
      success = await invoiceProcessorService.approveDraftWithData(organizationId, processedInvoiceId, extractedData);
    } else {
      success = await invoiceProcessorService.approveDraft(organizationId, processedInvoiceId);
    }

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Entwurf konnte nicht bestätigt werden',
      });
    }
  } catch (error: any) {
    logger.error('Approve draft error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve draft',
    });
  }
});

// POST /api/microsoft365/invoices/:id/revert - Revert processed invoice back to draft
router.post('/invoices/:id/revert', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const success = await invoiceProcessorService.revertToDraft(organizationId, processedInvoiceId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Konnte nicht zurückgesetzt werden',
      });
    }
  } catch (error: any) {
    logger.error('Revert to draft error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to revert to draft',
    });
  }
});

// DELETE /api/microsoft365/invoices/:id - Delete a draft invoice
router.delete('/invoices/:id', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const processedInvoiceId = req.params.id;

    const success = await invoiceProcessorService.deleteDraft(organizationId, processedInvoiceId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(400).json({
        success: false,
        error: 'Entwurf konnte nicht gelöscht werden',
      });
    }
  } catch (error: any) {
    logger.error('Delete draft error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete draft',
    });
  }
});

// POST /api/microsoft365/support/emails/:id/save-as-interaction - Save email as customer interaction
router.post('/support/emails/:id/save-as-interaction', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const messageId = req.params.id;
    const { customerId: providedCustomerId } = req.body;

    // Get the email
    const emailResult = await mailboxMonitorService.getEmailById(organizationId, messageId, 'support');

    if (!emailResult.success || !emailResult.email) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }

    const email = emailResult.email;
    const senderEmail = email.from.email;

    // Find customer by email if not provided
    let customerId = providedCustomerId;
    let customerName = '';

    if (!customerId) {
      const customer = await findCustomerByEmail(organizationId, senderEmail);
      if (customer) {
        customerId = customer.id;
        customerName = customer.name;
      }
    } else {
      // Get customer name
      const customerResult = await query(
        'SELECT name FROM customers WHERE id = $1 AND organization_id = $2',
        [customerId, organizationId]
      );
      if (customerResult.rows.length > 0) {
        customerName = customerResult.rows[0].name;
      }
    }

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Kein Kunde gefunden. Bitte Kunden manuell zuweisen.',
        requiresCustomer: true,
      });
    }

    // Check if interaction already exists for this email
    const existingInteraction = await query(
      `SELECT id FROM customer_interactions
       WHERE organization_id = $1
       AND external_id = $2
       AND external_source = 'microsoft365'`,
      [organizationId, messageId]
    );

    if (existingInteraction.rows.length > 0) {
      return res.json({
        success: true,
        alreadyExists: true,
        interactionId: existingInteraction.rows[0].id,
        message: 'Diese E-Mail wurde bereits als Interaktion gespeichert.',
      });
    }

    // Extract plain text from HTML body if needed
    let content = email.body?.content || email.bodyPreview || '';
    if (email.body?.contentType === 'html') {
      // Simple HTML to text conversion
      content = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limit content length
    }

    // Create interaction
    const interactionResult = await query(
      `INSERT INTO customer_interactions (
        id, organization_id, customer_id, user_id, type, direction,
        subject, content, summary, occurred_at, external_id, external_source,
        created_at
      ) VALUES (
        gen_random_uuid()::text, $1, $2, $3, 'email', 'inbound',
        $4, $5, $6, $7, $8, 'microsoft365',
        NOW()
      ) RETURNING id`,
      [
        organizationId,
        customerId,
        userId,
        email.subject || 'Keine Betreffzeile',
        content,
        email.bodyPreview?.substring(0, 500) || '',
        email.receivedDateTime || new Date().toISOString(),
        messageId,
      ]
    );

    const interactionId = interactionResult.rows[0].id;

    // Mark email as read
    await mailboxMonitorService.markAsRead(organizationId, messageId, 'support');

    res.json({
      success: true,
      data: {
        interactionId,
        customerId,
        customerName,
        subject: email.subject,
      },
    });

  } catch (error: any) {
    logger.error('Save email as interaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Fehler beim Speichern der Interaktion',
    });
  }
});

// ============================================
// PERSONAL INBOX ROUTES
// Access emails from the logged-in user's personal mailbox
// ============================================

// GET /api/microsoft365/personal/emails - Get user's personal inbox emails
router.get('/personal/emails', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const includeRead = req.query.includeRead === 'true';
    const maxResults = parseInt(req.query.limit as string) || 30;

    // Get user's email address
    const userResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
      });
    }

    const userEmail = userResult.rows[0].email;

    // Fetch emails from user's personal mailbox
    const result = await mailboxMonitorService.getEmailsFromMailbox(
      organizationId,
      userEmail,
      {
        includeRead,
        maxResults,
      }
    );

    if (result.success) {
      // Enrich emails with customer matching
      const enrichedEmails = await Promise.all(
        (result.emails || []).map(async (email) => {
          const customer = await findCustomerByEmail(organizationId, email.from.email);
          return {
            ...email,
            matchedCustomer: customer ? {
              id: customer.id,
              name: customer.name,
              matchType: customer.matchType,
            } : null,
          };
        })
      );

      res.json({
        success: true,
        data: enrichedEmails,
        userEmail,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    logger.error('Get personal emails error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Fehler beim Abrufen der E-Mails',
    });
  }
});

// POST /api/microsoft365/personal/emails/:id/save-as-interaction - Save personal email as interaction
router.post('/personal/emails/:id/save-as-interaction', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const messageId = req.params.id;
    const { customerId: providedCustomerId } = req.body;

    // Get user's email address
    const userResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
      });
    }

    const userEmail = userResult.rows[0].email;

    // Get the email from personal mailbox
    const email = await mailboxMonitorService.getEmailFromMailbox(
      organizationId,
      userEmail,
      messageId
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }

    // Find customer by sender email if not provided
    let customerId = providedCustomerId;
    let customerName = '';

    if (!customerId) {
      const customer = await findCustomerByEmail(organizationId, email.from.email);
      if (customer) {
        customerId = customer.id;
        customerName = customer.name;
      }
    } else {
      // Get customer name
      const customerResult = await query(
        'SELECT name FROM customers WHERE id = $1 AND organization_id = $2',
        [customerId, organizationId]
      );
      if (customerResult.rows.length > 0) {
        customerName = customerResult.rows[0].name;
      }
    }

    if (!customerId) {
      // Return sender info so UI can show customer selection
      const domainMatch = email.from.email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
      const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : null;

      return res.status(400).json({
        success: false,
        error: 'Kein Kunde gefunden. Bitte Kunden manuell zuweisen.',
        requiresCustomer: true,
        sender: {
          email: email.from.email,
          name: email.from.name,
          domain: senderDomain,
        },
      });
    }

    // Check if interaction already exists for this email
    const existingInteraction = await query(
      `SELECT id FROM customer_interactions
       WHERE organization_id = $1
       AND external_id = $2
       AND external_source = 'microsoft365_personal'`,
      [organizationId, messageId]
    );

    if (existingInteraction.rows.length > 0) {
      return res.json({
        success: true,
        alreadyExists: true,
        interactionId: existingInteraction.rows[0].id,
        message: 'Diese E-Mail wurde bereits als Interaktion gespeichert.',
      });
    }

    // Extract plain text from HTML body if needed
    let content = email.body?.content || email.bodyPreview || '';
    if (email.body?.contentType === 'html') {
      content = content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000);
    }

    // Determine direction: inbound if from external, outbound if to external
    const isInbound = email.from.email.toLowerCase() !== userEmail.toLowerCase();

    // Create interaction
    const interactionResult = await query(
      `INSERT INTO customer_interactions (
        id, organization_id, customer_id, user_id, type, direction,
        subject, content, summary, occurred_at, external_id, external_source,
        created_at
      ) VALUES (
        gen_random_uuid()::text, $1, $2, $3, 'email', $4,
        $5, $6, $7, $8, $9, 'microsoft365_personal',
        NOW()
      ) RETURNING id`,
      [
        organizationId,
        customerId,
        userId,
        isInbound ? 'inbound' : 'outbound',
        email.subject || 'Keine Betreffzeile',
        content,
        email.bodyPreview?.substring(0, 500) || '',
        email.receivedDateTime || new Date().toISOString(),
        messageId,
      ]
    );

    const interactionId = interactionResult.rows[0].id;

    // Mark email as read
    await mailboxMonitorService.markAsReadInMailbox(organizationId, userEmail, messageId);

    res.json({
      success: true,
      data: {
        interactionId,
        customerId,
        customerName,
        subject: email.subject,
        direction: isInbound ? 'inbound' : 'outbound',
      },
    });

  } catch (error: any) {
    logger.error('Save personal email as interaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Fehler beim Speichern der Interaktion',
    });
  }
});

// GET /api/microsoft365/personal/emails/:id/customer-lookup - Lookup customer for personal email
router.get('/personal/emails/:id/customer-lookup', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const messageId = req.params.id;

    // Get user's email address
    const userResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Benutzer nicht gefunden',
      });
    }

    const userEmail = userResult.rows[0].email;

    // Get the email from personal mailbox
    const email = await mailboxMonitorService.getEmailFromMailbox(
      organizationId,
      userEmail,
      messageId
    );

    if (!email) {
      return res.status(404).json({
        success: false,
        error: 'E-Mail nicht gefunden',
      });
    }

    const senderEmail = email.from.email;
    const domainMatch = senderEmail.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : null;

    // Try to find customer by email
    const customer = await findCustomerByEmail(organizationId, senderEmail);

    if (customer) {
      return res.json({
        success: true,
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          matchType: customer.matchType,
        },
        sender: {
          email: senderEmail,
          name: email.from.name,
          domain: senderDomain,
        },
      });
    }

    // No customer found
    return res.json({
      success: true,
      found: false,
      customer: null,
      sender: {
        email: senderEmail,
        name: email.from.name,
        domain: senderDomain,
      },
    });

  } catch (error: any) {
    logger.error('Personal email customer lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Fehler bei der Kundensuche',
    });
  }
});

export default router;
