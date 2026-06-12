/**
 * Opportunities Routes
 *
 * Sales pipeline and deal tracking
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { getUserOrganizationId } from '../middleware/organization';
import { logger } from '../utils/logger';

const router = Router();

// ============================================
// Explicit column lists (no SELECT *)
// ============================================

const PIPELINE_STAGE_COLUMNS = `
  id, organization_id, name, description, color, probability, sort_order, is_won, is_lost, created_at
`;

// All routes require authentication
router.use(authenticateToken);

// ============================================
// VALIDATION SCHEMAS
// ============================================

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color');
const isoDateSchema = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));

const createStageSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  color: hexColorSchema.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
});

const updateStageSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  color: hexColorSchema.optional(),
  probability: z.number().int().min(0).max(100).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
});

const reorderStagesSchema = z.object({
  stage_ids: z.array(z.string().uuid('Each stage_id must be a UUID')).min(1),
});

const opportunityStatusSchema = z.enum(['open', 'won', 'lost']);

const createOpportunitySchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  description: z.string().max(5000).optional().nullable(),
  customer_id: z.string().uuid('customer_id must be a UUID').optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  value: z.number().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional().nullable(),
  expected_close_date: isoDateSchema.optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  campaign: z.string().max(150).optional().nullable(),
  next_step: z.string().max(500).optional().nullable(),
  next_step_date: isoDateSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional().nullable(),
});

const updateOpportunitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  stage_id: z.string().uuid().optional().nullable(),
  value: z.number().nonnegative().optional().nullable(),
  probability: z.number().int().min(0).max(100).optional().nullable(),
  expected_close_date: isoDateSchema.optional().nullable(),
  actual_close_date: isoDateSchema.optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  status: opportunityStatusSchema.optional(),
  lost_reason: z.string().max(500).optional().nullable(),
  lost_to_competitor: z.string().max(150).optional().nullable(),
  next_step: z.string().max(500).optional().nullable(),
  next_step_date: isoDateSchema.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional().nullable(),
});

const moveOpportunitySchema = z.object({
  stage_id: z.string().uuid('stage_id must be a UUID'),
  note: z.string().max(1000).optional().nullable(),
});

const opportunityActivityTypeSchema = z.enum(['note', 'call', 'email', 'meeting', 'task', 'stage_change', 'value_change']);

const createOpportunityActivitySchema = z.object({
  activity_type: opportunityActivityTypeSchema.optional(),
  title: z.string().min(1).max(200).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  scheduled_at: isoDateSchema.optional().nullable(),
  is_completed: z.boolean().optional(),
});

// ============================================
// Pipeline Stages
// ============================================

// GET /api/opportunities/stages - Get pipeline stages
router.get('/stages', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const result = await query(`
      SELECT ${PIPELINE_STAGE_COLUMNS} FROM pipeline_stages
      WHERE organization_id = $1
      ORDER BY sort_order ASC
    `, [organizationId]);

    // If no stages exist, create default ones
    if (result.rows.length === 0) {
      const defaultStages = [
        { name: 'Qualifizierung', probability: 10, color: '#6B7280' },
        { name: 'Bedarfsanalyse', probability: 25, color: '#3B82F6' },
        { name: 'Angebot', probability: 50, color: '#8B5CF6' },
        { name: 'Verhandlung', probability: 75, color: '#F59E0B' },
        { name: 'Gewonnen', probability: 100, color: '#10B981', is_won: true },
        { name: 'Verloren', probability: 0, color: '#EF4444', is_lost: true }
      ];

      for (let i = 0; i < defaultStages.length; i++) {
        const stage = defaultStages[i];
        await query(`
          INSERT INTO pipeline_stages (id, organization_id, name, probability, color, sort_order, is_won, is_lost)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [uuidv4(), organizationId, stage.name, stage.probability, stage.color, i, stage.is_won || false, stage.is_lost || false]);
      }

      // Fetch again
      const newResult = await query(`
        SELECT ${PIPELINE_STAGE_COLUMNS} FROM pipeline_stages
        WHERE organization_id = $1
        ORDER BY sort_order ASC
      `, [organizationId]);

      return res.json(newResult.rows);
    }

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching pipeline stages:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline stages' });
  }
});

// POST /api/opportunities/stages - Create stage
router.post('/stages', validate(createStageSchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { name, description, color, probability, is_won, is_lost } = req.body;

    // Get max sort_order
    const maxOrder = await query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM pipeline_stages WHERE organization_id = $1',
      [organizationId]
    );

    const id = uuidv4();

    const result = await query(`
      INSERT INTO pipeline_stages (id, organization_id, name, description, color, probability, sort_order, is_won, is_lost)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [id, organizationId, name, description, color || '#3B82F6', probability || 0, maxOrder.rows[0].next_order, is_won || false, is_lost || false]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating pipeline stage:', error);
    res.status(500).json({ error: 'Failed to create pipeline stage' });
  }
});

// PUT /api/opportunities/stages/:id - Update stage
router.put('/stages/:id', validate(updateStageSchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { name, description, color, probability, sort_order, is_won, is_lost } = req.body;

    const result = await query(`
      UPDATE pipeline_stages SET
        name = COALESCE($3, name),
        description = COALESCE($4, description),
        color = COALESCE($5, color),
        probability = COALESCE($6, probability),
        sort_order = COALESCE($7, sort_order),
        is_won = COALESCE($8, is_won),
        is_lost = COALESCE($9, is_lost)
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [id, organizationId, name, description, color, probability, sort_order, is_won, is_lost]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating pipeline stage:', error);
    res.status(500).json({ error: 'Failed to update pipeline stage' });
  }
});

// PUT /api/opportunities/stages/reorder - Reorder stages
router.put('/stages/reorder', validate(reorderStagesSchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { stage_ids } = req.body; // Array of stage IDs in new order

    for (let i = 0; i < stage_ids.length; i++) {
      await query(
        'UPDATE pipeline_stages SET sort_order = $3 WHERE id = $1 AND organization_id = $2',
        [stage_ids[i], organizationId, i]
      );
    }

    const result = await query(`
      SELECT ${PIPELINE_STAGE_COLUMNS} FROM pipeline_stages
      WHERE organization_id = $1
      ORDER BY sort_order ASC
    `, [organizationId]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Error reordering stages:', error);
    res.status(500).json({ error: 'Failed to reorder stages' });
  }
});

// DELETE /api/opportunities/stages/:id - Delete stage
router.delete('/stages/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { move_opportunities_to } = req.query;

    // Check if stage has opportunities
    const oppCheck = await query(
      'SELECT COUNT(*) as count FROM opportunities WHERE stage_id = $1',
      [id]
    );

    if (parseInt(oppCheck.rows[0].count) > 0) {
      if (!move_opportunities_to) {
        return res.status(400).json({
          error: 'Stage has opportunities. Provide move_opportunities_to parameter.',
          opportunity_count: parseInt(oppCheck.rows[0].count)
        });
      }

      // Move opportunities to new stage
      await query(
        'UPDATE opportunities SET stage_id = $1 WHERE stage_id = $2',
        [move_opportunities_to, id]
      );
    }

    const result = await query(
      'DELETE FROM pipeline_stages WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    res.json({ success: true, deleted: id });
  } catch (error) {
    logger.error('Error deleting pipeline stage:', error);
    res.status(500).json({ error: 'Failed to delete pipeline stage' });
  }
});

// ============================================
// Opportunities (Deals)
// ============================================

// GET /api/opportunities - List opportunities
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      status,
      stage_id,
      customer_id,
      assigned_to,
      search,
      limit = '100',
      offset = '0'
    } = req.query;

    let sql = `
      SELECT
        o.*,
        ps.name as stage_name,
        ps.color as stage_color,
        ps.probability as stage_probability,
        c.name as customer_name,
        c.color as customer_color,
        l.name as lead_name,
        cc.first_name || ' ' || cc.last_name as contact_name,
        u.username as assigned_to_name,
        cu.username as created_by_name
      FROM opportunities o
      LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN leads l ON o.lead_id = l.id
      LEFT JOIN customer_contacts cc ON o.contact_id = cc.id
      LEFT JOIN users u ON o.assigned_to = u.id
      LEFT JOIN users cu ON o.created_by = cu.id
      WHERE o.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (stage_id) {
      sql += ` AND o.stage_id = $${paramIndex}`;
      params.push(stage_id);
      paramIndex++;
    }

    if (customer_id) {
      sql += ` AND o.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (assigned_to) {
      sql += ` AND o.assigned_to = $${paramIndex}`;
      params.push(assigned_to);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (o.name ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY ps.sort_order ASC, o.expected_close_date ASC NULLS LAST`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);

    res.json({
      opportunities: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// GET /api/opportunities/pipeline - Get pipeline view (grouped by stage)
router.get('/pipeline', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // Get stages
    const stages = await query(`
      SELECT ${PIPELINE_STAGE_COLUMNS} FROM pipeline_stages
      WHERE organization_id = $1
      ORDER BY sort_order ASC
    `, [organizationId]);

    // Get open opportunities grouped by stage
    const opportunities = await query(`
      SELECT
        o.*,
        ps.name as stage_name,
        c.name as customer_name,
        c.color as customer_color,
        u.username as assigned_to_name
      FROM opportunities o
      LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.assigned_to = u.id
      WHERE o.organization_id = $1 AND o.status = 'open'
      ORDER BY o.expected_close_date ASC NULLS LAST
    `, [organizationId]);

    // Group opportunities by stage
    const pipeline = stages.rows.map(stage => ({
      ...stage,
      opportunities: opportunities.rows.filter(o => o.stage_id === stage.id),
      total_value: opportunities.rows
        .filter(o => o.stage_id === stage.id)
        .reduce((sum, o) => sum + parseFloat(o.value || 0), 0),
      weighted_value: opportunities.rows
        .filter(o => o.stage_id === stage.id)
        .reduce((sum, o) => sum + parseFloat(o.weighted_value || 0), 0)
    }));

    // Calculate totals
    const totals = {
      total_opportunities: opportunities.rows.length,
      total_value: opportunities.rows.reduce((sum, o) => sum + parseFloat(o.value || 0), 0),
      weighted_value: opportunities.rows.reduce((sum, o) => sum + parseFloat(o.weighted_value || 0), 0)
    };

    res.json({ pipeline, totals });
  } catch (error) {
    logger.error('Error fetching pipeline:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

// GET /api/opportunities/forecast - Sales forecast
router.get('/forecast', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { months = '3' } = req.query;

    const result = await query(`
      SELECT
        DATE_TRUNC('month', expected_close_date) as month,
        COUNT(*) as opportunity_count,
        SUM(value) as total_value,
        SUM(weighted_value) as weighted_value
      FROM opportunities
      WHERE organization_id = $1
        AND status = 'open'
        AND expected_close_date IS NOT NULL
        AND expected_close_date >= CURRENT_DATE
        AND expected_close_date < CURRENT_DATE + INTERVAL '${parseInt(months as string)} months'
      GROUP BY DATE_TRUNC('month', expected_close_date)
      ORDER BY month ASC
    `, [organizationId]);

    // Get won/lost stats for comparison
    const wonLost = await query(`
      SELECT
        status,
        DATE_TRUNC('month', actual_close_date) as month,
        COUNT(*) as count,
        SUM(value) as value
      FROM opportunities
      WHERE organization_id = $1
        AND status IN ('won', 'lost')
        AND actual_close_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY status, DATE_TRUNC('month', actual_close_date)
      ORDER BY month ASC
    `, [organizationId]);

    res.json({
      forecast: result.rows,
      historical: wonLost.rows,
      period_months: parseInt(months as string)
    });
  } catch (error) {
    logger.error('Error fetching forecast:', error);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

// GET /api/opportunities/:id - Get single opportunity
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const result = await query(`
      SELECT
        o.*,
        ps.name as stage_name,
        ps.color as stage_color,
        c.name as customer_name,
        c.color as customer_color,
        l.name as lead_name,
        cc.first_name || ' ' || cc.last_name as contact_name,
        cc.email as contact_email,
        u.username as assigned_to_name,
        cu.username as created_by_name
      FROM opportunities o
      LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN leads l ON o.lead_id = l.id
      LEFT JOIN customer_contacts cc ON o.contact_id = cc.id
      LEFT JOIN users u ON o.assigned_to = u.id
      LEFT JOIN users cu ON o.created_by = cu.id
      WHERE o.id = $1 AND o.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    // Get activities
    const activities = await query(`
      SELECT
        oa.*,
        u.username as user_name,
        os.name as old_stage_name,
        ns.name as new_stage_name
      FROM opportunity_activities oa
      LEFT JOIN users u ON oa.user_id = u.id
      LEFT JOIN pipeline_stages os ON oa.old_stage_id = os.id
      LEFT JOIN pipeline_stages ns ON oa.new_stage_id = ns.id
      WHERE oa.opportunity_id = $1
      ORDER BY oa.created_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      ...result.rows[0],
      activities: activities.rows
    });
  } catch (error) {
    logger.error('Error fetching opportunity:', error);
    res.status(500).json({ error: 'Failed to fetch opportunity' });
  }
});

// POST /api/opportunities - Create opportunity
router.post('/', validate(createOpportunitySchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      name,
      description,
      customer_id,
      lead_id,
      contact_id,
      stage_id,
      value,
      currency = 'EUR',
      probability,
      expected_close_date,
      assigned_to,
      source,
      campaign,
      next_step,
      next_step_date,
      notes,
      tags
    } = req.body;

    // Get first stage if not specified
    let actualStageId = stage_id;
    if (!actualStageId) {
      const firstStage = await query(
        'SELECT id FROM pipeline_stages WHERE organization_id = $1 AND is_won = false AND is_lost = false ORDER BY sort_order ASC LIMIT 1',
        [organizationId]
      );
      if (firstStage.rows.length > 0) {
        actualStageId = firstStage.rows[0].id;
      }
    }

    const id = uuidv4();

    // Calculate weighted value
    const weightedValue = value && probability ? (parseFloat(value) * parseInt(probability)) / 100 : null;

    const result = await query(`
      INSERT INTO opportunities (
        id, organization_id, customer_id, lead_id, contact_id,
        name, description, stage_id, value, currency, probability, weighted_value,
        expected_close_date, assigned_to, created_by, source, campaign,
        next_step, next_step_date, notes, tags
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17,
        $18, $19, $20, $21
      )
      RETURNING *
    `, [
      id, organizationId, customer_id, lead_id, contact_id,
      name, description, actualStageId, value, currency, probability, weightedValue,
      expected_close_date, assigned_to || userId, userId, source, campaign,
      next_step, next_step_date, notes, tags
    ]);

    // Log activity
    await query(`
      INSERT INTO opportunity_activities (id, opportunity_id, user_id, activity_type, title)
      VALUES ($1, $2, $3, 'note', 'Opportunity erstellt')
    `, [uuidv4(), id, userId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating opportunity:', error);
    res.status(500).json({ error: 'Failed to create opportunity' });
  }
});

// PUT /api/opportunities/:id - Update opportunity
router.put('/:id', validate(updateOpportunitySchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const {
      name,
      description,
      customer_id,
      contact_id,
      stage_id,
      value,
      probability,
      expected_close_date,
      actual_close_date,
      assigned_to,
      status,
      lost_reason,
      lost_to_competitor,
      next_step,
      next_step_date,
      notes,
      tags
    } = req.body;

    // Get current state for activity logging
    const current = await query(
      'SELECT stage_id, value, status FROM opportunities WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const oldState = current.rows[0];

    const result = await query(`
      UPDATE opportunities SET
        name = COALESCE($3, name),
        description = COALESCE($4, description),
        customer_id = COALESCE($5, customer_id),
        contact_id = COALESCE($6, contact_id),
        stage_id = COALESCE($7, stage_id),
        value = COALESCE($8, value),
        probability = COALESCE($9, probability),
        weighted_value = COALESCE($8, value) * COALESCE($9, probability) / 100,
        expected_close_date = COALESCE($10, expected_close_date),
        actual_close_date = COALESCE($11, actual_close_date),
        assigned_to = COALESCE($12, assigned_to),
        status = COALESCE($13, status),
        lost_reason = COALESCE($14, lost_reason),
        lost_to_competitor = COALESCE($15, lost_to_competitor),
        next_step = COALESCE($16, next_step),
        next_step_date = COALESCE($17, next_step_date),
        notes = COALESCE($18, notes),
        tags = COALESCE($19, tags),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [
      id, organizationId, name, description, customer_id, contact_id,
      stage_id, value, probability, expected_close_date, actual_close_date,
      assigned_to, status, lost_reason, lost_to_competitor, next_step, next_step_date,
      notes, tags
    ]);

    // Log stage change
    if (stage_id && stage_id !== oldState.stage_id) {
      await query(`
        INSERT INTO opportunity_activities (id, opportunity_id, user_id, activity_type, title, old_stage_id, new_stage_id)
        VALUES ($1, $2, $3, 'stage_change', 'Pipeline-Phase geändert', $4, $5)
      `, [uuidv4(), id, userId, oldState.stage_id, stage_id]);
    }

    // Log value change
    if (value && parseFloat(value) !== parseFloat(oldState.value || 0)) {
      await query(`
        INSERT INTO opportunity_activities (id, opportunity_id, user_id, activity_type, title, old_value, new_value)
        VALUES ($1, $2, $3, 'value_change', 'Wert geändert', $4, $5)
      `, [uuidv4(), id, userId, oldState.value, value]);
    }

    // Log status change (won/lost)
    if (status && status !== oldState.status) {
      const statusTitle = status === 'won' ? 'Opportunity gewonnen! 🎉' : status === 'lost' ? 'Opportunity verloren' : 'Status geändert';
      await query(`
        INSERT INTO opportunity_activities (id, opportunity_id, user_id, activity_type, title, description)
        VALUES ($1, $2, $3, 'note', $4, $5)
      `, [uuidv4(), id, userId, statusTitle, lost_reason || null]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating opportunity:', error);
    res.status(500).json({ error: 'Failed to update opportunity' });
  }
});

// POST /api/opportunities/:id/move - Move to different stage
router.post('/:id/move', validate(moveOpportunitySchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { stage_id, note } = req.body;

    // Get current and new stage
    const [current, newStage] = await Promise.all([
      query('SELECT stage_id FROM opportunities WHERE id = $1 AND organization_id = $2', [id, organizationId]),
      query('SELECT ${PIPELINE_STAGE_COLUMNS} FROM pipeline_stages WHERE id = $1 AND organization_id = $2', [stage_id, organizationId])
    ]);

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    if (newStage.rows.length === 0) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const stage = newStage.rows[0];

    // Update opportunity
    const updates: any = { stage_id };
    if (stage.is_won) {
      updates.status = 'won';
      updates.actual_close_date = new Date().toISOString();
    } else if (stage.is_lost) {
      updates.status = 'lost';
      updates.actual_close_date = new Date().toISOString();
    }

    await query(`
      UPDATE opportunities SET
        stage_id = $3,
        status = COALESCE($4, status),
        actual_close_date = COALESCE($5, actual_close_date),
        probability = $6,
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId, stage_id, updates.status, updates.actual_close_date, stage.probability]);

    // Log activity
    await query(`
      INSERT INTO opportunity_activities (id, opportunity_id, user_id, activity_type, title, description, old_stage_id, new_stage_id)
      VALUES ($1, $2, $3, 'stage_change', $4, $5, $6, $7)
    `, [
      uuidv4(), id, userId,
      stage.is_won ? 'Opportunity gewonnen! 🎉' : stage.is_lost ? 'Opportunity verloren' : 'In Phase verschoben: ' + stage.name,
      note, current.rows[0].stage_id, stage_id
    ]);

    const result = await query(`
      SELECT o.*, ps.name as stage_name, ps.color as stage_color
      FROM opportunities o
      LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
      WHERE o.id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error moving opportunity:', error);
    res.status(500).json({ error: 'Failed to move opportunity' });
  }
});

// POST /api/opportunities/:id/activities - Add activity
router.post('/:id/activities', validate(createOpportunityActivitySchema), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { activity_type, title, description, scheduled_at, is_completed } = req.body;

    // Verify opportunity exists
    const opp = await query(
      'SELECT id FROM opportunities WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (opp.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    const activityId = uuidv4();

    const result = await query(`
      INSERT INTO opportunity_activities (
        id, opportunity_id, user_id, activity_type, title, description,
        scheduled_at, is_completed, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      activityId, id, userId, activity_type || 'note', title, description,
      scheduled_at, is_completed || false, is_completed ? new Date().toISOString() : null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error adding activity:', error);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

// DELETE /api/opportunities/:id - Delete opportunity
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const result = await query(
      'DELETE FROM opportunities WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Opportunity not found' });
    }

    res.json({ success: true, deleted: id });
  } catch (error) {
    logger.error('Error deleting opportunity:', error);
    res.status(500).json({ error: 'Failed to delete opportunity' });
  }
});

// GET /api/opportunities/stats - Pipeline statistics
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    // Pipeline summary
    const summary = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'won') as won_count,
        COUNT(*) FILTER (WHERE status = 'lost') as lost_count,
        SUM(value) FILTER (WHERE status = 'open') as open_value,
        SUM(weighted_value) FILTER (WHERE status = 'open') as weighted_value,
        SUM(value) FILTER (WHERE status = 'won' AND actual_close_date >= DATE_TRUNC('month', CURRENT_DATE)) as won_this_month,
        SUM(value) FILTER (WHERE status = 'lost' AND actual_close_date >= DATE_TRUNC('month', CURRENT_DATE)) as lost_this_month
      FROM opportunities
      WHERE organization_id = $1
    `, [organizationId]);

    // Win rate (last 90 days)
    const winRate = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'won') as won,
        COUNT(*) FILTER (WHERE status IN ('won', 'lost')) as total
      FROM opportunities
      WHERE organization_id = $1 AND actual_close_date >= CURRENT_DATE - INTERVAL '90 days'
    `, [organizationId]);

    const winRatePercent = winRate.rows[0].total > 0
      ? Math.round((winRate.rows[0].won / winRate.rows[0].total) * 100)
      : 0;

    // Average deal size
    const avgDeal = await query(`
      SELECT AVG(value) as avg_value
      FROM opportunities
      WHERE organization_id = $1 AND status = 'won' AND actual_close_date >= CURRENT_DATE - INTERVAL '90 days'
    `, [organizationId]);

    // Closing soon (next 30 days)
    const closingSoon = await query(`
      SELECT COUNT(*) as count, SUM(value) as value
      FROM opportunities
      WHERE organization_id = $1 AND status = 'open'
        AND expected_close_date >= CURRENT_DATE
        AND expected_close_date <= CURRENT_DATE + INTERVAL '30 days'
    `, [organizationId]);

    res.json({
      summary: summary.rows[0],
      win_rate: winRatePercent,
      avg_deal_value: parseFloat(avgDeal.rows[0].avg_value || 0),
      closing_soon: closingSoon.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching opportunity stats:', error);
    res.status(500).json({ error: 'Failed to fetch opportunity stats' });
  }
});

export default router;
