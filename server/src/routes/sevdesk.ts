import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import * as sevdeskService from '../services/sevdeskService';

const router = express.Router();

// Middleware to check if billing feature is enabled
async function requireBillingFeature(req: AuthRequest, res: Response, next: Function) {
  try {
    const userId = req.user!.id;
    const result = await query(
      "SELECT feature_flags->>'billing_enabled' as billing_enabled FROM users WHERE id = $1",
      [userId]
    );

    const billingEnabled = result.rows[0]?.billing_enabled === 'true';

    if (!billingEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Billing feature is not enabled for your account',
        code: 'FEATURE_NOT_ENABLED',
      });
    }

    next();
  } catch (error) {
    console.error('Feature check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check feature access' });
  }
}

// GET /api/sevdesk/feature-status - Check if billing feature is enabled
router.get('/feature-status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      "SELECT feature_flags FROM users WHERE id = $1",
      [userId]
    );

    const featureFlags = result.rows[0]?.feature_flags || {};

    res.json({
      success: true,
      data: {
        billingEnabled: featureFlags.billing_enabled === true,
        ninjaRmmEnabled: featureFlags.ninja_rmm_enabled === true,
      },
    });
  } catch (error: any) {
    console.error('Feature status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/config - Get sevDesk configuration
router.get('/config', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    res.json({
      success: true,
      data: config ? {
        ...config,
        apiToken: config.apiToken ? '••••••••' : null, // Don't expose full token
        hasToken: !!config.apiToken,
      } : null,
    });
  } catch (error: any) {
    console.error('Get config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/sevdesk/config - Save sevDesk configuration
router.put('/config', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { apiToken, defaultHourlyRate, paymentTermsDays, taxRate, autoSyncCustomers, createAsFinal } = req.body;

    const config = await sevdeskService.saveConfig(userId, {
      apiToken,
      defaultHourlyRate,
      paymentTermsDays,
      taxRate,
      autoSyncCustomers,
      createAsFinal,
    });

    res.json({
      success: true,
      data: {
        ...config,
        apiToken: config.apiToken ? '••••••••' : null,
        hasToken: !!config.apiToken,
      },
    });
  } catch (error: any) {
    console.error('Save config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/test-connection - Test sevDesk API connection
router.post('/test-connection', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const { apiToken } = req.body;

    if (!apiToken) {
      return res.status(400).json({ success: false, error: 'API token is required' });
    }

    const result = await sevdeskService.testConnection(apiToken);

    res.json({
      success: result.success,
      companyName: result.companyName,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Test connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/customers - Get customers from sevDesk
router.get('/customers', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const customers = await sevdeskService.getSevdeskCustomers(config.apiToken);

    res.json({
      success: true,
      data: customers,
    });
  } catch (error: any) {
    console.error('Get sevDesk customers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/link-customer - Link local customer to sevDesk customer
router.post('/link-customer', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, sevdeskCustomerId } = req.body;

    if (!customerId || !sevdeskCustomerId) {
      return res.status(400).json({ success: false, error: 'customerId and sevdeskCustomerId are required' });
    }

    await sevdeskService.linkCustomerToSevdesk(customerId, sevdeskCustomerId);

    res.json({
      success: true,
      message: 'Customer linked successfully',
    });
  } catch (error: any) {
    console.error('Link customer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/billing-summary - Get unbilled time entries summary
router.get('/billing-summary', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
    }

    const summary = await sevdeskService.getBillingSummary(
      userId,
      startDate as string,
      endDate as string
    );

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Billing summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/create-invoice - Create invoice in sevDesk
router.post('/create-invoice', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, entryIds, periodStart, periodEnd } = req.body;

    if (!customerId || !entryIds || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'customerId, entryIds, periodStart, and periodEnd are required',
      });
    }

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    // Get customer info
    const customerResult = await query(
      'SELECT id, name, hourly_rate, sevdesk_customer_id FROM customers WHERE id = $1 AND user_id = $2',
      [customerId, userId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    if (!customer.sevdesk_customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Customer is not linked to a sevDesk contact',
      });
    }

    const hourlyRate = customer.hourly_rate ? parseFloat(customer.hourly_rate) : config.defaultHourlyRate;

    // Get time entries
    const entries = await sevdeskService.getUnbilledTimeEntries(userId, customerId, periodStart, periodEnd);
    const selectedEntries = entries.filter(e => entryIds.includes(e.id));

    if (selectedEntries.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid time entries selected' });
    }

    // Calculate totals
    const totalSeconds = selectedEntries.reduce((sum, e) => sum + e.duration, 0);
    const totalHours = Math.round((totalSeconds / 3600) * 100) / 100;
    const totalAmount = Math.round(totalHours * hourlyRate * 100) / 100;

    // Create invoice in sevDesk
    const invoice = await sevdeskService.createInvoice(
      config.apiToken,
      config,
      customer.sevdesk_customer_id,
      selectedEntries,
      hourlyRate,
      periodStart,
      periodEnd
    );

    // Record the export
    const exportId = await sevdeskService.recordInvoiceExport(
      userId,
      customerId,
      entryIds,
      invoice.invoiceId,
      invoice.invoiceNumber,
      periodStart,
      periodEnd,
      totalHours,
      totalAmount
    );

    res.json({
      success: true,
      data: {
        exportId,
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        totalHours,
        totalAmount,
      },
    });
  } catch (error: any) {
    console.error('Create invoice error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/record-export - Record time entries as exported (without sevDesk)
router.post('/record-export', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, entryIds, periodStart, periodEnd, totalHours, totalAmount } = req.body;

    if (!customerId || !entryIds || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'customerId, entryIds, periodStart, and periodEnd are required',
      });
    }

    const exportId = await sevdeskService.recordInvoiceExport(
      userId,
      customerId,
      entryIds,
      null,
      null,
      periodStart,
      periodEnd,
      totalHours || 0,
      totalAmount || 0
    );

    res.json({
      success: true,
      data: { exportId },
    });
  } catch (error: any) {
    console.error('Record export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/invoice-exports - Get invoice export history
router.get('/invoice-exports', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const exports = await sevdeskService.getInvoiceExports(userId, limit);

    res.json({
      success: true,
      data: exports,
    });
  } catch (error: any) {
    console.error('Get invoice exports error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
