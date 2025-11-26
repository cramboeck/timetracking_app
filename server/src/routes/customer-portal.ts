import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { authLimiter } from '../middleware/rateLimiter';
import { CustomerAuthRequest, authenticateCustomerToken } from '../middleware/customerAuth';
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
      `SELECT cc.*, c.name as customer_name
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

export default router;
