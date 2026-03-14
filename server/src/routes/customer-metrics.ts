/**
 * Customer Metrics Routes
 *
 * API endpoints for customer health metrics, analytics, and churn risk assessment
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query, getClient } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { getUserOrganizationId, requireOrgRole } from '../middleware/organization';
import { runHealthScoreJob, runHealthScoreJobForOrganization, getJobStatus } from '../jobs/healthScoreJobs';
import { customerHealthScoreService } from '../services/customerHealthScoreService';
import { auditLog } from '../services/auditLog';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================
// Validation Schemas
// ============================================

const customerIdParamSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format')
});

const historyQuerySchema = z.object({
  periodType: z.enum(['monthly', 'quarterly', 'yearly']).optional().default('monthly'),
  months: z.coerce.number().min(1).max(36).optional().default(12)
});

const calculateBodySchema = z.object({
  periodType: z.enum(['monthly', 'quarterly', 'yearly']).optional().default('monthly'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional()
});

const dashboardQuerySchema = z.object({
  sortBy: z.enum(['health_score', 'churn_risk', 'name']).optional().default('health_score'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
  churnRisk: z.enum(['low', 'medium', 'high']).optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0)
});

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate health score based on metrics
 * Score: 0-100
 * Factors:
 * - SLA Compliance (40%): Percentage of tickets without SLA breaches
 * - Resolution Rate (30%): Percentage of tickets resolved
 * - Activity (15%): Interaction frequency
 * - Ticket Trend (15%): Declining ticket count is positive
 */
