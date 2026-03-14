/**
 * Customer Health Score Service
 *
 * Calculates and manages customer health scores based on:
 * - Ticket volume and trends
 * - SLA compliance
 * - Resolution times
 * - Customer activity/interactions
 *
 * Health Score: 0-100
 * Churn Risk: low, medium, high
 */

import { pool, getClient } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { auditLog } from './auditLog';

export interface HealthScoreMetrics {
  ticketsCreated: number;
  ticketsResolved: number;
  slaBreaches: number;
  interactionsCount: number;
  avgResolutionTimeHours: number | null;
  daysSinceLastInteraction?: number;
  previousTicketsCreated?: number;
}

export interface CalculatedHealthScore {
  healthScore: number;
  churnRisk: 'low' | 'medium' | 'high';
  healthTrend: 'improving' | 'stable' | 'declining';
  riskFactors: string[];
}

export interface CustomerHealthResult {
  customerId: string;
  customerName: string;
  organizationId: string;
  period: {
    type: 'monthly' | 'quarterly' | 'yearly';
    start: string;
    end: string;
  };
  metrics: HealthScoreMetrics;
  calculated: CalculatedHealthScore;
  warning?: ChurnWarning;
}

export interface ChurnWarning {
  customerId: string;
  customerName: string;
  organizationId: string;
  healthScore: number;
  churnRisk: 'medium' | 'high';
  riskFactors: string[];
  generatedAt: string;
}

export interface JobExecutionResult {
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  customersProcessed: number;
  customersUpdated: number;
  customersSkipped: number;
  warningsGenerated: ChurnWarning[];
  errors: Array<{ customerId: string; error: string }>;
}

