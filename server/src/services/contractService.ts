import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface Contract {
  id: string;
  userId: string;
  customerId: string;
  contractNumber: string;
  name: string;
  description: string | null;
  contractType: 'service' | 'support' | 'maintenance' | 'project' | 'subscription' | 'framework' | 'other';
  status: 'draft' | 'active' | 'paused' | 'expiring' | 'expired' | 'cancelled' | 'terminated';
  startDate: string;
  endDate: string | null;
  isIndefinite: boolean;
  noticePeriodDays: number;
  autoRenew: boolean;
  renewalPeriodMonths: number;
  billingCycle: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time' | 'per_call';
  basePrice: number | null;
  currency: string;
  includedHoursMonthly: number | null;
  hourlyRate: number | null;
  overageRate: number | null;
  slaResponseHours: number | null;
  slaResolutionHours: number | null;
  supportHours: string | null;
  documentUrl: string | null;
  internalNotes: string | null;
  projectId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  customerName?: string;
  projectName?: string;
}

export interface ContractPosition {
  id: string;
  contractId: string;
  positionNumber: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  totalPrice: number | null;
  positionType: 'service' | 'product' | 'license' | 'hours' | 'flat_fee' | 'other';
  isRecurring: boolean;
  billingCycle: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time';
  sortOrder: number;
  createdAt: Date;
}

