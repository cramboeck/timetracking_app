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
      if (typeof pos.quantity !== 'number' || pos.quantity <= 0) {
        return res.status(400).json({ success: false, error: 'Each position must have a valid quantity > 0' });
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

export default router;