function calculateHealthScore(metrics: {
  ticketsCreated: number;
  ticketsResolved: number;
  slaBreaches: number;
  interactionsCount: number;
  previousTicketsCreated?: number;
}): number {
  let score = 100;

  // SLA Compliance (40 points max)
  if (metrics.ticketsCreated > 0) {
    const slaCompliance = 1 - (metrics.slaBreaches / metrics.ticketsCreated);
    score -= (1 - slaCompliance) * 40;
  }

  // Resolution Rate (30 points max)
  if (metrics.ticketsCreated > 0) {
    const resolutionRate = Math.min(metrics.ticketsResolved / metrics.ticketsCreated, 1);
    score -= (1 - resolutionRate) * 30;
  }

  // Activity Score (15 points max) - Having regular interactions is good
  const activityScore = Math.min(metrics.interactionsCount / 10, 1); // 10+ interactions = max score
  score -= (1 - activityScore) * 15;

  // Ticket Trend (15 points max) - Fewer tickets than before is good
  if (metrics.previousTicketsCreated !== undefined && metrics.previousTicketsCreated > 0) {
    const trend = metrics.ticketsCreated / metrics.previousTicketsCreated;
    if (trend > 1.5) {
      // Tickets increased by 50%+ - bad
      score -= 15;
    } else if (trend > 1.2) {
      // Tickets increased by 20-50%
      score -= 10;
    } else if (trend > 1) {
      // Slight increase
      score -= 5;
    }
    // No penalty if tickets stayed same or decreased
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine churn risk based on health score and other factors
 */
function calculateChurnRisk(healthScore: number, metrics: {
  slaBreaches: number;
  ticketsCreated: number;
  interactionsCount: number;
  daysSinceLastInteraction?: number;
}): 'low' | 'medium' | 'high' {
  // High risk indicators
  if (healthScore < 40) return 'high';
  if (metrics.slaBreaches >= 3 && metrics.ticketsCreated > 0) return 'high';
  if (metrics.daysSinceLastInteraction !== undefined && metrics.daysSinceLastInteraction > 90) return 'high';

  // Medium risk indicators
  if (healthScore < 60) return 'medium';
  if (metrics.slaBreaches >= 2) return 'medium';
  if (metrics.interactionsCount === 0) return 'medium';
  if (metrics.daysSinceLastInteraction !== undefined && metrics.daysSinceLastInteraction > 60) return 'medium';

  return 'low';
}

/**
 * Calculate health trend based on comparing current and previous period
 */
function calculateHealthTrend(
  currentScore: number,
  previousScore: number | null
): 'improving' | 'stable' | 'declining' {
  if (previousScore === null) return 'stable';

  const diff = currentScore - previousScore;
  if (diff >= 10) return 'improving';
  if (diff <= -10) return 'declining';
  return 'stable';
}

/**
 * Get risk factors based on metrics
 */
function getRiskFactors(metrics: {
  slaBreaches: number;
  ticketsCreated: number;
  ticketsResolved: number;
  interactionsCount: number;
  avgResolutionTimeHours: number | null;
  daysSinceLastInteraction?: number;
}): string[] {
  const factors: string[] = [];

  if (metrics.slaBreaches > 0) {
    factors.push(`${metrics.slaBreaches} SLA breach(es) in period`);
  }

  if (metrics.ticketsCreated > 0 && metrics.ticketsResolved < metrics.ticketsCreated * 0.5) {
    factors.push('Low ticket resolution rate');
  }

  if (metrics.avgResolutionTimeHours !== null && metrics.avgResolutionTimeHours > 48) {
    factors.push('High average resolution time');
  }

  if (metrics.interactionsCount === 0) {
    factors.push('No customer interactions in period');
  }

  if (metrics.daysSinceLastInteraction !== undefined && metrics.daysSinceLastInteraction > 30) {
    factors.push(`No interaction in ${metrics.daysSinceLastInteraction} days`);
  }

  return factors;
}

// ============================================
// GET /api/customer-metrics/dashboard
// Overview of all customer health scores
// ============================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const validation = dashboardQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: validation.error.errors });
    }

    const { sortBy, sortOrder, churnRisk, limit, offset } = validation.data;

    // Get latest metrics for each customer
    let sql = `
      SELECT DISTINCT ON (cm.customer_id)
        cm.*,
        c.name as customer_name,
        c.color as customer_color,
        c.customer_number
      FROM customer_metrics cm
      INNER JOIN customers c ON cm.customer_id = c.id
      WHERE cm.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (churnRisk) {
      sql += ` AND cm.churn_risk = $${paramIndex}`;
      params.push(churnRisk);
      paramIndex++;
    }

    // Order by period_start desc to get latest for DISTINCT ON
    sql += ` ORDER BY cm.customer_id, cm.period_start DESC`;

    // Wrap to apply custom sorting
    let sortColumn = 'health_score';
    if (sortBy === 'churn_risk') {
      sortColumn = "CASE churn_risk WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END";
    } else if (sortBy === 'name') {
      sortColumn = 'customer_name';
    }

    sql = `
      SELECT * FROM (${sql}) as latest_metrics
      ORDER BY ${sortColumn} ${sortOrder === 'desc' ? 'DESC' : 'ASC'} NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(DISTINCT cm.customer_id) as total
      FROM customer_metrics cm
      WHERE cm.organization_id = $1
    `;
    const countParams: any[] = [organizationId];

    if (churnRisk) {
      countSql = `
        SELECT COUNT(*) as total FROM (
          SELECT DISTINCT ON (cm.customer_id) cm.churn_risk
          FROM customer_metrics cm
          WHERE cm.organization_id = $1
          ORDER BY cm.customer_id, cm.period_start DESC
        ) as latest
        WHERE latest.churn_risk = $2
      `;
      countParams.push(churnRisk);
    }

    const countResult = await query(countSql, countParams);

    // Calculate summary statistics
    const summaryResult = await query(`
      SELECT
        COUNT(DISTINCT customer_id) as total_customers,
        AVG(health_score) as avg_health_score,
        COUNT(DISTINCT customer_id) FILTER (WHERE churn_risk = 'high') as high_risk_count,
        COUNT(DISTINCT customer_id) FILTER (WHERE churn_risk = 'medium') as medium_risk_count,
        COUNT(DISTINCT customer_id) FILTER (WHERE churn_risk = 'low') as low_risk_count
      FROM (
        SELECT DISTINCT ON (customer_id)
          customer_id, health_score, churn_risk
        FROM customer_metrics
        WHERE organization_id = $1
        ORDER BY customer_id, period_start DESC
      ) as latest
    `, [organizationId]);

    const summary = summaryResult.rows[0] || {
      total_customers: 0,
      avg_health_score: null,
      high_risk_count: 0,
      medium_risk_count: 0,
      low_risk_count: 0
    };

    res.json({
      customers: result.rows.map(row => ({
        customerId: row.customer_id,
        customerName: row.customer_name,
        customerColor: row.customer_color,
        customerNumber: row.customer_number,
        healthScore: row.health_score,
        healthTrend: row.health_trend,
        churnRisk: row.churn_risk,
        riskFactors: row.risk_factors || [],
        ticketsOpened: row.tickets_opened,
        ticketsResolved: row.tickets_resolved,
        slaBreaches: row.sla_breaches,
        periodStart: row.period_start,
        periodEnd: row.period_end
      })),
      summary: {
        totalCustomers: parseInt(summary.total_customers) || 0,
        avgHealthScore: summary.avg_health_score ? Math.round(parseFloat(summary.avg_health_score)) : null,
        highRiskCount: parseInt(summary.high_risk_count) || 0,
        mediumRiskCount: parseInt(summary.medium_risk_count) || 0,
        lowRiskCount: parseInt(summary.low_risk_count) || 0
      },
      total: parseInt(countResult.rows[0]?.total) || 0,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching customer metrics dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch customer metrics dashboard' });
  }
});

// ============================================
// GET /api/customer-metrics/:customerId
// Current metrics for a specific customer
// ============================================
router.get('/:customerId', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const paramValidation = customerIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ error: 'Invalid customer ID', details: paramValidation.error.errors });
    }

    const { customerId } = paramValidation.data;

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id, name, color, customer_number FROM customers WHERE id = $1 AND organization_id = $2',
      [customerId, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = customerCheck.rows[0];

    // Get latest metrics
    const metricsResult = await query(`
      SELECT *
      FROM customer_metrics
      WHERE customer_id = $1 AND organization_id = $2
      ORDER BY period_start DESC
      LIMIT 1
    `, [customerId, organizationId]);

    if (metricsResult.rows.length === 0) {
      return res.json({
        customerId,
        customerName: customer.name,
        customerColor: customer.color,
        customerNumber: customer.customer_number,
        metrics: null,
        message: 'No metrics calculated yet. Use POST /api/customer-metrics/calculate/:customerId to generate.'
      });
    }

    const metrics = metricsResult.rows[0];

    res.json({
      customerId,
      customerName: customer.name,
      customerColor: customer.color,
      customerNumber: customer.customer_number,
      metrics: {
        id: metrics.id,
        periodType: metrics.period_type,
        periodStart: metrics.period_start,
        periodEnd: metrics.period_end,
        revenue: parseFloat(metrics.revenue) || 0,
        hoursBilled: parseFloat(metrics.hours_billed) || 0,
        hoursUnbilled: parseFloat(metrics.hours_unbilled) || 0,
        ticketsOpened: metrics.tickets_opened,
        ticketsResolved: metrics.tickets_resolved,
        ticketsEscalated: metrics.tickets_escalated,
        avgResolutionTimeHours: metrics.avg_resolution_time_hours ? parseFloat(metrics.avg_resolution_time_hours) : null,
        avgFirstResponseTimeHours: metrics.avg_first_response_time_hours ? parseFloat(metrics.avg_first_response_time_hours) : null,
        slaBreaches: metrics.sla_breaches,
        interactionsCount: metrics.interactions_count,
        lastInteractionDate: metrics.last_interaction_date,
        activeContracts: metrics.active_contracts,
        contractValue: parseFloat(metrics.contract_value) || 0,
        healthScore: metrics.health_score,
        healthTrend: metrics.health_trend,
        churnRisk: metrics.churn_risk,
        riskFactors: metrics.risk_factors || [],
        createdAt: metrics.created_at,
        updatedAt: metrics.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching customer metrics:', error);
    res.status(500).json({ error: 'Failed to fetch customer metrics' });
  }
});

// ============================================
// GET /api/customer-metrics/:customerId/history
// Historical metrics for the last 12 months
// ============================================
router.get('/:customerId/history', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const paramValidation = customerIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ error: 'Invalid customer ID', details: paramValidation.error.errors });
    }

    const queryValidation = historyQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: queryValidation.error.errors });
    }

    const { customerId } = paramValidation.data;
    const { periodType, months } = queryValidation.data;

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2',
      [customerId, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    // Get historical metrics
    const metricsResult = await query(`
      SELECT *
      FROM customer_metrics
      WHERE customer_id = $1
        AND organization_id = $2
        AND period_type = $3
        AND period_start >= $4
        AND period_end <= $5
      ORDER BY period_start ASC
    `, [customerId, organizationId, periodType, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

    res.json({
      customerId,
      customerName: customerCheck.rows[0].name,
      periodType,
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0]
      },
      history: metricsResult.rows.map(row => ({
        id: row.id,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        ticketsOpened: row.tickets_opened,
        ticketsResolved: row.tickets_resolved,
        avgResolutionTimeHours: row.avg_resolution_time_hours ? parseFloat(row.avg_resolution_time_hours) : null,
        slaBreaches: row.sla_breaches,
        interactionsCount: row.interactions_count,
        healthScore: row.health_score,
        healthTrend: row.health_trend,
        churnRisk: row.churn_risk,
        revenue: parseFloat(row.revenue) || 0,
        hoursBilled: parseFloat(row.hours_billed) || 0
      }))
    });
  } catch (error) {
    console.error('Error fetching customer metrics history:', error);
    res.status(500).json({ error: 'Failed to fetch customer metrics history' });
  }
});

// ============================================
// POST /api/customer-metrics/calculate/:customerId
// Calculate/recalculate metrics for a customer
// ============================================
router.post('/calculate/:customerId', async (req: Request, res: Response) => {
  const client = await getClient();

  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const paramValidation = customerIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ error: 'Invalid customer ID', details: paramValidation.error.errors });
    }

    const bodyValidation = calculateBodySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({ error: 'Invalid request body', details: bodyValidation.error.errors });
    }

    const { customerId } = paramValidation.data;
    const { periodType } = bodyValidation.data;

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2',
      [customerId, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await client.query('BEGIN');

    // Calculate period boundaries
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;

    if (bodyValidation.data.periodStart && bodyValidation.data.periodEnd) {
      periodStart = new Date(bodyValidation.data.periodStart);
      periodEnd = new Date(bodyValidation.data.periodEnd);
    } else {
      // Default to current period
      if (periodType === 'monthly') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (periodType === 'quarterly') {
        const quarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), quarter * 3, 1);
        periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
      } else {
        // yearly
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear(), 11, 31);
      }
    }

    const periodStartStr = periodStart.toISOString().split('T')[0];
    const periodEndStr = periodEnd.toISOString().split('T')[0];

    // Calculate previous period for trend analysis
    const prevPeriodStart = new Date(periodStart);
    const prevPeriodEnd = new Date(periodEnd);
    if (periodType === 'monthly') {
      prevPeriodStart.setMonth(prevPeriodStart.getMonth() - 1);
      prevPeriodEnd.setMonth(prevPeriodEnd.getMonth() - 1);
    } else if (periodType === 'quarterly') {
      prevPeriodStart.setMonth(prevPeriodStart.getMonth() - 3);
      prevPeriodEnd.setMonth(prevPeriodEnd.getMonth() - 3);
    } else {
      prevPeriodStart.setFullYear(prevPeriodStart.getFullYear() - 1);
      prevPeriodEnd.setFullYear(prevPeriodEnd.getFullYear() - 1);
    }

    // Get ticket metrics
    const ticketMetrics = await client.query(`
      SELECT
        COUNT(*) as tickets_created,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) as tickets_resolved,
        COUNT(*) FILTER (WHERE priority = 'critical' OR priority = 'high') as tickets_escalated,
        AVG(
          CASE
            WHEN resolved_at IS NOT NULL THEN
              EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600
            ELSE NULL
          END
        ) as avg_resolution_time_hours,
        AVG(
          CASE
            WHEN first_response_at IS NOT NULL THEN
              EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600
            ELSE NULL
          END
        ) as avg_first_response_time_hours,
        COUNT(*) FILTER (WHERE sla_first_response_breached = true OR sla_resolution_breached = true) as sla_breaches
      FROM tickets
      WHERE customer_id = $1
        AND organization_id = $2
        AND created_at >= $3
        AND created_at <= $4
    `, [customerId, organizationId, periodStartStr, periodEndStr]);

    // Get previous period tickets for trend
    const prevTicketMetrics = await client.query(`
      SELECT COUNT(*) as tickets_created
      FROM tickets
      WHERE customer_id = $1
        AND organization_id = $2
        AND created_at >= $3
        AND created_at <= $4
    `, [customerId, organizationId, prevPeriodStart.toISOString().split('T')[0], prevPeriodEnd.toISOString().split('T')[0]]);

    // Get interaction metrics
    const interactionMetrics = await client.query(`
      SELECT
        COUNT(*) as interactions_count,
        MAX(occurred_at) as last_interaction_date
      FROM customer_interactions
      WHERE customer_id = $1
        AND organization_id = $2
        AND occurred_at >= $3
        AND occurred_at <= $4
    `, [customerId, organizationId, periodStartStr, periodEndStr]);

    // Get revenue metrics from time entries
    const revenueMetrics = await client.query(`
      SELECT
        COALESCE(SUM(
          CASE WHEN e.billable = true THEN
            (EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600) * COALESCE(c.hourly_rate, 0)
          ELSE 0 END
        ), 0) as revenue,
        COALESCE(SUM(
          CASE WHEN e.billable = true THEN
            EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600
          ELSE 0 END
        ), 0) as hours_billed,
        COALESCE(SUM(
          CASE WHEN e.billable = false OR e.billable IS NULL THEN
            EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600
          ELSE 0 END
        ), 0) as hours_unbilled
      FROM time_entries e
      INNER JOIN projects p ON e.project_id = p.id
      INNER JOIN customers c ON p.customer_id = c.id
      WHERE p.customer_id = $1
        AND e.organization_id = $2
        AND e.date >= $3
        AND e.date <= $4
    `, [customerId, organizationId, periodStartStr, periodEndStr]);

    // Get contract metrics
    const contractMetrics = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_contracts,
        COALESCE(SUM(CASE WHEN status = 'active' THEN value ELSE 0 END), 0) as contract_value
      FROM contracts
      WHERE customer_id = $1
        AND organization_id = $2
    `, [customerId, organizationId]);

    // Get previous health score for trend calculation
    const prevMetrics = await client.query(`
      SELECT health_score
      FROM customer_metrics
      WHERE customer_id = $1
        AND organization_id = $2
        AND period_type = $3
        AND period_start < $4
      ORDER BY period_start DESC
      LIMIT 1
    `, [customerId, organizationId, periodType, periodStartStr]);

    // Calculate days since last interaction (for churn risk)
    const lastInteractionResult = await client.query(`
      SELECT MAX(occurred_at) as last_interaction
      FROM customer_interactions
      WHERE customer_id = $1 AND organization_id = $2
    `, [customerId, organizationId]);

    let daysSinceLastInteraction: number | undefined;
    if (lastInteractionResult.rows[0]?.last_interaction) {
      const lastInteraction = new Date(lastInteractionResult.rows[0].last_interaction);
      daysSinceLastInteraction = Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Aggregate metrics
    const ticketData = ticketMetrics.rows[0];
    const interactionData = interactionMetrics.rows[0];
    const revenueData = revenueMetrics.rows[0];
    const contractData = contractMetrics.rows[0];
    const prevTicketData = prevTicketMetrics.rows[0];
    const prevHealthScore = prevMetrics.rows.length > 0 ? prevMetrics.rows[0].health_score : null;

    const ticketsCreated = parseInt(ticketData.tickets_created) || 0;
    const ticketsResolved = parseInt(ticketData.tickets_resolved) || 0;
    const slaBreaches = parseInt(ticketData.sla_breaches) || 0;
    const interactionsCount = parseInt(interactionData.interactions_count) || 0;
    const previousTicketsCreated = parseInt(prevTicketData.tickets_created) || 0;
    const avgResolutionTimeHours = ticketData.avg_resolution_time_hours ? parseFloat(ticketData.avg_resolution_time_hours) : null;

    // Calculate health score
    const healthScore = calculateHealthScore({
      ticketsCreated,
      ticketsResolved,
      slaBreaches,
      interactionsCount,
      previousTicketsCreated: previousTicketsCreated > 0 ? previousTicketsCreated : undefined
    });

    // Calculate churn risk
    const churnRisk = calculateChurnRisk(healthScore, {
      slaBreaches,
      ticketsCreated,
      interactionsCount,
      daysSinceLastInteraction
    });

    // Calculate health trend
    const healthTrend = calculateHealthTrend(healthScore, prevHealthScore);

    // Get risk factors
    const riskFactors = getRiskFactors({
      slaBreaches,
      ticketsCreated,
      ticketsResolved,
      interactionsCount,
      avgResolutionTimeHours,
      daysSinceLastInteraction
    });

    // Upsert metrics
    const metricsId = uuidv4();
    await client.query(`
      INSERT INTO customer_metrics (
        id, customer_id, organization_id,
        period_type, period_start, period_end,
        revenue, hours_billed, hours_unbilled,
        tickets_opened, tickets_resolved, tickets_escalated,
        avg_resolution_time_hours, avg_first_response_time_hours, sla_breaches,
        interactions_count, last_interaction_date,
        active_contracts, contract_value,
        health_score, health_trend, churn_risk, risk_factors,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
      ON CONFLICT (customer_id, period_type, period_start)
      DO UPDATE SET
        revenue = EXCLUDED.revenue,
        hours_billed = EXCLUDED.hours_billed,
        hours_unbilled = EXCLUDED.hours_unbilled,
        tickets_opened = EXCLUDED.tickets_opened,
        tickets_resolved = EXCLUDED.tickets_resolved,
        tickets_escalated = EXCLUDED.tickets_escalated,
        avg_resolution_time_hours = EXCLUDED.avg_resolution_time_hours,
        avg_first_response_time_hours = EXCLUDED.avg_first_response_time_hours,
        sla_breaches = EXCLUDED.sla_breaches,
        interactions_count = EXCLUDED.interactions_count,
        last_interaction_date = EXCLUDED.last_interaction_date,
        active_contracts = EXCLUDED.active_contracts,
        contract_value = EXCLUDED.contract_value,
        health_score = EXCLUDED.health_score,
        health_trend = EXCLUDED.health_trend,
        churn_risk = EXCLUDED.churn_risk,
        risk_factors = EXCLUDED.risk_factors,
        updated_at = NOW()
    `, [
      metricsId, customerId, organizationId,
      periodType, periodStartStr, periodEndStr,
      revenueData.revenue || 0,
      revenueData.hours_billed || 0,
      revenueData.hours_unbilled || 0,
      ticketsCreated,
      ticketsResolved,
      parseInt(ticketData.tickets_escalated) || 0,
      avgResolutionTimeHours,
      ticketData.avg_first_response_time_hours ? parseFloat(ticketData.avg_first_response_time_hours) : null,
      slaBreaches,
      interactionsCount,
      interactionData.last_interaction_date || null,
      parseInt(contractData.active_contracts) || 0,
      contractData.contract_value || 0,
      healthScore,
      healthTrend,
      churnRisk,
      riskFactors
    ]);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Metrics calculated successfully',
      customerId,
      customerName: customerCheck.rows[0].name,
      period: {
        type: periodType,
        start: periodStartStr,
        end: periodEndStr
      },
      metrics: {
        ticketsCreated,
        ticketsResolved,
        slaBreaches,
        avgResolutionTimeHours,
        interactionsCount,
        healthScore,
        healthTrend,
        churnRisk,
        riskFactors
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error calculating customer metrics:', error);
    res.status(500).json({ error: 'Failed to calculate customer metrics' });
  } finally {
    client.release();
  }
});

