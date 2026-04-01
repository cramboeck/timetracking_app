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
  // Parent company info for sub-contacts (Ansprechpartner)
  parent?: { id: string; name: string };
  isSubContact?: boolean;
  // Type of customer: 'company' if has company name, 'individual' if only person name
  customerType?: 'company' | 'individual';
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
// sevDesk category IDs: 3 = Customer, 4 = Supplier, 28 = Partner
// Options:
// - showAll: Include all categories (not just customers)
// - includeSuppliers: Include suppliers (category 4)
// - includeSubContacts: Include sub-contacts (Ansprechpartner) with parent info
export async function getSevdeskCustomers(apiToken: string, options?: { includeSuppliers?: boolean; showAll?: boolean; includeSubContacts?: boolean }): Promise<SevdeskCustomer[]> {
  // When showAll is true, don't filter by category at all to get all contacts
  // When includeSuppliers is true, also remove category filter
  // By default, only fetch customers (category 3), not suppliers
  const categoryFilter = (options?.showAll || options?.includeSuppliers) ? '' : '&category[id]=3&category[objectName]=Category';
  const response = await sevdeskFetch(apiToken, `/Contact?depth=1&embed=category,parent${categoryFilter}`);

  // Helper to map contact to SevdeskCustomer
  const mapContact = (contact: any): SevdeskCustomer => {
    const hasParent = contact.parent && contact.parent.id;
    // Detect customer type: 'company' if has company name field, 'individual' if only person name
    const hasCompanyName = contact.name && contact.name.trim() !== '';
    const customerType: 'company' | 'individual' = hasCompanyName ? 'company' : 'individual';
    return {
      id: contact.id,
      customerNumber: contact.customerNumber || '',
      // Build name from company name or person name
      name: contact.name || [contact.surename, contact.familyname].filter(Boolean).join(' ') || `Kontakt ${contact.id}`,
      category: contact.category ? { id: contact.category.id, name: contact.category.name } : undefined,
      email: contact.email,
      phone: contact.phone,
      // Include parent info for sub-contacts
      parent: hasParent ? { id: contact.parent.id.toString(), name: contact.parent.name || '' } : undefined,
      isSubContact: hasParent,
      customerType,
    };
  };

  // If showAll is true, return all contacts (optionally including sub-contacts)
  if (options?.showAll) {
    return (response.objects || [])
      .filter((contact: any) => {
        const isTopLevel = !contact.parent || !contact.parent.id;
        // Include sub-contacts if option is set
        if (options?.includeSubContacts) return true;
        return isTopLevel;
      })
      .map(mapContact);
  }

  // Filter contacts based on options
  const filteredContacts = (response.objects || []).filter((contact: any) => {
    const isTopLevel = !contact.parent || !contact.parent.id;
    // Must have some form of name (company name OR person name)
    const hasAnyName = (contact.name && contact.name.trim() !== '') ||
                       (contact.surename && contact.surename.trim() !== '') ||
                       (contact.familyname && contact.familyname.trim() !== '');

    // Include sub-contacts if option is set, otherwise only top-level
    if (options?.includeSubContacts) {
      return hasAnyName;
    }
    return isTopLevel && hasAnyName;
  });

  return filteredContacts.map(mapContact);
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
// Helper function to round up seconds to nearest interval (in minutes)
function roundUpToInterval(seconds: number, intervalMinutes: number): number {
  if (intervalMinutes <= 0) return seconds;
  const intervalSeconds = intervalMinutes * 60;
  return Math.ceil(seconds / intervalSeconds) * intervalSeconds;
}

export async function getBillingSummary(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Array<{
  customerId: string;
  customerName: string;
  hourlyRate: number | null;
  sevdeskCustomerId: string | null;
  timeRoundingInterval: number;
  paymentTermsDays: number;
  totalSeconds: number;
  totalHours: number;
  roundedSeconds: number;
  roundedHours: number;
  totalAmount: number | null;
  isBilled: boolean;
  entries: TimeEntryForBilling[];
}>> {
  // Get default hourly rate from config
  const config = await getConfig(userId);
  const defaultRate = config?.defaultHourlyRate || 95;

  // Get ALL entries (billed and unbilled) grouped by customer
  // Only include completed entries (end_time IS NOT NULL) - running entries should not be billed
  // Use DATE() cast to ensure full day inclusion for the end date
  const result = await query(
    `SELECT c.id as customer_id, c.name as customer_name, c.hourly_rate, c.sevdesk_customer_id,
            c.time_rounding_interval, c.payment_terms_days,
            te.id as entry_id, te.duration, te.description, te.start_time,
            te.invoice_export_id,
            t.ticket_number, t.title as ticket_title,
            p.name as project_name
     FROM customers c
     JOIN projects p ON p.customer_id = c.id
     JOIN time_entries te ON te.project_id = p.id
     LEFT JOIN tickets t ON te.ticket_id = t.id
     WHERE c.user_id = $1
       AND DATE(te.start_time) >= $2::date
       AND DATE(te.start_time) <= $3::date
       AND te.end_time IS NOT NULL
       AND te.is_billable = true
     ORDER BY c.name, te.start_time`,
    [userId, startDate, endDate]
  );

  // Group by customer AND billing status
  const customerMap = new Map<string, {
    customerId: string;
    customerName: string;
    hourlyRate: number | null;
    sevdeskCustomerId: string | null;
    timeRoundingInterval: number;
    paymentTermsDays: number;
    totalSeconds: number;
    roundedSeconds: number;
    isBilled: boolean;
    entries: TimeEntryForBilling[];
  }>();

  for (const row of result.rows) {
    const isBilled = row.invoice_export_id !== null;
    const key = `${row.customer_id}_${isBilled ? 'billed' : 'unbilled'}`;
    const roundingInterval = row.time_rounding_interval || 15; // Default 15 minutes
    const paymentTermsDays = row.payment_terms_days || 14; // Default 14 days

    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerId: row.customer_id,
        customerName: row.customer_name,
        hourlyRate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
        sevdeskCustomerId: row.sevdesk_customer_id,
        timeRoundingInterval: roundingInterval,
        paymentTermsDays: paymentTermsDays,
        totalSeconds: 0,
        roundedSeconds: 0,
        isBilled,
        entries: [],
      });
    }

    const customer = customerMap.get(key)!;
    const duration = row.duration || 0;
    customer.totalSeconds += duration;
    // Round up each entry individually to the nearest interval
    customer.roundedSeconds += roundUpToInterval(duration, roundingInterval);
    customer.entries.push({
      id: row.entry_id,
      duration: duration,
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
    const roundedHours = customer.roundedSeconds / 3600;
    return {
      ...customer,
      totalHours: Math.round(totalHours * 100) / 100,
      roundedHours: Math.round(roundedHours * 100) / 100,
      // Amount is calculated based on ROUNDED hours
      totalAmount: rate ? Math.round(roundedHours * rate * 100) / 100 : null,
    };
  });
}

