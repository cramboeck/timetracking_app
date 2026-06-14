import express, { Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { query } from '../config/database';
import * as sevdeskService from '../services/sevdeskService';
import * as aiService from '../services/aiService';
import { invoiceProcessorService } from '../services/invoiceProcessorService';
import { customerMatchingService } from '../services/customerMatchingService';
import { triggerInvoiceMailboxProcessing } from '../jobs/invoiceInboxCron';
import { logger } from '../utils/logger';

const router = express.Router();

// Invoice documents upload config
const invoiceUploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
const invoiceDocsDir = path.join(invoiceUploadsDir, 'invoice-documents');
if (!fs.existsSync(invoiceDocsDir)) {
  fs.mkdirSync(invoiceDocsDir, { recursive: true });
}

const invoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, invoiceDocsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const invoiceUpload = multer({
  storage: invoiceStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF und Bilder erlaubt'));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ============================================================================
// Zod validation schemas
// ============================================================================

const configSchema = z.object({
  apiToken: z.string().min(1).max(500).optional(),
  defaultHourlyRate: z.number().min(0).max(10000).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  autoSyncCustomers: z.boolean().optional(),
  createAsFinal: z.boolean().optional(),
});

const testConnectionSchema = z.object({
  apiToken: z.string().min(1, 'API token is required').max(500),
});

const linkCustomerSchema = z.object({
  customerId: z.string().uuid(),
  sevdeskCustomerId: z.string().min(1).max(100),
});

const invoicePositionSchema = z.object({
  name: z.string().max(1000).optional(),
  quantity: z.number().min(0).optional(),
  price: z.number().optional(),
  hours: z.number().min(0).optional(),
  amount: z.number().optional(),
  text: z.string().max(10000).optional(),
  unity: z.any().optional(),
});

const createInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  entryIds: z.array(z.string().uuid()).min(1).max(1000),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  header: z.string().max(500).optional(),
  headText: z.string().max(10000).optional(),
  footText: z.string().max(10000).optional(),
  positions: z.array(invoicePositionSchema).max(100).optional(),
  reportFilename: z.string().max(500).optional(),
});

const previewReportSchema = z.object({
  reportFilename: z.string().min(1).max(500),
});

const createVoucherSchema = z.object({
  customerId: z.string().uuid(),
  entryIds: z.array(z.string().uuid()).min(1).max(1000),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  totalHours: z.number().min(0).max(100000),
  totalAmount: z.number().min(0).max(10000000),
});

const entrySchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  description: z.string().max(10000).optional(),
  duration: z.number().min(0),
  hourlyRate: z.number().min(0).optional(),
  amount: z.number().optional(),
  projectName: z.string().max(500).optional(),
  activityName: z.string().max(500).optional(),
});

const createInvoiceDirectSchema = z.object({
  customerId: z.string().uuid(),
  sevdeskContactId: z.string().min(1).max(100),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  entries: z.array(entrySchema).min(1).max(1000),
});

const saveEntriesForInvoiceSchema = z.object({
  customerId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
});

const uploadFileSchema = z.object({
  fileData: z.string().min(1, 'File data is required'),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
});

const createVoucherFromFileSchema = z.object({
  fileId: z.string().min(1).max(100),
  voucherDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  description: z.string().max(1000).optional(),
  supplierName: z.string().max(500).optional(),
  sumNet: z.number().min(0).max(10000000).optional(),
  sumGross: z.number().min(0).max(10000000).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  creditDebit: z.enum(['C', 'D']).optional(),
});

const quotePositionSchema = z.object({
  name: z.string().max(1000),
  quantity: z.number().min(0),
  price: z.number(),
  text: z.string().max(10000).optional(),
  unity: z.any().optional(),
});

const createQuoteSchema = z.object({
  contactId: z.string().min(1, 'contactId is required').max(100),
  quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  header: z.string().min(1, 'header (Betreff) is required').max(500),
  headText: z.string().max(10000).optional(),
  footText: z.string().max(10000).optional(),
  positions: z.array(quotePositionSchema).min(1, 'At least one position is required').max(100),
  status: z.number().int().min(0).max(1000).optional(),
});

const updateQuoteSchema = createQuoteSchema.partial();

const importCustomerSchema = z.object({
  sevdeskId: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  customerNumber: z.string().max(100).optional(),
  email: z.string().email().max(500).optional().nullable(),
  address: z.string().max(1000).optional(),
});

const importCustomersSchema = z.object({
  imports: z.array(importCustomerSchema).min(1).max(500),
});

const updateCustomerFromSevdeskSchema = z.object({
  sevdeskId: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  customerNumber: z.string().max(100).optional(),
  email: z.string().email().max(500).optional().nullable(),
  address: z.string().max(1000).optional(),
  color: z.string().max(50).optional(),
  hourlyRate: z.number().min(0).max(10000).optional().nullable(),
});

