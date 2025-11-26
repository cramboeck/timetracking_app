import express from 'express';
import crypto from 'crypto';
import { query, getClient } from '../config/database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Helper function to generate ticket number
async function generateTicketNumber(userId: string): Promise<string> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get or create sequence for user
    const result = await client.query(
      `INSERT INTO ticket_sequences (user_id, last_number)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO UPDATE SET last_number = ticket_sequences.last_number + 1
       RETURNING last_number`,
      [userId]
    );

    // If it was an insert, we need to increment
    let number = result.rows[0].last_number;
    if (number === 0) {
      const updateResult = await client.query(
        'UPDATE ticket_sequences SET last_number = 1 WHERE user_id = $1 RETURNING last_number',
        [userId]
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
    assignedToUserId: row.assigned_to_user_id,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    resolvedAt: row.resolved_at?.toISOString(),
    closedAt: row.closed_at?.toISOString(),
    // Include related data if joined
    customerName: row.customer_name,
    projectName: row.project_name,
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

// GET /api/tickets - Get all tickets for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { status, customerId, priority } = req.query;

    let queryText = `
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (customerId) {
      queryText += ` AND t.customer_id = $${paramIndex}`;
      params.push(customerId);
      paramIndex++;
    }

    if (priority) {
      queryText += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    queryText += ' ORDER BY t.created_at DESC';

    const result = await query(queryText, params);
    res.json({ success: true, data: result.rows.map(transformTicket) });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
});

// GET /api/tickets/stats - Get ticket statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

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
      WHERE user_id = $1
    `, [userId]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket stats' });
  }
});

// GET /api/tickets/:id - Get single ticket with comments
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Get ticket
    const ticketResult = await query(`
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND t.user_id = $2
    `, [id, userId]);

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

    res.json({
      success: true,
      data: {
        ...ticket,
        comments: commentsResult.rows.map(transformComment),
        timeEntries: timeEntriesResult.rows,
      }
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
  }
});

// POST /api/tickets - Create new ticket
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { customerId, projectId, title, description, priority = 'normal' } = req.body;

    if (!customerId || !title) {
      return res.status(400).json({ success: false, error: 'Customer and title are required' });
    }

    const id = crypto.randomUUID();
    const ticketNumber = await generateTicketNumber(userId);

    const result = await query(`
      INSERT INTO tickets (id, ticket_number, user_id, customer_id, project_id, title, description, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
      RETURNING *
    `, [id, ticketNumber, userId, customerId, projectId || null, title, description || '', priority]);

    // Get with joined data
    const ticketResult = await query(`
      SELECT t.*, c.name as customer_name, p.name as project_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);

    res.status(201).json({ success: true, data: transformTicket(ticketResult.rows[0]) });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to create ticket' });
  }
});

// PUT /api/tickets/:id - Update ticket
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { customerId, projectId, title, description, status, priority, assignedToUserId } = req.body;

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
      updates.push(`assigned_to_user_id = $${paramIndex}`);
      params.push(assignedToUserId || null);
      paramIndex++;
    }

    params.push(id, userId);

    const result = await query(`
      UPDATE tickets SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
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
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to update ticket' });
  }
});

// DELETE /api/tickets/:id - Delete ticket
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM tickets WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to delete ticket' });
  }
});

// ============================================================================
// TICKET COMMENT ROUTES
// ============================================================================

// POST /api/tickets/:id/comments - Add comment to ticket
router.post('/:id/comments', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id: ticketId } = req.params;
    const { content, isInternal = false } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    // Verify ticket belongs to user
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const commentId = crypto.randomUUID();

    await query(`
      INSERT INTO ticket_comments (id, ticket_id, user_id, is_internal, content)
      VALUES ($1, $2, $3, $4, $5)
    `, [commentId, ticketId, userId, isInternal, content]);

    // Update ticket's updated_at
    await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    // Get comment with author info
    const result = await query(`
      SELECT tc.*, COALESCE(u.display_name, u.username) as author_name
      FROM ticket_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.id = $1
    `, [commentId]);

    res.status(201).json({ success: true, data: transformComment(result.rows[0]) });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, error: 'Failed to add comment' });
  }
});

// ============================================================================
// CUSTOMER CONTACTS ROUTES (for managing portal access)
// ============================================================================

// GET /api/tickets/contacts/:customerId - Get contacts for a customer
router.get('/contacts/:customerId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { customerId } = req.params;

    // Verify customer belongs to user
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND user_id = $2',
      [customerId, userId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const result = await query(`
      SELECT id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets, last_login, created_at
      FROM customer_contacts
      WHERE customer_id = $1
      ORDER BY is_primary DESC, name ASC
    `, [customerId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

// POST /api/tickets/contacts - Create customer contact
router.post('/contacts', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { customerId, name, email, canCreateTickets = true, canViewAllTickets = false } = req.body;

    if (!customerId || !name || !email) {
      return res.status(400).json({ success: false, error: 'Customer ID, name and email are required' });
    }

    // Verify customer belongs to user
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND user_id = $2',
      [customerId, userId]
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
      INSERT INTO customer_contacts (id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets, created_at
    `, [id, customerId, name, email, isPrimary, canCreateTickets, canViewAllTickets]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ success: false, error: 'Email already exists for this customer' });
    }
    console.error('Error creating contact:', error);
    res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

export default router;
