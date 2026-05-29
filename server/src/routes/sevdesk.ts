import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import * as sevdeskService from '../services/sevdeskService';
import * as aiService from '../services/aiService';

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
    const { customerId, entryIds, periodStart, periodEnd, header, headText, footText, positions } = req.body;

    console.log('[create-invoice] Starting invoice creation for customer:', customerId);
    console.log('[create-invoice] Custom texts provided:', !!header, !!headText, !!footText);
    console.log('[create-invoice] Custom positions:', positions?.length || 0);

    if (!customerId || !entryIds || !periodStart || !periodEnd) {
      console.log('[create-invoice] Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'customerId, entryIds, periodStart, and periodEnd are required',
      });
    }

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      console.log('[create-invoice] No sevDesk API token configured');
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }
    console.log('[create-invoice] Config loaded, API token exists:', !!config.apiToken);

    // Get customer info
    const customerResult = await query(
      'SELECT id, name, hourly_rate, sevdesk_customer_id, time_rounding_interval FROM customers WHERE id = $1 AND user_id = $2',
      [customerId, userId]
    );

    if (customerResult.rows.length === 0) {
      console.log('[create-invoice] Customer not found');
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];
    console.log('[create-invoice] Customer:', customer.name, 'sevDesk ID:', customer.sevdesk_customer_id);

    if (!customer.sevdesk_customer_id) {
      console.log('[create-invoice] Customer not linked to sevDesk');
      return res.status(400).json({
        success: false,
        error: 'Kunde ist nicht mit einem sevdesk-Kontakt verknüpft.',
        code: 'CUSTOMER_NOT_LINKED',
        customerId,
      });
    }

    const hourlyRate = customer.hourly_rate ? parseFloat(customer.hourly_rate) : config.defaultHourlyRate;
    console.log('[create-invoice] Hourly rate:', hourlyRate);

    // Get time entries to verify they exist
    const entries = await sevdeskService.getUnbilledTimeEntries(userId, customerId, periodStart, periodEnd);
    const selectedEntries = entries.filter(e => entryIds.includes(e.id));
    console.log('[create-invoice] Found', entries.length, 'entries, selected', selectedEntries.length);

    if (selectedEntries.length === 0) {
      console.log('[create-invoice] No valid entries selected');
      return res.status(400).json({ success: false, error: 'No valid time entries selected' });
    }

    // Calculate totals - use grouped positions if provided, otherwise calculate from entries
    let totalHours: number;
    let totalAmount: number;

    if (positions && positions.length > 0) {
      // Use the grouped positions data from frontend
      totalHours = positions.reduce((sum: number, p: any) => sum + (p.hours || 0), 0);
      totalAmount = positions.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      console.log('[create-invoice] Using grouped positions - Total hours:', totalHours, 'amount:', totalAmount);
    } else {
      // Fallback: calculate from entries
      const roundingInterval = customer.time_rounding_interval || 15;
      const roundedSeconds = selectedEntries.reduce((sum, e) => {
        const intervalSeconds = roundingInterval * 60;
        return sum + Math.ceil(e.duration / intervalSeconds) * intervalSeconds;
      }, 0);
      totalHours = Math.round((roundedSeconds / 3600) * 100) / 100;
      totalAmount = Math.round(totalHours * hourlyRate * 100) / 100;
      console.log('[create-invoice] Calculated from entries - Total hours:', totalHours, 'amount:', totalAmount);
    }

    // Create invoice in sevDesk with custom texts and positions
    console.log('[create-invoice] Calling sevdeskService.createInvoice...');
    const invoice = await sevdeskService.createInvoice(
      config.apiToken,
      config,
      customer.sevdesk_customer_id,
      selectedEntries,
      hourlyRate,
      periodStart,
      periodEnd,
      {
        header,
        headText,
        footText,
        positions,
      }
    );
    console.log('[create-invoice] Invoice created:', invoice.invoiceId, invoice.invoiceNumber);

    // Record the export
    console.log('[create-invoice] Recording export...');
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
    console.log('[create-invoice] Export recorded:', exportId);

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
    console.error('[create-invoice] ERROR:', error);
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

