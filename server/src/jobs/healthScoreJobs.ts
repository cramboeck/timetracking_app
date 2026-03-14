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

// Job state
let isJobRunning = false;
let lastJobResult: JobExecutionResult | null = null;
let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Run the health score calculation job
 */
export async function runHealthScoreJob(): Promise<JobExecutionResult> {
  if (isJobRunning) {
    console.log('[HealthScoreJob] Job already running, skipping...');
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
  console.log('[HealthScoreJob] ========================================');
  console.log('[HealthScoreJob] Starting scheduled health score calculation');
  console.log('[HealthScoreJob] ========================================');

  try {
    // Run the calculation for all organizations
    const result = await customerHealthScoreService.calculateForAllOrganizations('monthly');

    // Record job execution
    await customerHealthScoreService.recordJobExecution(result);

    // Update last result
    lastJobResult = result;

    // Log summary
    console.log('[HealthScoreJob] ========================================');
    console.log('[HealthScoreJob] Job completed successfully');
    console.log(`[HealthScoreJob] Duration: ${result.durationMs}ms`);
    console.log(`[HealthScoreJob] Customers processed: ${result.customersProcessed}`);
    console.log(`[HealthScoreJob] Customers updated: ${result.customersUpdated}`);
    console.log(`[HealthScoreJob] Warnings generated: ${result.warningsGenerated.length}`);
    console.log(`[HealthScoreJob] Errors: ${result.errors.length}`);
    console.log('[HealthScoreJob] ========================================');

    // Log high-risk customers
    const highRiskWarnings = result.warningsGenerated.filter(w => w.churnRisk === 'high');
    if (highRiskWarnings.length > 0) {
      console.log('[HealthScoreJob] HIGH RISK CUSTOMERS:');
      highRiskWarnings.forEach(w => {
        console.log(`  - ${w.customerName}: Score ${w.healthScore}, Factors: ${w.riskFactors.join(', ')}`);
      });
    }

    return result;
  } catch (error: any) {
    console.error('[HealthScoreJob] Fatal error:', error);

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
    console.log('[HealthScoreJob] Health score jobs disabled via environment');
    return;
  }

  // Stop existing scheduled task if any
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  // Validate cron expression
  if (!cron.validate(schedule)) {
    console.error(`[HealthScoreJob] Invalid cron expression: ${schedule}`);
    return;
  }

  // Schedule the job
  scheduledTask = cron.schedule(schedule, async () => {
    console.log(`[HealthScoreJob] Triggered at ${new Date().toISOString()}`);
    await runHealthScoreJob();
  });

  console.log(`[HealthScoreJob] Health score job scheduled: ${schedule}`);
  console.log('[HealthScoreJob] Next run: Daily at 2:00 AM (default)');
}

/**
 * Stop the scheduled health score job
 */
export function stopHealthScoreJobs(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[HealthScoreJob] Health score job stopped');
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
  console.log(`[HealthScoreJob] Manual trigger for organization: ${organizationId}`);

  try {
    const { results, warnings, errors } = await customerHealthScoreService.calculateForOrganization(
      organizationId,
      periodType
    );

    console.log(`[HealthScoreJob] Organization job completed: ${results.length} customers, ${warnings.length} warnings`);

    return {
      success: true,
      results,
      warnings,
      errors
    };
  } catch (error: any) {
    console.error(`[HealthScoreJob] Error processing organization:`, error);
    return {
      success: false,
      results: [],
      warnings: [],
      errors: [{ customerId: 'N/A', error: error.message }]
    };
  }
}
