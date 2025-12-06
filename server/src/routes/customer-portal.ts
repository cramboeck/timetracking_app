import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/database';
import { authLimiter } from '../middleware/rateLimiter';
import { securityService } from '../services/securityService';
import { CustomerAuthRequest, authenticateCustomerToken } from '../middleware/customerAuth';
import { upload, getFileUrl, deleteFile } from '../middleware/upload';
import { z } from 'zod';
import { sendTicketNotification } from '../services/pushNotifications';
import { emailService } from '../services/emailService';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { UAParser } from 'ua-parser-js';

// MFA Constants
const TRUST_DURATION_DAYS = 30;

// Helper to parse user agent for trusted devices
function parseUserAgent(userAgent?: string): { browser: string; os: string; deviceName: string } {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', deviceName: 'Unknown Device' };
  }
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const browser = result.browser.name || 'Unknown';
  const browserVersion = result.browser.version?.split('.')[0] || '';
  const os = result.os.name || 'Unknown';
  const osVersion = result.os.version || '';

  return {
    browser: browserVersion ? `${browser} ${browserVersion}` : browser,
    os: osVersion ? `${os} ${osVersion}` : os,
    deviceName: `${browser} on ${os}`
  };
}

// Check if device is trusted for portal
async function checkPortalTrustedDevice(contactId: string, deviceToken: string): Promise<boolean> {
  if (!deviceToken) return false;
  try {
    const result = await pool.query(
      `SELECT id FROM portal_trusted_devices WHERE contact_id = $1 AND device_token = $2 AND expires_at > NOW()`,
      [contactId, deviceToken]
    );
    if (result.rows.length > 0) {
      await pool.query('UPDATE portal_trusted_devices SET last_used_at = NOW() WHERE id = $1', [result.rows[0].id]);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Create trusted device for portal
async function createPortalTrustedDevice(contactId: string, userAgent: string | undefined, ipAddress: string): Promise<string> {
  const deviceToken = crypto.randomBytes(32).toString('hex');
  const { browser, os, deviceName } = parseUserAgent(userAgent);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TRUST_DURATION_DAYS);
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO portal_trusted_devices (id, contact_id, device_token, device_name, browser, os, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, contactId, deviceToken, deviceName, browser, os, ipAddress, expiresAt.toISOString()]
  );
  return deviceToken;
}

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createTicketSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});

const addCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