// Custom invoice data interface
interface CustomInvoiceData {
  header?: string;
  headText?: string;
  footText?: string;
  positions?: Array<{
    title: string;
    description: string;
    hours: number;
    amount: number;
    hourlyRate?: number;
    isHeader?: boolean; // Header positions have quantity 0 and display as bold
  }>;
}

// Create invoice in sevDesk
export async function createInvoice(
  apiToken: string,
  config: SevdeskConfig,
  sevdeskCustomerId: string,
  entries: TimeEntryForBilling[],
  hourlyRate: number,
  periodStart: string,
  periodEnd: string,
  customData?: CustomInvoiceData
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  // Format the period for display
  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);
  const periodLabel = `${startDate.toLocaleDateString('de-DE')} - ${endDate.toLocaleDateString('de-DE')}`;

  console.log(`Creating sevDesk invoice for contact ${sevdeskCustomerId}, period ${periodLabel}, ${entries.length} entries`);
  console.log('Custom data provided:', !!customData, 'custom positions:', customData?.positions?.length || 0);

  // Create invoice positions - use custom positions if provided, otherwise create from entries
  let positions: any[];

  if (customData?.positions && customData.positions.length > 0) {
    // Use grouped positions from frontend
    console.log('Using custom grouped positions');
    positions = customData.positions.map((pos, index) => {
      // Header positions (quantity 0) are displayed as bold headers in sevDesk
      if (pos.isHeader || pos.hours === 0) {
        return {
          objectName: 'InvoicePos',
          mapAll: true,
          quantity: 0,
          price: 0,
          name: pos.title,
          text: pos.description || null,
          unity: {
            id: 1, // Stück for header positions
            objectName: 'Unity',
          },
          taxRate: config.taxRate,
          positionNumber: index,
        };
      }

      // Regular positions with hours
      const posHourlyRate = pos.hourlyRate || hourlyRate;
      return {
        objectName: 'InvoicePos',
        mapAll: true,
        quantity: Math.round(pos.hours * 100) / 100,
        price: posHourlyRate,
        name: pos.title,
        text: pos.description || null,
        unity: {
          id: 9, // Stunden for regular positions
          objectName: 'Unity',
        },
        taxRate: config.taxRate,
        positionNumber: index,
      };
    });
  } else {
    // Fallback: create positions from individual entries
    console.log('Using individual entry positions (fallback)');
    positions = entries.map((entry, index) => {
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
  }

  // Use custom texts if provided, otherwise use defaults
  const invoiceHeader = customData?.header || `Leistungen ${periodLabel}`;
  const invoiceHeadText = customData?.headText || `Abrechnung für den Zeitraum ${periodLabel}`;
  const invoiceFootText = customData?.footText || 'Vielen Dank für Ihr Vertrauen.';

  // Fetch required data: SevUser (for contactPerson), contact with address
  const [userResponse, contactResponse, addressResponse] = await Promise.all([
    sevdeskFetch(apiToken, '/SevUser'),
    sevdeskFetch(apiToken, `/Contact/${sevdeskCustomerId}`),
    sevdeskFetch(apiToken, `/ContactAddress?contact[id]=${sevdeskCustomerId}&contact[objectName]=Contact`),
  ]);

  const sevUser = userResponse.objects?.[0];
  if (!sevUser) {
    throw new Error('Could not get sevDesk user for contactPerson');
  }

  const contact = contactResponse.objects;
  const addresses = addressResponse.objects || [];
  const mainAddress = addresses[0] || {};

  // Build address fields
  const addressName = contact?.name || `${contact?.surename || ''} ${contact?.familyname || ''}`.trim() || '';
  const addressStreet = mainAddress.street || null;
  const addressZip = mainAddress.zip || null;
  const addressCity = mainAddress.city || null;

  // Build combined address
  const addressParts: string[] = [];
  if (addressName) addressParts.push(addressName);
  if (addressStreet) addressParts.push(addressStreet);
  if (addressZip || addressCity) addressParts.push([addressZip, addressCity].filter(Boolean).join(' '));
  const fullAddress = addressParts.join('\n');

  console.log('[sevDesk] Using SevUser as contactPerson:', sevUser.id);
  console.log('[sevDesk] Address:', fullAddress);

  // Use Unix timestamp for date (like the quote creation)
  const invoiceDateTimestamp = Math.floor(new Date().getTime() / 1000);
  const taxRate = config.taxRate || 19;

  // Build invoice data structure matching sevDesk format (similar to quote creation)
  const invoiceData: Record<string, unknown> = {
    invoice: {
      objectName: 'Invoice',
      contact: {
        id: parseInt(sevdeskCustomerId),
        objectName: 'Contact',
      },
      invoiceDate: invoiceDateTimestamp,
      header: invoiceHeader,
      headText: invoiceHeadText,
      footText: invoiceFootText,
      timeToPay: config.paymentTermsDays,
      discount: 0,
      status: config.createAsFinal ? 200 : 100,
      // Address fields
      addressName: addressName,
      addressStreet: addressStreet,
      addressZip: addressZip,
      addressCity: addressCity,
      address: fullAddress,
      addressCountry: {
        id: mainAddress.country?.id || 1,
        objectName: 'StaticCountry',
      },
      // Contact person (SevUser, not Contact)
      contactPerson: {
        id: parseInt(sevUser.id),
        objectName: 'SevUser',
      },
      taxRate: 0,
      taxType: null,
      taxRule: {
        id: 1,
        objectName: 'TaxRule',
      },
      invoiceType: 'RE',
      currency: 'EUR',
      showNet: true,
      mapAll: true,
      version: 0,
      smallSettlement: false,
    },
    invoicePosSave: positions.map((pos, index) => ({
      quantity: pos.quantity,
      price: pos.price,
      priceNet: pos.price,
      priceTax: 0,
      priceGross: pos.price * (1 + taxRate / 100),
      name: pos.name || null,
      unity: {
        id: 9, // Stunden
        objectName: 'Unity',
      },
      positionNumber: index,
      text: pos.text || '',
      discount: null,
      taxRate: taxRate,
      objectName: 'InvoicePos',
      mapAll: true,
    })),
    invoicePosDelete: null,
  };

  // Convert to form-urlencoded format (like quote creation)
  const formBody = objectToFormData(invoiceData);

  console.log('[sevDesk] Creating invoice with form-urlencoded data');
  console.log('[sevDesk] Form body (first 500 chars):', formBody.substring(0, 500));

  // Create invoice with retry mechanism
  let response: Response;
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      response = await fetch(`${SEVDESK_API_URL}/Invoice/Factory/saveInvoice`, {
        method: 'POST',
        headers: {
          'Authorization': apiToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      });

      const responseText = await response.text();
      console.log('[sevDesk] Response:', response.status, responseText.substring(0, 500));

      if (!response.ok) {
        const errorMessage = responseText;
        // Check if retryable error
        if (errorMessage.includes('Correct number abort') && retries < maxRetries - 1) {
          retries++;
          console.log(`Invoice creation attempt ${retries} failed, retrying in ${retries * 2000}ms...`);
          await new Promise(resolve => setTimeout(resolve, retries * 2000));
          continue;
        }
        throw new Error(`Failed to create invoice: ${responseText}`);
      }

      const invoiceResponse = JSON.parse(responseText) as { objects: { invoice: { id: string; invoiceNumber: string } } };
      const invoiceId = invoiceResponse.objects.invoice.id;
      const invoiceNumber = invoiceResponse.objects.invoice.invoiceNumber;

      console.log('[sevDesk] Invoice created:', invoiceId, invoiceNumber);

      return {
        invoiceId,
        invoiceNumber,
      };
    } catch (error: any) {
      if (error.message?.includes('Correct number abort') && retries < maxRetries - 1) {
        retries++;
        console.log(`Invoice creation attempt ${retries} failed:`, error.message);
        await new Promise(resolve => setTimeout(resolve, retries * 2000));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to create invoice after maximum retries');
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
  customerId: string;
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
    customerId: row.customer_id,
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

// Delete an invoice export (undo billing)
export async function deleteInvoiceExport(
  userId: string,
  exportId: string
): Promise<void> {
  // First, verify the export exists and belongs to this user
  const exportResult = await query(
    `SELECT id FROM invoice_exports WHERE id = $1 AND user_id = $2`,
    [exportId, userId]
  );

  if (exportResult.rows.length === 0) {
    throw new Error('Export not found');
  }

  // Start transaction
  await query('BEGIN');

  try {
    // Unlink time entries from this export (set invoice_export_id to NULL)
    await query(
      `UPDATE time_entries SET invoice_export_id = NULL WHERE invoice_export_id = $1`,
      [exportId]
    );

    // Delete the export record
    await query(
      `DELETE FROM invoice_exports WHERE id = $1 AND user_id = $2`,
      [exportId, userId]
    );

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
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

// Voucher (Beleg) interface
export interface SevdeskVoucherDetail {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  description: string;
  status: number;
  statusName: string;
  voucherType: string; // VOU = Beleg, VOU_R = Recurring
  creditDebit: string; // C = Credit (Gutschrift), D = Debit (Ausgabe)
  supplier: {
    id: string;
    name: string;
  } | null;
  sumNet: number;
  sumGross: number;
  sumTax: number;
  taxRate: number;
  currency: string;
  paidAt: string | null;
  document: {
    id: string;
    filename: string;
  } | null;
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

// Get status name for vouchers
function getVoucherStatusName(status: number): string {
  switch (status) {
    case 50: return 'Entwurf';
    case 100: return 'Unpaid';
    case 1000: return 'Bezahlt';
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
  // Sort by invoice date descending (newest first)
  params.append('countAll', 'true');

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.contactId) params.append('contact[id]', options.contactId);
  if (options.status) params.append('status', options.status.toString());
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);

  const response = await sevdeskFetch(apiToken, `/Invoice?${params.toString()}`);

  // Sort by invoiceDate descending (newest first) since sevDesk doesn't guarantee order
  const invoices = (response.objects || []).map((inv: any) => ({
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

  // Sort by date descending
  invoices.sort((a: SevdeskInvoiceDetail, b: SevdeskInvoiceDetail) => {
    const dateA = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
    const dateB = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
    return dateB - dateA;
  });

  return invoices;
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
  params.append('countAll', 'true');

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.contactId) params.append('contact[id]', options.contactId);
  if (options.status) params.append('status', options.status.toString());

  const response = await sevdeskFetch(apiToken, `/Order?${params.toString()}`);

  const quotes = (response.objects || []).map((quote: any) => ({
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

  // Sort by date descending (newest first)
  quotes.sort((a: SevdeskQuoteDetail, b: SevdeskQuoteDetail) => {
    const dateA = a.quoteDate ? new Date(a.quoteDate).getTime() : 0;
    const dateB = b.quoteDate ? new Date(b.quoteDate).getTime() : 0;
    return dateB - dateA;
  });

  return quotes;
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
// Voucher (Beleg) Functions
// ============================================

// Get vouchers from sevDesk
export async function getVouchers(
  apiToken: string,
  options: {
    limit?: number;
    offset?: number;
    status?: number;
    creditDebit?: 'C' | 'D'; // C = Credit, D = Debit
  } = {}
): Promise<SevdeskVoucherDetail[]> {
  const params = new URLSearchParams();
  params.append('depth', '1');
  params.append('embed', 'supplier,document');
  params.append('countAll', 'true');

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.status) params.append('status', options.status.toString());
  if (options.creditDebit) params.append('creditDebit', options.creditDebit);

  const response = await sevdeskFetch(apiToken, `/Voucher?${params.toString()}`);

  const vouchers = (response.objects || []).map((v: any) => ({
    id: v.id?.toString(),
    voucherNumber: v.voucherNumber || v.description || '',
    voucherDate: v.voucherDate,
    description: v.description || '',
    status: parseInt(v.status) || 0,
    statusName: getVoucherStatusName(parseInt(v.status) || 0),
    voucherType: v.voucherType || 'VOU',
    creditDebit: v.creditDebit || 'D',
    supplier: v.supplier ? {
      id: v.supplier.id?.toString(),
      name: v.supplier.name || 'Unbekannt',
    } : null,
    sumNet: parseFloat(v.sumNet) || 0,
    sumGross: parseFloat(v.sumGross) || 0,
    sumTax: parseFloat(v.sumTax) || 0,
    taxRate: parseFloat(v.taxRate) || 0,
    currency: v.currency || 'EUR',
    paidAt: v.paidDate || null,
    document: v.document ? {
      id: v.document.id?.toString(),
      filename: v.document.filename || '',
    } : null,
  }));

  // Sort by date descending (newest first)
  vouchers.sort((a: SevdeskVoucherDetail, b: SevdeskVoucherDetail) => {
    const dateA = a.voucherDate ? new Date(a.voucherDate).getTime() : 0;
    const dateB = b.voucherDate ? new Date(b.voucherDate).getTime() : 0;
    return dateB - dateA;
  });

  return vouchers;
}

// Get single voucher details
export async function getVoucherDetail(
  apiToken: string,
  voucherId: string
): Promise<SevdeskVoucherDetail | null> {
  const response = await sevdeskFetch(apiToken, `/Voucher/${voucherId}?depth=1&embed=supplier,document`);

  let v = response.objects;
  if (Array.isArray(v)) {
    v = v[0];
  }

  if (!v) {
    return null;
  }

  return {
    id: v.id?.toString(),
    voucherNumber: v.voucherNumber || v.description || '',
    voucherDate: v.voucherDate,
    description: v.description || '',
    status: parseInt(v.status) || 0,
    statusName: getVoucherStatusName(parseInt(v.status) || 0),
    voucherType: v.voucherType || 'VOU',
    creditDebit: v.creditDebit || 'D',
    supplier: v.supplier ? {
      id: v.supplier.id?.toString(),
      name: v.supplier.name || 'Unbekannt',
    } : null,
    sumNet: parseFloat(v.sumNet) || 0,
    sumGross: parseFloat(v.sumGross) || 0,
    sumTax: parseFloat(v.sumTax) || 0,
    taxRate: parseFloat(v.taxRate) || 0,
    currency: v.currency || 'EUR',
    paidAt: v.paidDate || null,
    document: v.document ? {
      id: v.document.id?.toString(),
      filename: v.document.filename || '',
    } : null,
  };
}

// Upload voucher file to sevDesk
export async function uploadVoucherFile(
  apiToken: string,
  file: Buffer,
  filename: string,
  mimeType: string
): Promise<{ id: string; filename: string }> {
  const formData = new FormData();
  const blob = new Blob([file], { type: mimeType });
  formData.append('file', blob, filename);

  const response = await fetch(`${SEVDESK_API_URL}/Voucher/Factory/uploadTempFile`, {
    method: 'POST',
    headers: {
      'Authorization': apiToken,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${errorText}`);
  }

  const data = await response.json() as { objects?: { id?: string | number; filename?: string } };
  return {
    id: data.objects?.id?.toString() || '',
    filename: data.objects?.filename || filename,
  };
}

// Create voucher from uploaded file
export async function createVoucherFromFile(
  apiToken: string,
  fileId: string,
  voucherData: {
    voucherDate: string;
    description?: string;
    invoiceNumber?: string;  // Rechnungsnummer für sevDesk
    supplierName?: string;
    sumNet?: number | string;
    sumGross?: number | string;
    sumTax?: number | string;
    taxRate?: number;
    creditDebit?: 'C' | 'D';
  }
): Promise<{ voucherId: string; validationWarnings?: string[] }> {
  const validationWarnings: string[] = [];

  // First, we need to get or create the supplier if provided
  let supplierId: string | null = null;

  if (voucherData.supplierName) {
    // Search for existing supplier
    const searchResponse = await sevdeskFetch(
      apiToken,
      `/Contact?name=${encodeURIComponent(voucherData.supplierName)}&category[id]=4&category[objectName]=Category`
    );

    if (searchResponse.objects && searchResponse.objects.length > 0) {
      supplierId = searchResponse.objects[0].id?.toString();
    }
    // If no supplier found, we'll create the voucher without one
  }

  // Build voucher data - handle both number and string inputs
  let taxRate = voucherData.taxRate || 19;
  const sumNetInput = typeof voucherData.sumNet === 'string' ? parseFloat(voucherData.sumNet) : voucherData.sumNet;
  const sumGrossInput = typeof voucherData.sumGross === 'string' ? parseFloat(voucherData.sumGross) : voucherData.sumGross;
  const sumTaxInput = typeof voucherData.sumTax === 'string' ? parseFloat(voucherData.sumTax) : voucherData.sumTax;

  // Smart calculation with validation
  let sumNet = sumNetInput || 0;
  let sumGross = sumGrossInput || 0;
  let sumTax = sumTaxInput || 0;

  // Case 1: We have all three values - validate consistency
  if (sumNetInput && sumGrossInput && sumTaxInput) {
    const calculatedGross = sumNetInput + sumTaxInput;
    const diff = Math.abs(sumGrossInput - calculatedGross);
    if (diff > 0.02) {
      validationWarnings.push(
        `Betragsinkonsistenz: Netto ${sumNetInput.toFixed(2)}€ + MwSt ${sumTaxInput.toFixed(2)}€ = ${calculatedGross.toFixed(2)}€ ≠ Brutto ${sumGrossInput.toFixed(2)}€`
      );
      // Trust net + tax over gross
      sumGross = calculatedGross;
    }
    // Calculate actual tax rate from amounts
    const actualTaxRate = (sumTaxInput / sumNetInput) * 100;
    if (Math.abs(actualTaxRate - taxRate) > 0.5) {
      validationWarnings.push(
        `MwSt-Satz korrigiert: ${taxRate}% → ${Math.round(actualTaxRate)}% (basierend auf Beträgen)`
      );
      taxRate = Math.round(actualTaxRate);
    }
  }
  // Case 2: We have net and tax - calculate gross
  else if (sumNetInput && sumTaxInput) {
    sumGross = sumNetInput + sumTaxInput;
    const actualTaxRate = (sumTaxInput / sumNetInput) * 100;
    if (Math.abs(actualTaxRate - taxRate) > 0.5) {
      taxRate = Math.round(actualTaxRate);
    }
  }
  // Case 3: We have gross and tax - calculate net
  else if (sumGrossInput && sumTaxInput) {
    sumNet = sumGrossInput - sumTaxInput;
    const actualTaxRate = (sumTaxInput / sumNet) * 100;
    if (Math.abs(actualTaxRate - taxRate) > 0.5) {
      taxRate = Math.round(actualTaxRate);
    }
  }
  // Case 4: Only gross - calculate net from taxRate
  else if (sumGrossInput && !sumNetInput) {
    sumNet = sumGrossInput / (1 + taxRate / 100);
    sumTax = sumGrossInput - sumNet;
  }
  // Case 5: Only net - calculate gross from taxRate
  else if (sumNetInput && !sumGrossInput) {
    sumGross = sumNetInput * (1 + taxRate / 100);
    sumTax = sumGross - sumNetInput;
  }

  // Build description with invoice number if provided
  let description = voucherData.description || 'Beleg';
  if (voucherData.invoiceNumber) {
    description = `${voucherData.invoiceNumber} - ${description}`;
  }

  const voucherPayload: Record<string, unknown> = {
    voucher: {
      objectName: 'Voucher',
      mapAll: true,
      voucherDate: Math.floor(new Date(voucherData.voucherDate).getTime() / 1000),
      description: description,
      status: 50, // Draft
      voucherType: 'VOU',
      creditDebit: voucherData.creditDebit || 'D',
      taxType: 'default',
      currency: 'EUR',
    },
    voucherPosSave: [{
      objectName: 'VoucherPos',
      mapAll: true,
      taxRate: taxRate,
      sum: sumNet,
      net: true,
      accountingType: {
        id: 26, // Default: Sonstige betriebliche Aufwendungen
        objectName: 'AccountingType',
      },
    }],
    filename: fileId,
  };

  if (supplierId) {
    (voucherPayload.voucher as Record<string, unknown>).supplier = {
      id: parseInt(supplierId),
      objectName: 'Contact',
    };
  }

  // Log validation warnings
  if (validationWarnings.length > 0) {
    console.log(`Voucher validation warnings for file ${fileId}:`, validationWarnings);
  }

  const response = await fetch(`${SEVDESK_API_URL}/Voucher/Factory/saveVoucher`, {
    method: 'POST',
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(voucherPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create voucher: ${errorText}`);
  }

  const data = await response.json() as { objects?: { voucher?: { id?: string | number } } };
  return {
    voucherId: data.objects?.voucher?.id?.toString() || '',
    validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
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

// ============================================
// Position Search & Quote Creation
// ============================================

export interface PositionSearchResult {
  id: string;
  name: string;
  text: string | null;
  quantity: number;
  price: number;
  sumNet: number;
  // Context from source document
  sourceDocumentId: string;
  sourceDocumentNumber: string;
  sourceDocumentType: 'invoice' | 'quote';
  sourceContactName: string;
  sourceDocumentDate: string;
}

// Search positions across all synced documents
export async function searchPositions(
  userId: string,
  searchQuery: string,
  options: {
    documentType?: 'invoice' | 'quote';
    limit?: number;
  } = {}
): Promise<PositionSearchResult[]> {
  const { documentType, limit = 30 } = options;

  // Search in JSONB positions_json array
  // Using ILIKE for case-insensitive search in name and text fields
  let sql = `
    SELECT
      d.id as doc_id,
      d.sevdesk_id,
      d.document_number,
      d.document_type,
      d.contact_name,
      d.document_date,
      pos.value as position
    FROM sevdesk_documents d,
    jsonb_array_elements(d.positions_json) as pos
    WHERE d.user_id = $1
      AND (
        pos.value->>'name' ILIKE $2
        OR pos.value->>'text' ILIKE $2
      )
  `;

  const searchPattern = `%${searchQuery}%`;
  const params: any[] = [userId, searchPattern];

  if (documentType) {
    sql += ` AND d.document_type = $3`;
    params.push(documentType);
  }

  sql += ` ORDER BY d.document_date DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  return result.rows.map((row, index) => {
    const pos = row.position;
    return {
      id: `${row.doc_id}-${index}`,
      name: pos.name || '',
      text: pos.text || null,
      quantity: parseFloat(pos.quantity) || 1,
      price: parseFloat(pos.price) || 0,
      sumNet: parseFloat(pos.sumNet) || 0,
      sourceDocumentId: row.sevdesk_id,
      sourceDocumentNumber: row.document_number,
      sourceDocumentType: row.document_type,
      sourceContactName: row.contact_name,
      sourceDocumentDate: row.document_date,
    };
  });
}

// Get unique position names for autocomplete
export async function getPositionSuggestions(
  userId: string,
  prefix: string,
  limit: number = 20
): Promise<string[]> {
  const sql = `
    SELECT DISTINCT pos.value->>'name' as name
    FROM sevdesk_documents d,
    jsonb_array_elements(d.positions_json) as pos
    WHERE d.user_id = $1
      AND pos.value->>'name' ILIKE $2
      AND pos.value->>'name' IS NOT NULL
      AND pos.value->>'name' != ''
    ORDER BY name
    LIMIT $3
  `;

  const result = await query(sql, [userId, `${prefix}%`, limit]);
  return result.rows.map(row => row.name);
}

// Interface for creating quotes
export interface CreateQuoteInput {
  contactId: string;  // sevDesk contact ID
  quoteDate?: string; // ISO date, defaults to today
  header: string;
  headText?: string;
  footText?: string;
  positions: Array<{
    name: string;
    text?: string;
    quantity: number;
    price: number;
    taxRate?: number;  // defaults to config taxRate
  }>;
  status?: number;  // 100 = Draft, 200 = Sent
}

// Helper function to convert nested object to URL-encoded form data with bracket notation
function objectToFormData(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      parts.push(`${encodeURIComponent(fullKey)}=null`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(objectToFormData(value as Record<string, unknown>, fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          parts.push(objectToFormData(item as Record<string, unknown>, `${fullKey}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.filter(p => p).join('&');
}

// Create a quote in sevDesk using form-urlencoded format (like the web UI)
export async function createQuote(
  apiToken: string,
  config: SevdeskConfig,
  input: CreateQuoteInput
): Promise<{ quoteId: string; quoteNumber: string }> {
  // Fetch required data including contact with addresses
  const [userResponse, orderNumberResponse, contactResponse, addressResponse] = await Promise.all([
    sevdeskFetch(apiToken, '/SevUser'),
    sevdeskFetch(apiToken, '/Order/getCorrectOrderNumber?type=AN'),
    sevdeskFetch(apiToken, `/Contact/${input.contactId}`),
    sevdeskFetch(apiToken, `/ContactAddress?contact[id]=${input.contactId}&contact[objectName]=Contact`),
  ]);

  const sevUser = userResponse.objects?.[0];
  if (!sevUser) {
    throw new Error('Could not get sevDesk user for contactPerson');
  }

  const orderNumber = orderNumberResponse.objects || 'AN-0000';
  const contact = contactResponse.objects;
  const addresses = addressResponse.objects || [];

  console.log('[sevDesk] Contact response:', JSON.stringify(contact, null, 2));
  console.log('[sevDesk] Addresses response:', JSON.stringify(addresses, null, 2));

  // Get the main address (or first address)
  const mainAddress = addresses[0] || {};

  // Build address fields - use contact name for addressName
  // For companies: use company name. For persons: use familyname, surename
  const addressName = contact?.name || `${contact?.surename || ''} ${contact?.familyname || ''}`.trim() || '';
  const addressStreet = mainAddress.street || null;
  const addressZip = mainAddress.zip || null;
  const addressCity = mainAddress.city || null;

  // Build combined address like sevDesk does
  const addressParts: string[] = [];
  if (addressName) addressParts.push(addressName);
  if (addressStreet) addressParts.push(addressStreet);
  if (addressZip || addressCity) addressParts.push([addressZip, addressCity].filter(Boolean).join(' '));
  const fullAddress = addressParts.join('\n');

  console.log('[sevDesk] Address fields - name:', addressName, 'street:', addressStreet, 'zip:', addressZip, 'city:', addressCity);
  console.log('[sevDesk] Full address:', fullAddress);

  // Use Unix timestamp for date
  const dateObj = input.quoteDate ? new Date(input.quoteDate) : new Date();
  const orderDateTimestamp = Math.floor(dateObj.getTime() / 1000);
  const taxRate = config.taxRate || 19;

  // Build order data structure matching sevDesk web UI format
  const orderData: Record<string, unknown> = {
    order: {
      orderNumber: orderNumber,
      contact: {
        id: parseInt(input.contactId),
        objectName: 'Contact',
      },
      orderDate: orderDateTimestamp,
      status: 100,
      header: input.header || `Angebot ${orderNumber}`,
      headText: input.headText || '',
      footText: input.footText || '',
      // Address fields
      addressName: addressName,
      addressStreet: addressStreet,
      addressZip: addressZip,
      addressCity: addressCity,
      address: fullAddress,
      addressCountry: {
        id: mainAddress.country?.id || 1,
        objectName: 'StaticCountry',
      },
      version: 0,
      smallSettlement: false,
      contactPerson: {
        id: parseInt(sevUser.id),
        objectName: 'SevUser',
      },
      taxRate: 0,
      taxType: null,
      taxRule: {
        id: 1,
        objectName: 'TaxRule',
      },
      orderType: 'AN',
      currency: 'EUR',
      showNet: false,
      mapAll: true,
      objectName: 'Order',
    },
    orderPosSave: input.positions.map((pos, index) => ({
      quantity: pos.quantity,
      price: pos.price,
      priceNet: pos.price,
      priceTax: 0,
      priceGross: pos.price * (1 + taxRate / 100),
      name: pos.name || null,
      unity: {
        id: 9, // Stunden
        objectName: 'Unity',
      },
      positionNumber: index,
      text: pos.text || '',
      discount: null,
      optional: false,
      taxRate: pos.taxRate || taxRate,
      objectName: 'OrderPos',
      mapAll: true,
    })),
    orderPosDelete: null,
  };

  const formBody = objectToFormData(orderData);

  console.log('[sevDesk] Creating quote with form-urlencoded data');
  console.log('[sevDesk] Form body (first 500 chars):', formBody.substring(0, 500));

  const response = await fetch(`${SEVDESK_API_URL}/Order/Factory/saveOrder`, {
    method: 'POST',
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  const responseText = await response.text();
  console.log('[sevDesk] Response:', response.status, responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`Failed to create quote: ${responseText}`);
  }

  const quoteData = JSON.parse(responseText) as { objects: { order: { id: string; orderNumber: string } } };
  const quoteId = quoteData.objects.order.id;
  const quoteNumber = quoteData.objects.order.orderNumber;

  console.log('[sevDesk] Quote created:', quoteId, quoteNumber);

  return {
    quoteId,
    quoteNumber,
  };
}

// Update an existing quote in sevDesk
export async function updateQuote(
  apiToken: string,
  config: SevdeskConfig,
  quoteId: string,
  input: CreateQuoteInput
): Promise<{ quoteId: string; quoteNumber: string }> {
  // Get existing quote details to preserve some fields
  const existingQuote = await getQuoteWithPositions(apiToken, quoteId);
  if (!existingQuote) {
    throw new Error('Angebot nicht gefunden');
  }

  // Get existing positions IDs for deletion
  const positionsResponse = await sevdeskFetch(apiToken, `/OrderPos?order[id]=${quoteId}&order[objectName]=Order`);
  const existingPositionIds = (positionsResponse.objects || []).map((p: any) => p.id);

  // Fetch required data
  const [userResponse, contactResponse, addressResponse] = await Promise.all([
    sevdeskFetch(apiToken, '/SevUser'),
    sevdeskFetch(apiToken, `/Contact/${input.contactId}`),
    sevdeskFetch(apiToken, `/ContactAddress?contact[id]=${input.contactId}&contact[objectName]=Contact`),
  ]);

  const sevUser = userResponse.objects?.[0];
  if (!sevUser) {
    throw new Error('Could not get sevDesk user for contactPerson');
  }

  const contact = contactResponse.objects;
  const addresses = addressResponse.objects || [];
  const mainAddress = addresses[0] || {};

  // Build address fields
  const addressName = contact?.name || `${contact?.surename || ''} ${contact?.familyname || ''}`.trim() || '';
  const addressStreet = mainAddress.street || null;
  const addressZip = mainAddress.zip || null;
  const addressCity = mainAddress.city || null;

  const addressParts: string[] = [];
  if (addressName) addressParts.push(addressName);
  if (addressStreet) addressParts.push(addressStreet);
  if (addressZip || addressCity) addressParts.push([addressZip, addressCity].filter(Boolean).join(' '));
  const fullAddress = addressParts.join('\n');

  // Use Unix timestamp for date
  const dateObj = input.quoteDate ? new Date(input.quoteDate) : new Date();
  const orderDateTimestamp = Math.floor(dateObj.getTime() / 1000);
  const taxRate = config.taxRate || 19;

  // Build order data with ID for update
  const orderData: Record<string, unknown> = {
    order: {
      id: parseInt(quoteId),
      orderNumber: existingQuote.quoteNumber,
      contact: {
        id: parseInt(input.contactId),
        objectName: 'Contact',
      },
      orderDate: orderDateTimestamp,
      status: input.status || existingQuote.status || 100,
      header: input.header || existingQuote.header,
      headText: input.headText ?? existingQuote.headText ?? '',
      footText: input.footText ?? existingQuote.footText ?? '',
      addressName: addressName,
      addressStreet: addressStreet,
      addressZip: addressZip,
      addressCity: addressCity,
      address: fullAddress,
      addressCountry: {
        id: mainAddress.country?.id || 1,
        objectName: 'StaticCountry',
      },
      version: 0,
      smallSettlement: false,
      contactPerson: {
        id: parseInt(sevUser.id),
        objectName: 'SevUser',
      },
      taxRate: 0,
      taxType: null,
      taxRule: {
        id: 1,
        objectName: 'TaxRule',
      },
      orderType: 'AN',
      currency: 'EUR',
      showNet: false,
      mapAll: true,
      objectName: 'Order',
    },
    orderPosSave: input.positions.map((pos, index) => ({
      quantity: pos.quantity,
      price: pos.price,
      priceNet: pos.price,
      priceTax: 0,
      priceGross: pos.price * (1 + taxRate / 100),
      name: pos.name || null,
      unity: {
        id: 9, // Stunden
        objectName: 'Unity',
      },
      positionNumber: index,
      text: pos.text || '',
      discount: null,
      optional: false,
      taxRate: pos.taxRate || taxRate,
      objectName: 'OrderPos',
      mapAll: true,
    })),
    orderPosDelete: existingPositionIds.length > 0 ? existingPositionIds.map((id: string) => ({
      id: parseInt(id),
      objectName: 'OrderPos',
    })) : null,
  };

  const formBody = objectToFormData(orderData);

  console.log('[sevDesk] Updating quote with form-urlencoded data');

  const response = await fetch(`${SEVDESK_API_URL}/Order/Factory/saveOrder`, {
    method: 'POST',
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });

  const responseText = await response.text();
  console.log('[sevDesk] Update response:', response.status, responseText.substring(0, 500));

  if (!response.ok) {
    throw new Error(`Failed to update quote: ${responseText}`);
  }

  const quoteData = JSON.parse(responseText) as { objects: { order: { id: string; orderNumber: string } } };
  const updatedQuoteNumber = quoteData.objects.order.orderNumber;

  console.log('[sevDesk] Quote updated:', quoteId, updatedQuoteNumber);

  return {
    quoteId,
    quoteNumber: updatedQuoteNumber,
  };
}

// Get previous invoices for a contact (from local DB)
export async function getPreviousInvoicesForContact(
  userId: string,
  contactId: string,
  limit: number = 10
): Promise<Array<{
  documentNumber: string;
  documentDate: string;
  header: string;
  headText: string;
  footText: string;
  positions: Array<{ name: string; quantity: number; price: number }>;
}>> {
  const result = await query(
    `SELECT document_number, document_date, header, head_text, foot_text, positions_json
     FROM sevdesk_documents
     WHERE user_id = $1
       AND contact_id = $2
       AND document_type = 'invoice'
     ORDER BY document_date DESC
     LIMIT $3`,
    [userId, contactId, limit]
  );

  return result.rows.map(row => ({
    documentNumber: row.document_number,
    documentDate: row.document_date,
    header: row.header || '',
    headText: row.head_text || '',
    footText: row.foot_text || '',
    positions: (row.positions_json || []).map((p: any) => ({
      name: p.name || '',
      quantity: parseFloat(p.quantity) || 0,
      price: parseFloat(p.price) || 0,
    })),
  }));
}

// ============================================
// Customer Import Functions
// ============================================

export interface CustomerImportPreview {
  sevdeskId: string;
  sevdeskCustomerNumber: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  // Parent company info for sub-contacts
  parent?: { id: string; name: string };
  isSubContact?: boolean;
  // Type of customer
  customerType?: 'company' | 'individual';
  // Matching info
  matchStatus: 'new' | 'linked' | 'name_match';
  localCustomerId?: string;
  localCustomerName?: string;
}

// Get import preview - compare sevDesk contacts with local customers
export async function getCustomerImportPreview(
  userId: string,
  apiToken: string,
  options?: { showAll?: boolean; includeSubContacts?: boolean }
): Promise<CustomerImportPreview[]> {
  // Get all sevDesk contacts (optionally including all without filtering)
  const sevdeskCustomers = await getSevdeskCustomers(apiToken, {
    showAll: options?.showAll,
    includeSubContacts: options?.includeSubContacts,
  });

  // Get all local customers with their sevdesk links
  const localResult = await query(
    `SELECT id, name, sevdesk_customer_id, import_aliases
     FROM customers
     WHERE user_id = $1`,
    [userId]
  );
  const localCustomers = localResult.rows;

  // Build lookup maps
  const linkedSevdeskIds = new Map<string, { id: string; name: string }>();
  const localNameMap = new Map<string, { id: string; name: string }>();

  for (const local of localCustomers) {
    if (local.sevdesk_customer_id) {
      linkedSevdeskIds.set(local.sevdesk_customer_id, { id: local.id, name: local.name });
    }
    // Normalize name for matching
    const normalizedName = local.name.toLowerCase().trim();
    localNameMap.set(normalizedName, { id: local.id, name: local.name });

    // Also check import_aliases
    if (local.import_aliases && Array.isArray(local.import_aliases)) {
      for (const alias of local.import_aliases) {
        localNameMap.set(alias.toLowerCase().trim(), { id: local.id, name: local.name });
      }
    }
  }

  // Get addresses for sevDesk contacts
  const contactAddresses = new Map<string, string>();
  try {
    const addressResponse = await sevdeskFetch(apiToken, '/ContactAddress');
    for (const addr of addressResponse.objects || []) {
      if (addr.contact?.id) {
        const parts = [
          addr.street,
          [addr.zip, addr.city].filter(Boolean).join(' '),
          addr.country?.name
        ].filter(Boolean);
        contactAddresses.set(addr.contact.id.toString(), parts.join(', '));
      }
    }
  } catch (err) {
    console.error('Failed to fetch contact addresses:', err);
  }

  // Build preview list
  const preview: CustomerImportPreview[] = [];

  for (const sevdesk of sevdeskCustomers) {
    const sevdeskId = sevdesk.id.toString();

    // Check if already linked
    if (linkedSevdeskIds.has(sevdeskId)) {
      const local = linkedSevdeskIds.get(sevdeskId)!;
      preview.push({
        sevdeskId,
        sevdeskCustomerNumber: sevdesk.customerNumber,
        name: sevdesk.name,
        email: sevdesk.email,
        phone: sevdesk.phone,
        address: contactAddresses.get(sevdeskId),
        parent: sevdesk.parent,
        isSubContact: sevdesk.isSubContact,
        customerType: sevdesk.customerType,
        matchStatus: 'linked',
        localCustomerId: local.id,
        localCustomerName: local.name,
      });
      continue;
    }

    // Check if name matches an existing customer
    const normalizedName = sevdesk.name.toLowerCase().trim();
    if (localNameMap.has(normalizedName)) {
      const local = localNameMap.get(normalizedName)!;
      preview.push({
        sevdeskId,
        sevdeskCustomerNumber: sevdesk.customerNumber,
        name: sevdesk.name,
        email: sevdesk.email,
        phone: sevdesk.phone,
        address: contactAddresses.get(sevdeskId),
        parent: sevdesk.parent,
        isSubContact: sevdesk.isSubContact,
        customerType: sevdesk.customerType,
        matchStatus: 'name_match',
        localCustomerId: local.id,
        localCustomerName: local.name,
      });
      continue;
    }

    // New customer
    preview.push({
      sevdeskId,
      sevdeskCustomerNumber: sevdesk.customerNumber,
      name: sevdesk.name,
      email: sevdesk.email,
      phone: sevdesk.phone,
      address: contactAddresses.get(sevdeskId),
      parent: sevdesk.parent,
      isSubContact: sevdesk.isSubContact,
      customerType: sevdesk.customerType,
      matchStatus: 'new',
    });
  }

  // Sort: new first, then name_match, then linked
  const statusOrder = { new: 0, name_match: 1, linked: 2 };
  preview.sort((a, b) => statusOrder[a.matchStatus] - statusOrder[b.matchStatus]);

  return preview;
}

// Import a single sevDesk contact as a new customer
export async function importSevdeskCustomer(
  userId: string,
  sevdeskContact: {
    sevdeskId: string;
    name: string;
    customerNumber?: string;
    email?: string;
    address?: string;
    customerType?: 'company' | 'individual';
  },
  options: {
    color?: string;
    hourlyRate?: number;
  } = {}
): Promise<{ customerId: string }> {
  const customerId = uuidv4();
  const color = options.color || '#3B82F6'; // Default blue

  // Get the user's organization_id from organization_members
  const orgResult = await query(
    'SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const organizationId = orgResult.rows[0]?.organization_id || null;

  await query(
    `INSERT INTO customers (id, user_id, organization_id, name, color, customer_number, email, address, sevdesk_customer_id, hourly_rate, customer_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      customerId,
      userId,
      organizationId,
      sevdeskContact.name,
      color,
      sevdeskContact.customerNumber || null,
      sevdeskContact.email || null,
      sevdeskContact.address || null,
      sevdeskContact.sevdeskId,
      options.hourlyRate || null,
      sevdeskContact.customerType || null,
    ]
  );

  return { customerId };
}

// Link an existing local customer to a sevDesk contact
export async function linkExistingCustomerToSevdesk(
  userId: string,
  customerId: string,
  sevdeskId: string
): Promise<void> {
  const result = await query(
    `UPDATE customers
     SET sevdesk_customer_id = $1
     WHERE id = $2 AND user_id = $3`,
    [sevdeskId, customerId, userId]
  );

  if (result.rowCount === 0) {
    throw new Error('Customer not found');
  }
}

// Batch import multiple customers
export async function batchImportSevdeskCustomers(
  userId: string,
  apiToken: string,
  imports: Array<{
    sevdeskId: string;
    action: 'import' | 'link' | 'skip';
    linkToCustomerId?: string;  // For 'link' action
    color?: string;             // For 'import' action
    hourlyRate?: number;        // For 'import' action
  }>
): Promise<{
  imported: number;
  linked: number;
  skipped: number;
  errors: string[];
}> {
  const result = { imported: 0, linked: 0, skipped: 0, errors: [] as string[] };

  // Get full sevDesk customer data - include ALL contacts (showAll + includeSubContacts)
  // to ensure we can find any contact that was shown in the preview
  const allCustomers = await getSevdeskCustomers(apiToken, { showAll: true, includeSubContacts: true });
  const customerMap = new Map(allCustomers.map(c => [c.id.toString(), c]));

  // Get addresses
  const addressMap = new Map<string, string>();
  try {
    const addressResponse = await sevdeskFetch(apiToken, '/ContactAddress');
    for (const addr of addressResponse.objects || []) {
      if (addr.contact?.id) {
        const parts = [
          addr.street,
          [addr.zip, addr.city].filter(Boolean).join(' ')
        ].filter(Boolean);
        addressMap.set(addr.contact.id.toString(), parts.join(', '));
      }
    }
  } catch (err) {
    console.error('Failed to fetch addresses:', err);
  }

  for (const item of imports) {
    try {
      if (item.action === 'skip') {
        result.skipped++;
        continue;
      }

      const sevdeskCustomer = customerMap.get(item.sevdeskId);
      if (!sevdeskCustomer) {
        result.errors.push(`sevDesk contact ${item.sevdeskId} not found`);
        continue;
      }

      if (item.action === 'import') {
        await importSevdeskCustomer(userId, {
          sevdeskId: item.sevdeskId,
          name: sevdeskCustomer.name,
          customerNumber: sevdeskCustomer.customerNumber,
          email: sevdeskCustomer.email,
          address: addressMap.get(item.sevdeskId),
          customerType: sevdeskCustomer.customerType,
        }, {
          color: item.color,
          hourlyRate: item.hourlyRate,
        });
        result.imported++;
      } else if (item.action === 'link' && item.linkToCustomerId) {
        await linkExistingCustomerToSevdesk(userId, item.linkToCustomerId, item.sevdeskId);
        result.linked++;
      }
    } catch (err: any) {
      result.errors.push(`${item.sevdeskId}: ${err.message}`);
    }
  }

  return result;
}
