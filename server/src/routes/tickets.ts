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

    console.log(`📋 Fetching tickets for user_id: ${userId}`);

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
    console.log(`📋 Found ${result.rows.length} tickets for user_id: ${userId}`);
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

    // Log activity
    await logTicketActivity(id, userId, null, 'created', null, null, { ticketNumber, title, priority });

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

    // Get current ticket values for activity logging
    const currentTicket = await query(
      'SELECT status, priority, title, description, assigned_to_user_id FROM tickets WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (currentTicket.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const oldValues = currentTicket.rows[0];

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

    // Log activities for each change
    if (status !== undefined && status !== oldValues.status) {
      let actionType = 'status_changed';
      if (status === 'resolved') actionType = 'resolved';
      else if (status === 'closed') actionType = 'closed';
      else if (status === 'archived') actionType = 'archived';
      else if (oldValues.status === 'closed' || oldValues.status === 'resolved') actionType = 'reopened';
      await logTicketActivity(id, userId, null, actionType, oldValues.status, status);
    }
    if (priority !== undefined && priority !== oldValues.priority) {
      await logTicketActivity(id, userId, null, 'priority_changed', oldValues.priority, priority);
    }
    if (title !== undefined && title !== oldValues.title) {
      await logTicketActivity(id, userId, null, 'title_changed', oldValues.title, title);
    }
    if (description !== undefined && description !== oldValues.description) {
      await logTicketActivity(id, userId, null, 'description_changed', null, null);
    }
    if (assignedToUserId !== undefined && assignedToUserId !== oldValues.assigned_to_user_id) {
      if (assignedToUserId) {
        await logTicketActivity(id, userId, null, 'assigned', oldValues.assigned_to_user_id, assignedToUserId);
      } else {
        await logTicketActivity(id, userId, null, 'unassigned', oldValues.assigned_to_user_id, null);
      }
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
// DEBUG ROUTE - Check ticket ownership
// ============================================================================

// GET /api/tickets/debug - Debug endpoint to check ticket data
router.get('/debug/check', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    console.log(`🔍 Debug check for user_id: ${userId}`);

    // Get user info
    const userResult = await query('SELECT id, username FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Get all customers for this user
    const customersResult = await query('SELECT id, name, user_id FROM customers WHERE user_id = $1', [userId]);

    // Get all tickets (without user filter) to see what's there
    const allTicketsResult = await query(`
      SELECT t.id, t.ticket_number, t.user_id, t.customer_id, t.title, c.name as customer_name
      FROM tickets t
      LEFT JOIN customers c ON t.customer_id = c.id
      ORDER BY t.created_at DESC
      LIMIT 20
    `);

    // Get tickets for this user
    const userTicketsResult = await query(`
      SELECT t.id, t.ticket_number, t.user_id, t.customer_id, t.title
      FROM tickets t
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      debug: {
        currentUser: user,
        customersCount: customersResult.rows.length,
        customers: customersResult.rows.map(c => ({ id: c.id, name: c.name, userId: c.user_id })),
        allTicketsCount: allTicketsResult.rowCount,
        allTickets: allTicketsResult.rows.map(t => ({
          id: t.id,
          ticketNumber: t.ticket_number,
          userId: t.user_id,
          customerId: t.customer_id,
          customerName: t.customer_name,
          title: t.title,
          matchesCurrentUser: t.user_id === userId
        })),
        userTicketsCount: userTicketsResult.rowCount,
      }
    });
  } catch (error) {
    console.error('Debug check error:', error);
    res.status(500).json({ success: false, error: 'Debug check failed' });
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

// ============================================================================
// CANNED RESPONSES (Textbausteine) ROUTES
// ============================================================================

// GET /api/tickets/canned-responses - Get all canned responses for user
router.get('/canned-responses/list', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { category } = req.query;

    let queryText = `
      SELECT * FROM canned_responses
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (category) {
      queryText += ' AND category = $2';
      params.push(category);
    }

    queryText += ' ORDER BY usage_count DESC, title ASC';

    const result = await query(queryText, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching canned responses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch canned responses' });
  }
});

// POST /api/tickets/canned-responses - Create canned response
router.post('/canned-responses', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { title, content, shortcut, category } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO canned_responses (id, user_id, title, content, shortcut, category)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, userId, title, content, shortcut || null, category || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to create canned response' });
  }
});

// PUT /api/tickets/canned-responses/:id - Update canned response
router.put('/canned-responses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { title, content, shortcut, category } = req.body;

    const result = await query(`
      UPDATE canned_responses
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          shortcut = $3,
          category = $4,
          updated_at = NOW()
      WHERE id = $5 AND user_id = $6
      RETURNING *
    `, [title, content, shortcut || null, category || null, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to update canned response' });
  }
});

// DELETE /api/tickets/canned-responses/:id - Delete canned response
router.delete('/canned-responses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM canned_responses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, message: 'Canned response deleted' });
  } catch (error) {
    console.error('Error deleting canned response:', error);
    res.status(500).json({ success: false, error: 'Failed to delete canned response' });
  }
});

