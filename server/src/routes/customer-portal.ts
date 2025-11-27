import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { pool } from '../config/database';
import { authLimiter } from '../middleware/rateLimiter';
import { CustomerAuthRequest, authenticateCustomerToken } from '../middleware/customerAuth';
import { upload, getFileUrl, deleteFile } from '../middleware/upload';
import { z } from 'zod';

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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!contact.password_hash) {
      return res.status(401).json({ error: 'Account not activated. Please contact support.' });
    }

    const validPassword = await bcrypt.compare(password, contact.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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

    // Get the customer's service provider user_id
    const customerResult = await pool.query(
      'SELECT user_id, name FROM customers WHERE id = $1',
      [req.customerId]
    );
    const userId = customerResult.rows[0]?.user_id;
    const customerName = customerResult.rows[0]?.name;

    console.log(`🎫 Creating ticket for customer "${customerName}" (${req.customerId}), service provider user_id: ${userId}`);

    if (!userId) {
      console.error(`❌ Customer ${req.customerId} not found or has no user_id`);
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get or create ticket sequence
    await pool.query(
      'INSERT INTO ticket_sequences (user_id, last_number) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );

    // Increment and get next ticket number
    const seqResult = await pool.query(
      'UPDATE ticket_sequences SET last_number = last_number + 1 WHERE user_id = $1 RETURNING last_number',
      [userId]
    );
    const ticketNumber = `TKT-${String(seqResult.rows[0].last_number).padStart(6, '0')}`;

    // Create ticket
    const ticketId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tickets (id, ticket_number, user_id, customer_id, created_by_contact_id, title, description, status, priority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, NOW(), NOW())`,
      [ticketId, ticketNumber, userId, req.customerId, req.contactId, title, description || null, priority]
    );

    console.log(`✅ Ticket ${ticketNumber} created with id=${ticketId}, user_id=${userId}, customer_id=${req.customerId}`);

    // Get created ticket
    const ticketResult = await pool.query(
      `SELECT t.*, c.name as customer_name
       FROM tickets t
       JOIN customers c ON t.customer_id = c.id
       WHERE t.id = $1`,
      [ticketId]
    );

    const ticket = ticketResult.rows[0];

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

    // Get created comment with contact name
    const commentResult = await pool.query(
      `SELECT tc.*, cc.name as contact_name
       FROM ticket_comments tc
       JOIN customer_contacts cc ON tc.customer_contact_id = cc.id
       WHERE tc.id = $1`,
      [commentId]
    );

    const comment = commentResult.rows[0];

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

export default router;
