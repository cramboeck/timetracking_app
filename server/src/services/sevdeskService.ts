import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// sevDesk API Base URL
const SEVDESK_API_URL = 'https://my.sevdesk.de/api/v1';

// Types
export interface SevdeskConfig {
  id: string;
  userId: string;
  apiToken: string | null;
  defaultHourlyRate: number;
  paymentTermsDays: number;
  taxRate: number;
  autoSyncCustomers: boolean;
  createAsFinal: boolean;
  lastSyncAt: string | null;
}

export interface SevdeskCustomer {
  id: string;
  customerNumber: string;
  name: string;
  category?: { id: number; name: string };
  email?: string;
  phone?: string;
}

export interface SevdeskInvoice {
  id: string;
  invoiceNumber: string;
  contact: { id: number; name: string };
  invoiceDate: string;
  status: number;
  sumNet: number;
  sumGross: number;
}

interface TimeEntryForBilling {
  id: string;
  duration: number;
  description: string;
  ticketNumber?: string;
  ticketTitle?: string;
  projectName?: string;
  startTime: string;
}

// Helper to make sevDesk API requests
async function sevdeskFetch(
  apiToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${SEVDESK_API_URL}${endpoint}`;
  console.log(`sevDesk API call: ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`sevDesk API error: ${response.status} ${response.statusText}`, errorText);
    let errorMessage = `sevDesk API error: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorData.message || errorMessage;
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// Get or create sevDesk config for user
export async function getConfig(userId: string): Promise<SevdeskConfig | null> {
  const result = await query(
    'SELECT * FROM sevdesk_config WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    apiToken: row.api_token,
    defaultHourlyRate: parseFloat(row.default_hourly_rate),
    paymentTermsDays: row.payment_terms_days,
    taxRate: parseFloat(row.tax_rate),
    autoSyncCustomers: row.auto_sync_customers,
    createAsFinal: row.create_as_final,
    lastSyncAt: row.last_sync_at,
  };
}

// Save sevDesk config
export async function saveConfig(
  userId: string,
  config: Partial<Omit<SevdeskConfig, 'id' | 'userId'>>
): Promise<SevdeskConfig> {
  const existing = await getConfig(userId);

  if (existing) {
    // Update existing config
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (config.apiToken !== undefined) {
      updates.push(`api_token = $${paramCount++}`);
      values.push(config.apiToken);
    }
    if (config.defaultHourlyRate !== undefined) {
      updates.push(`default_hourly_rate = $${paramCount++}`);
      values.push(config.defaultHourlyRate);
    }
    if (config.paymentTermsDays !== undefined) {
      updates.push(`payment_terms_days = $${paramCount++}`);
      values.push(config.paymentTermsDays);
    }
    if (config.taxRate !== undefined) {
      updates.push(`tax_rate = $${paramCount++}`);
      values.push(config.taxRate);
    }
    if (config.autoSyncCustomers !== undefined) {
      updates.push(`auto_sync_customers = $${paramCount++}`);
      values.push(config.autoSyncCustomers);
    }
    if (config.createAsFinal !== undefined) {
      updates.push(`create_as_final = $${paramCount++}`);
      values.push(config.createAsFinal);
    }

    updates.push('updated_at = NOW()');
    values.push(userId);

    await query(
      `UPDATE sevdesk_config SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
      values
    );

    return (await getConfig(userId))!;
  } else {
    // Create new config
    const id = uuidv4();
    await query(
      `INSERT INTO sevdesk_config (id, user_id, api_token, default_hourly_rate, payment_terms_days, tax_rate, auto_sync_customers, create_as_final)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        userId,
        config.apiToken || null,
        config.defaultHourlyRate || 95.00,
        config.paymentTermsDays || 14,
        config.taxRate || 19.00,
        config.autoSyncCustomers || false,
        config.createAsFinal || false,
      ]
    );

    return (await getConfig(userId))!;
  }
}

// Test sevDesk connection
export async function testConnection(apiToken: string): Promise<{ success: boolean; companyName?: string; error?: string }> {
  try {
    // First try to get SevClient info directly
    const clientResponse = await sevdeskFetch(apiToken, '/SevClient');
    const client = clientResponse.objects?.[0];

    if (client?.name) {
      return {
        success: true,
        companyName: client.name,
      };
    }

    // Fallback: try SevUser endpoint
    const userResponse = await sevdeskFetch(apiToken, '/SevUser');
    const user = userResponse.objects?.[0];

    if (user) {
      // Try different paths for company name
      const companyName =
        user.sevClient?.name ||
        user.client?.name ||
        user.username ||
        'Verbunden';

      return {
        success: true,
        companyName,
      };
    }

    return { success: false, error: 'Keine Benutzerdaten gefunden' };
  } catch (error: any) {
    console.error('sevDesk testConnection error:', error);
    return { success: false, error: error.message };
  }
}

// Get customers from sevDesk
export async function getSevdeskCustomers(apiToken: string): Promise<SevdeskCustomer[]> {
  const response = await sevdeskFetch(apiToken, '/Contact?depth=1&embed=category');

  return (response.objects || []).map((contact: any) => ({
    id: contact.id,
    customerNumber: contact.customerNumber || '',
    name: contact.name || `${contact.surename || ''} ${contact.familyname || ''}`.trim(),
    category: contact.category ? { id: contact.category.id, name: contact.category.name } : undefined,
    email: contact.email,
    phone: contact.phone,
  }));
}

// Sync sevDesk customer to local customer
export async function linkCustomerToSevdesk(
  customerId: string,
  sevdeskCustomerId: string
): Promise<void> {
  await query(
    'UPDATE customers SET sevdesk_customer_id = $1 WHERE id = $2',
    [sevdeskCustomerId, customerId]
  );
}

// Get unbilled time entries for a customer
export async function getUnbilledTimeEntries(
  userId: string,
  customerId: string,
  startDate: string,
  endDate: string
): Promise<TimeEntryForBilling[]> {
  const result = await query(
    `SELECT te.id, te.duration, te.description, te.start_time,
            t.ticket_number, t.title as ticket_title,
            p.name as project_name
     FROM time_entries te
     LEFT JOIN tickets t ON te.ticket_id = t.id
     LEFT JOIN projects p ON te.project_id = p.id
     WHERE te.user_id = $1
       AND p.customer_id = $2
       AND te.invoice_export_id IS NULL
       AND te.start_time >= $3
       AND te.start_time <= $4
     ORDER BY te.start_time`,
    [userId, customerId, startDate, endDate]
  );

  return result.rows.map(row => ({
    id: row.id,
    duration: row.duration,
    description: row.description,
    ticketNumber: row.ticket_number,
    ticketTitle: row.ticket_title,
    projectName: row.project_name,
    startTime: row.start_time,
  }));
}

// Get billing summary by customer
export async function getBillingSummary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Array<{
  customerId: string;
  customerName: string;
  hourlyRate: number | null;
  sevdeskCustomerId: string | null;
  totalSeconds: number;
  totalHours: number;
  totalAmount: number | null;
  entries: TimeEntryForBilling[];
}>> {
  // Get default hourly rate from config
  const config = await getConfig(userId);
  const defaultRate = config?.defaultHourlyRate || 95;

  // Get all unbilled entries grouped by customer
  const result = await query(
    `SELECT c.id as customer_id, c.name as customer_name, c.hourly_rate, c.sevdesk_customer_id,
            te.id as entry_id, te.duration, te.description, te.start_time,
            t.ticket_number, t.title as ticket_title,
            p.name as project_name
     FROM customers c
     JOIN projects p ON p.customer_id = c.id
     JOIN time_entries te ON te.project_id = p.id
     LEFT JOIN tickets t ON te.ticket_id = t.id
     WHERE c.user_id = $1
       AND te.invoice_export_id IS NULL
       AND te.start_time >= $2
       AND te.start_time <= $3
     ORDER BY c.name, te.start_time`,
    [userId, startDate, endDate]
  );

  // Group by customer
  const customerMap = new Map<string, {
    customerId: string;
    customerName: string;
    hourlyRate: number | null;
    sevdeskCustomerId: string | null;
    totalSeconds: number;
    entries: TimeEntryForBilling[];
  }>();

  for (const row of result.rows) {
    if (!customerMap.has(row.customer_id)) {
      customerMap.set(row.customer_id, {
        customerId: row.customer_id,
        customerName: row.customer_name,
        hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
        sevdeskCustomerId: row.sevdesk_customer_id,
        totalSeconds: 0,
        entries: [],
      });
    }

    const customer = customerMap.get(row.customer_id)!;
    customer.totalSeconds += row.duration;
    customer.entries.push({
      id: row.entry_id,
      duration: row.duration,
      description: row.description,
      ticketNumber: row.ticket_number,
      ticketTitle: row.ticket_title,
      projectName: row.project_name,
      startTime: row.start_time,
    });
  }

  // Calculate totals
  return Array.from(customerMap.values()).map(customer => {
    const rate = customer.hourlyRate || defaultRate;
    const totalHours = customer.totalSeconds / 3600;
    return {
      ...customer,
      totalHours: Math.round(totalHours * 100) / 100,
      totalAmount: rate ? Math.round(totalHours * rate * 100) / 100 : null,
    };
  });
}

// Create invoice in sevDesk
export async function createInvoice(
  apiToken: string,
  config: SevdeskConfig,
  sevdeskCustomerId: string,
  entries: TimeEntryForBilling[],
  hourlyRate: number,
  periodStart: string,
  periodEnd: string
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  // Format the period for display
  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);
  const periodLabel = `${startDate.toLocaleDateString('de-DE')} - ${endDate.toLocaleDateString('de-DE')}`;

  // Create invoice positions
  const positions = entries.map((entry, index) => {
    const hours = entry.duration / 3600;
    let name = entry.description || 'Dienstleistung';

    if (entry.ticketNumber) {
      name = `${entry.ticketNumber}: ${entry.ticketTitle || entry.description || 'Support'}`;
    } else if (entry.projectName) {
      name = `${entry.projectName}: ${entry.description || 'Arbeitszeit'}`;
    }

    return {
      objectName: 'InvoicePos',
      mapAll: true,
      quantity: Math.round(hours * 100) / 100,
      price: hourlyRate,
      name: name,
      unity: {
        id: 9, // Hours in sevDesk
        objectName: 'Unity',
      },
      taxRate: config.taxRate,
      positionNumber: index + 1,
    };
  });

  // Create the invoice
  const invoiceData = {
    objectName: 'Invoice',
    mapAll: true,
    contact: {
      id: parseInt(sevdeskCustomerId),
      objectName: 'Contact',
    },
    invoiceDate: new Date().toISOString().split('T')[0],
    header: `Leistungen ${periodLabel}`,
    headText: `Abrechnung für den Zeitraum ${periodLabel}`,
    footText: 'Vielen Dank für Ihr Vertrauen.',
    timeToPay: config.paymentTermsDays,
    discount: 0,
    status: config.createAsFinal ? 200 : 100, // 100 = Draft, 200 = Open
    taxRate: config.taxRate,
    taxType: 'default',
    invoiceType: 'RE', // Regular invoice
    currency: 'EUR',
  };

  // Create invoice
  const invoiceResponse = await sevdeskFetch(apiToken, '/Invoice', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  });

  const invoiceId = invoiceResponse.objects.id;

  // Add positions to invoice
  for (const position of positions) {
    await sevdeskFetch(apiToken, '/InvoicePos', {
      method: 'POST',
      body: JSON.stringify({
        ...position,
        invoice: {
          id: invoiceId,
          objectName: 'Invoice',
        },
      }),
    });
  }

  return {
    invoiceId: invoiceId.toString(),
    invoiceNumber: invoiceResponse.objects.invoiceNumber || `RE-${invoiceId}`,
  };
}

// Record invoice export
export async function recordInvoiceExport(
  userId: string,
  customerId: string,
  entryIds: string[],
  sevdeskInvoiceId: string | null,
  sevdeskInvoiceNumber: string | null,
  periodStart: string,
  periodEnd: string,
  totalHours: number,
  totalAmount: number
): Promise<string> {
  const exportId = uuidv4();

  await query(
    `INSERT INTO invoice_exports (id, user_id, customer_id, sevdesk_invoice_id, sevdesk_invoice_number, period_start, period_end, total_hours, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [exportId, userId, customerId, sevdeskInvoiceId, sevdeskInvoiceNumber, periodStart, periodEnd, totalHours, totalAmount, 'draft']
  );

  // Mark time entries as billed
  if (entryIds.length > 0) {
    await query(
      `UPDATE time_entries SET invoice_export_id = $1 WHERE id = ANY($2)`,
      [exportId, entryIds]
    );
  }

  return exportId;
}

// Get invoice exports for a user
export async function getInvoiceExports(
  userId: string,
  limit: number = 50
): Promise<Array<{
  id: string;
  customerName: string;
  sevdeskInvoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}>> {
  const result = await query(
    `SELECT ie.*, c.name as customer_name
     FROM invoice_exports ie
     JOIN customers c ON ie.customer_id = c.id
     WHERE ie.user_id = $1
     ORDER BY ie.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(row => ({
    id: row.id,
    customerName: row.customer_name,
    sevdeskInvoiceNumber: row.sevdesk_invoice_number,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    totalHours: parseFloat(row.total_hours),
    totalAmount: parseFloat(row.total_amount),
    status: row.status,
    createdAt: row.created_at,
  }));
}

// Types for sevDesk documents
export interface SevdeskInvoiceDetail {
  id: string;
  invoiceNumber: string;
  contact: {
    id: string;
    name: string;
  };
  invoiceDate: string;
  deliveryDate: string | null;
  status: number; // 100=Draft, 200=Open, 1000=Paid
  statusName: string;
  header: string;
  headText: string | null;
  footText: string | null;
  sumNet: number;
  sumGross: number;
  sumTax: number;
  currency: string;
  positions: Array<{
    id: string;
    name: string;
    text: string | null;
    quantity: number;
    price: number;
    sumNet: number;
  }>;
}

export interface SevdeskQuoteDetail {
  id: string;
  quoteNumber: string;
  contact: {
    id: string;
    name: string;
  };
  quoteDate: string;
  status: number;
  statusName: string;
  header: string;
  headText: string | null;
  footText: string | null;
  sumNet: number;
  sumGross: number;
  currency: string;
  positions: Array<{
    id: string;
    name: string;
    text: string | null;
    quantity: number;
    price: number;
    sumNet: number;
  }>;
}

// Get status name for invoices
function getInvoiceStatusName(status: number): string {
  switch (status) {
    case 50: return 'Deaktiviert';
    case 100: return 'Entwurf';
    case 200: return 'Offen';
    case 750: return 'Teilbezahlt';
    case 1000: return 'Bezahlt';
    default: return `Status ${status}`;
  }
}

// Get status name for quotes/orders
function getQuoteStatusName(status: number): string {
  switch (status) {
    case 100: return 'Entwurf';
    case 200: return 'Gesendet';
    case 300: return 'Bestätigt';
    case 500: return 'Teilberechnet';
    case 750: return 'Abgeschlossen';
    case 1000: return 'Storniert';
    default: return `Status ${status}`;
  }
}

// Get invoices from sevDesk
export async function getInvoices(
  apiToken: string,
  options: {
    limit?: number;
    offset?: number;
    contactId?: string;
    status?: number;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<SevdeskInvoiceDetail[]> {
  const params = new URLSearchParams();
  params.append('depth', '1');
  params.append('embed', 'contact');

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.contactId) params.append('contact[id]', options.contactId);
  if (options.status) params.append('status', options.status.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);

  const response = await sevdeskFetch(apiToken, `/Invoice?${params.toString()}`);

  return (response.objects || []).map((inv: any) => ({
    id: inv.id?.toString(),
    invoiceNumber: inv.invoiceNumber || '',
    contact: inv.contact ? {
      id: inv.contact.id?.toString(),
      name: inv.contact.name || 'Unbekannt',
    } : { id: '', name: 'Unbekannt' },
    invoiceDate: inv.invoiceDate,
    deliveryDate: inv.deliveryDate,
    status: parseInt(inv.status) || 0,
    statusName: getInvoiceStatusName(parseInt(inv.status) || 0),
    header: inv.header || '',
    headText: inv.headText,
    footText: inv.footText,
    sumNet: parseFloat(inv.sumNet) || 0,
    sumGross: parseFloat(inv.sumGross) || 0,
    sumTax: parseFloat(inv.sumTax) || 0,
    currency: inv.currency || 'EUR',
    positions: [], // Will be loaded separately if needed
  }));
}

// Get single invoice with positions
export async function getInvoiceWithPositions(
  apiToken: string,
  invoiceId: string
): Promise<SevdeskInvoiceDetail | null> {
  const invoiceResponse = await sevdeskFetch(apiToken, `/Invoice/${invoiceId}?depth=1&embed=contact`);

  // sevDesk API returns different formats:
  // - For lists: { objects: [...] }
  // - For single item by ID: { objects: { ... } } (single object, not array)
  let inv = invoiceResponse.objects;

  // Handle case where objects is an array (some API versions)
  if (Array.isArray(inv)) {
    inv = inv[0];
  }

  console.log('Invoice response type:', typeof inv, Array.isArray(invoiceResponse.objects) ? 'array' : 'object');

  if (!inv) {
    console.error('No invoice data in response:', JSON.stringify(invoiceResponse, null, 2));
    return null;
  }

  // Get positions - sevDesk requires both invoice[id] and invoice[objectName]
  const positionsResponse = await sevdeskFetch(apiToken, `/InvoicePos?invoice[id]=${invoiceId}&invoice[objectName]=Invoice`);

  return {
    id: inv.id?.toString(),
    invoiceNumber: inv.invoiceNumber || '',
    contact: inv.contact ? {
      id: inv.contact.id?.toString(),
      name: inv.contact.name || 'Unbekannt',
    } : { id: '', name: 'Unbekannt' },
    invoiceDate: inv.invoiceDate,
    deliveryDate: inv.deliveryDate,
    status: parseInt(inv.status) || 0,
    statusName: getInvoiceStatusName(parseInt(inv.status) || 0),
    header: inv.header || '',
    headText: inv.headText,
    footText: inv.footText,
    sumNet: parseFloat(inv.sumNet) || 0,
    sumGross: parseFloat(inv.sumGross) || 0,
    sumTax: parseFloat(inv.sumTax) || 0,
    currency: inv.currency || 'EUR',
    positions: (positionsResponse.objects || []).map((pos: any) => ({
      id: pos.id?.toString(),
      name: pos.name || '',
      text: pos.text || null,
      quantity: parseFloat(pos.quantity) || 0,
      price: parseFloat(pos.price) || 0,
      sumNet: parseFloat(pos.sumNet) || 0,
    })),
  };
}

// Get quotes/offers from sevDesk
export async function getQuotes(
  apiToken: string,
  options: {
    limit?: number;
    offset?: number;
    contactId?: string;
    status?: number;
  } = {}
): Promise<SevdeskQuoteDetail[]> {
  const params = new URLSearchParams();
  params.append('depth', '1');
  params.append('embed', 'contact');

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.contactId) params.append('contact[id]', options.contactId);
  if (options.status) params.append('status', options.status.toString());

  const response = await sevdeskFetch(apiToken, `/Order?${params.toString()}`);

  return (response.objects || []).map((quote: any) => ({
    id: quote.id?.toString(),
    quoteNumber: quote.orderNumber || '',
    contact: quote.contact ? {
      id: quote.contact.id?.toString(),
      name: quote.contact.name || 'Unbekannt',
    } : { id: '', name: 'Unbekannt' },
    quoteDate: quote.orderDate,
    status: parseInt(quote.status) || 0,
    statusName: getQuoteStatusName(parseInt(quote.status) || 0),
    header: quote.header || '',
    headText: quote.headText,
    footText: quote.footText,
    sumNet: parseFloat(quote.sumNet) || 0,
    sumGross: parseFloat(quote.sumGross) || 0,
    currency: quote.currency || 'EUR',
    positions: [],
  }));
}

// Get single quote with positions
export async function getQuoteWithPositions(
  apiToken: string,
  quoteId: string
): Promise<SevdeskQuoteDetail | null> {
  const quoteResponse = await sevdeskFetch(apiToken, `/Order/${quoteId}?depth=1&embed=contact`);

  // sevDesk API returns different formats:
  // - For lists: { objects: [...] }
  // - For single item by ID: { objects: { ... } } (single object, not array)
  let quote = quoteResponse.objects;

  // Handle case where objects is an array (some API versions)
  if (Array.isArray(quote)) {
    quote = quote[0];
  }

  console.log('Quote response type:', typeof quote, Array.isArray(quoteResponse.objects) ? 'array' : 'object');

  if (!quote) {
    console.error('No quote data in response:', JSON.stringify(quoteResponse, null, 2));
    return null;
  }

  // Get positions - sevDesk requires both order[id] and order[objectName]
  const positionsResponse = await sevdeskFetch(apiToken, `/OrderPos?order[id]=${quoteId}&order[objectName]=Order`);

  return {
    id: quote.id?.toString(),
    quoteNumber: quote.orderNumber || '',
    contact: quote.contact ? {
      id: quote.contact.id?.toString(),
      name: quote.contact.name || 'Unbekannt',
    } : { id: '', name: 'Unbekannt' },
    quoteDate: quote.orderDate,
    status: parseInt(quote.status) || 0,
    statusName: getQuoteStatusName(parseInt(quote.status) || 0),
    header: quote.header || '',
    headText: quote.headText,
    footText: quote.footText,
    sumNet: parseFloat(quote.sumNet) || 0,
    sumGross: parseFloat(quote.sumGross) || 0,
    currency: quote.currency || 'EUR',
    positions: (positionsResponse.objects || []).map((pos: any) => ({
      id: pos.id?.toString(),
      name: pos.name || '',
      text: pos.text || null,
      quantity: parseFloat(pos.quantity) || 0,
      price: parseFloat(pos.price) || 0,
      sumNet: parseFloat(pos.sumNet) || 0,
    })),
  };
}

// ============================================
// Document Sync & Search Functions
// ============================================

interface SyncResult {
  synced: number;
  errors: number;
  type: 'invoice' | 'quote';
}

// Build full text from positions for search
function buildFullText(positions: Array<{ name: string; text: string | null }>): string {
  return positions
    .map(p => `${p.name || ''} ${p.text || ''}`)
    .join(' ')
    .trim();
}

// Sync all invoices to local database
export async function syncInvoices(
  userId: string,
  apiToken: string
): Promise<SyncResult> {
  let synced = 0;
  let errors = 0;

  try {
    // Fetch all invoices (paginated)
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const invoices = await getInvoices(apiToken, { limit, offset });

      if (invoices.length === 0) {
        hasMore = false;
        break;
      }

      for (const inv of invoices) {
        try {
          // Get full invoice with positions
          const detail = await getInvoiceWithPositions(apiToken, inv.id);
          if (!detail) continue;

          const fullText = buildFullText(detail.positions);
          const id = `inv_${userId}_${inv.id}`;

          await query(
            `INSERT INTO sevdesk_documents (
              id, user_id, sevdesk_id, document_type, document_number,
              contact_id, contact_name, document_date, status, status_name,
              header, head_text, foot_text, sum_net, sum_gross, sum_tax,
              currency, positions_json, full_text, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
            ON CONFLICT (user_id, sevdesk_id, document_type)
            DO UPDATE SET
              document_number = EXCLUDED.document_number,
              contact_name = EXCLUDED.contact_name,
              document_date = EXCLUDED.document_date,
              status = EXCLUDED.status,
              status_name = EXCLUDED.status_name,
              header = EXCLUDED.header,
              head_text = EXCLUDED.head_text,
              foot_text = EXCLUDED.foot_text,
              sum_net = EXCLUDED.sum_net,
              sum_gross = EXCLUDED.sum_gross,
              sum_tax = EXCLUDED.sum_tax,
              positions_json = EXCLUDED.positions_json,
              full_text = EXCLUDED.full_text,
              synced_at = NOW()`,
            [
              id, userId, inv.id, 'invoice', detail.invoiceNumber,
              detail.contact.id, detail.contact.name, detail.invoiceDate,
              detail.status, detail.statusName, detail.header,
              detail.headText, detail.footText, detail.sumNet,
              detail.sumGross, detail.sumTax, detail.currency,
              JSON.stringify(detail.positions), fullText
            ]
          );
          synced++;
        } catch (err) {
          console.error(`Error syncing invoice ${inv.id}:`, err);
          errors++;
        }
      }

      offset += limit;
      if (invoices.length < limit) {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error('Error fetching invoices for sync:', err);
    errors++;
  }

  return { synced, errors, type: 'invoice' };
}

// Sync all quotes to local database
export async function syncQuotes(
  userId: string,
  apiToken: string
): Promise<SyncResult> {
  let synced = 0;
  let errors = 0;

  try {
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const quotes = await getQuotes(apiToken, { limit, offset });

      if (quotes.length === 0) {
        hasMore = false;
        break;
      }

      for (const quote of quotes) {
        try {
          const detail = await getQuoteWithPositions(apiToken, quote.id);
          if (!detail) continue;

          const fullText = buildFullText(detail.positions);
          const id = `quote_${userId}_${quote.id}`;

          await query(
            `INSERT INTO sevdesk_documents (
              id, user_id, sevdesk_id, document_type, document_number,
              contact_id, contact_name, document_date, status, status_name,
              header, head_text, foot_text, sum_net, sum_gross,
              currency, positions_json, full_text, synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
            ON CONFLICT (user_id, sevdesk_id, document_type)
            DO UPDATE SET
              document_number = EXCLUDED.document_number,
              contact_name = EXCLUDED.contact_name,
              document_date = EXCLUDED.document_date,
              status = EXCLUDED.status,
              status_name = EXCLUDED.status_name,
              header = EXCLUDED.header,
              head_text = EXCLUDED.head_text,
              foot_text = EXCLUDED.foot_text,
              sum_net = EXCLUDED.sum_net,
              sum_gross = EXCLUDED.sum_gross,
              positions_json = EXCLUDED.positions_json,
              full_text = EXCLUDED.full_text,
              synced_at = NOW()`,
            [
              id, userId, quote.id, 'quote', detail.quoteNumber,
              detail.contact.id, detail.contact.name, detail.quoteDate,
              detail.status, detail.statusName, detail.header,
              detail.headText, detail.footText, detail.sumNet,
              detail.sumGross, detail.currency,
              JSON.stringify(detail.positions), fullText
            ]
          );
          synced++;
        } catch (err) {
          console.error(`Error syncing quote ${quote.id}:`, err);
          errors++;
        }
      }

      offset += limit;
      if (quotes.length < limit) {
        hasMore = false;
      }
    }
  } catch (err) {
    console.error('Error fetching quotes for sync:', err);
    errors++;
  }

  return { synced, errors, type: 'quote' };
}

// Full sync - invoices and quotes
export async function syncAllDocuments(
  userId: string,
  apiToken: string
): Promise<{ invoices: SyncResult; quotes: SyncResult }> {
  const invoices = await syncInvoices(userId, apiToken);
  const quotes = await syncQuotes(userId, apiToken);
  return { invoices, quotes };
}

// Search documents using full-text search
export interface DocumentSearchResult {
  id: string;
  sevdeskId: string;
  documentType: 'invoice' | 'quote';
  documentNumber: string;
  contactId: string | null;
  contactName: string;
  documentDate: string;
  status: number;
  statusName: string;
  header: string;
  sumNet: number;
  sumGross: number;
  sumTax: number | null;
  currency: string;
  positions: Array<{ name: string; text: string | null; quantity: number; price: number; sumNet: number }>;
  rank: number;
}

export async function searchDocuments(
  userId: string,
  searchQuery: string,
  options: {
    type?: 'invoice' | 'quote';
    limit?: number;
    offset?: number;
  } = {}
): Promise<DocumentSearchResult[]> {
  const { type, limit = 50, offset = 0 } = options;

  // Build search query with German stemming
  const searchTerms = searchQuery.trim().split(/\s+/).map(t => `${t}:*`).join(' & ');

  let sql = `
    SELECT
      id, sevdesk_id, document_type, document_number,
      contact_id, contact_name, document_date, status, status_name,
      header, sum_net, sum_gross, sum_tax, currency, positions_json,
      ts_rank(search_vector, to_tsquery('german', $2)) as rank
    FROM sevdesk_documents
    WHERE user_id = $1
      AND search_vector @@ to_tsquery('german', $2)
  `;

  const params: any[] = [userId, searchTerms];

  if (type) {
    sql += ` AND document_type = $3`;
    params.push(type);
  }

  sql += ` ORDER BY rank DESC, document_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  return result.rows.map(row => ({
    id: row.id,
    sevdeskId: row.sevdesk_id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    contactId: row.contact_id,
    contactName: row.contact_name,
    documentDate: row.document_date,
    status: row.status,
    statusName: row.status_name,
    header: row.header,
    sumNet: parseFloat(row.sum_net) || 0,
    sumGross: parseFloat(row.sum_gross) || 0,
    sumTax: row.sum_tax ? parseFloat(row.sum_tax) : null,
    currency: row.currency,
    positions: row.positions_json || [],
    rank: row.rank,
  }));
}

// Get sync status
export async function getSyncStatus(userId: string): Promise<{
  lastSync: string | null;
  invoiceCount: number;
  quoteCount: number;
}> {
  const result = await query(
    `SELECT
      MAX(synced_at) as last_sync,
      COUNT(*) FILTER (WHERE document_type = 'invoice') as invoice_count,
      COUNT(*) FILTER (WHERE document_type = 'quote') as quote_count
    FROM sevdesk_documents
    WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    lastSync: row?.last_sync || null,
    invoiceCount: parseInt(row?.invoice_count) || 0,
    quoteCount: parseInt(row?.quote_count) || 0,
  };
}
