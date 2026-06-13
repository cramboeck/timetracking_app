/**
 * Contract Hours Monitoring Job
 *
 * Automatically checks contract hour usage and generates warnings
 * when customers approach or exceed their included monthly hours.
 *
 * Schedule: Daily at 6:00 AM (default)
 *
 * Thresholds:
 * - 80%: Warning (approaching limit)
 * - 90%: Critical (almost exhausted)
 * - 100%+: Exceeded (overage)
 */

import cron from 'node-cron';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

// Warning thresholds as percentages
const THRESHOLDS = {
  warning: 80,    // 80% - approaching limit
  critical: 90,   // 90% - almost exhausted
  exceeded: 100,  // 100% - over limit
};

// Job state
let isJobRunning = false;
let scheduledTask: cron.ScheduledTask | null = null;

export interface ContractHoursWarning {
  contractId: string;
  contractName: string;
  contractNumber: string;
  customerId: string;
  customerName: string;
  organizationId: string;
  includedHours: number;
  usedHours: number;
  remainingHours: number;
  usagePercent: number;
  severity: 'warning' | 'critical' | 'exceeded';
  overageHours: number;
  overageCost: number;
}

export interface JobResult {
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  contractsChecked: number;
  warningsGenerated: ContractHoursWarning[];
  errors: Array<{ contractId: string; error: string }>;
}

let lastJobResult: JobResult | null = null;

/**
 * Calculate used hours for a contract in the current month
 */
async function calculateUsedHours(contractId: string, customerId: string, userId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Get time entries for this customer in the current month
  // Only count customer_project entries (not internal or absence)
  const result = await pool.query(
    `SELECT COALESCE(SUM(
      CASE
        WHEN duration_seconds IS NOT NULL THEN duration_seconds / 3600.0
        WHEN end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
        ELSE 0
      END
    ), 0) as total_hours
    FROM time_entries
    WHERE customer_id = $1
      AND user_id = $2
      AND start_time >= $3
      AND start_time <= $4
      AND entry_scope = 'customer_project'
      AND deleted_at IS NULL`,
    [customerId, userId, startOfMonth.toISOString(), endOfMonth.toISOString()]
  );

  return parseFloat(result.rows[0]?.total_hours || 0);
}

/**
 * Get severity level based on usage percentage
 */
function getSeverity(usagePercent: number): 'warning' | 'critical' | 'exceeded' | null {
  if (usagePercent >= THRESHOLDS.exceeded) return 'exceeded';
  if (usagePercent >= THRESHOLDS.critical) return 'critical';
  if (usagePercent >= THRESHOLDS.warning) return 'warning';
  return null;
}

/**
 * Run the contract hours check job
 */
