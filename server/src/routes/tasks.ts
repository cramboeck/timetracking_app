import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import crypto from 'crypto';

const router = Router();

// Validation schemas
const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  ticketId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  reminderAt: z.string().optional().nullable(),
  estimatedMinutes: z.number().int().min(0).optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrencePattern: z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']).optional().nullable(),
  recurrenceInterval: z.number().int().min(1).optional(),
  recurrenceDays: z.array(z.string()).optional().nullable(),
  recurrenceEndDate: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  checklistItems: z.array(z.object({
    title: z.string().min(1),
    completed: z.boolean().optional(),
  })).optional(),
});

const updateTaskSchema = createTaskSchema.partial();

const createChecklistItemSchema = z.object({
  title: z.string().min(1).max(500),
});

// Helper function to transform task row
function transformTask(row: any) {
  const task = transformRow(row);
  return task;
}

// GET /api/tasks - Get all tasks for organization with filters
router.get('/', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const userId = req.userId!;
    const organizationId = orgReq.organization.id;
    const {
      status,
      priority,
      assignedTo,
      customerId,
      projectId,
      ticketId,
      view, // 'my', 'all', 'today', 'week', 'overdue'
      includeCompleted,
    } = req.query;

    let query = `
      SELECT t.*,
             u.username as assigned_to_name,
             u.display_name as assigned_to_display_name,
             cb.username as created_by_name,
             c.name as customer_name,
             p.name as project_name,
             tk.ticket_number,
             tk.title as ticket_title,
             (SELECT COUNT(*) FROM task_checklist_items WHERE task_id = t.id) as checklist_count,
             (SELECT COUNT(*) FROM task_checklist_items WHERE task_id = t.id AND completed = true) as checklist_completed,
             (SELECT COALESCE(SUM(duration), 0) FROM time_entries WHERE task_id = t.id) as total_tracked_time
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cb ON t.created_by = cb.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tickets tk ON t.ticket_id = tk.id
      WHERE t.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramCount = 2;

    // View-based filters
    if (view === 'my') {
      query += ` AND t.assigned_to = $${paramCount++}`;
      params.push(userId);
    } else if (view === 'today') {
      query += ` AND DATE(t.due_date) = CURRENT_DATE`;
    } else if (view === 'week') {
      query += ` AND t.due_date >= CURRENT_DATE AND t.due_date < CURRENT_DATE + INTERVAL '7 days'`;
    } else if (view === 'overdue') {
      query += ` AND t.due_date < CURRENT_DATE AND t.status NOT IN ('completed', 'cancelled')`;
    }

    // Additional filters
    if (status) {
      query += ` AND t.status = $${paramCount++}`;
      params.push(status);
    } else if (includeCompleted !== 'true') {
      query += ` AND t.status NOT IN ('completed', 'cancelled')`;
    }

    if (priority) {
      query += ` AND t.priority = $${paramCount++}`;
      params.push(priority);
    }
    if (assignedTo) {
      query += ` AND t.assigned_to = $${paramCount++}`;
      params.push(assignedTo);
    }
    if (customerId) {
      query += ` AND t.customer_id = $${paramCount++}`;
      params.push(customerId);
    }
    if (projectId) {
      query += ` AND t.project_id = $${paramCount++}`;
      params.push(projectId);
    }
    if (ticketId) {
      query += ` AND t.ticket_id = $${paramCount++}`;
      params.push(ticketId);
    }

    // Order by priority and due date
    query += ` ORDER BY
      CASE t.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
    `;

    const result = await pool.query(query, params);
    const tasks = result.rows.map(transformTask);

    res.json({ success: true, data: tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/dashboard - Get task statistics for dashboard
router.get('/dashboard', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const userId = req.userId!;
    const organizationId = orgReq.organization.id;

    // Get counts by status
    const statusCounts = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM tasks
      WHERE organization_id = $1 AND status NOT IN ('cancelled')
      GROUP BY status
    `, [organizationId]);

    // Get my tasks counts
    const myTasksCounts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as my_pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as my_in_progress,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')) as my_overdue,
        COUNT(*) FILTER (WHERE DATE(due_date) = CURRENT_DATE AND status NOT IN ('completed', 'cancelled')) as my_today
      FROM tasks
      WHERE organization_id = $1 AND assigned_to = $2
    `, [organizationId, userId]);

    // Get overdue tasks
    const overdueTasks = await pool.query(`
      SELECT t.id, t.title, t.due_date, t.priority,
             c.name as customer_name
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.organization_id = $1
        AND t.assigned_to = $2
        AND t.due_date < CURRENT_DATE
        AND t.status NOT IN ('completed', 'cancelled')
      ORDER BY t.due_date ASC
      LIMIT 5
    `, [organizationId, userId]);

    // Get today's tasks
    const todayTasks = await pool.query(`
      SELECT t.id, t.title, t.due_date, t.due_time, t.priority, t.status,
             c.name as customer_name,
             (SELECT COALESCE(SUM(duration), 0) FROM time_entries WHERE task_id = t.id) as total_tracked_time
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.organization_id = $1
        AND t.assigned_to = $2
        AND DATE(t.due_date) = CURRENT_DATE
        AND t.status NOT IN ('cancelled')
      ORDER BY t.due_time ASC NULLS LAST, t.priority DESC
    `, [organizationId, userId]);

    // Get time tracking insights
    const timeInsights = await pool.query(`
      SELECT
        t.category,
        COUNT(*) as task_count,
        AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 60)::INTEGER as avg_completion_minutes,
        AVG(te.total_time)::INTEGER as avg_tracked_minutes
      FROM tasks t
      LEFT JOIN (
        SELECT task_id, SUM(duration) as total_time
        FROM time_entries
        WHERE task_id IS NOT NULL
        GROUP BY task_id
      ) te ON t.id = te.task_id
      WHERE t.organization_id = $1
        AND t.status = 'completed'
        AND t.completed_at IS NOT NULL
        AND t.category IS NOT NULL
      GROUP BY t.category
      ORDER BY task_count DESC
      LIMIT 10
    `, [organizationId]);

    res.json({
      success: true,
      data: {
        statusCounts: statusCounts.rows,
        myTasks: myTasksCounts.rows[0] || { my_pending: 0, my_in_progress: 0, my_overdue: 0, my_today: 0 },
        overdueTasks: overdueTasks.rows.map(transformTask),
        todayTasks: todayTasks.rows.map(transformTask),
        timeInsights: timeInsights.rows,
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/similar/:title - Get similar tasks for time estimation
router.get('/similar/:title', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { title } = req.params;
    const { category } = req.query;

    // Find similar completed tasks based on title keywords
    const keywords = title.toLowerCase().split(' ').filter((w: string) => w.length > 3);

    if (keywords.length === 0) {
      return res.json({ success: true, data: { suggestedMinutes: null, similarTasks: [] } });
    }

    // Build LIKE conditions for each keyword
    const likeConditions = keywords.map((_: string, i: number) => `LOWER(t.title) LIKE $${i + 2}`).join(' OR ');
    const params = [organizationId, ...keywords.map((k: string) => `%${k}%`)];

    let query = `
      SELECT t.id, t.title, t.category, t.estimated_minutes,
             EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 60 as actual_minutes,
             te.tracked_minutes
      FROM tasks t
      LEFT JOIN (
        SELECT task_id, SUM(duration) / 60 as tracked_minutes
        FROM time_entries
        WHERE task_id IS NOT NULL
        GROUP BY task_id
      ) te ON t.id = te.task_id
      WHERE t.organization_id = $1
        AND t.status = 'completed'
        AND (${likeConditions})
    `;

    if (category) {
      query += ` AND t.category = $${params.length + 1}`;
      params.push(category as string);
    }

    query += ' ORDER BY t.completed_at DESC LIMIT 10';

    const result = await pool.query(query, params);
    const similarTasks = result.rows.map(transformTask);

    // Calculate suggested time
    const timesWithData = similarTasks
      .map((t: any) => t.trackedMinutes || t.actualMinutes)
      .filter((t: number | null) => t && t > 0);

    const suggestedMinutes = timesWithData.length > 0
      ? Math.round(timesWithData.reduce((a: number, b: number) => a + b, 0) / timesWithData.length)
      : null;

    res.json({
      success: true,
      data: {
        suggestedMinutes,
        similarTasks,
        basedOnCount: timesWithData.length,
      }
    });
  } catch (error) {
    console.error('Get similar tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id - Get single task with details
router.get('/:id', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const taskResult = await pool.query(`
      SELECT t.*,
             u.username as assigned_to_name,
             u.display_name as assigned_to_display_name,
             cb.username as created_by_name,
             comp.username as completed_by_name,
             c.name as customer_name,
             p.name as project_name,
             tk.ticket_number,
             tk.title as ticket_title
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cb ON t.created_by = cb.id
      LEFT JOIN users comp ON t.completed_by = comp.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tickets tk ON t.ticket_id = tk.id
      WHERE t.id = $1 AND t.organization_id = $2
    `, [id, organizationId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = transformTask(taskResult.rows[0]);

    // Get checklist items
    const checklistResult = await pool.query(`
      SELECT * FROM task_checklist_items
      WHERE task_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `, [id]);

    // Get comments
    const commentsResult = await pool.query(`
      SELECT tc.*, u.username, u.display_name
      FROM task_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.task_id = $1
      ORDER BY tc.created_at DESC
    `, [id]);

    // Get time entries
    const timeEntriesResult = await pool.query(`
      SELECT te.*, p.name as project_name
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE te.task_id = $1
      ORDER BY te.start_time DESC
    `, [id]);

    // Get activity log
    const activityResult = await pool.query(`
      SELECT tal.*, u.username
      FROM task_activity_log tal
      LEFT JOIN users u ON tal.user_id = u.id
      WHERE tal.task_id = $1
      ORDER BY tal.created_at DESC
      LIMIT 50
    `, [id]);

    res.json({
      success: true,
      data: {
        ...task,
        checklistItems: transformRows(checklistResult.rows),
        comments: transformRows(commentsResult.rows),
        timeEntries: transformRows(timeEntriesResult.rows),
        activityLog: transformRows(activityResult.rows),
      }
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks - Create new task
router.post('/', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createTaskSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      title, description, status, priority, ticketId, projectId, customerId,
      assignedTo, dueDate, dueTime, reminderAt, estimatedMinutes,
      isRecurring, recurrencePattern, recurrenceInterval, recurrenceDays, recurrenceEndDate,
      category, tags, color, checklistItems
    } = req.body;

    const id = crypto.randomUUID();

    await pool.query(`
      INSERT INTO tasks (
        id, organization_id, title, description, status, priority,
        ticket_id, project_id, customer_id, assigned_to, created_by,
        due_date, due_time, reminder_at, estimated_minutes,
        is_recurring, recurrence_pattern, recurrence_interval, recurrence_days, recurrence_end_date,
        category, tags, color
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      )
    `, [
      id, organizationId, title, description || null, status || 'pending', priority || 'normal',
      ticketId || null, projectId || null, customerId || null, assignedTo || userId, userId,
      dueDate || null, dueTime || null, reminderAt || null, estimatedMinutes || null,
      isRecurring || false, recurrencePattern || null, recurrenceInterval || 1,
      recurrenceDays || null, recurrenceEndDate || null,
      category || null, tags || null, color || null
    ]);

    // Create checklist items if provided
    if (checklistItems && checklistItems.length > 0) {
      for (let i = 0; i < checklistItems.length; i++) {
        const item = checklistItems[i];
        await pool.query(`
          INSERT INTO task_checklist_items (id, task_id, title, completed, sort_order)
          VALUES ($1, $2, $3, $4, $5)
        `, [crypto.randomUUID(), id, item.title, item.completed || false, i]);
      }
    }

    // Log activity
    await pool.query(`
      INSERT INTO task_activity_log (id, task_id, user_id, action, details)
      VALUES ($1, $2, $3, 'created', $4)
    `, [crypto.randomUUID(), id, userId, JSON.stringify({ title })]);

    // Fetch created task
    const result = await pool.query(`
      SELECT t.*, u.username as assigned_to_name, c.name as customer_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.id = $1
    `, [id]);

    const newTask = transformTask(result.rows[0]);

    auditLog.log({
      userId,
      action: 'task.create',
      details: JSON.stringify({ id, title, organizationId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({ success: true, data: newTask });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateTaskSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    // Verify task belongs to organization
    const existingTask = await pool.query(
      'SELECT * FROM tasks WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (existingTask.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const oldTask = existingTask.rows[0];

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      status: 'status',
      priority: 'priority',
      ticketId: 'ticket_id',
      projectId: 'project_id',
      customerId: 'customer_id',
      assignedTo: 'assigned_to',
      dueDate: 'due_date',
      dueTime: 'due_time',
      reminderAt: 'reminder_at',
      estimatedMinutes: 'estimated_minutes',
      isRecurring: 'is_recurring',
      recurrencePattern: 'recurrence_pattern',
      recurrenceInterval: 'recurrence_interval',
      recurrenceDays: 'recurrence_days',
      recurrenceEndDate: 'recurrence_end_date',
      category: 'category',
      tags: 'tags',
      color: 'color',
      sortOrder: 'sort_order',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = $${paramCount++}`);
        values.push(updates[key]);
      }
    }

    // Handle status change - set completed_at and completed_by
    if (updates.status === 'completed' && oldTask.status !== 'completed') {
      fields.push(`completed_at = $${paramCount++}`);
      values.push(new Date().toISOString());
      fields.push(`completed_by = $${paramCount++}`);
      values.push(userId);

      // Log completion activity
      await pool.query(`
        INSERT INTO task_activity_log (id, task_id, user_id, action, old_value, new_value)
        VALUES ($1, $2, $3, 'status_changed', $4, $5)
      `, [crypto.randomUUID(), id, userId, oldTask.status, 'completed']);

      // Create next recurring task if applicable
      if (oldTask.is_recurring && oldTask.recurrence_pattern) {
        await createNextRecurringTask(oldTask, organizationId, userId);
      }
    } else if (updates.status && updates.status !== 'completed' && oldTask.status === 'completed') {
      // Reopening task
      fields.push(`completed_at = $${paramCount++}`);
      values.push(null);
      fields.push(`completed_by = $${paramCount++}`);
      values.push(null);

      await pool.query(`
        INSERT INTO task_activity_log (id, task_id, user_id, action, old_value, new_value)
        VALUES ($1, $2, $3, 'status_changed', $4, $5)
      `, [crypto.randomUUID(), id, userId, 'completed', updates.status]);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = $${paramCount++}`);
    values.push(new Date().toISOString());

    values.push(id);
    const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    // Fetch updated task
    const result = await pool.query(`
      SELECT t.*, u.username as assigned_to_name, c.name as customer_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.id = $1
    `, [id]);

    const updatedTask = transformTask(result.rows[0]);

    auditLog.log({
      userId,
      action: 'task.update',
      details: JSON.stringify({ id, updates }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND organization_id = $2 RETURNING title',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    auditLog.log({
      userId,
      action: 'task.delete',
      details: JSON.stringify({ id, title: result.rows[0].title }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/checklist - Add checklist item
router.post('/:id/checklist', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createChecklistItemSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: taskId } = req.params;
    const { title } = req.body;

    // Verify task belongs to organization
    const taskCheck = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND organization_id = $2',
      [taskId, organizationId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get next sort order
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM task_checklist_items WHERE task_id = $1',
      [taskId]
    );

    const itemId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO task_checklist_items (id, task_id, title, sort_order)
      VALUES ($1, $2, $3, $4)
    `, [itemId, taskId, title, orderResult.rows[0].next_order]);

    const result = await pool.query(
      'SELECT * FROM task_checklist_items WHERE id = $1',
      [itemId]
    );

    res.status(201).json({ success: true, data: transformRow(result.rows[0]) });
  } catch (error) {
    console.error('Add checklist item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:taskId/checklist/:itemId - Update checklist item
router.put('/:taskId/checklist/:itemId', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { taskId, itemId } = req.params;
    const { title, completed } = req.body;

    // Verify task belongs to organization
    const taskCheck = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND organization_id = $2',
      [taskId, organizationId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(title);
    }
    if (completed !== undefined) {
      updates.push(`completed = $${paramCount++}`);
      values.push(completed);
      updates.push(`completed_at = $${paramCount++}`);
      values.push(completed ? new Date().toISOString() : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(itemId, taskId);
    await pool.query(
      `UPDATE task_checklist_items SET ${updates.join(', ')} WHERE id = $${paramCount++} AND task_id = $${paramCount}`,
      values
    );

    const result = await pool.query(
      'SELECT * FROM task_checklist_items WHERE id = $1',
      [itemId]
    );

    res.json({ success: true, data: transformRow(result.rows[0]) });
  } catch (error) {
    console.error('Update checklist item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:taskId/checklist/:itemId - Delete checklist item
router.delete('/:taskId/checklist/:itemId', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { taskId, itemId } = req.params;

    // Verify task belongs to organization
    const taskCheck = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND organization_id = $2',
      [taskId, organizationId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await pool.query(
      'DELETE FROM task_checklist_items WHERE id = $1 AND task_id = $2',
      [itemId, taskId]
    );

    res.json({ success: true, message: 'Checklist item deleted' });
  } catch (error) {
    console.error('Delete checklist item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/comments - Add comment to task
router.post('/:id/comments', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: taskId } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    // Verify task belongs to organization
    const taskCheck = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND organization_id = $2',
      [taskId, organizationId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const commentId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO task_comments (id, task_id, user_id, comment)
      VALUES ($1, $2, $3, $4)
    `, [commentId, taskId, userId, comment.trim()]);

    const result = await pool.query(`
      SELECT tc.*, u.username, u.display_name
      FROM task_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.id = $1
    `, [commentId]);

    res.status(201).json({ success: true, data: transformRow(result.rows[0]) });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/start-timer - Start time tracking for task
router.post('/:id/start-timer', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: taskId } = req.params;

    // Verify task belongs to organization and get project info
    const taskResult = await pool.query(`
      SELECT t.*, p.id as linked_project_id
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1 AND t.organization_id = $2
    `, [taskId, organizationId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Stop any running time entry for this user
    await pool.query(`
      UPDATE time_entries
      SET is_running = false, end_time = NOW(), duration = EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER
      WHERE user_id = $1 AND is_running = true AND organization_id = $2
    `, [userId, organizationId]);

    // If task has a project, use it. Otherwise find or create a default project
    let projectId = task.linked_project_id;

    if (!projectId) {
      // Find a default project or the first available project
      const projectResult = await pool.query(`
        SELECT id FROM projects WHERE organization_id = $1 AND is_active = true
        ORDER BY created_at DESC LIMIT 1
      `, [organizationId]);

      if (projectResult.rows.length > 0) {
        projectId = projectResult.rows[0].id;
      } else {
        return res.status(400).json({ error: 'No project available. Please link the task to a project first.' });
      }
    }

    // Create new running time entry
    const entryId = crypto.randomUUID();
    await pool.query(`
      INSERT INTO time_entries (id, user_id, organization_id, project_id, task_id, start_time, is_running, description)
      VALUES ($1, $2, $3, $4, $5, NOW(), true, $6)
    `, [entryId, userId, organizationId, projectId, taskId, `Task: ${task.title}`]);

    // Update task status to in_progress if pending
    if (task.status === 'pending') {
      await pool.query(
        'UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2',
        ['in_progress', taskId]
      );
    }

    const result = await pool.query(`
      SELECT te.*, p.name as project_name
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE te.id = $1
    `, [entryId]);

    res.json({ success: true, data: transformRow(result.rows[0]) });
  } catch (error) {
    console.error('Start timer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/stop-timer - Stop time tracking for task
router.post('/:id/stop-timer', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id: taskId } = req.params;

    // Stop running time entry for this task
    const result = await pool.query(`
      UPDATE time_entries
      SET is_running = false, end_time = NOW(), duration = EXTRACT(EPOCH FROM (NOW() - start_time))::INTEGER
      WHERE user_id = $1 AND task_id = $2 AND is_running = true AND organization_id = $3
      RETURNING *
    `, [userId, taskId, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No running timer found for this task' });
    }

    res.json({ success: true, data: transformRow(result.rows[0]) });
  } catch (error) {
    console.error('Stop timer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to create next recurring task
async function createNextRecurringTask(oldTask: any, organizationId: string, userId: string) {
  if (!oldTask.due_date || !oldTask.recurrence_pattern) return;

  const dueDate = new Date(oldTask.due_date);
  let nextDueDate: Date;

  switch (oldTask.recurrence_pattern) {
    case 'daily':
      nextDueDate = new Date(dueDate);
      nextDueDate.setDate(nextDueDate.getDate() + (oldTask.recurrence_interval || 1));
      break;
    case 'weekly':
      nextDueDate = new Date(dueDate);
      nextDueDate.setDate(nextDueDate.getDate() + 7 * (oldTask.recurrence_interval || 1));
      break;
    case 'monthly':
      nextDueDate = new Date(dueDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + (oldTask.recurrence_interval || 1));
      break;
    case 'yearly':
      nextDueDate = new Date(dueDate);
      nextDueDate.setFullYear(nextDueDate.getFullYear() + (oldTask.recurrence_interval || 1));
      break;
    default:
      return;
  }

  // Check if we've passed the recurrence end date
  if (oldTask.recurrence_end_date && nextDueDate > new Date(oldTask.recurrence_end_date)) {
    return;
  }

  const newTaskId = crypto.randomUUID();
  await pool.query(`
    INSERT INTO tasks (
      id, organization_id, title, description, status, priority,
      ticket_id, project_id, customer_id, assigned_to, created_by,
      due_date, due_time, estimated_minutes,
      is_recurring, recurrence_pattern, recurrence_interval, recurrence_days, recurrence_end_date,
      category, tags, color, parent_task_id
    ) VALUES (
      $1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
    )
  `, [
    newTaskId, organizationId, oldTask.title, oldTask.description, oldTask.priority,
    oldTask.ticket_id, oldTask.project_id, oldTask.customer_id, oldTask.assigned_to, userId,
    nextDueDate.toISOString(), oldTask.due_time, oldTask.estimated_minutes,
    true, oldTask.recurrence_pattern, oldTask.recurrence_interval, oldTask.recurrence_days, oldTask.recurrence_end_date,
    oldTask.category, oldTask.tags, oldTask.color, oldTask.id
  ]);

  // Copy checklist items
  const checklistItems = await pool.query(
    'SELECT title FROM task_checklist_items WHERE task_id = $1 ORDER BY sort_order',
    [oldTask.id]
  );

  for (let i = 0; i < checklistItems.rows.length; i++) {
    await pool.query(`
      INSERT INTO task_checklist_items (id, task_id, title, sort_order)
      VALUES ($1, $2, $3, $4)
    `, [crypto.randomUUID(), newTaskId, checklistItems.rows[i].title, i]);
  }
}

export default router;