// POST /api/tickets/canned-responses/:id/use - Increment usage count
router.post('/canned-responses/:id/use', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const result = await query(`
      UPDATE canned_responses
      SET usage_count = usage_count + 1
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Canned response not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating canned response usage:', error);
    res.status(500).json({ success: false, error: 'Failed to update usage count' });
  }
});

// ============================================================================
// TICKET TAGS ROUTES
// ============================================================================

// GET /api/tickets/tags/list - Get all tags for user
router.get('/tags/list', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const result = await query(`
      SELECT t.*, COUNT(tta.ticket_id) as ticket_count
      FROM ticket_tags t
      LEFT JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE t.user_id = $1
      GROUP BY t.id
      ORDER BY t.name ASC
    `, [userId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
});

// POST /api/tickets/tags - Create tag
router.post('/tags', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name, color = '#6b7280' } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO ticket_tags (id, user_id, name, color)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, userId, name.trim(), color]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Tag with this name already exists' });
    }
    console.error('Error creating tag:', error);
    res.status(500).json({ success: false, error: 'Failed to create tag' });
  }
});

// PUT /api/tickets/tags/:id - Update tag
router.put('/tags/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { name, color } = req.body;

    const result = await query(`
      UPDATE ticket_tags
      SET name = COALESCE($1, name),
          color = COALESCE($2, color)
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `, [name?.trim(), color, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Tag with this name already exists' });
    }
    console.error('Error updating tag:', error);
    res.status(500).json({ success: false, error: 'Failed to update tag' });
  }
});

// DELETE /api/tickets/tags/:id - Delete tag
router.delete('/tags/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM ticket_tags WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    res.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ success: false, error: 'Failed to delete tag' });
  }
});

// GET /api/tickets/:ticketId/tags - Get tags for a ticket
router.get('/:ticketId/tags', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { ticketId } = req.params;

    // Verify ticket belongs to user
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
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
    console.error('Error fetching ticket tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket tags' });
  }
});

// POST /api/tickets/:ticketId/tags/:tagId - Add tag to ticket
router.post('/:ticketId/tags/:tagId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { ticketId, tagId } = req.params;

    // Verify ticket belongs to user
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Verify tag belongs to user
    const tagCheck = await query(
      'SELECT id FROM ticket_tags WHERE id = $1 AND user_id = $2',
      [tagId, userId]
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
    console.error('Error adding tag to ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to add tag to ticket' });
  }
});

// DELETE /api/tickets/:ticketId/tags/:tagId - Remove tag from ticket
router.delete('/:ticketId/tags/:tagId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { ticketId, tagId } = req.params;

    // Verify ticket belongs to user
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
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
    console.error('Error removing tag from ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to remove tag from ticket' });
  }
});

// ============================================================================
// TICKET ACTIVITIES ROUTES (Activity Timeline)
// ============================================================================

// Helper function to log ticket activities
async function logTicketActivity(
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
    console.error('Error logging ticket activity:', error);
    // Don't throw - activity logging should not break main operations
  }
}

// GET /api/tickets/:ticketId/activities - Get activity timeline for a ticket
router.get('/:ticketId/activities', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { ticketId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Verify ticket belongs to user
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const result = await query(`
      SELECT
        ta.*,
        COALESCE(u.display_name, u.username) as user_name,
        cc.name as contact_name
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
    console.error('Error fetching ticket activities:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket activities' });
  }
});

// ============================================================================
// TICKET SEARCH ROUTES
// ============================================================================

// GET /api/tickets/search - Search tickets by keyword
router.get('/search/query', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
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
      WHERE t.user_id = $1
        AND (
          LOWER(t.title) LIKE $2
          OR LOWER(t.description) LIKE $2
          OR LOWER(t.ticket_number) LIKE $2
          OR LOWER(c.name) LIKE $2
        )
    `;
    const params: any[] = [userId, searchTerm];
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
      WHERE t.user_id = $1
        AND LOWER(tc.content) LIKE $2
        AND t.id NOT IN (SELECT id FROM tickets WHERE user_id = $1 AND (
          LOWER(title) LIKE $2
          OR LOWER(description) LIKE $2
          OR LOWER(ticket_number) LIKE $2
        ))
      ORDER BY t.updated_at DESC
      LIMIT $3
    `, [userId, searchTerm, Number(limit)]);

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
      WHERE t.user_id = $1
        AND LOWER(tt.name) LIKE $2
      ORDER BY t.updated_at DESC
      LIMIT $3
    `, [userId, searchTerm, Number(limit)]);

    // Add tag results if not already in list
    const existingIds = new Set(allTickets.map(t => t.id));
    tagSearchResult.rows.forEach(row => {
      if (!existingIds.has(row.id)) {
        allTickets.push(row);
      }
    });

    res.json({ success: true, data: allTickets.map(transformTicket) });
  } catch (error) {
    console.error('Error searching tickets:', error);
    res.status(500).json({ success: false, error: 'Failed to search tickets' });
  }
});

export default router;