class CustomerHealthScoreService {
  /**
   * Calculate health score based on metrics
   * Score: 0-100
   * Factors:
   * - SLA Compliance (40%): Percentage of tickets without SLA breaches
   * - Resolution Rate (30%): Percentage of tickets resolved
   * - Activity (15%): Interaction frequency
   * - Ticket Trend (15%): Declining ticket count is positive
   */
  calculateHealthScore(metrics: HealthScoreMetrics): number {
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
  calculateChurnRisk(healthScore: number, metrics: HealthScoreMetrics): 'low' | 'medium' | 'high' {
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
  calculateHealthTrend(
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
  getRiskFactors(metrics: HealthScoreMetrics): string[] {
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

    if (metrics.previousTicketsCreated !== undefined && metrics.previousTicketsCreated > 0) {
      const trend = metrics.ticketsCreated / metrics.previousTicketsCreated;
      if (trend > 1.5) {
        factors.push('Significant increase in ticket volume (+50%)');
      } else if (trend > 1.2) {
        factors.push('Increased ticket volume (+20-50%)');
      }
    }

    return factors;
  }

  /**
   * Calculate health score for a single customer
   */
  async calculateForCustomer(
    customerId: string,
    organizationId: string,
    periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
  ): Promise<CustomerHealthResult> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get customer info
      const customerResult = await client.query(
        'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2',
        [customerId, organizationId]
      );

      if (customerResult.rows.length === 0) {
        throw new Error(`Customer not found: ${customerId}`);
      }

      const customer = customerResult.rows[0];
      const now = new Date();

      // Calculate period boundaries
      let periodStart: Date;
      let periodEnd: Date;

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

      const periodStartStr = periodStart.toISOString().split('T')[0];
      const periodEndStr = periodEnd.toISOString().split('T')[0];

      // Calculate previous period for trend
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
          COUNT(*) FILTER (WHERE sla_first_response_breached = true OR sla_resolution_breached = true) as sla_breaches
        FROM tickets
        WHERE customer_id = $1
          AND organization_id = $2
          AND created_at >= $3
          AND created_at <= $4
      `, [customerId, organizationId, periodStartStr, periodEndStr]);

      // Get previous period tickets
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

      // Get days since last interaction
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

      // Get revenue metrics
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

      // Get previous health score
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

      // Aggregate metrics
      const ticketData = ticketMetrics.rows[0];
      const interactionData = interactionMetrics.rows[0];
      const revenueData = revenueMetrics.rows[0];
      const contractData = contractMetrics.rows[0];
      const prevTicketData = prevTicketMetrics.rows[0];
      const prevHealthScore = prevMetrics.rows.length > 0 ? prevMetrics.rows[0].health_score : null;

      const metrics: HealthScoreMetrics = {
        ticketsCreated: parseInt(ticketData.tickets_created) || 0,
        ticketsResolved: parseInt(ticketData.tickets_resolved) || 0,
        slaBreaches: parseInt(ticketData.sla_breaches) || 0,
        interactionsCount: parseInt(interactionData.interactions_count) || 0,
        avgResolutionTimeHours: ticketData.avg_resolution_time_hours ? parseFloat(ticketData.avg_resolution_time_hours) : null,
        daysSinceLastInteraction,
        previousTicketsCreated: parseInt(prevTicketData.tickets_created) || undefined
      };

      // Calculate scores
      const healthScore = this.calculateHealthScore(metrics);
      const churnRisk = this.calculateChurnRisk(healthScore, metrics);
      const healthTrend = this.calculateHealthTrend(healthScore, prevHealthScore);
      const riskFactors = this.getRiskFactors(metrics);

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
        metrics.ticketsCreated,
        metrics.ticketsResolved,
        parseInt(ticketData.tickets_escalated) || 0,
        metrics.avgResolutionTimeHours,
        ticketData.avg_first_response_time_hours ? parseFloat(ticketData.avg_first_response_time_hours) : null,
        metrics.slaBreaches,
        metrics.interactionsCount,
        interactionData.last_interaction_date || null,
        parseInt(contractData.active_contracts) || 0,
        contractData.contract_value || 0,
        healthScore,
        healthTrend,
        churnRisk,
        riskFactors
      ]);

      await client.query('COMMIT');

      // Generate warning if applicable
      let warning: ChurnWarning | undefined;
      if (churnRisk === 'high' || churnRisk === 'medium') {
        warning = {
          customerId,
          customerName: customer.name,
          organizationId,
          healthScore,
          churnRisk,
          riskFactors,
          generatedAt: new Date().toISOString()
        };
      }

      return {
        customerId,
        customerName: customer.name,
        organizationId,
        period: {
          type: periodType,
          start: periodStartStr,
          end: periodEndStr
        },
        metrics,
        calculated: {
          healthScore,
          churnRisk,
          healthTrend,
          riskFactors
        },
        warning
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate health scores for all active customers in an organization
   */
  async calculateForOrganization(
    organizationId: string,
    periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
  ): Promise<{
    results: CustomerHealthResult[];
    warnings: ChurnWarning[];
    errors: Array<{ customerId: string; error: string }>;
  }> {
    // Get all active customers
    const customersResult = await pool.query(
      'SELECT id, name FROM customers WHERE organization_id = $1 AND active = true ORDER BY name',
      [organizationId]
    );

    const results: CustomerHealthResult[] = [];
    const warnings: ChurnWarning[] = [];
    const errors: Array<{ customerId: string; error: string }> = [];

    for (const customer of customersResult.rows) {
      try {
        const result = await this.calculateForCustomer(customer.id, organizationId, periodType);
        results.push(result);
        if (result.warning) {
          warnings.push(result.warning);
        }
      } catch (error: any) {
        console.error(`Error calculating health score for customer ${customer.id}:`, error);
        errors.push({
          customerId: customer.id,
          error: error.message
        });
      }
    }

    return { results, warnings, errors };
  }

  /**
   * Calculate health scores for ALL organizations
   * Used by the background job
   */
  async calculateForAllOrganizations(
    periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
  ): Promise<JobExecutionResult> {
    const startedAt = new Date();
    console.log(`[HealthScoreJob] Starting health score calculation for all organizations...`);

    const allWarnings: ChurnWarning[] = [];
    const allErrors: Array<{ customerId: string; error: string }> = [];
    let customersProcessed = 0;
    let customersUpdated = 0;
    let customersSkipped = 0;

    try {
      // Get all organizations
      const orgsResult = await pool.query('SELECT id, name FROM organizations');

      for (const org of orgsResult.rows) {
        console.log(`[HealthScoreJob] Processing organization: ${org.name} (${org.id})`);

        try {
          const { results, warnings, errors } = await this.calculateForOrganization(org.id, periodType);

          customersProcessed += results.length + errors.length;
          customersUpdated += results.length;
          customersSkipped += errors.length;

          allWarnings.push(...warnings);
          allErrors.push(...errors);

          console.log(`[HealthScoreJob] Organization ${org.name}: ${results.length} customers updated, ${warnings.length} warnings`);
        } catch (error: any) {
          console.error(`[HealthScoreJob] Error processing organization ${org.name}:`, error);
        }
      }

      // Store churn warnings if any
      if (allWarnings.length > 0) {
        await this.storeChurnWarnings(allWarnings);
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      console.log(`[HealthScoreJob] Completed in ${durationMs}ms. Processed: ${customersProcessed}, Updated: ${customersUpdated}, Warnings: ${allWarnings.length}`);

      return {
        success: true,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        customersProcessed,
        customersUpdated,
        customersSkipped,
        warningsGenerated: allWarnings,
        errors: allErrors
      };
    } catch (error: any) {
      const completedAt = new Date();
      console.error('[HealthScoreJob] Fatal error:', error);

      return {
        success: false,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        customersProcessed,
        customersUpdated,
        customersSkipped,
        warningsGenerated: allWarnings,
        errors: [...allErrors, { customerId: 'N/A', error: error.message }]
      };
    }
  }

  /**
   * Store churn warnings in the database for notification/alerting
   */
  private async storeChurnWarnings(warnings: ChurnWarning[]): Promise<void> {
    for (const warning of warnings) {
      try {
        await pool.query(`
          INSERT INTO churn_risk_warnings (
            id, customer_id, organization_id,
            health_score, churn_risk, risk_factors,
            generated_at, acknowledged, acknowledged_at, acknowledged_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, false, NULL, NULL)
          ON CONFLICT (customer_id, DATE(generated_at))
          DO UPDATE SET
            health_score = EXCLUDED.health_score,
            churn_risk = EXCLUDED.churn_risk,
            risk_factors = EXCLUDED.risk_factors,
            generated_at = EXCLUDED.generated_at
        `, [
          uuidv4(),
          warning.customerId,
          warning.organizationId,
          warning.healthScore,
          warning.churnRisk,
          warning.riskFactors,
          warning.generatedAt
        ]);
      } catch (error) {
        // Table might not exist yet, log and continue
        console.warn('[HealthScoreJob] Could not store churn warning:', error);
      }
    }
  }

  /**
   * Get recent churn warnings for an organization
   */
  async getChurnWarnings(
    organizationId: string,
    options: {
      acknowledged?: boolean;
      riskLevel?: 'medium' | 'high';
      limit?: number;
    } = {}
  ): Promise<ChurnWarning[]> {
    let sql = `
      SELECT
        crw.*,
        c.name as customer_name
      FROM churn_risk_warnings crw
      INNER JOIN customers c ON crw.customer_id = c.id
      WHERE crw.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (options.acknowledged !== undefined) {
      sql += ` AND crw.acknowledged = $${paramIndex}`;
      params.push(options.acknowledged);
      paramIndex++;
    }

    if (options.riskLevel) {
      sql += ` AND crw.churn_risk = $${paramIndex}`;
      params.push(options.riskLevel);
      paramIndex++;
    }

    sql += ` ORDER BY crw.generated_at DESC`;

    if (options.limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
    }

    try {
      const result = await pool.query(sql, params);
      return result.rows.map(row => ({
        customerId: row.customer_id,
        customerName: row.customer_name,
        organizationId: row.organization_id,
        healthScore: row.health_score,
        churnRisk: row.churn_risk,
        riskFactors: row.risk_factors || [],
        generatedAt: row.generated_at
      }));
    } catch (error) {
      console.error('Error fetching churn warnings:', error);
      return [];
    }
  }

  /**
   * Acknowledge a churn warning
   */
  async acknowledgeWarning(warningId: string, userId: string): Promise<boolean> {
    try {
      const result = await pool.query(`
        UPDATE churn_risk_warnings
        SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
        WHERE id = $1
      `, [warningId, userId]);

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error acknowledging warning:', error);
      return false;
    }
  }

  /**
   * Get job execution history
   */
  async getJobHistory(limit: number = 10): Promise<any[]> {
    try {
      const result = await pool.query(`
        SELECT *
        FROM health_score_job_runs
        ORDER BY started_at DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      // Table might not exist
      return [];
    }
  }

  /**
   * Record job execution
   */
  async recordJobExecution(result: JobExecutionResult): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO health_score_job_runs (
          id, started_at, completed_at, duration_ms,
          success, customers_processed, customers_updated, customers_skipped,
          warnings_generated, errors
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        uuidv4(),
        result.startedAt,
        result.completedAt,
        result.durationMs,
        result.success,
        result.customersProcessed,
        result.customersUpdated,
        result.customersSkipped,
        result.warningsGenerated.length,
        JSON.stringify(result.errors)
      ]);
    } catch (error) {
      // Table might not exist, log and continue
      console.warn('[HealthScoreJob] Could not record job execution:', error);
    }
  }
}

export const customerHealthScoreService = new CustomerHealthScoreService();