// Invoice Draft schemas
const updateInvoiceDraftSchema = z.object({
  supplierName: z.string().max(500).optional(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD').optional().nullable(),
  netAmount: z.number().min(0).max(100000000).optional().nullable(),
  grossAmount: z.number().min(0).max(100000000).optional().nullable(),
  vatAmount: z.number().min(0).max(100000000).optional().nullable(),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  currency: z.string().max(10).optional(),
  vendorId: z.string().uuid().optional().nullable(),
});

const confirmInvoiceDraftSchema = z.object({
  supplierName: z.string().min(1).max(500),
  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  netAmount: z.number().min(0).max(100000000),
  grossAmount: z.number().min(0).max(100000000),
  taxRate: z.number().min(0).max(100),
  description: z.string().max(2000).optional(),
});

const recordExportSchema = z.object({
  customerId: z.string().uuid(),
  entryIds: z.array(z.string().uuid()).min(1).max(1000),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  totalHours: z.number().min(0).max(100000).optional(),
  totalAmount: z.number().min(0).max(10000000).optional(),
});

const generateInvoiceTextsSchema = z.object({
  customerId: z.string().uuid(),
  sevdeskContactId: z.string().min(1).max(100).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
  entries: z.array(entrySchema).min(1).max(1000),
});

// Line item matching schemas
const matchLineItemsSchema = z.object({
  lineItemIds: z.array(z.string()).min(1).max(500),
  minConfidence: z.number().min(0).max(1).optional(),
});

const assignLineItemSchema = z.object({
  customerId: z.string().uuid(),
  saveAsAlias: z.boolean().optional(),
});

const updateLineItemSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  rebillingStatus: z.enum(['pending', 'included', 'billed', 'skipped']).optional(),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  matchMethod: z.string().max(50).nullable().optional(),
});

const createAliasSchema = z.object({
  alias: z.string().min(1).max(500),
  source: z.enum(['manual', 'invoice_assignment']).optional(),
});

