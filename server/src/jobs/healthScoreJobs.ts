/**
 * Customer Health Score Background Job
 *
 * Automatically calculates and updates health scores for all customers
 * on a scheduled basis (default: daily at 2:00 AM)
 *
 * Features:
 * - Scheduled execution via node-cron
 * - Calculates health scores for all active customers
 * - Generates churn risk warnings
 * - Records job execution history
 * - Supports manual triggering
 */

import cron from 'node-cron';
import { customerHealthScoreService, JobExecutionResult } from '../services/customerHealthScoreService';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// Job state
let isJobRunning = false;
let lastJobResult: JobExecutionResult | null = null;
let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Run the health score calculation job
 */
export async function runHealthScoreJob(): Promise<JobExecutionResult> {
  if (isJobRunning) {
    logger.info('[HealthScoreJob] Job already running, skipping...');
    return {
      success: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      customersProcessed: 0,
      customersUpdated: 0,
      customersSkipped: 0,
      warningsGenerated: [],
      errors: [{ customerId: 'N/A', error: 'Job already running' }]
    };
  }

  isJobRunning = true;
  logger.info('[HealthScoreJob] ========================================');
  logger.info('[HealthScoreJob] Starting scheduled health score calculation');
  logger.info('[HealthScoreJob] ========================================');

  try {
    // Run the calculation for all organizations
    const result = await customerHealthScoreService.calculateForAllOrganizations('monthly');

    // Record job execution
    await customerHealthScoreService.recordJobExecution(result);

    // Update last result
    lastJobResult = result;

    // Log summary
    logger.info('[HealthScoreJob] ========================================');
    logger.info('[HealthScoreJob] Job completed successfully');
    logger.info(`[HealthScoreJob] Duration: ${result.durationMs}ms`);
    logger.info(`[HealthScoreJob] Customers processed: ${result.customersProcessed}`);
    logger.info(`[HealthScoreJob] Customers updated: ${result.customersUpdated}`);
    logger.info(`[HealthScoreJob] Warnings generated: ${result.warningsGenerated.length}`);
    logger.info(`[HealthScoreJob] Errors: ${result.errors.length}`);
    logger.info('[HealthScoreJob] ========================================');

    // Log high-risk customers
    const highRiskWarnings = result.warningsGenerated.filter(w => w.churnRisk === 'high');
    if (highRiskWarnings.length > 0) {
      logger.info('[HealthScoreJob] HIGH RISK CUSTOMERS:');
      highRiskWarnings.forEach(w => {
        logger.info(`  - ${w.customerName}: Score ${w.healthScore}, Factors: ${w.riskFactors.join(', ')}`);
      });
    }

    return result;
  } catch (error: any) {
    logger.error('[HealthScoreJob] Fatal error:', error);

    const errorResult: JobExecutionResult = {
      success: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      customersProcessed: 0,
      customersUpdated: 0,
      customersSkipped: 0,
      warningsGenerated: [],
      errors: [{ customerId: 'N/A', error: error.message }]
    };

    lastJobResult = errorResult;
    return errorResult;
  } finally {
    isJobRunning = false;
  }
}

/**
 * Start the scheduled health score job
 * Default schedule: Daily at 2:00 AM
 */
export function startHealthScoreJobs(schedule: string = '0 2 * * *'): void {
  // Check if health score jobs are enabled
  if (process.env.HEALTH_SCORE_JOBS_ENABLED === 'false') {
    logger.info('[HealthScoreJob] Health score jobs disabled via environment');
    return;
  }

  // Stop existing scheduled task if any
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  // Validate cron expression
  if (!cron.validate(schedule)) {
    logger.error(`[HealthScoreJob] Invalid cron expression: ${schedule}`);
    return;
  }

  // Schedule the job
  scheduledTask = cron.schedule(schedule, async () => {
    logger.info(`[HealthScoreJob] Triggered at ${new Date().toISOString()}`);
    await runHealthScoreJob();
  });

  logger.info(`[HealthScoreJob] Health score job scheduled: ${schedule}`);
  logger.info('[HealthScoreJob] Next run: Daily at 2:00 AM (default)');
}

/**
 * Stop the scheduled health score job
 */
export function stopHealthScoreJobs(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[HealthScoreJob] Health score job stopped');
  }
}

/**
 * Get job status
 */
export function getJobStatus(): {
  isRunning: boolean;
  lastResult: JobExecutionResult | null;
  isScheduled: boolean;
} {
  return {
    isRunning: isJobRunning,
    lastResult: lastJobResult,
    isScheduled: scheduledTask !== null
  };
}

/**
 * Run job for a specific organization (for manual trigger)
 */
export async function runHealthScoreJobForOrganization(
  organizationId: string,
  periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly'
): Promise<{
  success: boolean;
  results: any[];
  warnings: any[];
  errors: any[];
}> {
  logger.info(`[HealthScoreJob] Manual trigger for organization: ${organizationId}`);

  try {
    const { results, warnings, errors } = await customerHealthScoreService.calculateForOrganization(
      organizationId,
      periodType
    );

    logger.info(`[HealthScoreJob] Organization job completed: ${results.length} customers, ${warnings.length} warnings`);

    return {
      success: true,
      results,
      warnings,
      errors
    };
  } catch (error: any) {
    logger.error(`[HealthScoreJob] Error processing organization:`, error);
    return {
      success: false,
      results: [],
      warnings: [],
      errors: [{ customerId: 'N/A', error: error.message }]
    };
  }
}