// ============================================
// Admin Endpoints for Health Score Job Management
// ============================================

const adminTriggerSchema = z.object({
  periodType: z.enum(['monthly', 'quarterly', 'yearly']).optional().default('monthly'),
  organizationId: z.string().uuid().optional()
});

// ============================================
// POST /api/customer-metrics/admin/trigger-job
// Manually trigger health score calculation
// Requires admin role
// ============================================
router.post('/admin/trigger-job', requireOrgRole('admin'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = await getUserOrganizationId(userId);

    const validation = adminTriggerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request body', details: validation.error.errors });
    }

    const { periodType, organizationId: targetOrgId } = validation.data;

    // Log the manual trigger
    await auditLog.log({
      userId,
      action: 'health_score.manual_trigger' as any,
      details: JSON.stringify({
        periodType,
        targetOrganizationId: targetOrgId || organizationId,
        triggeredAt: new Date().toISOString()
      })
    });

    // If specific organization is requested (super admin feature)
    // Otherwise use the user's organization
    const effectiveOrgId = targetOrgId || organizationId;

    if (effectiveOrgId) {
      // Run for specific organization
      const result = await runHealthScoreJobForOrganization(effectiveOrgId, periodType);

      res.json({
        success: true,
        message: 'Health score calculation triggered for organization',
        organizationId: effectiveOrgId,
        periodType,
        result: {
          customersProcessed: result.results.length + result.errors.length,
          customersUpdated: result.results.length,
          warningsGenerated: result.warnings.length,
          errors: result.errors.length
        },
        warnings: result.warnings.map(w => ({
          customerId: w.customerId,
          customerName: w.customerName,
          healthScore: w.healthScore,
          churnRisk: w.churnRisk,
          riskFactors: w.riskFactors
        }))
      });
    } else {
      // Run for all organizations (system admin only)
      const result = await runHealthScoreJob();

      res.json({
        success: result.success,
        message: 'Health score calculation triggered for all organizations',
        result: {
          durationMs: result.durationMs,
          customersProcessed: result.customersProcessed,
          customersUpdated: result.customersUpdated,
          customersSkipped: result.customersSkipped,
          warningsGenerated: result.warningsGenerated.length,
          errors: result.errors.length
        },
        highRiskWarnings: result.warningsGenerated
          .filter(w => w.churnRisk === 'high')
          .map(w => ({
            customerId: w.customerId,
            customerName: w.customerName,
            healthScore: w.healthScore,
            riskFactors: w.riskFactors
          }))
      });
    }
  } catch (error) {
    console.error('Error triggering health score job:', error);
    res.status(500).json({ error: 'Failed to trigger health score calculation' });
  }
});

