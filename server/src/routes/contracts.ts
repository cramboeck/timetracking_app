import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import * as contractService from '../services/contractService';

const router = express.Router();

// ============================================
// Contract Routes
// ============================================

// GET /api/contracts - Get all contracts
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const { customerId, status, contractType, search } = req.query;

    const contracts = await contractService.getContracts(organizationId, {
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
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const summary = await contractService.getContractSummary(organizationId);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Get contract summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/expiring - Get expiring contracts
router.get('/expiring', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const daysAhead = parseInt(req.query.days as string) || 30;
    const contracts = await contractService.getExpiringContracts(organizationId, daysAhead);

    res.json({ success: true, data: contracts });
  } catch (error: any) {
    console.error('Get expiring contracts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/next-number - Get next contract number
router.get('/next-number', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const nextNumber = await contractService.getNextContractNumber(organizationId);
    res.json({ success: true, data: nextNumber });
  } catch (error: any) {
    console.error('Get next contract number error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/customer/:customerId - Get contracts by customer
router.get('/customer/:customerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const { customerId } = req.params;
    const contracts = await contractService.getContractsByCustomer(organizationId, customerId);

    res.json({ success: true, data: contracts });
  } catch (error: any) {
    console.error('Get customer contracts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/contracts/:id - Get single contract
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const contract = await contractService.getContractById(organizationId, req.params.id);

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
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

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

    const contract = await contractService.createContract(organizationId, userId, {
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
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const contract = await contractService.updateContract(
      organizationId,
      req.params.id,
      userId,
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
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const deleted = await contractService.deleteContract(organizationId, req.params.id, userId);

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
router.post('/:id/positions', authenticateToken, async (req: AuthRequest, res: Response) => {
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
router.put('/:id/hours', authenticateToken, async (req: AuthRequest, res: Response) => {
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
    const organizationId = req.user!.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization nicht gefunden' });
    }

    const updatedCount = await contractService.updateContractStatuses(organizationId);
    res.json({ success: true, data: { updatedCount } });
  } catch (error: any) {
    console.error('Update contract statuses error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
