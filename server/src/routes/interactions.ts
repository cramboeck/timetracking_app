/**
 * Customer Interactions Routes
 *
 * Communication log and activity tracking for customers
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { getUserOrganizationId } from '../middleware/organization';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================
// GET /api/interactions - List interactions
// ============================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      customer_id,
      contact_id,
      type,
      follow_up_pending,
      date_from,
      date_to,
      limit = '50',
      offset = '0'
    } = req.query;

    let sql = `
      SELECT
        ci.*,
        c.name as customer_name,
        c.color as customer_color,
        cc.first_name as contact_first_name,
        cc.last_name as contact_last_name,
        u.username as user_name,
        t.ticket_number,
        t.title as ticket_title
      FROM customer_interactions ci
      LEFT JOIN customers c ON ci.customer_id = c.id
      LEFT JOIN customer_contacts cc ON ci.contact_id = cc.id
      LEFT JOIN users u ON ci.user_id = u.id
      LEFT JOIN tickets t ON ci.ticket_id = t.id
      WHERE ci.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (customer_id) {
      sql += ` AND ci.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (contact_id) {
      sql += ` AND ci.contact_id = $${paramIndex}`;
      params.push(contact_id);
      paramIndex++;
    }

    if (type) {
      sql += ` AND ci.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (follow_up_pending === 'true') {
      sql += ` AND ci.follow_up_required = true AND ci.follow_up_completed = false`;
    }

    if (date_from) {
      sql += ` AND ci.occurred_at >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      sql += ` AND ci.occurred_at <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }

    sql += ` ORDER BY ci.occurred_at DESC`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM customer_interactions ci
      WHERE ci.organization_id = $1
    `;
    const countParams: any[] = [organizationId];
    let countParamIndex = 2;

    if (customer_id) {
      countSql += ` AND ci.customer_id = $${countParamIndex}`;
      countParams.push(customer_id);
      countParamIndex++;
    }

    if (contact_id) {
      countSql += ` AND ci.contact_id = $${countParamIndex}`;
      countParams.push(contact_id);
      countParamIndex++;
    }

    if (type) {
      countSql += ` AND ci.type = $${countParamIndex}`;
      countParams.push(type);
      countParamIndex++;
    }

    if (follow_up_pending === 'true') {
      countSql += ` AND ci.follow_up_required = true AND ci.follow_up_completed = false`;
    }

    const countResult = await query(countSql, countParams);

    res.json({
      interactions: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Error fetching interactions:', error);
    res.status(500).json({ error: 'Failed to fetch interactions' });
  }
});

// ============================================
// GET /api/interactions/follow-ups - Get pending follow-ups
// ============================================
router.get('/follow-ups', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { assigned_to_me, overdue_only } = req.query;

    let sql = `
      SELECT
        ci.*,
        c.name as customer_name,
        c.color as customer_color,
        cc.first_name as contact_first_name,
        cc.last_name as contact_last_name,
        u.username as created_by_name,
        fu.username as assigned_to_name
      FROM customer_interactions ci
      LEFT JOIN customers c ON ci.customer_id = c.id
      LEFT JOIN customer_contacts cc ON ci.contact_id = cc.id
      LEFT JOIN users u ON ci.user_id = u.id
      LEFT JOIN users fu ON ci.follow_up_assigned_to = fu.id
      WHERE ci.organization_id = $1
        AND ci.follow_up_required = true
        AND ci.follow_up_completed = false
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (assigned_to_me === 'true') {
      sql += ` AND (ci.follow_up_assigned_to = $${paramIndex} OR ci.user_id = $${paramIndex})`;
      params.push(userId);
      paramIndex++;
    }

    if (overdue_only === 'true') {
      sql += ` AND ci.follow_up_date < CURRENT_DATE`;
    }

    sql += ` ORDER BY ci.follow_up_date ASC NULLS LAST`;

    const result = await query(sql, params);

    // Group by status
    const today = new Date().toISOString().split('T')[0];
    const grouped = {
      overdue: result.rows.filter(r => r.follow_up_date && r.follow_up_date < today),
      today: result.rows.filter(r => r.follow_up_date === today),
      upcoming: result.rows.filter(r => !r.follow_up_date || r.follow_up_date > today)
    };

    res.json({
      follow_ups: result.rows,
      grouped,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// ============================================
// GET /api/interactions/:id - Get single interaction
// ============================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const result = await query(`
      SELECT
        ci.*,
        c.name as customer_name,
        c.color as customer_color,
        cc.first_name as contact_first_name,
        cc.last_name as contact_last_name,
        cc.email as contact_email,
        u.username as user_name,
        fu.username as follow_up_assigned_to_name,
        t.ticket_number,
        t.title as ticket_title,
        l.name as lead_name,
        con.name as contract_name
      FROM customer_interactions ci
      LEFT JOIN customers c ON ci.customer_id = c.id
      LEFT JOIN customer_contacts cc ON ci.contact_id = cc.id
      LEFT JOIN users u ON ci.user_id = u.id
      LEFT JOIN users fu ON ci.follow_up_assigned_to = fu.id
      LEFT JOIN tickets t ON ci.ticket_id = t.id
      LEFT JOIN leads l ON ci.lead_id = l.id
      LEFT JOIN contracts con ON ci.contract_id = con.id
      WHERE ci.id = $1 AND ci.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching interaction:', error);
    res.status(500).json({ error: 'Failed to fetch interaction' });
  }
});

// ============================================
// POST /api/interactions - Create interaction
// ============================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      customer_id,
      contact_id,
      type,
      direction,
      subject,
      content,
      summary,
      ticket_id,
      lead_id,
      contract_id,
      duration_minutes,
      scheduled_at,
      occurred_at,
      follow_up_required = false,
      follow_up_date,
      follow_up_assigned_to,
      follow_up_notes,
      outcome,
      tags
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2',
      [customer_id, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const id = uuidv4();

    const result = await query(`
      INSERT INTO customer_interactions (
        id, organization_id, customer_id, contact_id, user_id,
        type, direction, subject, content, summary,
        ticket_id, lead_id, contract_id,
        duration_minutes, scheduled_at, occurred_at,
        follow_up_required, follow_up_date, follow_up_assigned_to, follow_up_notes,
        outcome, tags
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, COALESCE($16, NOW()),
        $17, $18, $19, $20,
        $21, $22
      )
      RETURNING *
    `, [
      id, organizationId, customer_id, contact_id, userId,
      type, direction, subject, content, summary,
      ticket_id, lead_id, contract_id,
      duration_minutes, scheduled_at, occurred_at,
      follow_up_required, follow_up_date, follow_up_assigned_to || userId, follow_up_notes,
      outcome, tags
    ]);

    // Update customer's last interaction date in metrics (if exists)
    await query(`
      UPDATE customer_metrics
      SET last_interaction_date = NOW(), interactions_count = interactions_count + 1
      WHERE customer_id = $1 AND period_end >= CURRENT_DATE
    `, [customer_id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating interaction:', error);
    res.status(500).json({ error: 'Failed to create interaction' });
  }
});

// ============================================
// PUT /api/interactions/:id - Update interaction
// ============================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const {
      contact_id,
      type,
      direction,
      subject,
      content,
      summary,
      duration_minutes,
      occurred_at,
      follow_up_required,
      follow_up_date,
      follow_up_assigned_to,
      follow_up_notes,
      follow_up_completed,
      outcome,
      tags
    } = req.body;

    const result = await query(`
      UPDATE customer_interactions SET
        contact_id = COALESCE($3, contact_id),
        type = COALESCE($4, type),
        direction = COALESCE($5, direction),
        subject = COALESCE($6, subject),
        content = COALESCE($7, content),
        summary = COALESCE($8, summary),
        duration_minutes = COALESCE($9, duration_minutes),
        occurred_at = COALESCE($10, occurred_at),
        follow_up_required = COALESCE($11, follow_up_required),
        follow_up_date = COALESCE($12, follow_up_date),
        follow_up_assigned_to = COALESCE($13, follow_up_assigned_to),
        follow_up_notes = COALESCE($14, follow_up_notes),
        follow_up_completed = COALESCE($15, follow_up_completed),
        outcome = COALESCE($16, outcome),
        tags = COALESCE($17, tags)
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [
      id, organizationId, contact_id, type, direction, subject, content, summary,
      duration_minutes, occurred_at, follow_up_required, follow_up_date,
      follow_up_assigned_to, follow_up_notes, follow_up_completed, outcome, tags
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating interaction:', error);
    res.status(500).json({ error: 'Failed to update interaction' });
  }
});

// ============================================
// POST /api/interactions/:id/complete-follow-up - Mark follow-up as done
// ============================================
router.post('/:id/complete-follow-up', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { create_new_follow_up, new_follow_up_date, new_follow_up_notes } = req.body;

    // Mark current follow-up as completed
    const result = await query(`
      UPDATE customer_interactions
      SET follow_up_completed = true
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    // Optionally create a new follow-up interaction
    if (create_new_follow_up && new_follow_up_date) {
      const interaction = result.rows[0];
      const newId = uuidv4();

      await query(`
        INSERT INTO customer_interactions (
          id, organization_id, customer_id, contact_id, user_id,
          type, subject, content,
          follow_up_required, follow_up_date, follow_up_notes
        ) VALUES ($1, $2, $3, $4, $5, 'note', $6, $7, true, $8, $9)
      `, [
        newId, organizationId, interaction.customer_id, interaction.contact_id,
        interaction.user_id, `Follow-up: ${interaction.subject || 'Nachfassen'}`,
        new_follow_up_notes || '', new_follow_up_date, new_follow_up_notes
      ]);
    }

    res.json({ success: true, interaction: result.rows[0] });
  } catch (error) {
    console.error('Error completing follow-up:', error);
    res.status(500).json({ error: 'Failed to complete follow-up' });
  }
});

// ============================================
// DELETE /api/interactions/:id - Delete interaction
// ============================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const result = await query(
      'DELETE FROM customer_interactions WHERE id = $1 AND organization_id = $2 RETURNING id, customer_id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    // Update metrics
    await query(`
      UPDATE customer_metrics
      SET interactions_count = GREATEST(0, interactions_count - 1)
      WHERE customer_id = $1 AND period_end >= CURRENT_DATE
    `, [result.rows[0].customer_id]);

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Error deleting interaction:', error);
    res.status(500).json({ error: 'Failed to delete interaction' });
  }
});

// ============================================
// GET /api/interactions/customer/:customerId/timeline - Customer timeline
// ============================================
router.get('/customer/:customerId/timeline', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { customerId } = req.params;
    const { limit = '50' } = req.query;

    // Get interactions
    const interactions = await query(`
      SELECT
        ci.id,
        'interaction' as item_type,
        ci.type as sub_type,
        ci.subject as title,
        ci.summary as description,
        ci.occurred_at as timestamp,
        ci.outcome,
        u.username as user_name,
        cc.first_name || ' ' || cc.last_name as contact_name
      FROM customer_interactions ci
      LEFT JOIN users u ON ci.user_id = u.id
      LEFT JOIN customer_contacts cc ON ci.contact_id = cc.id
      WHERE ci.customer_id = $1 AND ci.organization_id = $2
    `, [customerId, organizationId]);

    // Get tickets
    const tickets = await query(`
      SELECT
        t.id,
        'ticket' as item_type,
        t.status as sub_type,
        t.title,
        t.description,
        t.created_at as timestamp,
        NULL as outcome,
        u.username as user_name,
        NULL as contact_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.customer_id = $1 AND t.organization_id = $2
    `, [customerId, organizationId]);

    // Get time entries (summarized)
    const timeEntries = await query(`
      SELECT
        te.id,
        'time_entry' as item_type,
        p.name as sub_type,
        te.description as title,
        NULL as description,
        te.start_time as timestamp,
        NULL as outcome,
        u.username as user_name,
        NULL as contact_name
      FROM time_entries te
      LEFT JOIN projects p ON te.project_id = p.id
      LEFT JOIN users u ON te.user_id = u.id
      WHERE p.customer_id = $1 AND te.organization_id = $2
    `, [customerId, organizationId]);

    // Combine and sort by timestamp
    const timeline = [
      ...interactions.rows,
      ...tickets.rows,
      ...timeEntries.rows
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
     .slice(0, parseInt(limit as string));

    res.json({
      timeline,
      total: timeline.length
    });
  } catch (error) {
    console.error('Error fetching customer timeline:', error);
    res.status(500).json({ error: 'Failed to fetch customer timeline' });
  }
});

// ============================================
// GET /api/interactions/stats - Interaction statistics
// ============================================
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { period = '30' } = req.query;
    const days = parseInt(period as string);

    // Interactions by type
    const byType = await query(`
      SELECT type, COUNT(*) as count
      FROM customer_interactions
      WHERE organization_id = $1 AND occurred_at >= NOW() - INTERVAL '${days} days'
      GROUP BY type
      ORDER BY count DESC
    `, [organizationId]);

    // Interactions by user
    const byUser = await query(`
      SELECT u.username, COUNT(*) as count
      FROM customer_interactions ci
      JOIN users u ON ci.user_id = u.id
      WHERE ci.organization_id = $1 AND ci.occurred_at >= NOW() - INTERVAL '${days} days'
      GROUP BY u.id, u.username
      ORDER BY count DESC
      LIMIT 10
    `, [organizationId]);

    // Pending follow-ups
    const pendingFollowUps = await query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE follow_up_date < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE follow_up_date = CURRENT_DATE) as today
      FROM customer_interactions
      WHERE organization_id = $1 AND follow_up_required = true AND follow_up_completed = false
    `, [organizationId]);

    // Total this period vs last period
    const totals = await query(`
      SELECT
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '${days} days') as current_period,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '${days * 2} days' AND occurred_at < NOW() - INTERVAL '${days} days') as previous_period
      FROM customer_interactions
      WHERE organization_id = $1
    `, [organizationId]);

    res.json({
      by_type: byType.rows,
      by_user: byUser.rows,
      follow_ups: pendingFollowUps.rows[0],
      totals: totals.rows[0],
      period_days: days
    });
  } catch (error) {
    console.error('Error fetching interaction stats:', error);
    res.status(500).json({ error: 'Failed to fetch interaction stats' });
  }
});

export default router;
