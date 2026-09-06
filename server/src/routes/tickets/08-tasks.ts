/**
 * Ticket-Aufgaben (CRUD, Reorder)
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import crypto from 'crypto';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../../middleware/organization';
import { auditLog } from '../../services/auditLog';
import { logger } from '../../utils/logger';
import {
  ticketTaskSchema,
  updateTicketTaskSchema,
  reorderTasksSchema,
  TICKET_TASK_COLUMNS,
  logTicketActivity,
  transformTask,
} from './shared';

const router = express.Router();

// ============================================================================
// TICKET TASKS ROUTES
// ============================================================================


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

// PUT /api/tickets/:ticketId/tasks/reorder - Reorder tasks (requires member role).
// MUSS vor PUT /:ticketId/tasks/:taskId registriert sein, sonst matcht Express
// 'reorder' als Task-ID und das Drag&Drop-Sortieren der Tasks schlägt fehl.
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