// POST /api/sevdesk/generate-invoice-texts - Generate AI-enhanced invoice texts
router.post('/generate-invoice-texts', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, sevdeskContactId, periodStart, periodEnd, entries } = req.body;

    if (!customerId || !periodStart || !periodEnd || !entries) {
      return res.status(400).json({
        success: false,
        error: 'customerId, periodStart, periodEnd, and entries are required',
      });
    }

    // Get customer name
    const customerResult = await query(
      'SELECT name FROM customers WHERE id = $1 AND user_id = $2',
      [customerId, userId]
    );
    const customerName = customerResult.rows[0]?.name || 'Kunde';

    // Get previous invoices for this customer from local DB
    let previousInvoices: any[] = [];
    if (sevdeskContactId) {
      previousInvoices = await sevdeskService.getPreviousInvoicesForContact(
        userId,
        sevdeskContactId,
        5
      );
    }

    // Calculate total hours
    const totalHours = entries.reduce((sum: number, e: any) => sum + (e.hours || e.duration / 3600 || 0), 0);

    // Generate AI texts
    const generatedTexts = await aiService.generateInvoiceTexts(userId, {
      customerName,
      periodStart,
      periodEnd,
      totalHours,
      entries: entries.map((e: any) => ({
        description: e.description || '',
        hours: e.hours || e.duration / 3600 || 0,
        projectName: e.projectName || '',
      })),
      previousInvoices: previousInvoices.map(inv => ({
        header: inv.header,
        headText: inv.headText,
        footText: inv.footText,
        positions: inv.positions,
      })),
    });

    res.json({
      success: true,
      data: {
        ...generatedTexts,
        previousInvoicesCount: previousInvoices.length,
      },
    });
  } catch (error: any) {
    console.error('Generate invoice texts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to round up seconds to nearest interval (in minutes)
function roundUpToInterval(seconds: number, intervalMinutes: number): number {
  if (intervalMinutes <= 0) return seconds;
  const intervalSeconds = intervalMinutes * 60;
  return Math.ceil(seconds / intervalSeconds) * intervalSeconds;
}

// POST /api/sevdesk/create-export - Simple export: mark all unbilled entries for customer/period as billed
router.post('/create-export', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, periodStart, periodEnd } = req.body;

    if (!customerId || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'customerId, periodStart, and periodEnd are required',
      });
    }

    // Get customer info for hourly rate and rounding interval
    const customerResult = await query(
      'SELECT id, name, hourly_rate, time_rounding_interval FROM customers WHERE id = $1 AND user_id = $2',
      [customerId, userId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];
    const roundingInterval = customer.time_rounding_interval || 15; // Default 15 minutes

    // Get config for default hourly rate
    const config = await sevdeskService.getConfig(userId);
    const hourlyRate = customer.hourly_rate ? parseFloat(customer.hourly_rate) : (config?.defaultHourlyRate || 95);

    // Get all unbilled entries for this customer in the period
    const entries = await sevdeskService.getUnbilledTimeEntries(userId, customerId, periodStart, periodEnd);

    if (entries.length === 0) {
      return res.status(400).json({ success: false, error: 'Keine offenen Zeiteinträge für diesen Zeitraum gefunden' });
    }

    const entryIds = entries.map(e => e.id);

    // Calculate totals with rounding
    const totalSeconds = entries.reduce((sum, e) => sum + e.duration, 0);
    // Round up each entry individually, then sum
    const roundedSeconds = entries.reduce((sum, e) => sum + roundUpToInterval(e.duration, roundingInterval), 0);

    const totalHours = Math.round((totalSeconds / 3600) * 100) / 100;
    const roundedHours = Math.round((roundedSeconds / 3600) * 100) / 100;
    // Amount is calculated based on ROUNDED hours
    const totalAmount = Math.round(roundedHours * hourlyRate * 100) / 100;

    // Record the export (marks entries as billed) - store rounded hours as the billing hours
    const exportId = await sevdeskService.recordInvoiceExport(
      userId,
      customerId,
      entryIds,
      null, // no sevDesk invoice ID
      null, // no sevDesk invoice number
      periodStart,
      periodEnd,
      roundedHours, // Use rounded hours for the export record
      totalAmount
    );

    res.json({
      success: true,
      data: {
        exportId,
        totalHours,
        roundedHours,
        totalAmount,
        entriesCount: entries.length,
        roundingInterval,
      },
    });
  } catch (error: any) {
    console.error('Create export error:', error);
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

// DELETE /api/sevdesk/invoice-exports/:id - Delete an export (undo billing)
router.delete('/invoice-exports/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const exportId = req.params.id;

    await sevdeskService.deleteInvoiceExport(userId, exportId);

    res.json({
      success: true,
    });
  } catch (error: any) {
    console.error('Delete invoice export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/invoices - Get invoices from sevDesk
router.get('/invoices', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const { limit, offset, contactId, status, startDate, endDate } = req.query;

    const invoices = await sevdeskService.getInvoices(config.apiToken, {
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      contactId: contactId as string,
      status: status ? parseInt(status as string) : undefined,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json({
      success: true,
      data: invoices,
    });
  } catch (error: any) {
    console.error('Get invoices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/invoices/:id - Get single invoice with positions
router.get('/invoices/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const invoice = await sevdeskService.getInvoiceWithPositions(config.apiToken, req.params.id);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({
      success: true,
      data: invoice,
    });
  } catch (error: any) {
    console.error('Get invoice error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/quotes - Get quotes/offers from sevDesk
router.get('/quotes', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const { limit, offset, contactId, status } = req.query;

    const quotes = await sevdeskService.getQuotes(config.apiToken, {
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      contactId: contactId as string,
      status: status ? parseInt(status as string) : undefined,
    });

    res.json({
      success: true,
      data: quotes,
    });
  } catch (error: any) {
    console.error('Get quotes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/quotes/:id - Get single quote with positions
router.get('/quotes/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const quote = await sevdeskService.getQuoteWithPositions(config.apiToken, req.params.id);

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Quote not found' });
    }

    res.json({
      success: true,
      data: quote,
    });
  } catch (error: any) {
    console.error('Get quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Voucher (Beleg) Routes
// ============================================

// GET /api/sevdesk/vouchers - Get vouchers from sevDesk
router.get('/vouchers', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 500;
    const creditDebit = req.query.creditDebit as 'C' | 'D' | undefined;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    const vouchers = await sevdeskService.getVouchers(config.apiToken, {
      limit,
      creditDebit,
    });

    res.json({
      success: true,
      data: vouchers,
    });
  } catch (error: any) {
    console.error('Get vouchers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/vouchers/:id - Get single voucher
router.get('/vouchers/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const voucherId = req.params.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    const voucher = await sevdeskService.getVoucherDetail(config.apiToken, voucherId);
    if (!voucher) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }

    res.json({
      success: true,
      data: voucher,
    });
  } catch (error: any) {
    console.error('Get voucher detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/vouchers/upload - Upload a voucher file
router.post('/vouchers/upload', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    // Check if file data is provided (base64 encoded)
    const { fileData, filename, mimeType } = req.body;
    if (!fileData || !filename) {
      return res.status(400).json({ success: false, error: 'File data and filename required' });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    const result = await sevdeskService.uploadVoucherFile(
      config.apiToken,
      buffer,
      filename,
      mimeType || 'application/pdf'
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Upload voucher file error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/vouchers/create - Create voucher from uploaded file
router.post('/vouchers/create', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    const { fileId, voucherDate, description, supplierName, sumNet, sumGross, taxRate, creditDebit } = req.body;

    if (!fileId || !voucherDate) {
      return res.status(400).json({ success: false, error: 'fileId and voucherDate are required' });
    }

    const result = await sevdeskService.createVoucherFromFile(config.apiToken, fileId, {
      voucherDate,
      description,
      supplierName,
      sumNet: sumNet ? parseFloat(sumNet) : undefined,
      sumGross: sumGross ? parseFloat(sumGross) : undefined,
      taxRate: taxRate ? parseFloat(taxRate) : undefined,
      creditDebit,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Create voucher error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Document Sync & Search Routes
// ============================================

// GET /api/sevdesk/sync/status - Get sync status
router.get('/sync/status', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = await sevdeskService.getSyncStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('Get sync status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/sync - Trigger full sync
router.post('/sync', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get API token
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({
        success: false,
        error: 'sevDesk API token not configured',
      });
    }

    // Run sync (this may take a while for large datasets)
    const result = await sevdeskService.syncAllDocuments(userId, config.apiToken);

    res.json({
      success: true,
      data: {
        invoices: result.invoices,
        quotes: result.quotes,
        totalSynced: result.invoices.synced + result.quotes.synced,
        totalErrors: result.invoices.errors + result.quotes.errors,
      },
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/sync/invoices - Sync only invoices
router.post('/sync/invoices', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({
        success: false,
        error: 'sevDesk API token not configured',
      });
    }

    const result = await sevdeskService.syncInvoices(userId, config.apiToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Sync invoices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/sync/quotes - Sync only quotes
router.post('/sync/quotes', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({
        success: false,
        error: 'sevDesk API token not configured',
      });
    }

    const result = await sevdeskService.syncQuotes(userId, config.apiToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Sync quotes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/search - Search synced documents
router.get('/search', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { q, type, limit, offset } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    const results = await sevdeskService.searchDocuments(userId, q, {
      type: type as 'invoice' | 'quote' | undefined,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Position Search & Quote Creation Routes
// ============================================

// GET /api/sevdesk/positions/search - Search positions from synced documents
router.get('/positions/search', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { q, type, limit } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
    }

    const results = await sevdeskService.searchPositions(userId, q, {
      documentType: type as 'invoice' | 'quote' | undefined,
      limit: limit ? parseInt(limit as string) : 30,
    });

    res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    console.error('Position search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/positions/suggestions - Get autocomplete suggestions for position names
router.get('/positions/suggestions', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { prefix, limit } = req.query;

    if (!prefix || typeof prefix !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prefix is required',
      });
    }

    const suggestions = await sevdeskService.getPositionSuggestions(
      userId,
      prefix,
      limit ? parseInt(limit as string) : 20
    );

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error: any) {
    console.error('Position suggestions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/quotes/create - Create a new quote in sevDesk
router.post('/quotes/create', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { contactId, quoteDate, header, headText, footText, positions, status } = req.body;

    // Validate required fields
    if (!contactId) {
      return res.status(400).json({ success: false, error: 'contactId is required' });
    }
    if (!header || header.trim() === '') {
      return res.status(400).json({ success: false, error: 'header (Betreff) is required' });
    }
    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one position is required' });
    }

    // Validate each position
    for (const pos of positions) {
      if (!pos.name || pos.name.trim() === '') {
        return res.status(400).json({ success: false, error: 'Each position must have a name' });
      }
      // Allow quantity=0 for headings (sections)
      if (typeof pos.quantity !== 'number' || pos.quantity < 0) {
        return res.status(400).json({ success: false, error: 'Each position must have a valid quantity >= 0' });
      }
      // For normal positions (quantity > 0), validate it's not zero
      if (pos.quantity === 0 && pos.price !== 0) {
        return res.status(400).json({ success: false, error: 'Position with price must have quantity > 0' });
      }
      if (typeof pos.price !== 'number' || pos.price < 0) {
        return res.status(400).json({ success: false, error: 'Each position must have a valid price >= 0' });
      }
    }

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    // Create the quote
    const result = await sevdeskService.createQuote(config.apiToken, config, {
      contactId,
      quoteDate,
      header,
      headText,
      footText,
      positions,
      status: status || 100, // Default to draft
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Create quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/quotes/:id - Get a single quote with positions
router.get('/quotes/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const quoteId = req.params.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const quote = await sevdeskService.getQuoteWithPositions(config.apiToken, quoteId);

    if (!quote) {
      return res.status(404).json({ success: false, error: 'Angebot nicht gefunden' });
    }

    res.json({
      success: true,
      data: quote,
    });
  } catch (error: any) {
    console.error('Get quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/sevdesk/quotes/:id - Update an existing quote
router.put('/quotes/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const quoteId = req.params.id;
    const { contactId, quoteDate, header, headText, footText, positions, status } = req.body;

    // Validate required fields
    if (!contactId) {
      return res.status(400).json({ success: false, error: 'contactId is required' });
    }
    if (!header || header.trim() === '') {
      return res.status(400).json({ success: false, error: 'header (Betreff) is required' });
    }
    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one position is required' });
    }

    // Validate each position
    for (const pos of positions) {
      if (!pos.name || pos.name.trim() === '') {
        return res.status(400).json({ success: false, error: 'Each position must have a name' });
      }
      // Allow quantity=0 for headings (sections)
      if (typeof pos.quantity !== 'number' || pos.quantity < 0) {
        return res.status(400).json({ success: false, error: 'Each position must have a valid quantity >= 0' });
      }
      if (pos.quantity === 0 && pos.price !== 0) {
        return res.status(400).json({ success: false, error: 'Position with price must have quantity > 0' });
      }
      if (typeof pos.price !== 'number' || pos.price < 0) {
        return res.status(400).json({ success: false, error: 'Each position must have a valid price >= 0' });
      }
    }

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    // Update the quote
    const result = await sevdeskService.updateQuote(config.apiToken, config, quoteId, {
      contactId,
      quoteDate,
      header,
      headText,
      footText,
      positions,
      status: status || 100,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Update quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Customer Import Routes
// ============================================

// GET /api/sevdesk/import/preview - Get preview of customers to import
router.get('/import/preview', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const showAll = req.query.showAll === 'true';
    const includeSubContacts = req.query.includeSubContacts === 'true';

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const preview = await sevdeskService.getCustomerImportPreview(userId, config.apiToken, {
      showAll,
      includeSubContacts,
    });

    // Count by status
    const counts = {
      new: preview.filter(p => p.matchStatus === 'new').length,
      name_match: preview.filter(p => p.matchStatus === 'name_match').length,
      linked: preview.filter(p => p.matchStatus === 'linked').length,
      subContacts: preview.filter(p => p.isSubContact).length,
      total: preview.length,
    };

    res.json({
      success: true,
      data: {
        customers: preview,
        counts,
      },
    });
  } catch (error: any) {
    console.error('Import preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/import/execute - Execute customer import
router.post('/import/execute', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { imports } = req.body;

    if (!imports || !Array.isArray(imports)) {
      return res.status(400).json({ success: false, error: 'imports array is required' });
    }

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    const result = await sevdeskService.batchImportSevdeskCustomers(
      userId,
      config.apiToken,
      imports
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Import execute error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/import/single - Import a single customer
router.post('/import/single', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sevdeskId, name, customerNumber, email, address, color, hourlyRate } = req.body;

    if (!sevdeskId || !name) {
      return res.status(400).json({ success: false, error: 'sevdeskId and name are required' });
    }

    const result = await sevdeskService.importSevdeskCustomer(
      userId,
      { sevdeskId, name, customerNumber, email, address },
      { color, hourlyRate }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Single import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
