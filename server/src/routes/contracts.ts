import express, { Response } from 'express';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import * as contractService from '../services/contractService';
import { runContractHoursJobForOrganization, getContractHoursJobStatus } from '../jobs/contractHoursCron';

const router = express.Router();

// ============================================================================
// Zod validation schemas
// ============================================================================

const contractStatusSchema = z.enum(['draft', 'active', 'expiring', 'expired', 'cancelled', 'paused']);
const contractTypeSchema = z.enum(['service', 'maintenance', 'support', 'license', 'subscription', 'project', 'other']);
const billingCycleSchema = z.enum(['monthly', 'quarterly', 'yearly', 'one_time']);

const createContractSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().trim().min(1).max(500),
  startDate: z.string().min(1), // ISO date or 'YYYY-MM-DD'
  contractNumber: z.string().max(100).optional().nullable(),
  description: z.string().max(10_000).optional().nullable(),
  contractType: contractTypeSchema.optional(),
  status: contractStatusSchema.optional(),
  endDate: z.string().optional().nullable(),
  isIndefinite: z.boolean().optional(),
  noticePeriodDays: z.number().int().nonnegative().optional().nullable(),
  autoRenew: z.boolean().optional(),
  renewalPeriodMonths: z.number().int().positive().optional().nullable(),
  billingCycle: billingCycleSchema.optional(),
  basePrice: z.number().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional(),
  includedHoursMonthly: z.number().nonnegative().optional().nullable(),
  hourlyRate: z.number().nonnegative().optional().nullable(),
  overageRate: z.number().nonnegative().optional().nullable(),
  slaResponseHours: z.number().nonnegative().optional().nullable(),
  slaResolutionHours: z.number().nonnegative().optional().nullable(),
  supportHours: z.string().max(500).optional().nullable(),
  documentUrl: z.string().url().optional().nullable(),
  internalNotes: z.string().max(10_000).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
});

const updateContractSchema = createContractSchema.partial();

const contractPositionSchema = z.object({
  name: z.string().trim().min(1).max(500),
  description: z.string().max(5_000).optional().nullable(),
  quantity: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative().optional(),
  unit: z.string().max(50).optional(),
}).passthrough();

const updateContractHoursSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  usedHours: z.number().nonnegative(),
});

// ============================================
// Contract Routes
// ============================================