// ============================================
// GET /api/customer-metrics/admin/job-status
// Get current job status and last execution result
// Requires admin role
// ============================================
router.get('/admin/job-status', requireOrgRole('admin'), async (req: Request, res: Response) => {
  try {
    const status = getJobStatus();
    const history = await customerHealthScoreService.getJobHistory(5);

    res.json({
      isRunning: status.isRunning,
      isScheduled: status.isScheduled,
      lastResult: status.lastResult ? {
        success: status.lastResult.success,
        startedAt: status.lastResult.startedAt,
        completedAt: status.lastResult.completedAt,
        durationMs: status.lastResult.durationMs,
        customersProcessed: status.lastResult.customersProcessed,
        customersUpdated: status.lastResult.customersUpdated,
        warningsGenerated: status.lastResult.warningsGenerated.length,
        errors: status.lastResult.errors.length
      } : null,
      recentRuns: history.map(run => ({
        id: run.id,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        durationMs: run.duration_ms,
        success: run.success,
        customersProcessed: run.customers_processed,
        customersUpdated: run.customers_updated,
        warningsGenerated: run.warnings_generated,
        errors: run.errors ? JSON.parse(run.errors).length : 0
      }))
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

// ============================================
// GET /api/customer-metrics/admin/churn-warnings
// Get unacknowledged churn risk warnings
// Requires admin role
// ============================================
router.get('/admin/churn-warnings', requireOrgRole('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const acknowledged = req.query.acknowledged === 'true' ? true :
                         req.query.acknowledged === 'false' ? false : undefined;
    const riskLevel = req.query.riskLevel as 'medium' | 'high' | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const warnings = await customerHealthScoreService.getChurnWarnings(organizationId, {
      acknowledged,
      riskLevel,
      limit
    });

    res.json({
      warnings,
      total: warnings.length,
      unacknowledgedHighRisk: warnings.filter(w => w.churnRisk === 'high').length,
      unacknowledgedMediumRisk: warnings.filter(w => w.churnRisk === 'medium').length
    });
  } catch (error) {
    console.error('Error getting churn warnings:', error);
    res.status(500).json({ error: 'Failed to get churn warnings' });
  }
});

// ============================================
// POST /api/customer-metrics/admin/acknowledge-warning/:warningId
// Acknowledge a churn warning
// Requires admin role
// ============================================
router.post('/admin/acknowledge-warning/:warningId', requireOrgRole('admin'), async (req: Request, res: Response) => {
  try {
    const { warningId } = req.params;
    const userId = (req as any).user.id;

    if (!warningId || !z.string().uuid().safeParse(warningId).success) {
      return res.status(400).json({ error: 'Invalid warning ID' });
    }

    const success = await customerHealthScoreService.acknowledgeWarning(warningId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Warning acknowledged successfully'
      });
    } else {
      res.status(404).json({ error: 'Warning not found' });
    }
  } catch (error) {
    console.error('Error acknowledging warning:', error);
    res.status(500).json({ error: 'Failed to acknowledge warning' });
  }
});

// ============================================
// POST /api/customer-metrics/calculate-all
// Calculate metrics for all customers in the organization
// Requires admin role
// ============================================
router.post('/calculate-all', requireOrgRole('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const validation = adminTriggerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid request body', details: validation.error.errors });
    }

    const { periodType } = validation.data;

    const result = await runHealthScoreJobForOrganization(organizationId, periodType);

    res.json({
      success: result.success,
      message: `Calculated health scores for ${result.results.length} customers`,
      summary: {
        customersProcessed: result.results.length + result.errors.length,
        customersUpdated: result.results.length,
        errors: result.errors.length,
        warningsGenerated: result.warnings.length
      },
      scoreDistribution: {
        healthy: result.results.filter(r => r.calculated.healthScore >= 70).length,
        atRisk: result.results.filter(r => r.calculated.healthScore >= 40 && r.calculated.healthScore < 70).length,
        critical: result.results.filter(r => r.calculated.healthScore < 40).length
      },
      churnRiskDistribution: {
        low: result.results.filter(r => r.calculated.churnRisk === 'low').length,
        medium: result.results.filter(r => r.calculated.churnRisk === 'medium').length,
        high: result.results.filter(r => r.calculated.churnRisk === 'high').length
      },
      warnings: result.warnings.map(w => ({
        customerId: w.customerId,
        customerName: w.customerName,
        healthScore: w.healthScore,
        churnRisk: w.churnRisk,
        riskFactors: w.riskFactors
      })),
      errors: result.errors
    });
  } catch (error) {
    console.error('Error calculating all customer metrics:', error);
    res.status(500).json({ error: 'Failed to calculate customer metrics' });
  }
});

export default router;