export interface ContractHourlyTracking {
  id: string;
  contractId: string;
  year: number;
  month: number;
  includedHours: number;
  usedHours: number;
  overageHours: number;
  rolloverHours: number;
  overageAmount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractSummary {
  totalContracts: number;
  activeContracts: number;
  expiringContracts: number;
  totalMonthlyRevenue: number;
  totalIncludedHours: number;
}

// ============================================
// Helper Functions
// ============================================

function mapContractRow(row: any): Contract {
  return {
    id: row.id,
    userId: row.user_id,
    customerId: row.customer_id,
    contractNumber: row.contract_number,
    name: row.name,
    description: row.description,
    contractType: row.contract_type,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    isIndefinite: row.is_indefinite,
    noticePeriodDays: row.notice_period_days,
    autoRenew: row.auto_renew,
    renewalPeriodMonths: row.renewal_period_months,
    billingCycle: row.billing_cycle,
    basePrice: row.base_price ? parseFloat(row.base_price) : null,
    currency: row.currency,
    includedHoursMonthly: row.included_hours_monthly ? parseFloat(row.included_hours_monthly) : null,
    hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
    overageRate: row.overage_rate ? parseFloat(row.overage_rate) : null,
    slaResponseHours: row.sla_response_hours,
    slaResolutionHours: row.sla_resolution_hours,
    supportHours: row.support_hours,
    documentUrl: row.document_url,
    internalNotes: row.internal_notes,
    projectId: row.project_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerName: row.customer_name,
    projectName: row.project_name,
  };
}

function mapPositionRow(row: any): ContractPosition {
  return {
    id: row.id,
    contractId: row.contract_id,
    positionNumber: row.position_number,
    name: row.name,
    description: row.description,
    quantity: parseFloat(row.quantity),
    unit: row.unit,
    unitPrice: row.unit_price ? parseFloat(row.unit_price) : null,
    totalPrice: row.total_price ? parseFloat(row.total_price) : null,
    positionType: row.position_type,
    isRecurring: row.is_recurring,
    billingCycle: row.billing_cycle,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// ============================================
// Contract CRUD
// ============================================

export async function getContracts(
  userId: string,
  filters?: {
    customerId?: string;
    status?: string;
    contractType?: string;
    search?: string;
  }
): Promise<Contract[]> {
  let sql = `
    SELECT c.*, cu.name as customer_name, p.name as project_name
    FROM contracts c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN projects p ON c.project_id = p.id
    WHERE c.user_id = $1
  `;
  const params: any[] = [userId];
  let paramIndex = 2;

  if (filters?.customerId) {
    sql += ` AND c.customer_id = $${paramIndex++}`;
    params.push(filters.customerId);
  }

  if (filters?.status) {
    sql += ` AND c.status = $${paramIndex++}`;
    params.push(filters.status);
  }

  if (filters?.contractType) {
    sql += ` AND c.contract_type = $${paramIndex++}`;
    params.push(filters.contractType);
  }

  if (filters?.search) {
    sql += ` AND (c.name ILIKE $${paramIndex} OR c.contract_number ILIKE $${paramIndex} OR cu.name ILIKE $${paramIndex})`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  sql += ` ORDER BY c.created_at DESC`;

  const result = await query(sql, params);
  return result.rows.map(mapContractRow);
}

export async function getContractById(
  userId: string,
  contractId: string
): Promise<Contract | null> {
  const result = await query(
    `SELECT c.*, cu.name as customer_name, p.name as project_name
     FROM contracts c
     LEFT JOIN customers cu ON c.customer_id = cu.id
     LEFT JOIN projects p ON c.project_id = p.id
     WHERE c.id = $1 AND c.user_id = $2`,
    [contractId, userId]
  );

  if (result.rows.length === 0) return null;
  return mapContractRow(result.rows[0]);
}

export async function getNextContractNumber(userId: string): Promise<string> {
  const result = await query(
    `SELECT contract_number FROM contracts
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return 'V-0001';
  }

  const lastNumber = result.rows[0].contract_number;
  const match = lastNumber.match(/V-(\d+)/);
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `V-${nextNum.toString().padStart(4, '0')}`;
  }

  return 'V-0001';
}

export async function createContract(
  userId: string,
  data: Partial<Contract>
): Promise<Contract> {
  const id = uuidv4();
  const contractNumber = data.contractNumber || (await getNextContractNumber(userId));

  const result = await query(
    `INSERT INTO contracts (
      id, user_id, customer_id, contract_number, name, description,
      contract_type, status, start_date, end_date, is_indefinite,
      notice_period_days, auto_renew, renewal_period_months,
      billing_cycle, base_price, currency,
      included_hours_monthly, hourly_rate, overage_rate,
      sla_response_hours, sla_resolution_hours, support_hours,
      document_url, internal_notes, project_id, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27
    ) RETURNING *`,
    [
      id,
      userId,
      data.customerId,
      contractNumber,
      data.name,
      data.description || null,
      data.contractType || 'service',
      data.status || 'draft',
      data.startDate,
      data.endDate || null,
      data.isIndefinite || false,
      data.noticePeriodDays || 30,
      data.autoRenew || false,
      data.renewalPeriodMonths || 12,
      data.billingCycle || 'monthly',
      data.basePrice || null,
      data.currency || 'EUR',
      data.includedHoursMonthly || null,
      data.hourlyRate || null,
      data.overageRate || null,
      data.slaResponseHours || null,
      data.slaResolutionHours || null,
      data.supportHours || null,
      data.documentUrl || null,
      data.internalNotes || null,
      data.projectId || null,
      userId,
    ]
  );

  // Log activity
  await logContractActivity(id, userId, 'created', { contractNumber });

  return mapContractRow(result.rows[0]);
}

export async function updateContract(
  userId: string,
  contractId: string,
  data: Partial<Contract>
): Promise<Contract | null> {
  const existing = await getContractById(userId, contractId);
  if (!existing) return null;

  const result = await query(
    `UPDATE contracts SET
      customer_id = COALESCE($3, customer_id),
      name = COALESCE($4, name),
      description = COALESCE($5, description),
      contract_type = COALESCE($6, contract_type),
      status = COALESCE($7, status),
      start_date = COALESCE($8, start_date),
      end_date = $9,
      is_indefinite = COALESCE($10, is_indefinite),
      notice_period_days = COALESCE($11, notice_period_days),
      auto_renew = COALESCE($12, auto_renew),
      renewal_period_months = COALESCE($13, renewal_period_months),
      billing_cycle = COALESCE($14, billing_cycle),
      base_price = $15,
      currency = COALESCE($16, currency),
      included_hours_monthly = $17,
      hourly_rate = $18,
      overage_rate = $19,
      sla_response_hours = $20,
      sla_resolution_hours = $21,
      support_hours = $22,
      document_url = $23,
      internal_notes = $24,
      project_id = $25,
      updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      contractId,
      userId,
      data.customerId,
      data.name,
      data.description,
      data.contractType,
      data.status,
      data.startDate,
      data.endDate,
      data.isIndefinite,
      data.noticePeriodDays,
      data.autoRenew,
      data.renewalPeriodMonths,
      data.billingCycle,
      data.basePrice,
      data.currency,
      data.includedHoursMonthly,
      data.hourlyRate,
      data.overageRate,
      data.slaResponseHours,
      data.slaResolutionHours,
      data.supportHours,
      data.documentUrl,
      data.internalNotes,
      data.projectId,
    ]
  );

  if (result.rows.length === 0) return null;

  // Log activity
  await logContractActivity(contractId, userId, 'updated', {
    changes: Object.keys(data),
  });

  return mapContractRow(result.rows[0]);
}

export async function deleteContract(
  userId: string,
  contractId: string
): Promise<boolean> {
  const existing = await getContractById(userId, contractId);
  if (!existing) return false;

  await query('DELETE FROM contracts WHERE id = $1 AND user_id = $2', [
    contractId,
    userId,
  ]);

  return true;
}

// ============================================
// Contract Positions
// ============================================

export async function getContractPositions(contractId: string): Promise<ContractPosition[]> {
  const result = await query(
    `SELECT * FROM contract_positions WHERE contract_id = $1 ORDER BY sort_order, position_number`,
    [contractId]
  );
  return result.rows.map(mapPositionRow);
}

export async function createContractPosition(
  contractId: string,
  data: Partial<ContractPosition>
): Promise<ContractPosition> {
  const id = uuidv4();

  // Get next position number
  const countResult = await query(
    'SELECT COUNT(*) as count FROM contract_positions WHERE contract_id = $1',
    [contractId]
  );
  const positionNumber = parseInt(countResult.rows[0].count) + 1;

  const result = await query(
    `INSERT INTO contract_positions (
      id, contract_id, position_number, name, description,
      quantity, unit, unit_price, total_price,
      position_type, is_recurring, billing_cycle, sort_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      id,
      contractId,
      data.positionNumber || positionNumber,
      data.name,
      data.description || null,
      data.quantity || 1,
      data.unit || 'Stück',
      data.unitPrice || null,
      data.totalPrice || (data.quantity || 1) * (data.unitPrice || 0),
      data.positionType || 'service',
      data.isRecurring ?? true,
      data.billingCycle || 'monthly',
      data.sortOrder || 0,
    ]
  );

  return mapPositionRow(result.rows[0]);
}

export async function updateContractPosition(
  positionId: string,
  data: Partial<ContractPosition>
): Promise<ContractPosition | null> {
  const result = await query(
    `UPDATE contract_positions SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      quantity = COALESCE($4, quantity),
      unit = COALESCE($5, unit),
      unit_price = $6,
      total_price = $7,
      position_type = COALESCE($8, position_type),
      is_recurring = COALESCE($9, is_recurring),
      billing_cycle = COALESCE($10, billing_cycle),
      sort_order = COALESCE($11, sort_order)
     WHERE id = $1
     RETURNING *`,
    [
      positionId,
      data.name,
      data.description,
      data.quantity,
      data.unit,
      data.unitPrice,
      data.totalPrice || (data.quantity || 1) * (data.unitPrice || 0),
      data.positionType,
      data.isRecurring,
      data.billingCycle,
      data.sortOrder,
    ]
  );

  if (result.rows.length === 0) return null;
  return mapPositionRow(result.rows[0]);
}

export async function deleteContractPosition(positionId: string): Promise<boolean> {
  const result = await query('DELETE FROM contract_positions WHERE id = $1', [positionId]);
  return (result.rowCount ?? 0) > 0;
}

// ============================================
// Hourly Tracking
// ============================================

export async function getContractHourlyTracking(
  contractId: string,
  year?: number,
  month?: number
): Promise<ContractHourlyTracking[]> {
  let sql = 'SELECT * FROM contract_hourly_tracking WHERE contract_id = $1';
  const params: any[] = [contractId];

  if (year) {
    sql += ' AND year = $2';
    params.push(year);
    if (month) {
      sql += ' AND month = $3';
      params.push(month);
    }
  }

  sql += ' ORDER BY year DESC, month DESC';

  const result = await query(sql, params);
  return result.rows.map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    year: row.year,
    month: row.month,
    includedHours: parseFloat(row.included_hours),
    usedHours: parseFloat(row.used_hours),
    overageHours: parseFloat(row.overage_hours),
    rolloverHours: parseFloat(row.rollover_hours),
    overageAmount: parseFloat(row.overage_amount),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function updateContractHourlyTracking(
  contractId: string,
  year: number,
  month: number,
  usedHours: number
): Promise<ContractHourlyTracking> {
  // Get contract to check included hours
  const contractResult = await query(
    'SELECT included_hours_monthly, overage_rate FROM contracts WHERE id = $1',
    [contractId]
  );

  if (contractResult.rows.length === 0) {
    throw new Error('Contract not found');
  }

  const includedHours = parseFloat(contractResult.rows[0].included_hours_monthly) || 0;
  const overageRate = parseFloat(contractResult.rows[0].overage_rate) || 0;
  const overageHours = Math.max(0, usedHours - includedHours);
  const overageAmount = overageHours * overageRate;

  // Upsert tracking record
  const result = await query(
    `INSERT INTO contract_hourly_tracking (
      id, contract_id, year, month, included_hours, used_hours, overage_hours, overage_amount
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (contract_id, year, month)
    DO UPDATE SET
      used_hours = $6,
      overage_hours = $7,
      overage_amount = $8,
      updated_at = NOW()
    RETURNING *`,
    [uuidv4(), contractId, year, month, includedHours, usedHours, overageHours, overageAmount]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    contractId: row.contract_id,
    year: row.year,
    month: row.month,
    includedHours: parseFloat(row.included_hours),
    usedHours: parseFloat(row.used_hours),
    overageHours: parseFloat(row.overage_hours),
    rolloverHours: parseFloat(row.rollover_hours),
    overageAmount: parseFloat(row.overage_amount),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// Statistics & Summary
// ============================================

export async function getContractSummary(userId: string): Promise<ContractSummary> {
  const result = await query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'expiring' OR (end_date IS NOT NULL AND end_date <= CURRENT_DATE + INTERVAL '30 days' AND status = 'active')) as expiring,
      SUM(CASE WHEN status = 'active' AND billing_cycle = 'monthly' THEN COALESCE(base_price, 0) ELSE 0 END) as monthly_revenue,
      SUM(CASE WHEN status = 'active' THEN COALESCE(included_hours_monthly, 0) ELSE 0 END) as included_hours
     FROM contracts
     WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    totalContracts: parseInt(row.total) || 0,
    activeContracts: parseInt(row.active) || 0,
    expiringContracts: parseInt(row.expiring) || 0,
    totalMonthlyRevenue: parseFloat(row.monthly_revenue) || 0,
    totalIncludedHours: parseFloat(row.included_hours) || 0,
  };
}

export async function getExpiringContracts(
  userId: string,
  daysAhead: number = 30
): Promise<Contract[]> {
  const result = await query(
    `SELECT c.*, cu.name as customer_name
     FROM contracts c
     LEFT JOIN customers cu ON c.customer_id = cu.id
     WHERE c.user_id = $1
       AND c.status = 'active'
       AND c.end_date IS NOT NULL
       AND c.end_date <= CURRENT_DATE + INTERVAL '1 day' * $2
     ORDER BY c.end_date ASC`,
    [userId, daysAhead]
  );

  return result.rows.map(mapContractRow);
}

export async function getContractsByCustomer(
  userId: string,
  customerId: string
): Promise<Contract[]> {
  const result = await query(
    `SELECT c.*, cu.name as customer_name, p.name as project_name
     FROM contracts c
     LEFT JOIN customers cu ON c.customer_id = cu.id
     LEFT JOIN projects p ON c.project_id = p.id
     WHERE c.user_id = $1 AND c.customer_id = $2
     ORDER BY c.status, c.created_at DESC`,
    [userId, customerId]
  );

  return result.rows.map(mapContractRow);
}

// ============================================
// Activity Log
// ============================================

async function logContractActivity(
  contractId: string,
  userId: string,
  action: string,
  details: any
): Promise<void> {
  await query(
    `INSERT INTO contract_activity_log (id, contract_id, user_id, action, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv4(), contractId, userId, action, JSON.stringify(details)]
  );
}

export async function getContractActivityLog(
  contractId: string
): Promise<Array<{ id: string; userId: string; action: string; details: any; createdAt: Date }>> {
  const result = await query(
    `SELECT * FROM contract_activity_log WHERE contract_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [contractId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  }));
}

// ============================================
// Status Updates
// ============================================

export async function updateContractStatuses(userId: string): Promise<number> {
  // Mark contracts as expiring if end_date is within 30 days
  const expiringResult = await query(
    `UPDATE contracts
     SET status = 'expiring', updated_at = NOW()
     WHERE user_id = $1
       AND status = 'active'
       AND end_date IS NOT NULL
       AND end_date <= CURRENT_DATE + INTERVAL '30 days'
       AND end_date > CURRENT_DATE`,
    [userId]
  );

  // Mark contracts as expired if end_date has passed
  const expiredResult = await query(
    `UPDATE contracts
     SET status = 'expired', updated_at = NOW()
     WHERE user_id = $1
       AND status IN ('active', 'expiring')
       AND end_date IS NOT NULL
       AND end_date < CURRENT_DATE`,
    [userId]
  );

  return (expiringResult.rowCount ?? 0) + (expiredResult.rowCount ?? 0);
}