export async function runContractHoursJob(): Promise<JobResult> {
  if (isJobRunning) {
    logger.info('[ContractHoursJob] Job already running, skipping...');
    return {
      success: false,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      contractsChecked: 0,
      warningsGenerated: [],
      errors: [{ contractId: 'N/A', error: 'Job already running' }]
    };
  }

  isJobRunning = true;
  const startedAt = new Date();
  const warnings: ContractHoursWarning[] = [];
  const errors: Array<{ contractId: string; error: string }> = [];
  let contractsChecked = 0;

  logger.info('[ContractHoursJob] ========================================');
  logger.info('[ContractHoursJob] Starting contract hours check');
  logger.info('[ContractHoursJob] ========================================');

  try {
    // Get all active contracts with included_hours_monthly
    const contractsResult = await pool.query(
      `SELECT
        c.id,
        c.name,
        c.contract_number,
        c.customer_id,
        c.user_id,
        c.organization_id,
        c.included_hours_monthly,
        c.overage_rate,
        cust.name as customer_name
      FROM contracts c
      JOIN customers cust ON c.customer_id = cust.id
      WHERE c.status = 'active'
        AND c.included_hours_monthly IS NOT NULL
        AND c.included_hours_monthly > 0
        AND c.deleted_at IS NULL
      ORDER BY c.organization_id, cust.name`
    );

    const contracts = contractsResult.rows;
    logger.info(`[ContractHoursJob] Found ${contracts.length} active contracts with hour limits`);

    for (const contract of contracts) {
      try {
        contractsChecked++;

        const usedHours = await calculateUsedHours(
          contract.id,
          contract.customer_id,
          contract.user_id
        );

        const includedHours = parseFloat(contract.included_hours_monthly);
        const usagePercent = (usedHours / includedHours) * 100;
        const severity = getSeverity(usagePercent);

        if (severity) {
          const remainingHours = Math.max(0, includedHours - usedHours);
          const overageHours = Math.max(0, usedHours - includedHours);
          const overageRate = parseFloat(contract.overage_rate || 0);
          const overageCost = overageHours * overageRate;

          const warning: ContractHoursWarning = {
            contractId: contract.id,
            contractName: contract.name,
            contractNumber: contract.contract_number,
            customerId: contract.customer_id,
            customerName: contract.customer_name,
            organizationId: contract.organization_id,
            includedHours,
            usedHours: Math.round(usedHours * 100) / 100,
            remainingHours: Math.round(remainingHours * 100) / 100,
            usagePercent: Math.round(usagePercent * 10) / 10,
            severity,
            overageHours: Math.round(overageHours * 100) / 100,
            overageCost: Math.round(overageCost * 100) / 100,
          };

          warnings.push(warning);

          const emoji = severity === 'exceeded' ? '🔴' : severity === 'critical' ? '🟠' : '🟡';
          logger.info(
            `${emoji} [ContractHoursJob] ${contract.customer_name} (${contract.contract_number}): ` +
            `${usedHours.toFixed(1)}/${includedHours}h (${usagePercent.toFixed(1)}%) - ${severity.toUpperCase()}`
          );
        }
      } catch (error: any) {
        logger.error(`[ContractHoursJob] Error checking contract ${contract.id}:`, error);
        errors.push({ contractId: contract.id, error: error.message });
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    const result: JobResult = {
      success: true,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs,
      contractsChecked,
      warningsGenerated: warnings,
      errors,
    };

    lastJobResult = result;

    // Log summary
    logger.info('[ContractHoursJob] ========================================');
    logger.info('[ContractHoursJob] Job completed');
    logger.info(`[ContractHoursJob] Duration: ${durationMs}ms`);
    logger.info(`[ContractHoursJob] Contracts checked: ${contractsChecked}`);
    logger.info(`[ContractHoursJob] Warnings: ${warnings.length}`);
    logger.info(`[ContractHoursJob]   - Exceeded (100%+): ${warnings.filter(w => w.severity === 'exceeded').length}`);
    logger.info(`[ContractHoursJob]   - Critical (90%+): ${warnings.filter(w => w.severity === 'critical').length}`);
    logger.info(`[ContractHoursJob]   - Warning (80%+): ${warnings.filter(w => w.severity === 'warning').length}`);
    logger.info(`[ContractHoursJob] Errors: ${errors.length}`);
    logger.info('[ContractHoursJob] ========================================');

    return result;
  } catch (error: any) {
    const completedAt = new Date();
    logger.error('[ContractHoursJob] Fatal error:', error);

    const result: JobResult = {
      success: false,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      contractsChecked,
      warningsGenerated: warnings,
      errors: [...errors, { contractId: 'N/A', error: error.message }],
    };

    lastJobResult = result;
    return result;
  } finally {
    isJobRunning = false;
  }
}

/**
 * Start the scheduled contract hours job
 * Default schedule: Daily at 6:00 AM
 */
export function startContractHoursJob(schedule: string = '0 6 * * *'): void {
  if (process.env.CONTRACT_HOURS_JOB_ENABLED === 'false') {
    logger.info('[ContractHoursJob] Contract hours job disabled via environment');
    return;
  }

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  if (!cron.validate(schedule)) {
    logger.error(`[ContractHoursJob] Invalid cron expression: ${schedule}`);
    return;
  }

  scheduledTask = cron.schedule(schedule, async () => {
    logger.info(`[ContractHoursJob] Triggered at ${new Date().toISOString()}`);
    await runContractHoursJob();
  });

  logger.info(`[ContractHoursJob] Contract hours job scheduled: ${schedule}`);
  logger.info('[ContractHoursJob] Next run: Daily at 6:00 AM (default)');
}

/**
 * Stop the scheduled job
 */
export function stopContractHoursJob(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[ContractHoursJob] Contract hours job stopped');
  }
}

/**
 * Get job status
 */
export function getContractHoursJobStatus(): {
  isRunning: boolean;
  lastResult: JobResult | null;
  isScheduled: boolean;
} {
  return {
    isRunning: isJobRunning,
    lastResult: lastJobResult,
    isScheduled: scheduledTask !== null,
  };
}

/**
 * Run job for a specific organization (for manual trigger)
 */
export async function runContractHoursJobForOrganization(organizationId: string): Promise<{
  success: boolean;
  warnings: ContractHoursWarning[];
  errors: Array<{ contractId: string; error: string }>;
}> {
  logger.info(`[ContractHoursJob] Manual trigger for organization: ${organizationId}`);

  const warnings: ContractHoursWarning[] = [];
  const errors: Array<{ contractId: string; error: string }> = [];

  try {
    const contractsResult = await pool.query(
      `SELECT
        c.id,
        c.name,
        c.contract_number,
        c.customer_id,
        c.user_id,
        c.organization_id,
        c.included_hours_monthly,
        c.overage_rate,
        cust.name as customer_name
      FROM contracts c
      JOIN customers cust ON c.customer_id = cust.id
      WHERE c.organization_id = $1
        AND c.status = 'active'
        AND c.included_hours_monthly IS NOT NULL
        AND c.included_hours_monthly > 0
        AND c.deleted_at IS NULL
      ORDER BY cust.name`,
      [organizationId]
    );

    for (const contract of contractsResult.rows) {
      try {
        const usedHours = await calculateUsedHours(
          contract.id,
          contract.customer_id,
          contract.user_id
        );

        const includedHours = parseFloat(contract.included_hours_monthly);
        const usagePercent = (usedHours / includedHours) * 100;
        const severity = getSeverity(usagePercent);

        if (severity) {
          const remainingHours = Math.max(0, includedHours - usedHours);
          const overageHours = Math.max(0, usedHours - includedHours);
          const overageRate = parseFloat(contract.overage_rate || 0);
          const overageCost = overageHours * overageRate;

          warnings.push({
            contractId: contract.id,
            contractName: contract.name,
            contractNumber: contract.contract_number,
            customerId: contract.customer_id,
            customerName: contract.customer_name,
            organizationId: contract.organization_id,
            includedHours,
            usedHours: Math.round(usedHours * 100) / 100,
            remainingHours: Math.round(remainingHours * 100) / 100,
            usagePercent: Math.round(usagePercent * 10) / 10,
            severity,
            overageHours: Math.round(overageHours * 100) / 100,
            overageCost: Math.round(overageCost * 100) / 100,
          });
        }
      } catch (error: any) {
        errors.push({ contractId: contract.id, error: error.message });
      }
    }

    return { success: true, warnings, errors };
  } catch (error: any) {
    return {
      success: false,
      warnings,
      errors: [...errors, { contractId: 'N/A', error: error.message }],
    };
  }
}