// Customer portal login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { email, password } = validation.data;

    // Get client IP (handle proxy)
    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    // Find customer contact by email
    const contactResult = await pool.query(
      `SELECT cc.*, c.name as customer_name, c.user_id
       FROM customer_contacts cc
       JOIN customers c ON cc.customer_id = c.id
       WHERE LOWER(cc.email) = LOWER($1)`,
      [email]
    );

    const contact = contactResult.rows[0];

    if (!contact) {
      // Log failed login (user not found)
      securityService.logFailedLogin(clientIP, `portal:${email}`, userAgent);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!contact.password_hash) {
      // Log failed login (account not activated)
      securityService.logFailedLogin(clientIP, `portal:${email}`, userAgent);
      return res.status(401).json({ error: 'Account not activated. Please contact support.' });
    }

    const validPassword = await bcrypt.compare(password, contact.password_hash);
    if (!validPassword) {
      // Log failed login (wrong password)
      securityService.logFailedLogin(clientIP, `portal:${email}`, userAgent);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if MFA is enabled
    if (contact.mfa_enabled && contact.mfa_secret) {
      // Check if this is a trusted device
      const deviceToken = req.headers['x-device-token'] as string;
      const isTrusted = deviceToken ? await checkPortalTrustedDevice(contact.id, deviceToken) : false;

      if (isTrusted) {
        console.log(`🔐 Portal MFA skipped for trusted device for contact "${contact.email}"`);
        // Skip MFA for trusted device - continue with login
      } else {
        // Generate a temporary token for MFA verification
        const mfaToken = jwt.sign(
          { contactId: contact.id, customerId: contact.customer_id, userId: contact.user_id, mfaPending: true },
          process.env.JWT_SECRET!,
          { expiresIn: '5m' }
        );

        console.log(`🔐 Portal MFA required for contact "${contact.email}"`);

        return res.json({
          success: true,
          mfaRequired: true,
          mfaToken,
          contact: {
            id: contact.id,
            name: contact.name
          }
        });
      }
    }

    // Log successful login
    securityService.logSuccessfulLogin(clientIP, `portal:${email}`, contact.id);

    // Update last login
    await pool.query('UPDATE customer_contacts SET last_login = NOW() WHERE id = $1', [contact.id]);

    // Generate token with type identifier
    const token = jwt.sign(
      {
        contactId: contact.id,
        customerId: contact.customer_id,
        userId: contact.user_id, // The service provider's user ID
        type: 'customer_portal',
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      contact: {
        id: contact.id,
        customerId: contact.customer_id,
        customerName: contact.customer_name,
        userId: contact.user_id, // Service provider's user ID
        name: contact.name,
        email: contact.email,
        canCreateTickets: contact.can_create_tickets,
        canViewAllTickets: contact.can_view_all_tickets,
        canViewDevices: contact.can_view_devices ?? false,
        canViewInvoices: contact.can_view_invoices ?? false,
        canViewQuotes: contact.can_view_quotes ?? false,
      },
    });
  } catch (error) {
    console.error('Customer portal login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current contact info
router.get('/me', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const contactResult = await pool.query(
      `SELECT cc.*, c.name as customer_name, c.user_id
       FROM customer_contacts cc
       JOIN customers c ON cc.customer_id = c.id
       WHERE cc.id = $1`,
      [req.contactId]
    );

    const contact = contactResult.rows[0];
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      id: contact.id,
      customerId: contact.customer_id,
      customerName: contact.customer_name,
      userId: contact.user_id, // Service provider's user ID
      name: contact.name,
      email: contact.email,
      canCreateTickets: contact.can_create_tickets,
      canViewAllTickets: contact.can_view_all_tickets,
      canViewDevices: contact.can_view_devices ?? false,
      canViewInvoices: contact.can_view_invoices ?? false,
      canViewQuotes: contact.can_view_quotes ?? false,
    });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tickets for the customer
router.get('/tickets', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { status } = req.query;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    if (!userId) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    let query = `
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.customer_id = $1 AND t.user_id = $2
    `;
    const params: any[] = [req.customerId, userId];

    // Filter by status (don't show archived to customers by default)
    if (status && status !== 'all') {
      query += ` AND t.status = $3`;
      params.push(status);
    } else {
      query += ` AND t.status != 'archived'`;
    }

    query += ` ORDER BY t.updated_at DESC`;

    const ticketsResult = await pool.query(query, params);

    const tickets = ticketsResult.rows.map(ticket => ({
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      customerName: ticket.customer_name,
      projectName: ticket.project_name,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      resolvedAt: ticket.resolved_at,
      closedAt: ticket.closed_at,
    }));

    res.json(tickets);
  } catch (error) {
    console.error('Get customer tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single ticket
router.get('/tickets/:id', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Get ticket with verification
    const ticketResult = await pool.query(
      `SELECT t.*, c.name as customer_name, p.name as project_name
       FROM tickets t
       JOIN customers c ON t.customer_id = c.id
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND t.customer_id = $2 AND t.user_id = $3`,
      [id, req.customerId, userId]
    );

    const ticket = ticketResult.rows[0];
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get comments (only non-internal comments for customers)
    const commentsResult = await pool.query(
      `SELECT tc.*,
        u.username as user_name,
        cc.name as contact_name
       FROM ticket_comments tc
       LEFT JOIN users u ON tc.user_id = u.id
       LEFT JOIN customer_contacts cc ON tc.customer_contact_id = cc.id
       WHERE tc.ticket_id = $1 AND tc.is_internal = FALSE
       ORDER BY tc.created_at ASC`,
      [id]
    );

    const comments = commentsResult.rows.map(comment => ({
      id: comment.id,
      content: comment.content,
      authorName: comment.user_name || comment.contact_name || 'System',
      isFromCustomer: !!comment.customer_contact_id,
      createdAt: comment.created_at,
    }));

    res.json({
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      customerName: ticket.customer_name,
      projectName: ticket.project_name,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      resolvedAt: ticket.resolved_at,
      closedAt: ticket.closed_at,
      comments,
    });
  } catch (error) {
    console.error('Get customer ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create ticket
router.post('/tickets', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    // Check if contact can create tickets
    const contactResult = await pool.query(
      'SELECT can_create_tickets FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    if (!contactResult.rows[0]?.can_create_tickets) {
      return res.status(403).json({ error: 'You are not allowed to create tickets' });
    }

    const validation = createTicketSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { title, description, priority } = validation.data;

    // Get the customer's service provider user_id and organization_id
    const customerResult = await pool.query(
      `SELECT c.user_id, c.name, c.organization_id
       FROM customers c
       WHERE c.id = $1`,
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;
    const customerName = customerResult.rows[0]?.name;
    const organizationId = customerResult.rows[0]?.organization_id;

    console.log(`🎫 Creating ticket for customer "${customerName}" (${req.customerId}), organization_id: ${organizationId}`);

    if (!userId || !organizationId) {
      console.error(`❌ Customer ${req.customerId} not found or has no user_id/organization_id`);
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get or create ticket sequence for organization
    await pool.query(
      'INSERT INTO ticket_sequences (organization_id, last_number) VALUES ($1, 0) ON CONFLICT (organization_id) DO NOTHING',
      [organizationId]
    );

    // Increment and get next ticket number
    const seqResult = await pool.query(
      'UPDATE ticket_sequences SET last_number = last_number + 1 WHERE organization_id = $1 RETURNING last_number',
      [organizationId]
    );
    const ticketNumber = `TKT-${String(seqResult.rows[0].last_number).padStart(6, '0')}`;

    // Create ticket
    const ticketId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tickets (id, ticket_number, user_id, organization_id, customer_id, created_by_contact_id, title, description, status, priority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, NOW(), NOW())`,
      [ticketId, ticketNumber, userId, organizationId, req.customerId, req.contactId, title, description || null, priority]
    );

    console.log(`✅ Ticket ${ticketNumber} created with id=${ticketId}, organization_id=${organizationId}, customer_id=${req.customerId}`);

    // Get created ticket
    const ticketResult = await pool.query(
      `SELECT t.*, c.name as customer_name
       FROM tickets t
       JOIN customers c ON t.customer_id = c.id
       WHERE t.id = $1`,
      [ticketId]
    );

    const ticket = ticketResult.rows[0];

    // Send push notifications to all organization members (async, non-blocking)
    (async () => {
      try {
        // Get all organization members
        const members = await pool.query(
          `SELECT user_id FROM organization_members WHERE organization_id = $1`,
          [organizationId]
        );

        for (const member of members.rows) {
          sendTicketNotification(
            member.user_id,
            { id: ticketId, ticketNumber, title },
            'push_on_new_ticket',
            `Neues Portal-Ticket von ${customerName}: ${title}`
          ).catch(err => console.error('Push notification error:', err));
        }
      } catch (err) {
        console.error('Error sending push notifications:', err);
      }
    })();

    // Send email confirmation to customer contact (async, non-blocking)
    try {
      const contactInfo = await pool.query(
        'SELECT email, name, notify_ticket_created FROM customer_contacts WHERE id = $1',
        [req.contactId]
      );
      if (contactInfo.rows.length > 0 && contactInfo.rows[0].email && contactInfo.rows[0].notify_ticket_created !== false) {
        const contact = contactInfo.rows[0];
        const portalUrl = `${process.env.FRONTEND_URL || 'https://app.ramboeck.it'}/portal/tickets/${ticketId}`;
        emailService.sendTicketCreatedNotification({
          to: contact.email,
          customerName: contact.name || customerName,
          ticketNumber,
          ticketTitle: title,
          ticketDescription: description || '',
          portalUrl,
        }).catch(err => console.error('Failed to send ticket created notification:', err));
      }
    } catch (emailErr) {
      console.error('Error preparing ticket created notification:', emailErr);
    }

    // Send email notification to admin/service provider (async, non-blocking)
    try {
      const adminInfo = await pool.query(
        'SELECT email, display_name, username FROM users WHERE id = $1',
        [userId]
      );
      const contactInfo = await pool.query(
        'SELECT name FROM customer_contacts WHERE id = $1',
        [req.contactId]
      );
      if (adminInfo.rows.length > 0 && adminInfo.rows[0].email) {
        const admin = adminInfo.rows[0];
        const contactName = contactInfo.rows[0]?.name || 'Unbekannt';
        const adminUrl = `${process.env.FRONTEND_URL || 'https://app.ramboeck.it'}/?ticket=${ticketId}`;
        emailService.sendNewTicketAdminNotification({
          to: admin.email,
          customerName,
          contactName,
          ticketNumber,
          ticketTitle: title,
          ticketDescription: description || '',
          priority,
          adminUrl,
        }).catch(err => console.error('Failed to send admin notification:', err));
      }
    } catch (emailErr) {
      console.error('Error preparing admin notification:', emailErr);
    }

    res.status(201).json({
      id: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      customerName: ticket.customer_name,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    });
  } catch (error) {
    console.error('Create customer ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment to ticket
router.post('/tickets/:id/comments', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const validation = addCommentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { content } = validation.data;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer
    const ticketResult = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3',
      [id, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Create comment
    const commentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ticket_comments (id, ticket_id, customer_contact_id, content, is_internal, created_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())`,
      [commentId, id, req.contactId, content]
    );

    // Update ticket updated_at
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id]);

    // Get created comment with contact name and ticket info for notification
    const commentResult = await pool.query(
      `SELECT tc.*, cc.name as contact_name, t.ticket_number, t.title as ticket_title, t.user_id as ticket_owner_id
       FROM ticket_comments tc
       JOIN customer_contacts cc ON tc.customer_contact_id = cc.id
       JOIN tickets t ON tc.ticket_id = t.id
       WHERE tc.id = $1`,
      [commentId]
    );

    const comment = commentResult.rows[0];

    // Send push notification to ticket owner (async, non-blocking)
    sendTicketNotification(
      comment.ticket_owner_id,
      { id, ticketNumber: comment.ticket_number, title: comment.ticket_title },
      'push_on_ticket_comment',
      `Neuer Kundenkommentar von ${comment.contact_name}`
    ).catch(err => console.error('Failed to send push notification:', err));

    res.status(201).json({
      id: comment.id,
      content: comment.content,
      authorName: comment.contact_name,
      isFromCustomer: true,
      createdAt: comment.created_at,
    });
  } catch (error) {
    console.error('Add customer comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set password (for first-time activation)
router.post('/set-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password || password.length < 8) {
      return res.status(400).json({ error: 'Token and password (min 8 chars) required' });
    }

    // Decode token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as { contactId: string; type: string };
    } catch {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (decoded.type !== 'customer_activation') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update contact
    const result = await pool.query(
      'UPDATE customer_contacts SET password_hash = $1 WHERE id = $2 RETURNING id',
      [passwordHash, decoded.contactId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true, message: 'Password set successfully. You can now login.' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// TICKET ACTIONS
// ============================================================================

// Close ticket (customer can close their own tickets)
router.post('/tickets/:id/close', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer and is not already closed
    const ticketResult = await pool.query(
      `SELECT id, status FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3`,
      [id, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Ticket is already closed' });
    }

    // Close the ticket
    await pool.query(
      `UPDATE tickets SET status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Add system comment
    const commentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ticket_comments (id, ticket_id, customer_contact_id, content, is_internal, created_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())`,
      [commentId, id, req.contactId, '✅ Ticket wurde vom Kunden geschlossen.']
    );

    res.json({ success: true, message: 'Ticket closed successfully' });
  } catch (error) {
    console.error('Close ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reopen ticket
router.post('/tickets/:id/reopen', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer
    const ticketResult = await pool.query(
      `SELECT id, status FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3`,
      [id, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
      return res.status(400).json({ error: 'Ticket is not closed or resolved' });
    }

    // Reopen the ticket
    await pool.query(
      `UPDATE tickets SET status = 'open', closed_at = NULL, resolved_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Add system comment
    const commentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO ticket_comments (id, ticket_id, customer_contact_id, content, is_internal, created_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())`,
      [commentId, id, req.contactId, '🔄 Ticket wurde vom Kunden wiedereröffnet.']
    );

    res.json({ success: true, message: 'Ticket reopened successfully' });
  } catch (error) {
    console.error('Reopen ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// FILE ATTACHMENTS
// ============================================================================

// Upload attachment to ticket
router.post('/tickets/:id/attachments', authenticateCustomerToken, upload.array('files', 5), async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer
    const ticketResult = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3',
      [id, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      // Delete uploaded files since ticket doesn't exist
      for (const file of files) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Save attachments to database
    const attachments = [];
    for (const file of files) {
      const attachmentId = crypto.randomUUID();
      const fileUrl = getFileUrl(file.filename);

      await pool.query(
        `INSERT INTO ticket_attachments (id, ticket_id, filename, file_url, file_size, mime_type, uploaded_by_contact_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [attachmentId, id, file.originalname, fileUrl, file.size, file.mimetype, req.contactId]
      );

      attachments.push({
        id: attachmentId,
        filename: file.originalname,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        createdAt: new Date().toISOString(),
      });
    }

    // Update ticket updated_at
    await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id]);

    res.status(201).json({ success: true, attachments });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get attachments for ticket
router.get('/tickets/:id/attachments', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer
    const ticketResult = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3',
      [id, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get attachments
    const attachmentsResult = await pool.query(
      `SELECT ta.*, cc.name as uploaded_by_name
       FROM ticket_attachments ta
       LEFT JOIN customer_contacts cc ON ta.uploaded_by_contact_id = cc.id
       WHERE ta.ticket_id = $1
       ORDER BY ta.created_at ASC`,
      [id]
    );

    const attachments = attachmentsResult.rows.map(a => ({
      id: a.id,
      filename: a.filename,
      fileUrl: a.file_url,
      fileSize: a.file_size,
      mimeType: a.mime_type,
      uploadedByName: a.uploaded_by_name || 'System',
      createdAt: a.created_at,
    }));

    res.json(attachments);
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete attachment
router.delete('/tickets/:ticketId/attachments/:attachmentId', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { ticketId, attachmentId } = req.params;

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer
    const ticketResult = await pool.query(
      'SELECT id FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3',
      [ticketId, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get attachment and verify it was uploaded by this contact
    const attachmentResult = await pool.query(
      'SELECT * FROM ticket_attachments WHERE id = $1 AND ticket_id = $2 AND uploaded_by_contact_id = $3',
      [attachmentId, ticketId, req.contactId]
    );

    if (attachmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found or not authorized to delete' });
    }

    const attachment = attachmentResult.rows[0];

    // Delete file from disk
    const filename = path.basename(attachment.file_url);
    await deleteFile(filename);

    // Delete from database
    await pool.query('DELETE FROM ticket_attachments WHERE id = $1', [attachmentId]);

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

// Change password (authenticated user)
router.post('/change-password', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Get current password hash
    const contactResult = await pool.query(
      'SELECT password_hash FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, contact.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE customer_contacts SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, req.contactId]
    );

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

// Get notification preferences
router.get('/notification-preferences', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply
       FROM customer_contacts WHERE id = $1`,
      [req.contactId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const prefs = result.rows[0];
    res.json({
      notifyTicketCreated: prefs.notify_ticket_created ?? true,
      notifyTicketStatusChanged: prefs.notify_ticket_status_changed ?? true,
      notifyTicketReply: prefs.notify_ticket_reply ?? true,
    });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update notification preferences
router.put('/notification-preferences', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply } = req.body;

    await pool.query(
      `UPDATE customer_contacts SET
        notify_ticket_created = COALESCE($1, notify_ticket_created),
        notify_ticket_status_changed = COALESCE($2, notify_ticket_status_changed),
        notify_ticket_reply = COALESCE($3, notify_ticket_reply)
       WHERE id = $4`,
      [notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply, req.contactId]
    );

    res.json({ success: true, message: 'Notification preferences updated' });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// SATISFACTION RATING
// ============================================================================

// Rate closed ticket
router.post('/tickets/:id/rate', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;

    // Verify ticket belongs to this customer and is closed/resolved
    const ticketResult = await pool.query(
      `SELECT id, status FROM tickets WHERE id = $1 AND customer_id = $2 AND user_id = $3`,
      [id, req.customerId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
      return res.status(400).json({ error: 'Can only rate closed or resolved tickets' });
    }

    // Save rating (using a JSON field in the ticket for simplicity)
    await pool.query(
      `UPDATE tickets SET
        satisfaction_rating = $1,
        satisfaction_feedback = $2,
        updated_at = NOW()
       WHERE id = $3`,
      [rating, feedback || null, id]
    );

    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('Rate ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// DEVICES (NinjaRMM Integration)
// ========================================================================

// Get devices for the customer's organization
router.get('/devices', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    // Check permission
    const contactResult = await pool.query(
      'SELECT can_view_devices FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    if (!contactResult.rows[0]?.can_view_devices) {
      return res.status(403).json({ error: 'No permission to view devices' });
    }

    // Get customer's NinjaRMM organization ID
    const customerResult = await pool.query(
      'SELECT user_id, ninjarmm_organization_id FROM customers WHERE id = $1',
      [req.customerId]
    );

    const customer = customerResult.rows[0];
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.ninjarmm_organization_id) {
      return res.json({ success: true, data: [], message: 'No NinjaRMM organization linked' });
    }

    // Get devices for this organization
    const devicesResult = await pool.query(
      `SELECT d.id, d.ninja_device_id, d.ninja_id, d.display_name, d.system_name, d.dns_name,
              d.node_class, d.os_name, d.last_contact, d.last_logged_in_user,
              d.public_ip, d.private_ip, d.offline, d.notes, d.manufacturer, d.model, d.serial_number,
              d.device_data,
              (SELECT COUNT(*) FROM ninjarmm_alerts a WHERE a.device_id = d.id AND a.resolved = false) as open_alerts
       FROM ninjarmm_devices d
       WHERE d.user_id = $1 AND d.organization_id = $2
       ORDER BY d.offline ASC, d.display_name ASC`,
      [customer.user_id, customer.ninjarmm_organization_id]
    );

    const devices = devicesResult.rows.map(row => {
      // Parse device_data JSON for additional fields
      let deviceData: any = {};
      try {
        deviceData = typeof row.device_data === 'string' ? JSON.parse(row.device_data) : (row.device_data || {});
      } catch (e) {
        console.error('Failed to parse device_data:', e);
      }

      // Extract OS details from device_data
      const osInfo = deviceData.os || {};
      const systemInfo = deviceData.system || {};
      const processorInfo = deviceData.processor || (deviceData.processors?.[0]) || {};
      const memoryInfo = deviceData.memory || {};

      // Build full OS version string
      let osVersion = osInfo.name || row.os_name || '';
      if (osInfo.buildNumber) {
        osVersion = `${osVersion} (Build ${osInfo.buildNumber})`;
      }

      // Get last boot time (various possible field names from NinjaRMM)
      const lastBoot = deviceData.lastBoot || deviceData.lastReboot ||
                       deviceData.system?.lastBoot || deviceData.os?.lastBootTime || null;

      return {
        id: row.id,
        ninjaId: row.ninja_id,
        displayName: row.display_name || row.system_name || row.dns_name,
        systemName: row.system_name,
        deviceType: row.node_class,
        osName: row.os_name,
        osVersion: osVersion,
        osBuild: osInfo.buildNumber || null,
        osArchitecture: osInfo.architecture || null,
        lastBoot: lastBoot,
        lastContact: row.last_contact,
        lastLoggedInUser: row.last_logged_in_user,
        publicIp: row.public_ip,
        privateIp: row.private_ip,
        offline: row.offline,
        notes: row.notes,
        manufacturer: row.manufacturer || systemInfo.manufacturer,
        model: row.model || systemInfo.model,
        serialNumber: row.serial_number || systemInfo.serialNumber || systemInfo.biosSerialNumber,
        // Additional hardware info
        processorName: processorInfo.name || null,
        processorCores: processorInfo.cores || null,
        memoryGb: memoryInfo.capacity ? Math.round(memoryInfo.capacity / (1024 * 1024 * 1024)) : null,
        openAlerts: parseInt(row.open_alerts) || 0,
      };
    });

    res.json({ success: true, data: devices });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alerts for a specific device
router.get('/devices/:deviceId/alerts', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    // Check permission
    const contactResult = await pool.query(
      'SELECT can_view_devices FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    if (!contactResult.rows[0]?.can_view_devices) {
      return res.status(403).json({ error: 'No permission to view devices' });
    }

    const { deviceId } = req.params;

    // Verify the device belongs to this customer's organization
    const customerResult = await pool.query(
      'SELECT user_id, ninjarmm_organization_id FROM customers WHERE id = $1',
      [req.customerId]
    );

    const customer = customerResult.rows[0];
    if (!customer?.ninjarmm_organization_id) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Get device and verify ownership
    const deviceResult = await pool.query(
      `SELECT id FROM ninjarmm_devices
       WHERE id = $1 AND user_id = $2 AND organization_id = $3`,
      [deviceId, customer.user_id, customer.ninjarmm_organization_id]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Get recent alerts for this device (last 30 days, max 20)
    const alertsResult = await pool.query(
      `SELECT id, severity, priority, message, source_type, source_name,
              activity_time, created_at, resolved, resolved_at, status
       FROM ninjarmm_alerts
       WHERE device_id = $1 AND user_id = $2
         AND (activity_time > NOW() - INTERVAL '30 days' OR resolved = false)
       ORDER BY resolved ASC, activity_time DESC
       LIMIT 20`,
      [deviceId, customer.user_id]
    );

    const alerts = alertsResult.rows.map(row => ({
      id: row.id,
      severity: row.severity,
      priority: row.priority,
      message: row.message,
      sourceType: row.source_type,
      sourceName: row.source_name,
      activityTime: row.activity_time,
      createdAt: row.created_at,
      resolved: row.resolved,
      resolvedAt: row.resolved_at,
      status: row.status,
    }));

    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Get device alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// INVOICES & QUOTES (sevDesk Integration)
// ========================================================================

// Get invoices for the customer
router.get('/invoices', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    // Check permission
    const contactResult = await pool.query(
      'SELECT can_view_invoices FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    if (!contactResult.rows[0]?.can_view_invoices) {
      return res.status(403).json({ error: 'No permission to view invoices' });
    }

    // Get customer's sevDesk customer ID
    const customerResult = await pool.query(
      'SELECT user_id, sevdesk_customer_id FROM customers WHERE id = $1',
      [req.customerId]
    );

    const customer = customerResult.rows[0];
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.sevdesk_customer_id) {
      return res.json({ success: true, data: [], message: 'No sevDesk customer linked' });
    }

    // Get sevDesk API token for the service provider
    const configResult = await pool.query(
      'SELECT api_token FROM sevdesk_config WHERE user_id = $1',
      [customer.user_id]
    );

    if (!configResult.rows[0]?.api_token) {
      return res.json({ success: true, data: [], message: 'sevDesk not configured' });
    }

    const apiToken = configResult.rows[0].api_token;

    // Fetch invoices from sevDesk API
    const response = await fetch(
      `https://my.sevdesk.de/api/v1/Invoice?contact[id]=${customer.sevdesk_customer_id}&contact[objectName]=Contact&embed=positions&limit=50`,
      {
        headers: {
          'Authorization': apiToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('sevDesk API error:', response.status, await response.text());
      return res.json({ success: true, data: [], message: 'Could not fetch invoices' });
    }

    const data = await response.json() as { objects?: any[] };
    const invoices = (data.objects || []).map((inv: any) => {
      const totalNet = parseFloat(inv.sumNet || 0);
      const totalGross = parseFloat(inv.sumGross || 0);
      const sumTax = parseFloat(inv.sumTax || 0);
      // Calculate tax rate from net and tax amounts
      const taxRate = totalNet > 0 ? Math.round((sumTax / totalNet) * 100) : 19;

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        deliveryDate: inv.deliveryDate,
        status: parseInt(inv.status), // 100=Draft, 200=Delivered, 1000=Paid
        totalNet,
        totalGross,
        taxRate,
        currency: inv.currency || 'EUR',
        payDate: inv.payDate || null,
        header: inv.header,
      };
    });

    res.json({ success: true, data: invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get quotes/offers for the customer
router.get('/quotes', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    // Check permission
    const contactResult = await pool.query(
      'SELECT can_view_quotes FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    if (!contactResult.rows[0]?.can_view_quotes) {
      return res.status(403).json({ error: 'No permission to view quotes' });
    }

    // Get customer's sevDesk customer ID
    const customerResult = await pool.query(
      'SELECT user_id, sevdesk_customer_id FROM customers WHERE id = $1',
      [req.customerId]
    );

    const customer = customerResult.rows[0];
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.sevdesk_customer_id) {
      return res.json({ success: true, data: [], message: 'No sevDesk customer linked' });
    }

    // Get sevDesk API token for the service provider
    const configResult = await pool.query(
      'SELECT api_token FROM sevdesk_config WHERE user_id = $1',
      [customer.user_id]
    );

    if (!configResult.rows[0]?.api_token) {
      return res.json({ success: true, data: [], message: 'sevDesk not configured' });
    }

    const apiToken = configResult.rows[0].api_token;

    // Fetch quotes from sevDesk API (Order with status < 500 are quotes/offers)
    const response = await fetch(
      `https://my.sevdesk.de/api/v1/Order?contact[id]=${customer.sevdesk_customer_id}&contact[objectName]=Contact&embed=positions&limit=50`,
      {
        headers: {
          'Authorization': apiToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('sevDesk API error:', response.status, await response.text());
      return res.json({ success: true, data: [], message: 'Could not fetch quotes' });
    }

    const data = await response.json() as { objects?: any[] };
    const quotes = (data.objects || [])
      .filter((order: any) => parseInt(order.status) < 500) // Only quotes, not confirmed orders
      .map((quote: any) => {
        const totalNet = parseFloat(quote.sumNet || 0);
        const totalGross = parseFloat(quote.sumGross || 0);
        const sumTax = parseFloat(quote.sumTax || 0);
        // Calculate tax rate from net and tax amounts
        const taxRate = totalNet > 0 ? Math.round((sumTax / totalNet) * 100) : 19;

        return {
          id: quote.id,
          orderNumber: quote.orderNumber,
          orderDate: quote.orderDate,
          status: parseInt(quote.status), // 100=Draft, 200=Delivered, 300=Accepted
          totalNet,
          totalGross,
          taxRate,
          currency: quote.currency || 'EUR',
          header: quote.header,
          validUntil: quote.deliveryDate,
        };
      });

    res.json({ success: true, data: quotes });
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// MFA (Two-Factor Authentication)
// ========================================================================

// Verify MFA code during login
router.post('/mfa/verify', async (req, res) => {
  try {
    const { mfaToken, code, trustDevice } = req.body;

    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'MFA token and code required' });
    }

    // Verify the MFA token
    let decoded;
    try {
      decoded = jwt.verify(mfaToken, process.env.JWT_SECRET!) as {
        contactId: string;
        customerId: string;
        userId: string;
        mfaPending: boolean;
      };
    } catch {
      return res.status(401).json({ error: 'MFA session expired. Please login again.' });
    }

    if (!decoded.mfaPending) {
      return res.status(400).json({ error: 'Invalid MFA token' });
    }

    // Get contact's MFA secret
    const contactResult = await pool.query(
      `SELECT cc.*, c.name as customer_name FROM customer_contacts cc
       JOIN customers c ON cc.customer_id = c.id
       WHERE cc.id = $1`,
      [decoded.contactId]
    );

    const contact = contactResult.rows[0];
    if (!contact || !contact.mfa_secret) {
      return res.status(400).json({ error: 'MFA not configured' });
    }

    // Try TOTP code first
    let isValid = authenticator.verify({
      token: code,
      secret: contact.mfa_secret
    });

    // If TOTP fails, try recovery code
    if (!isValid && code.length === 8) {
      const recoveryCodes = contact.mfa_recovery_codes ? JSON.parse(contact.mfa_recovery_codes) : [];
      for (let i = 0; i < recoveryCodes.length; i++) {
        const match = await bcrypt.compare(code.toUpperCase(), recoveryCodes[i]);
        if (match) {
          recoveryCodes.splice(i, 1);
          await pool.query(
            'UPDATE customer_contacts SET mfa_recovery_codes = $1 WHERE id = $2',
            [JSON.stringify(recoveryCodes), decoded.contactId]
          );
          isValid = true;
          break;
        }
      }
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];

    // Log successful login
    securityService.logSuccessfulLogin(clientIP, `portal:${contact.email}`, contact.id);

    // Update last login
    await pool.query('UPDATE customer_contacts SET last_login = NOW() WHERE id = $1', [contact.id]);

    // Create trusted device if requested
    let deviceToken: string | undefined;
    if (trustDevice) {
      deviceToken = await createPortalTrustedDevice(decoded.contactId, userAgent, clientIP);
    }

    // Generate full session token
    const token = jwt.sign(
      {
        contactId: contact.id,
        customerId: contact.customer_id,
        userId: decoded.userId,
        type: 'customer_portal',
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      deviceToken,
      contact: {
        id: contact.id,
        customerId: contact.customer_id,
        customerName: contact.customer_name,
        userId: decoded.userId,
        name: contact.name,
        email: contact.email,
        canCreateTickets: contact.can_create_tickets,
        canViewAllTickets: contact.can_view_all_tickets,
        canViewDevices: contact.can_view_devices ?? false,
        canViewInvoices: contact.can_view_invoices ?? false,
        canViewQuotes: contact.can_view_quotes ?? false,
      },
    });
  } catch (error) {
    console.error('Portal MFA verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get MFA status
router.get('/mfa/status', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT mfa_enabled FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    res.json({ enabled: result.rows[0]?.mfa_enabled ?? false });
  } catch (error) {
    console.error('Get MFA status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Setup MFA
router.post('/mfa/setup', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const contactResult = await pool.query(
      'SELECT email, mfa_enabled FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    const contact = contactResult.rows[0];
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact.mfa_enabled) {
      return res.status(400).json({ error: 'MFA already enabled' });
    }

    // Generate new secret
    const secret = authenticator.generateSecret();

    // Store temporarily (not enabled yet)
    await pool.query(
      'UPDATE customer_contacts SET mfa_secret = $1 WHERE id = $2',
      [secret, req.contactId]
    );

    // Generate QR code
    const otpauth = authenticator.keyuri(contact.email, 'Kundenportal', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    // Generate recovery codes
    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
    );

    res.json({
      secret,
      qrCode,
      recoveryCodes,
      manualEntryKey: secret
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify setup and enable MFA
router.post('/mfa/verify-setup', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    const contactResult = await pool.query(
      'SELECT mfa_secret, mfa_enabled FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    const contact = contactResult.rows[0];
    if (!contact?.mfa_secret) {
      return res.status(400).json({ error: 'MFA setup not started' });
    }

    if (contact.mfa_enabled) {
      return res.status(400).json({ error: 'MFA already enabled' });
    }

    const isValid = authenticator.verify({
      token: code,
      secret: contact.mfa_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate and store recovery codes
    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
    );

    const hashedCodes = await Promise.all(
      recoveryCodes.map(code => bcrypt.hash(code, 10))
    );

    await pool.query(
      'UPDATE customer_contacts SET mfa_enabled = true, mfa_recovery_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), req.contactId]
    );

    res.json({ success: true, message: 'MFA enabled successfully' });
  } catch (error) {
    console.error('MFA verify setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disable MFA
router.post('/mfa/disable', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { password, code } = req.body;

    if (!password || !code) {
      return res.status(400).json({ error: 'Password and code required' });
    }

    const contactResult = await pool.query(
      'SELECT password_hash, mfa_secret, mfa_enabled FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    const contact = contactResult.rows[0];
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contact.mfa_enabled) {
      return res.status(400).json({ error: 'MFA not enabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, contact.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Verify TOTP code
    const isValid = authenticator.verify({
      token: code,
      secret: contact.mfa_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Disable MFA and remove all trusted devices
    await pool.query(
      'UPDATE customer_contacts SET mfa_enabled = false, mfa_secret = NULL, mfa_recovery_codes = NULL WHERE id = $1',
      [req.contactId]
    );

    await pool.query(
      'DELETE FROM portal_trusted_devices WHERE contact_id = $1',
      [req.contactId]
    );

    res.json({ success: true, message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recovery codes count
router.get('/mfa/recovery-codes', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT mfa_recovery_codes FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    const codes = result.rows[0]?.mfa_recovery_codes;
    const remaining = codes ? JSON.parse(codes).length : 0;

    res.json({ remaining });
  } catch (error) {
    console.error('Get recovery codes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Regenerate recovery codes
router.post('/mfa/regenerate-recovery-codes', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { password, code } = req.body;

    const contactResult = await pool.query(
      'SELECT password_hash, mfa_secret, mfa_enabled FROM customer_contacts WHERE id = $1',
      [req.contactId]
    );

    const contact = contactResult.rows[0];
    if (!contact?.mfa_enabled) {
      return res.status(400).json({ error: 'MFA not enabled' });
    }

    const validPassword = await bcrypt.compare(password, contact.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const isValid = authenticator.verify({
      token: code,
      secret: contact.mfa_secret
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    const recoveryCodes = Array.from({ length: 8 }, () =>
      crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()
    );

    const hashedCodes = await Promise.all(
      recoveryCodes.map(code => bcrypt.hash(code, 10))
    );

    await pool.query(
      'UPDATE customer_contacts SET mfa_recovery_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), req.contactId]
    );

    res.json({ success: true, recoveryCodes });
  } catch (error) {
    console.error('Regenerate recovery codes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trusted devices
router.get('/mfa/trusted-devices', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, device_name, browser, os, ip_address, created_at, last_used_at, expires_at
       FROM portal_trusted_devices
       WHERE contact_id = $1 AND expires_at > NOW()
       ORDER BY last_used_at DESC`,
      [req.contactId]
    );

    res.json({
      devices: result.rows.map(row => ({
        id: row.id,
        deviceName: row.device_name,
        browser: row.browser,
        os: row.os,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at
      }))
    });
  } catch (error) {
    console.error('Get trusted devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove trusted device
router.delete('/mfa/trusted-devices/:id', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM portal_trusted_devices WHERE id = $1 AND contact_id = $2 RETURNING id',
      [id, req.contactId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove trusted device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove all trusted devices
router.delete('/mfa/trusted-devices', authenticateCustomerToken, async (req: CustomerAuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'DELETE FROM portal_trusted_devices WHERE contact_id = $1',
      [req.contactId]
    );

    res.json({ success: true, count: result.rowCount });
  } catch (error) {
    console.error('Remove all trusted devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