// GET /api/contracts - Get all contracts
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { customerId, status, contractType, search } = req.query;

    const contracts = await contractService.getContracts(userId, {
      customerId: customerId as string | undefined,
      status: status as string | undefined,
      contractType: contractType as string | undefined,
      search: search as string | undefined,
    });

    res.json({ success: true, data: contracts });
  } catch (error: any) {
    console.error('Get contracts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/summary - Get contract summary/statistics
router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const summary = await contractService.getContractSummary(userId);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Get contract summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/expiring - Get expiring contracts
router.get('/expiring', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const daysAhead = parseInt(req.query.days as string) || 30;
    const contracts = await contractService.getExpiringContracts(userId, daysAhead);

    res.json({ success: true, data: contracts });
  } catch (error: any) {
    console.error('Get expiring contracts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/next-number - Get next contract number
router.get('/next-number', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const nextNumber = await contractService.getNextContractNumber(userId);
    res.json({ success: true, data: nextNumber });
  } catch (error: any) {
    console.error('Get next contract number error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/customer/:customerId - Get contracts by customer
router.get('/customer/:customerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { customerId } = req.params;
    const contracts = await contractService.getContractsByCustomer(userId, customerId);

    res.json({ success: true, data: contracts });
  } catch (error: any) {
    console.error('Get customer contracts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/:id - Get single contract
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const contract = await contractService.getContractById(userId, req.params.id);

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Vertrag nicht gefunden' });
    }

    res.json({ success: true, data: contract });
  } catch (error: any) {
    console.error('Get contract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contracts - Create new contract
router.post('/', authenticateToken, validate(createContractSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const {
      customerId,
      contractNumber,
      name,
      description,
      contractType,
      status,
      startDate,
      endDate,
      isIndefinite,
      noticePeriodDays,
      autoRenew,
      renewalPeriodMonths,
      billingCycle,
      basePrice,
      currency,
      includedHoursMonthly,
      hourlyRate,
      overageRate,
      slaResponseHours,
      slaResolutionHours,
      supportHours,
      documentUrl,
      internalNotes,
      projectId,
    } = req.body;

    if (!customerId || !name || !startDate) {
      return res.status(400).json({
        success: false,
        error: 'Kunde, Name und Startdatum sind erforderlich',
      });
    }

    const contract = await contractService.createContract(userId, {
      customerId,
      contractNumber,
      name,
      description,
      contractType,
      status,
      startDate,
      endDate,
      isIndefinite,
      noticePeriodDays,
      autoRenew,
      renewalPeriodMonths,
      billingCycle,
      basePrice,
      currency,
      includedHoursMonthly,
      hourlyRate,
      overageRate,
      slaResponseHours,
      slaResolutionHours,
      supportHours,
      documentUrl,
      internalNotes,
      projectId,
    });

    res.status(201).json({ success: true, data: contract });
  } catch (error: any) {
    console.error('Create contract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/contracts/:id - Update contract
router.put('/:id', authenticateToken, validate(updateContractSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const contract = await contractService.updateContract(
      userId,
      req.params.id,
      req.body
    );

    if (!contract) {
      return res.status(404).json({ success: false, error: 'Vertrag nicht gefunden' });
    }

    res.json({ success: true, data: contract });
  } catch (error: any) {
    console.error('Update contract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/contracts/:id - Delete contract
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const deleted = await contractService.deleteContract(userId, req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Vertrag nicht gefunden' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete contract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Contract Position Routes
// ============================================

// GET /api/contracts/:id/positions - Get contract positions
router.get('/:id/positions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const positions = await contractService.getContractPositions(req.params.id);
    res.json({ success: true, data: positions });
  } catch (error: any) {
    console.error('Get contract positions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contracts/:id/positions - Create contract position
router.post('/:id/positions', authenticateToken, validate(contractPositionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const position = await contractService.createContractPosition(req.params.id, req.body);
    res.status(201).json({ success: true, data: position });
  } catch (error: any) {
    console.error('Create contract position error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/contracts/:id/positions/:positionId - Update contract position
router.put(
  '/:id/positions/:positionId',
  authenticateToken,
  validate(contractPositionSchema.partial()),
  async (req: AuthRequest, res: Response) => {
    try {
      const position = await contractService.updateContractPosition(
        req.params.positionId,
        req.body
      );

      if (!position) {
        return res.status(404).json({ success: false, error: 'Position nicht gefunden' });
      }

      res.json({ success: true, data: position });
    } catch (error: any) {
      console.error('Update contract position error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// DELETE /api/contracts/:id/positions/:positionId - Delete contract position
router.delete(
  '/:id/positions/:positionId',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await contractService.deleteContractPosition(req.params.positionId);

      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Position nicht gefunden' });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete contract position error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ============================================
// Contract Hourly Tracking Routes
// ============================================

// GET /api/contracts/:id/hours - Get hourly tracking
router.get('/:id/hours', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;

    const tracking = await contractService.getContractHourlyTracking(req.params.id, year, month);
    res.json({ success: true, data: tracking });
  } catch (error: any) {
    console.error('Get contract hourly tracking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/contracts/:id/hours - Update hourly tracking
router.put('/:id/hours', authenticateToken, validate(updateContractHoursSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { year, month, usedHours } = req.body;

    if (!year || !month || usedHours === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Jahr, Monat und verwendete Stunden sind erforderlich',
      });
    }

    const tracking = await contractService.updateContractHourlyTracking(
      req.params.id,
      year,
      month,
      usedHours
    );

    res.json({ success: true, data: tracking });
  } catch (error: any) {
    console.error('Update contract hourly tracking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Contract Activity Log
// ============================================

// GET /api/contracts/:id/activity - Get activity log
router.get('/:id/activity', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const activity = await contractService.getContractActivityLog(req.params.id);
    res.json({ success: true, data: activity });
  } catch (error: any) {
    console.error('Get contract activity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contracts/update-statuses - Update contract statuses (cron job endpoint)
router.post('/update-statuses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const updatedCount = await contractService.updateContractStatuses(userId);
    res.json({ success: true, data: { updatedCount } });
  } catch (error: any) {
    console.error('Update contract statuses error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Contract Hours Job Routes
// ============================================

// GET /api/contracts/hours-check/status - Get contract hours job status
router.get('/hours-check/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const status = getContractHoursJobStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    console.error('Get contract hours job status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contracts/hours-check/run - Manually trigger contract hours check
router.post('/hours-check/run', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Get user's organization
    const { pool } = await import('../config/database');
    const orgResult = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Keine Organisation gefunden'
      });
    }

    const organizationId = orgResult.rows[0].organization_id;
    const result = await runContractHoursJobForOrganization(organizationId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Run contract hours job error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