const updateCustomerMatchingSchema = z.object({
  primaryDomain: z.string().max(255).nullable().optional(),
  distributorIdentifiers: z.record(z.string()).optional(),
});

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
router.put('/config', authenticateToken, requireBillingFeature, validate(configSchema), async (req: AuthRequest, res: Response) => {
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
router.post('/test-connection', authenticateToken, requireBillingFeature, validate(testConnectionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { apiToken } = req.body;
    // Validation handled by Zod

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

// GET /api/sevdesk/contacts - Get all contacts from sevDesk (customers, suppliers, all)
router.get('/contacts', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await sevdeskService.getConfig(userId);

    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }

    // Query params: type = 'customers' | 'suppliers' | 'all' (default: all)
    const contactType = req.query.type as string || 'all';
    const search = (req.query.search as string || '').toLowerCase().trim();

    const options = {
      showAll: contactType === 'all',
      includeSuppliers: contactType === 'suppliers' || contactType === 'all',
    };

    const contacts = await sevdeskService.getSevdeskCustomers(config.apiToken, options);

    // Filter by search term if provided
    const filtered = search
      ? contacts.filter(c =>
          c.name.toLowerCase().includes(search) ||
          (c.customerNumber && c.customerNumber.toLowerCase().includes(search))
        )
      : contacts;

    res.json({
      success: true,
      data: filtered,
    });
  } catch (error: any) {
    console.error('Get sevDesk contacts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/link-customer - Link local customer to sevDesk customer
router.post('/link-customer', authenticateToken, requireBillingFeature, validate(linkCustomerSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, sevdeskCustomerId } = req.body;
    // Validation handled by Zod

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
router.post('/create-invoice', authenticateToken, requireBillingFeature, validate(createInvoiceSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, entryIds, periodStart, periodEnd, header, headText, footText, positions } = req.body;

    console.log('[create-invoice] Starting invoice creation for customer:', customerId);
    console.log('[create-invoice] Custom texts provided:', !!header, !!headText, !!footText);
    console.log('[create-invoice] Custom positions:', positions?.length || 0);
    // Validation handled by Zod

    // Get config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      console.log('[create-invoice] No sevDesk API token configured');
      return res.status(400).json({ success: false, error: 'sevDesk is not configured' });
    }
    console.log('[create-invoice] Config loaded, API token exists:', !!config.apiToken);

    // Get customer info + the linked default contract (for {contractNumber}/
    // {contractTitle} substitution in the per-customer position template).
    const customerResult = await query(
      `SELECT
         c.id, c.name, c.hourly_rate, c.sevdesk_customer_id, c.time_rounding_interval,
         c.sevdesk_position_template, c.default_contract_id,
         ct.contract_number AS default_contract_number,
         ct.name AS default_contract_title
       FROM customers c
       LEFT JOIN contracts ct ON ct.id = c.default_contract_id
       WHERE c.id = $1 AND c.user_id = $2`,
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

    // Build the template-context for per-position placeholder substitution.
    // Frontend additionally passes reportFilename in the payload (if a
    // service-report PDF was prepared) — picked up below.
    const { reportFilename } = req.body;
    const periodEndDate = new Date(periodEnd);
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const templateContext = {
      contractNumber: customer.default_contract_number ?? undefined,
      contractTitle: customer.default_contract_title ?? undefined,
      customerName: customer.name,
      periodMonth: String(periodEndDate.getMonth() + 1).padStart(2, '0'),
      periodYear: String(periodEndDate.getFullYear()),
      periodLabel: `${monthNames[periodEndDate.getMonth()]} ${periodEndDate.getFullYear()}`,
      reportFilename: reportFilename || undefined,
    };

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
        positionTemplate: customer.sevdesk_position_template ?? undefined,
        templateContext,
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
router.post('/record-export', authenticateToken, requireBillingFeature, validate(recordExportSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, entryIds, periodStart, periodEnd, totalHours, totalAmount } = req.body;
    // Validation handled by Zod

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
router.post('/generate-invoice-texts', authenticateToken, requireBillingFeature, validate(generateInvoiceTextsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { customerId, sevdeskContactId, periodStart, periodEnd, entries } = req.body;
    // Validation handled by Zod

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
router.post('/vouchers/upload', authenticateToken, requireBillingFeature, validate(uploadFileSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    // Validation handled by Zod
    const { fileData, filename, mimeType } = req.body;

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
router.post('/vouchers/create', authenticateToken, requireBillingFeature, validate(createVoucherFromFileSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    // Validation handled by Zod
    const { fileId, voucherDate, description, supplierName, sumNet, sumGross, taxRate, creditDebit } = req.body;

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
router.post('/quotes/create', authenticateToken, requireBillingFeature, validate(createQuoteSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { contactId, quoteDate, header, headText, footText, positions, status } = req.body;

    // Additional business logic validation (beyond Zod schema)
    for (const pos of positions) {
      // For normal positions (quantity > 0), validate price constraint
      if (pos.quantity === 0 && pos.price !== 0) {
        return res.status(400).json({ success: false, error: 'Position with price must have quantity > 0' });
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
router.put('/quotes/:id', authenticateToken, requireBillingFeature, validate(createQuoteSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const quoteId = req.params.id;
    const { contactId, quoteDate, header, headText, footText, positions, status } = req.body;

    // Additional business logic validation (beyond Zod schema)
    for (const pos of positions) {
      if (pos.quantity === 0 && pos.price !== 0) {
        return res.status(400).json({ success: false, error: 'Position with price must have quantity > 0' });
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
router.post('/import/execute', authenticateToken, requireBillingFeature, validate(importCustomersSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { imports } = req.body;
    // Validation handled by Zod

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
router.post('/import/single', authenticateToken, requireBillingFeature, validate(updateCustomerFromSevdeskSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { sevdeskId, name, customerNumber, email, address, color, hourlyRate } = req.body;
    // Validation handled by Zod

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

// ============================================
// Invoice Draft Queue Routes
// ============================================

// Helper: Get organization ID for user
async function getOrgIdForUser(userId: string): Promise<string | null> {
  const result = await query(
    'SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0]?.organization_id || null;
}

// GET /api/sevdesk/invoice-drafts - List all invoice drafts
router.get('/invoice-drafts', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const status = req.query.status as string || 'draft';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await query(`
      SELECT
        pi.id,
        pi.email_id,
        pi.email_subject,
        pi.sender_email,
        pi.sender_name,
        pi.received_at,
        pi.attachment_count,
        pi.document_ids,
        pi.vendor_id,
        pi.status,
        pi.error_message,
        pi.processed_at,
        pi.source,
        pi.original_filename,
        pi.sevdesk_voucher_id,
        pi.invoice_number,
        pi.supplier_name,
        pi.supplier_address,
        pi.invoice_date,
        pi.due_date,
        pi.net_amount,
        pi.gross_amount,
        pi.vat_amount,
        pi.vat_rate,
        pi.currency,
        pi.iban,
        pi.extracted_at,
        pi.extraction_confidence,
        c.name as vendor_name
      FROM processed_invoices pi
      LEFT JOIN customers c ON pi.vendor_id = c.id
      WHERE pi.organization_id = $1
        AND pi.status = $2
      ORDER BY pi.received_at DESC
      LIMIT $3 OFFSET $4
    `, [organizationId, status, limit, offset]);

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total FROM processed_invoices
      WHERE organization_id = $1 AND status = $2
    `, [organizationId, status]);

    res.json({
      success: true,
      data: {
        drafts: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
      },
    });
  } catch (error: any) {
    logger.error('Get invoice drafts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/invoice-drafts/stats - Get draft queue statistics
router.get('/invoice-drafts/stats', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const result = await query(`
      SELECT
        status,
        COUNT(*) as count,
        COALESCE(SUM(gross_amount), 0) as total_amount
      FROM processed_invoices
      WHERE organization_id = $1
      GROUP BY status
    `, [organizationId]);

    const stats = {
      pending: { count: 0, amount: 0 },
      draft: { count: 0, amount: 0 },
      processed: { count: 0, amount: 0 },
      failed: { count: 0, amount: 0 },
      skipped: { count: 0, amount: 0 },
    };

    for (const row of result.rows) {
      if (stats[row.status as keyof typeof stats]) {
        stats[row.status as keyof typeof stats] = {
          count: parseInt(row.count),
          amount: parseFloat(row.total_amount) || 0,
        };
      }
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Get draft stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/invoice-drafts/:id - Get single draft with document
router.get('/invoice-drafts/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const result = await query(`
      SELECT pi.*, c.name as vendor_name
      FROM processed_invoices pi
      LEFT JOIN customers c ON pi.vendor_id = c.id
      WHERE pi.id = $1 AND pi.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    const draft = result.rows[0];

    // Get associated documents
    const docsResult = await query(`
      SELECT id, filename, original_filename, mime_type, size, storage_path, created_at
      FROM invoice_documents
      WHERE processed_invoice_id = $1
      ORDER BY created_at ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...draft,
        documents: docsResult.rows,
      },
    });
  } catch (error: any) {
    logger.error('Get draft error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/sevdesk/invoice-drafts/:id - Update draft with corrections
router.put('/invoice-drafts/:id', authenticateToken, requireBillingFeature, validate(updateInvoiceDraftSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Verify draft belongs to organization
    const checkResult = await query(
      'SELECT id FROM processed_invoices WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    const updates = req.body;
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    if (updates.supplierName !== undefined) {
      fields.push(`supplier_name = $${paramIndex++}`);
      values.push(updates.supplierName);
    }
    if (updates.invoiceNumber !== undefined) {
      fields.push(`invoice_number = $${paramIndex++}`);
      values.push(updates.invoiceNumber);
    }
    if (updates.invoiceDate !== undefined) {
      fields.push(`invoice_date = $${paramIndex++}`);
      values.push(updates.invoiceDate);
    }
    if (updates.dueDate !== undefined) {
      fields.push(`due_date = $${paramIndex++}`);
      values.push(updates.dueDate);
    }
    if (updates.netAmount !== undefined) {
      fields.push(`net_amount = $${paramIndex++}`);
      values.push(updates.netAmount);
    }
    if (updates.grossAmount !== undefined) {
      fields.push(`gross_amount = $${paramIndex++}`);
      values.push(updates.grossAmount);
    }
    if (updates.vatAmount !== undefined) {
      fields.push(`vat_amount = $${paramIndex++}`);
      values.push(updates.vatAmount);
    }
    if (updates.vatRate !== undefined) {
      fields.push(`vat_rate = $${paramIndex++}`);
      values.push(updates.vatRate);
    }
    if (updates.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      values.push(updates.currency);
    }
    if (updates.vendorId !== undefined) {
      fields.push(`vendor_id = $${paramIndex++}`);
      values.push(updates.vendorId);
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    values.push(id);
    await query(
      `UPDATE processed_invoices SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ success: true, message: 'Draft updated' });
  } catch (error: any) {
    logger.error('Update draft error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/:id/extract - Re-run OCR extraction
router.post('/invoice-drafts/:id/extract', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Verify draft belongs to organization
    const checkResult = await query(
      'SELECT id FROM processed_invoices WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    // Force re-extraction
    const extracted = await invoiceProcessorService.extractInvoiceData(organizationId, id, { force: true });

    if (!extracted) {
      return res.status(400).json({ success: false, error: 'Extraction failed - no PDF found' });
    }

    res.json({
      success: true,
      data: extracted,
    });
  } catch (error: any) {
    logger.error('Extract draft error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/:id/confirm - Confirm draft and create sevDesk voucher
router.post('/invoice-drafts/:id/confirm', authenticateToken, requireBillingFeature, validate(confirmInvoiceDraftSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Get draft with document
    const draftResult = await query(`
      SELECT pi.*, id.storage_path, id.original_filename, id.mime_type
      FROM processed_invoices pi
      LEFT JOIN invoice_documents id ON id.processed_invoice_id = pi.id
      WHERE pi.id = $1 AND pi.organization_id = $2
      LIMIT 1
    `, [id, organizationId]);

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    const draft = draftResult.rows[0];

    if (draft.status === 'processed') {
      return res.status(400).json({ success: false, error: 'Draft already processed' });
    }

    // Get sevDesk config
    const config = await sevdeskService.getConfig(userId);
    if (!config?.apiToken) {
      return res.status(400).json({ success: false, error: 'sevDesk not configured' });
    }

    const { supplierName, invoiceNumber, invoiceDate, netAmount, grossAmount, taxRate, description } = req.body;

    let sevdeskVoucherId: string | null = null;

    // Upload file to sevDesk if we have a document
    if (draft.storage_path) {
      try {
        const fs = await import('fs');
        const fileBuffer = await fs.promises.readFile(draft.storage_path);

        // Upload file
        const uploadResult = await sevdeskService.uploadVoucherFile(
          config.apiToken,
          fileBuffer,
          draft.original_filename || 'invoice.pdf',
          draft.mime_type || 'application/pdf'
        );

        // Create voucher from file
        const voucherResult = await sevdeskService.createVoucherFromFile(config.apiToken, uploadResult.id, {
          voucherDate: invoiceDate,
          description: description || `${supplierName} - ${invoiceNumber}`,
          supplierName,
          sumNet: netAmount,
          sumGross: grossAmount,
          taxRate,
          creditDebit: 'D', // Debit = expense
        });

        sevdeskVoucherId = voucherResult.voucherId || null;
      } catch (uploadError: any) {
        logger.error('sevDesk upload failed:', uploadError);
        return res.status(500).json({
          success: false,
          error: `sevDesk Upload fehlgeschlagen: ${uploadError.message}`,
        });
      }
    }

    // Update draft status
    await query(`
      UPDATE processed_invoices SET
        status = 'processed',
        sevdesk_voucher_id = $2,
        supplier_name = $3,
        invoice_number = $4,
        invoice_date = $5,
        net_amount = $6,
        gross_amount = $7,
        vat_rate = $8,
        processed_at = NOW()
      WHERE id = $1
    `, [id, sevdeskVoucherId, supplierName, invoiceNumber, invoiceDate, netAmount, grossAmount, taxRate]);

    res.json({
      success: true,
      data: {
        sevdeskVoucherId,
        message: sevdeskVoucherId
          ? 'Beleg erfolgreich in sevDesk erstellt'
          : 'Entwurf als verarbeitet markiert (ohne sevDesk)',
      },
    });
  } catch (error: any) {
    logger.error('Confirm draft error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/sevdesk/invoice-drafts/:id - Delete/skip draft
router.delete('/invoice-drafts/:id', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;
    const skipOnly = req.query.skip === 'true';

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    if (skipOnly) {
      // Just mark as skipped
      await query(
        'UPDATE processed_invoices SET status = $1 WHERE id = $2 AND organization_id = $3',
        ['skipped', id, organizationId]
      );
    } else {
      // Delete documents first
      await query('DELETE FROM invoice_documents WHERE processed_invoice_id = $1', [id]);
      // Delete draft
      await query('DELETE FROM processed_invoices WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    }

    res.json({ success: true, message: skipOnly ? 'Draft skipped' : 'Draft deleted' });
  } catch (error: any) {
    logger.error('Delete draft error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/poll - Manually trigger mailbox poll
router.post('/invoice-drafts/poll', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const result = await triggerInvoiceMailboxProcessing(organizationId);

    res.json({
      success: result.success,
      data: {
        processed: result.processed,
        skipped: result.skipped,
        failed: result.failed,
        message: result.message,
      },
    });
  } catch (error: any) {
    logger.error('Poll mailbox error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/fetch-attachments - Re-fetch attachments for drafts without documents
router.post('/invoice-drafts/fetch-attachments', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Get drafts WITHOUT documents (attachments never downloaded)
    const draftsResult = await query(`
      SELECT pi.id, pi.email_id, pi.email_subject, pi.sender_name
      FROM processed_invoices pi
      LEFT JOIN invoice_documents id ON id.processed_invoice_id = pi.id
      WHERE pi.organization_id = $1
        AND pi.source = 'email'
        AND pi.email_id IS NOT NULL
        AND id.id IS NULL
      ORDER BY pi.received_at DESC
      LIMIT $2
    `, [organizationId, limit]);

    let fetched = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const draft of draftsResult.rows) {
      try {
        // Re-fetch and save attachments
        const success = await invoiceProcessorService.refetchAttachments(organizationId, draft.id);
        if (success) {
          fetched++;
        } else {
          failed++;
          errors.push(`${draft.sender_name || draft.email_subject}: Keine Anhänge`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${draft.sender_name || draft.email_subject}: ${err.message}`);
        logger.error(`Fetch attachments failed for ${draft.id}:`, err.message);
      }
    }

    res.json({
      success: true,
      data: {
        total: draftsResult.rows.length,
        fetched,
        failed,
        errors: errors.slice(0, 5),
        message: `${fetched} von ${draftsResult.rows.length} Anhänge nachgeladen`,
      },
    });
  } catch (error: any) {
    logger.error('Fetch attachments error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/upload - Manual PDF upload
router.post('/invoice-drafts/upload', authenticateToken, requireBillingFeature, invoiceUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen' });
    }

    const file = req.file;
    const draftId = uuidv4();
    const docId = uuidv4();

    // Create draft entry
    await query(`
      INSERT INTO processed_invoices (
        id, organization_id, source, status, original_filename, attachment_count, received_at
      ) VALUES ($1, $2, 'manual', 'pending', $3, 1, NOW())
    `, [draftId, organizationId, file.originalname]);

    // Create document entry
    await query(`
      INSERT INTO invoice_documents (
        id, organization_id, processed_invoice_id, filename, original_filename,
        mime_type, size, storage_path, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [docId, organizationId, draftId, file.filename, file.originalname, file.mimetype, file.size, file.path]);

    // Auto-extract data
    try {
      await invoiceProcessorService.extractInvoiceData(organizationId, draftId);
      await query('UPDATE processed_invoices SET status = $1 WHERE id = $2', ['draft', draftId]);
    } catch (extractErr: any) {
      logger.warn(`Auto-extract failed for manual upload ${draftId}:`, extractErr.message);
    }

    res.json({
      success: true,
      data: {
        id: draftId,
        filename: file.originalname,
        message: 'Datei hochgeladen und wird verarbeitet',
      },
    });
  } catch (error: any) {
    logger.error('Manual upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/:id/upload - Upload PDF for existing draft
router.post('/invoice-drafts/:id/upload', authenticateToken, requireBillingFeature, invoiceUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id: draftId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen' });
    }

    // Verify draft exists and belongs to org
    const draftResult = await query(
      'SELECT id FROM processed_invoices WHERE id = $1 AND organization_id = $2',
      [draftId, organizationId]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    const file = req.file;
    const docId = uuidv4();

    // Create document entry
    await query(`
      INSERT INTO invoice_documents (
        id, organization_id, processed_invoice_id, filename, original_filename,
        mime_type, size, storage_path, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [docId, organizationId, draftId, file.filename, file.originalname, file.mimetype, file.size, file.path]);

    // Update attachment count
    await query(`
      UPDATE processed_invoices SET attachment_count = attachment_count + 1 WHERE id = $1
    `, [draftId]);

    // Re-extract data with new document
    try {
      await invoiceProcessorService.extractInvoiceData(organizationId, draftId);
    } catch (extractErr: any) {
      logger.warn(`Re-extract failed for ${draftId}:`, extractErr.message);
    }

    res.json({
      success: true,
      data: {
        documentId: docId,
        filename: file.originalname,
        message: 'PDF hochgeladen und Daten extrahiert',
      },
    });
  } catch (error: any) {
    logger.error('Draft upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/invoice-drafts/extract-all - Extract data for all unextracted drafts
router.post('/invoice-drafts/extract-all', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Get drafts without extraction
    const draftsResult = await query(`
      SELECT id, email_subject, sender_name FROM processed_invoices
      WHERE organization_id = $1
        AND status IN ('pending', 'draft')
        AND extracted_at IS NULL
      ORDER BY received_at DESC
      LIMIT $2
    `, [organizationId, limit]);

    let extracted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const draft of draftsResult.rows) {
      try {
        const result = await invoiceProcessorService.extractInvoiceData(organizationId, draft.id);
        if (result) {
          await query(
            `UPDATE processed_invoices SET status = 'draft' WHERE id = $1 AND status = 'pending'`,
            [draft.id]
          );
          extracted++;
        } else {
          failed++;
          errors.push(`${draft.sender_name || draft.email_subject}: Keine PDF gefunden`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${draft.sender_name || draft.email_subject}: ${err.message}`);
        logger.error(`Extract failed for ${draft.id}:`, err.message);
      }
    }

    res.json({
      success: true,
      data: {
        total: draftsResult.rows.length,
        extracted,
        failed,
        errors: errors.slice(0, 5), // Only return first 5 errors
        message: `${extracted} von ${draftsResult.rows.length} Belegen extrahiert`,
      },
    });
  } catch (error: any) {
    logger.error('Extract all error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Invoice Line Items - Customer Matching (Epic G)
// ============================================================================

// GET /api/sevdesk/line-items/:invoiceId - Get line items for an invoice
router.get('/line-items/:invoiceId', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { invoiceId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const result = await query(`
      SELECT
        li.id, li.position_number, li.description, li.quantity, li.unit_price, li.total_price,
        li.extracted_customer_name, li.extracted_customer_domain, li.extracted_customer_number,
        li.customer_id, li.match_confidence, li.match_method, li.rebilling_status,
        li.period_start, li.period_end, li.product_sku, li.created_at,
        c.name as customer_name, c.customer_number as crm_customer_number
      FROM invoice_line_items li
      LEFT JOIN customers c ON c.id = li.customer_id
      WHERE li.organization_id = $1 AND li.processed_invoice_id = $2
      ORDER BY li.position_number
    `, [organizationId, invoiceId]);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    logger.error('Get line items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/line-items/match - Match line items to customers
router.post('/line-items/match', authenticateToken, requireBillingFeature, validate(matchLineItemsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { lineItemIds, minConfidence } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Get line item details
    const lineItemsResult = await query(`
      SELECT id, extracted_customer_name, extracted_customer_domain, extracted_customer_number
      FROM invoice_line_items
      WHERE organization_id = $1 AND id = ANY($2)
    `, [organizationId, lineItemIds]);

    const inputs = lineItemsResult.rows.map(row => ({
      lineItemId: row.id,
      extractedCustomerName: row.extracted_customer_name,
      extractedCustomerDomain: row.extracted_customer_domain,
      extractedCustomerNumber: row.extracted_customer_number,
    }));

    const results = await customerMatchingService.batchMatchLineItems(organizationId, inputs);

    // Apply matches if minConfidence is provided
    if (minConfidence !== undefined) {
      const applyResult = await customerMatchingService.applyBestMatches(
        organizationId,
        lineItemIds,
        minConfidence
      );

      res.json({
        success: true,
        data: {
          matches: results,
          applied: applyResult.applied,
          skipped: applyResult.skipped,
        },
      });
    } else {
      res.json({
        success: true,
        data: { matches: results },
      });
    }
  } catch (error: any) {
    logger.error('Match line items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/line-items/:invoiceId/auto-match - Auto-match all line items for an invoice
router.post('/line-items/:invoiceId/auto-match', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { invoiceId } = req.params;
    const minConfidence = parseFloat(req.query.minConfidence as string) || 0.8;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Get unmatched line items
    const lineItemsResult = await query(`
      SELECT id FROM invoice_line_items
      WHERE organization_id = $1 AND processed_invoice_id = $2 AND customer_id IS NULL
    `, [organizationId, invoiceId]);

    const lineItemIds = lineItemsResult.rows.map(r => r.id);

    if (lineItemIds.length === 0) {
      return res.json({
        success: true,
        data: { applied: 0, skipped: 0, message: 'Keine ungematchten Positionen gefunden' },
      });
    }

    const result = await customerMatchingService.applyBestMatches(
      organizationId,
      lineItemIds,
      minConfidence
    );

    // Get updated stats
    const stats = await customerMatchingService.getInvoiceMatchingStats(organizationId, invoiceId);

    res.json({
      success: true,
      data: {
        ...result,
        stats,
        message: `${result.applied} von ${lineItemIds.length} Positionen automatisch zugeordnet`,
      },
    });
  } catch (error: any) {
    logger.error('Auto-match line items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/sevdesk/line-items/:id - Update line item (assign customer, change status)
router.patch('/line-items/:id', authenticateToken, requireBillingFeature, validate(assignLineItemSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;
    const { customerId, saveAsAlias } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Get the line item first
    const lineItemResult = await query(`
      SELECT extracted_customer_name FROM invoice_line_items
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (lineItemResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Line item nicht gefunden' });
    }

    // Update line item
    await query(`
      UPDATE invoice_line_items
      SET customer_id = $1, match_method = 'manual', match_confidence = 1.0, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
    `, [customerId, id, organizationId]);

    // Save alias if requested
    if (saveAsAlias && lineItemResult.rows[0].extracted_customer_name) {
      await customerMatchingService.saveAlias(
        organizationId,
        customerId,
        lineItemResult.rows[0].extracted_customer_name,
        'invoice_assignment'
      );
    }

    res.json({
      success: true,
      data: { message: 'Kunde zugeordnet' + (saveAsAlias ? ', Alias gespeichert' : '') },
    });
  } catch (error: any) {
    logger.error('Assign line item error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/sevdesk/line-items/:id/status - Update line item rebilling status
router.patch('/line-items/:id/status', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id } = req.params;
    const { status } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const validStatuses = ['pending', 'included', 'billed', 'skipped'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Status muss einer von ${validStatuses.join(', ')} sein` });
    }

    await query(`
      UPDATE invoice_line_items
      SET rebilling_status = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
    `, [status, id, organizationId]);

    res.json({ success: true, data: { message: 'Status aktualisiert' } });
  } catch (error: any) {
    logger.error('Update line item status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/line-items/:invoiceId/stats - Get matching statistics for an invoice
router.get('/line-items/:invoiceId/stats', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { invoiceId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const stats = await customerMatchingService.getInvoiceMatchingStats(organizationId, invoiceId);

    res.json({ success: true, data: stats });
  } catch (error: any) {
    logger.error('Get line item stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/line-items/customer/:customerId/pending - Get pending line items for rebilling
router.get('/line-items/customer/:customerId/pending', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { customerId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    // Get all pending line items assigned to this customer
    const result = await pool.query(`
      SELECT
        li.id,
        li.processed_invoice_id,
        li.position_number,
        li.description,
        li.quantity,
        li.unit_price,
        li.total_price,
        li.extracted_customer_name,
        li.customer_id,
        li.rebilling_status,
        li.match_confidence,
        li.match_method,
        pi.email_subject AS invoice_subject,
        pi.sender_name AS vendor_name,
        pi.received_at AS invoice_date
      FROM invoice_line_items li
      JOIN processed_invoices pi ON pi.id = li.processed_invoice_id
      WHERE li.organization_id = $1
        AND li.customer_id = $2
        AND li.rebilling_status = 'pending'
      ORDER BY pi.received_at DESC, li.position_number
    `, [organizationId, customerId]);

    // Calculate totals
    const items = result.rows;
    const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);

    res.json({
      success: true,
      data: {
        items: items.map(row => ({
          id: row.id,
          processedInvoiceId: row.processed_invoice_id,
          positionNumber: row.position_number,
          description: row.description,
          quantity: parseFloat(row.quantity) || 1,
          unitPrice: parseFloat(row.unit_price) || 0,
          totalPrice: parseFloat(row.total_price) || 0,
          extractedCustomerName: row.extracted_customer_name,
          vendorName: row.vendor_name,
          invoiceSubject: row.invoice_subject,
          invoiceDate: row.invoice_date,
        })),
        totalAmount,
        count: items.length,
      },
    });
  } catch (error: any) {
    logger.error('Get pending line items for customer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/line-items/mark-billed - Mark line items as billed
router.post('/line-items/mark-billed', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { lineItemIds, sevdeskInvoiceId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    if (!Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return res.status(400).json({ success: false, error: 'lineItemIds is required' });
    }

    // Update status to 'billed' and optionally store the sevDesk invoice reference
    const result = await pool.query(`
      UPDATE invoice_line_items
      SET rebilling_status = 'billed',
          updated_at = NOW()
      WHERE organization_id = $1
        AND id = ANY($2)
      RETURNING id
    `, [organizationId, lineItemIds]);

    res.json({
      success: true,
      data: { updatedCount: result.rowCount },
    });
  } catch (error: any) {
    logger.error('Mark line items billed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Customer Aliases
// ============================================================================

// GET /api/sevdesk/customers/:id/aliases - Get aliases for a customer
router.get('/customers/:id/aliases', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id: customerId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const aliases = await customerMatchingService.getAliases(organizationId, customerId);

    res.json({ success: true, data: aliases });
  } catch (error: any) {
    logger.error('Get customer aliases error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sevdesk/customers/:id/aliases - Add alias for a customer
router.post('/customers/:id/aliases', authenticateToken, requireBillingFeature, validate(createAliasSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id: customerId } = req.params;
    const { alias, source } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    await customerMatchingService.saveAlias(organizationId, customerId, alias, source || 'manual');

    res.json({ success: true, data: { message: 'Alias gespeichert' } });
  } catch (error: any) {
    logger.error('Add customer alias error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/sevdesk/customers/:id/aliases/:aliasId - Delete an alias
router.delete('/customers/:id/aliases/:aliasId', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { aliasId } = req.params;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const deleted = await customerMatchingService.deleteAlias(organizationId, aliasId);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Alias nicht gefunden' });
    }

    res.json({ success: true, data: { message: 'Alias gelöscht' } });
  } catch (error: any) {
    logger.error('Delete customer alias error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/sevdesk/customers/:id/matching - Update customer matching settings (domain, distributor IDs)
router.patch('/customers/:id/matching', authenticateToken, requireBillingFeature, validate(updateCustomerMatchingSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const { id: customerId } = req.params;
    const { primaryDomain, distributorIdentifiers } = req.body;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    if (primaryDomain !== undefined) {
      if (primaryDomain === null) {
        await query(`UPDATE customers SET primary_domain = NULL WHERE id = $1 AND organization_id = $2`, [customerId, organizationId]);
      } else {
        await customerMatchingService.setCustomerDomain(organizationId, customerId, primaryDomain);
      }
    }

    if (distributorIdentifiers) {
      await customerMatchingService.updateDistributorIdentifiers(organizationId, customerId, distributorIdentifiers);
    }

    res.json({ success: true, data: { message: 'Matching-Einstellungen aktualisiert' } });
  } catch (error: any) {
    logger.error('Update customer matching error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/sevdesk/unmatched-items - Get all unmatched line items across invoices
router.get('/unmatched-items', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = await getOrgIdForUser(userId);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'No organization found' });
    }

    const result = await query(`
      SELECT
        li.id, li.processed_invoice_id, li.position_number, li.description,
        li.quantity, li.total_price, li.extracted_customer_name,
        li.extracted_customer_domain, li.extracted_customer_number,
        pi.supplier_name, pi.invoice_number, pi.invoice_date
      FROM invoice_line_items li
      JOIN processed_invoices pi ON pi.id = li.processed_invoice_id
      WHERE li.organization_id = $1 AND li.customer_id IS NULL AND li.rebilling_status = 'pending'
      ORDER BY pi.invoice_date DESC, li.position_number
      LIMIT $2 OFFSET $3
    `, [organizationId, limit, offset]);

    const countResult = await query(`
      SELECT COUNT(*) FROM invoice_line_items
      WHERE organization_id = $1 AND customer_id IS NULL AND rebilling_status = 'pending'
    `, [organizationId]);

    res.json({
      success: true,
      data: {
        items: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
      },
    });
  } catch (error: any) {
    logger.error('Get unmatched items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
