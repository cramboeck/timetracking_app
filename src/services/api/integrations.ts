/**
 * Integrations API
 * Handles sevDesk and NinjaRMM integrations
 */

import { authFetch, authFetchMultipart } from './base';

// ============================================
// sevDesk API Types
// ============================================

export interface SevdeskConfig {
  id: string;
  userId: string;
  hasToken: boolean;
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
  email?: string;
}

export interface SevdeskInvoice {
  id: string;
  invoiceNumber: string;
  contact: {
    id: string;
    name: string;
  };
  invoiceDate: string;
  deliveryDate: string | null;
  status: number;
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

export interface SevdeskQuote {
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

export interface SevdeskVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  description: string;
  status: number;
  statusName: string;
  voucherType: string;
  creditDebit: string;
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

export interface PositionSearchResult {
  id: string;
  name: string;
  text: string | null;
  quantity: number;
  price: number;
  sumNet: number;
  sourceDocumentId: string;
  sourceDocumentNumber: string;
  sourceDocumentType: 'invoice' | 'quote';
  sourceContactName: string;
  sourceDocumentDate: string;
}

export interface CreateQuoteInput {
  contactId: string;
  quoteDate?: string;
  header: string;
  headText?: string;
  footText?: string;
  positions: Array<{
    name: string;
    text?: string;
    quantity: number;
    price: number;
    taxRate?: number;
  }>;
  status?: number;
}

export interface BillingSummaryItem {
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
  isBilled?: boolean;
  entries: Array<{
    id: string;
    duration: number;
    description: string;
    ticketNumber?: string;
    ticketTitle?: string;
    projectName?: string;
    startTime: string;
  }>;
}

export interface InvoiceExport {
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
}

// sevDesk API
export const sevdeskApi = {
  getFeatureStatus: async (): Promise<{ success: boolean; data: { billingEnabled: boolean; ninjaRmmEnabled: boolean } }> => {
    return authFetch('/sevdesk/feature-status');
  },

  getConfig: async (): Promise<{ success: boolean; data: SevdeskConfig | null }> => {
    return authFetch('/sevdesk/config');
  },

  saveConfig: async (config: Partial<Omit<SevdeskConfig, 'id' | 'userId' | 'hasToken'>> & { apiToken?: string }): Promise<{ success: boolean; data: SevdeskConfig }> => {
    return authFetch('/sevdesk/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  testConnection: async (apiToken: string): Promise<{ success: boolean; companyName?: string; error?: string }> => {
    return authFetch('/sevdesk/test-connection', {
      method: 'POST',
      body: JSON.stringify({ apiToken }),
    });
  },

  getCustomers: async (): Promise<{ success: boolean; data: SevdeskCustomer[] }> => {
    return authFetch('/sevdesk/customers');
  },

  getContacts: async (options?: { type?: 'customers' | 'suppliers' | 'all'; search?: string }): Promise<{ success: boolean; data: SevdeskCustomer[] }> => {
    const params = new URLSearchParams();
    if (options?.type) params.append('type', options.type);
    if (options?.search) params.append('search', options.search);
    return authFetch(`/sevdesk/contacts?${params.toString()}`);
  },

  linkCustomer: async (customerId: string, sevdeskCustomerId: string): Promise<{ success: boolean }> => {
    return authFetch('/sevdesk/link-customer', {
      method: 'POST',
      body: JSON.stringify({ customerId, sevdeskCustomerId }),
    });
  },

  getBillingSummary: async (startDate: string, endDate: string): Promise<{ success: boolean; data: BillingSummaryItem[] }> => {
    return authFetch(`/sevdesk/billing-summary?startDate=${startDate}&endDate=${endDate}`);
  },

  createInvoice: async (params: {
    customerId: string;
    entryIds: string[];
    periodStart: string;
    periodEnd: string;
    header?: string;
    headText?: string;
    footText?: string;
    positions?: Array<{
      title: string;
      description: string;
      hours: number;
      amount: number;
      hourlyRate: number;
      isHeader?: boolean;
    }>;
    // Filename of the service-report PDF (if generated). Backend uses this
    // to substitute the {reportFilename} placeholder in the per-customer
    // position template.
    reportFilename?: string;
  }): Promise<{
    success: boolean;
    data: {
      exportId: string;
      invoiceId: string;
      invoiceNumber: string;
      totalHours: number;
      totalAmount: number;
    };
  }> => {
    return authFetch('/sevdesk/create-invoice', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  recordExport: async (customerId: string, entryIds: string[], periodStart: string, periodEnd: string, totalHours: number, totalAmount: number): Promise<{ success: boolean; data: { exportId: string } }> => {
    return authFetch('/sevdesk/record-export', {
      method: 'POST',
      body: JSON.stringify({ customerId, entryIds, periodStart, periodEnd, totalHours, totalAmount }),
    });
  },

  generateInvoiceTexts: async (params: {
    customerId: string;
    sevdeskContactId?: string;
    periodStart: string;
    periodEnd: string;
    entries: Array<{ description: string; hours?: number; duration?: number; projectName?: string }>;
  }): Promise<{
    success: boolean;
    data: {
      header: string;
      headText: string;
      footText: string;
      positionTexts: string[];
      previousInvoicesCount: number;
    };
  }> => {
    return authFetch('/sevdesk/generate-invoice-texts', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  createInvoiceExport: async (params: { customerId: string; periodStart: string; periodEnd: string }): Promise<{ success: boolean; data: { exportId: string; totalHours: number; totalAmount: number } }> => {
    return authFetch('/sevdesk/create-export', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  deleteExport: async (exportId: string): Promise<{ success: boolean }> => {
    return authFetch(`/sevdesk/invoice-exports/${exportId}`, {
      method: 'DELETE',
    });
  },

  getInvoiceExports: async (limit?: number): Promise<{ success: boolean; data: InvoiceExport[] }> => {
    return authFetch(`/sevdesk/invoice-exports${limit ? `?limit=${limit}` : ''}`);
  },

  getInvoices: async (options?: {
    limit?: number;
    offset?: number;
    contactId?: string;
    status?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{ success: boolean; data: SevdeskInvoice[] }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.contactId) params.append('contactId', options.contactId);
    if (options?.status) params.append('status', options.status.toString());
    if (options?.startDate) params.append('startDate', options.startDate);
    if (options?.endDate) params.append('endDate', options.endDate);
    const queryString = params.toString();
    return authFetch(`/sevdesk/invoices${queryString ? `?${queryString}` : ''}`);
  },

  getInvoice: async (id: string): Promise<{ success: boolean; data: SevdeskInvoice }> => {
    return authFetch(`/sevdesk/invoices/${id}`);
  },

  getQuotes: async (options?: {
    limit?: number;
    offset?: number;
    contactId?: string;
    status?: number;
  }): Promise<{ success: boolean; data: SevdeskQuote[] }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.contactId) params.append('contactId', options.contactId);
    if (options?.status) params.append('status', options.status.toString());
    const queryString = params.toString();
    return authFetch(`/sevdesk/quotes${queryString ? `?${queryString}` : ''}`);
  },

  getQuote: async (id: string): Promise<{ success: boolean; data: SevdeskQuote }> => {
    return authFetch(`/sevdesk/quotes/${id}`);
  },

  getVouchers: async (options?: {
    limit?: number;
    creditDebit?: 'C' | 'D';
  }): Promise<{ success: boolean; data: SevdeskVoucher[] }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.creditDebit) params.append('creditDebit', options.creditDebit);
    const queryString = params.toString();
    return authFetch(`/sevdesk/vouchers${queryString ? `?${queryString}` : ''}`);
  },

  getVoucher: async (id: string): Promise<{ success: boolean; data: SevdeskVoucher }> => {
    return authFetch(`/sevdesk/vouchers/${id}`);
  },

  uploadVoucherFile: async (fileData: string, filename: string, mimeType: string): Promise<{ success: boolean; data: { id: string; filename: string } }> => {
    return authFetch('/sevdesk/vouchers/upload', {
      method: 'POST',
      body: JSON.stringify({ fileData, filename, mimeType }),
    });
  },

  createVoucher: async (data: {
    fileId: string;
    voucherDate: string;
    description?: string;
    supplierName?: string;
    sumNet?: number;
    sumGross?: number;
    taxRate?: number;
    creditDebit?: 'C' | 'D';
  }): Promise<{ success: boolean; data: { voucherId: string } }> => {
    return authFetch('/sevdesk/vouchers/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getSyncStatus: async (): Promise<{ success: boolean; data: { lastSync: string | null; invoiceCount: number; quoteCount: number } }> => {
    return authFetch('/sevdesk/sync/status');
  },

  syncAll: async (): Promise<{ success: boolean; data: { invoices: { synced: number; errors: number }; quotes: { synced: number; errors: number }; totalSynced: number; totalErrors: number } }> => {
    return authFetch('/sevdesk/sync', { method: 'POST' });
  },

  syncInvoices: async (): Promise<{ success: boolean; data: { synced: number; errors: number; type: string } }> => {
    return authFetch('/sevdesk/sync/invoices', { method: 'POST' });
  },

  syncQuotes: async (): Promise<{ success: boolean; data: { synced: number; errors: number; type: string } }> => {
    return authFetch('/sevdesk/sync/quotes', { method: 'POST' });
  },

  searchDocuments: async (query: string, options?: { type?: 'invoice' | 'quote'; limit?: number; offset?: number }): Promise<{ success: boolean; data: DocumentSearchResult[] }> => {
    const params = new URLSearchParams({ q: query });
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    return authFetch(`/sevdesk/search?${params.toString()}`);
  },

  searchPositions: async (query: string, options?: { type?: 'invoice' | 'quote'; limit?: number }): Promise<{ success: boolean; data: PositionSearchResult[] }> => {
    const params = new URLSearchParams({ q: query });
    if (options?.type) params.append('type', options.type);
    if (options?.limit) params.append('limit', options.limit.toString());
    return authFetch(`/sevdesk/positions/search?${params.toString()}`);
  },

  getPositionSuggestions: async (prefix: string, limit?: number): Promise<{ success: boolean; data: string[] }> => {
    const params = new URLSearchParams({ prefix });
    if (limit) params.append('limit', limit.toString());
    return authFetch(`/sevdesk/positions/suggestions?${params.toString()}`);
  },

  createQuote: async (data: CreateQuoteInput): Promise<{ success: boolean; data: { quoteId: string; quoteNumber: string } }> => {
    return authFetch('/sevdesk/quotes/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateQuote: async (quoteId: string, data: CreateQuoteInput): Promise<{ success: boolean; data: { quoteId: string; quoteNumber: string } }> => {
    return authFetch(`/sevdesk/quotes/${quoteId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  getImportPreview: async (showAll?: boolean): Promise<{
    success: boolean;
    data: {
      customers: Array<{
        sevdeskId: string;
        sevdeskCustomerNumber: string;
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        matchStatus: 'new' | 'linked' | 'name_match';
        localCustomerId?: string;
        localCustomerName?: string;
      }>;
      counts: {
        new: number;
        name_match: number;
        linked: number;
        total: number;
      };
    };
  }> => {
    const query = showAll ? '?showAll=true' : '';
    return authFetch(`/sevdesk/import/preview${query}`);
  },

  executeImport: async (imports: Array<{
    sevdeskId: string;
    action: 'import' | 'link' | 'skip';
    linkToCustomerId?: string;
    color?: string;
    hourlyRate?: number;
  }>): Promise<{
    success: boolean;
    data: {
      imported: number;
      linked: number;
      skipped: number;
      errors: string[];
    };
  }> => {
    return authFetch('/sevdesk/import/execute', {
      method: 'POST',
      body: JSON.stringify({ imports }),
    });
  },

  importSingleCustomer: async (data: {
    sevdeskId: string;
    name: string;
    customerNumber?: string;
    email?: string;
    address?: string;
    color?: string;
    hourlyRate?: number;
  }): Promise<{ success: boolean; data: { customerId: string } }> => {
    return authFetch('/sevdesk/import/single', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============================================
// NinjaRMM API Types
// ============================================

export interface NinjaRMMConfig {
  instanceUrl: string;
  clientId: string | null;
  hasClientId: boolean;
  hasClientSecret: boolean;
  isConnected: boolean;
  tokenExpiresAt: string | null;
  autoSyncDevices: boolean;
  syncIntervalMinutes: number;
  lastSyncAt: string | null;
}

export interface NinjaSyncStatus {
  lastSync: string | null;
  organizationCount: number;
  deviceCount: number;
  alertCount: number;
  unresolvedAlertCount: number;
}

export interface NinjaOrganization {
  id: string;
  ninjaId: number;
  name: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  deviceCount: number;
  syncedAt: string;
}

export interface NinjaDevice {
  id: string;
  ninjaId: number;
  organizationName: string;
  customerName: string | null;
  systemName: string;
  displayName: string | null;
  nodeClass: string;
  offline: boolean;
  lastContact: string | null;
  publicIp: string | null;
  privateIp: string | null;
  osName: string | null;
  osVersion?: string | null;
  osBuild?: string | null;
  osArchitecture?: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  lastLoggedInUser: string | null;
  processorName?: string | null;
  processorCores?: number | null;
  memoryGb?: number | null;
  syncedAt: string;
}

export interface NinjaDeviceSoftware {
  id: string;
  deviceId: string;
  name: string;
  publisher: string | null;
  version: string | null;
  installDate: string | null;
  sizeBytes: number | null;
}

export interface NinjaDeviceOSPatch {
  id: string;
  deviceId: string;
  patchType: 'installed' | 'pending' | 'failed' | 'rejected';
  kbNumber: string | null;
  name: string;
  description: string | null;
  severity: string | null;
  category: string | null;
  installDate: string | null;
  installedOn: string | null;
  sizeBytes: number | null;
  status: string | null;
}

export interface NinjaAlert {
  id: string;
  ninjaUid: string;
  deviceName: string | null;
  organizationName: string | null;
  customerName: string | null;
  severity: string;
  priority: string;
  message: string;
  sourceType: string | null;
  sourceName: string | null;
  activityTime: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  ticketId: string | null;
}

export interface NinjaAlertExclusion {
  id: string;
  name: string;
  description: string | null;
  matchType: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
  matchField: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
  matchValue: string;
  isActive: boolean;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// NinjaRMM API
export const ninjaApi = {
  getConfig: async (): Promise<{ success: boolean; data: NinjaRMMConfig | null }> => {
    return authFetch('/ninjarmm/config');
  },

  saveConfig: async (config: {
    clientId?: string;
    clientSecret?: string;
    instanceUrl?: string;
    autoSyncDevices?: boolean;
    syncIntervalMinutes?: number;
  }): Promise<{ success: boolean; data: NinjaRMMConfig }> => {
    return authFetch('/ninjarmm/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  getAuthUrl: async (): Promise<{ success: boolean; data: { authUrl: string; redirectUri: string } }> => {
    return authFetch('/ninjarmm/auth-url');
  },

  disconnect: async (): Promise<{ success: boolean }> => {
    return authFetch('/ninjarmm/disconnect', { method: 'POST' });
  },

  testConnection: async (): Promise<{ success: boolean; data?: { organizationCount: number; deviceCount: number }; error?: string }> => {
    return authFetch('/ninjarmm/test');
  },

  syncAll: async (): Promise<{ success: boolean; data: { organizations: { synced: number; errors: number }; devices: { synced: number; errors: number }; alerts: { synced: number; errors: number } } }> => {
    return authFetch('/ninjarmm/sync', { method: 'POST' });
  },

  getSyncStatus: async (): Promise<{ success: boolean; data: NinjaSyncStatus }> => {
    return authFetch('/ninjarmm/sync-status');
  },

  getOrganizations: async (): Promise<{ success: boolean; data: NinjaOrganization[] }> => {
    return authFetch('/ninjarmm/organizations');
  },

  linkOrganization: async (organizationId: string, customerId: string | null): Promise<{ success: boolean }> => {
    return authFetch(`/ninjarmm/organizations/${organizationId}/link`, {
      method: 'PUT',
      body: JSON.stringify({ customerId }),
    });
  },

  getDevices: async (options?: {
    organizationId?: string;
    customerId?: string;
    nodeClass?: string;
    offline?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; data: NinjaDevice[] }> => {
    const params = new URLSearchParams();
    if (options?.organizationId) params.append('organizationId', options.organizationId);
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.nodeClass) params.append('nodeClass', options.nodeClass);
    if (options?.offline !== undefined) params.append('offline', options.offline.toString());
    if (options?.search) params.append('search', options.search);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    const queryString = params.toString();
    return authFetch(`/ninjarmm/devices${queryString ? `?${queryString}` : ''}`);
  },

  getDeviceDetails: async (deviceId: string): Promise<{ success: boolean; data: any }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/details`);
  },

  refreshDeviceDetails: async (deviceId: string): Promise<{ success: boolean; data: NinjaDevice }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/refresh`, {
      method: 'POST',
    });
  },

  getAlerts: async (options?: {
    deviceId?: string;
    customerId?: string;
    severity?: string;
    resolved?: boolean;
    ticketId?: string;
    limit?: number;
  }): Promise<{ success: boolean; data: NinjaAlert[] }> => {
    const params = new URLSearchParams();
    if (options?.deviceId) params.append('deviceId', options.deviceId);
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.severity) params.append('severity', options.severity);
    if (options?.resolved !== undefined) params.append('resolved', options.resolved.toString());
    if (options?.ticketId) params.append('ticketId', options.ticketId);
    if (options?.limit) params.append('limit', options.limit.toString());
    const queryString = params.toString();
    return authFetch(`/ninjarmm/alerts${queryString ? `?${queryString}` : ''}`);
  },

  resolveAlert: async (alertId: string, ticketId?: string, resetInNinja?: boolean): Promise<{ success: boolean }> => {
    return authFetch(`/ninjarmm/alerts/${alertId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ ticketId, resetInNinja }),
    });
  },

  createTicketFromAlert: async (alertId: string): Promise<{ success: boolean; data: { ticketId: string } }> => {
    return authFetch(`/ninjarmm/alerts/${alertId}/create-ticket`, { method: 'POST' });
  },

  // Webhook Configuration
  getWebhookConfig: async (): Promise<{
    success: boolean;
    data: {
      webhookUrl: string;
      webhookEnabled: boolean;
      webhookSecret: string | null;
      hasSecret: boolean;
      autoCreateTickets: boolean;
      minSeverity: string;
      autoResolveTickets: boolean;
    };
  }> => {
    return authFetch('/ninjarmm/webhook-config');
  },

  updateWebhookConfig: async (config: {
    webhookEnabled?: boolean;
    webhookSecret?: string;
    autoCreateTickets?: boolean;
    minSeverity?: string;
    autoResolveTickets?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    return authFetch('/ninjarmm/webhook-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  generateWebhookSecret: async (): Promise<{
    success: boolean;
    data: { secret: string; webhookUrl: string };
    message: string;
  }> => {
    return authFetch('/ninjarmm/webhook-config/generate-secret', { method: 'POST' });
  },

  getWebhookEvents: async (options?: {
    limit?: number;
    status?: string;
  }): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      event_type: string;
      ninja_alert_id: string;
      ninja_device_id: string;
      severity: string;
      status: string;
      error_message: string | null;
      alert_id: string | null;
      ticket_id: string | null;
      processing_time_ms: number;
      created_at: string;
    }>;
  }> => {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.status) params.append('status', options.status);
    const queryString = params.toString();
    return authFetch(`/ninjarmm/webhook-events${queryString ? `?${queryString}` : ''}`);
  },

  getWebhookEventPayload: async (eventId: string): Promise<{
    success: boolean;
    data: {
      id: string;
      eventType: string;
      payload: any;
      createdAt: string;
    };
  }> => {
    return authFetch(`/ninjarmm/webhook-events/${eventId}/payload`);
  },

  backfillWebhookDeviceNames: async (): Promise<{
    success: boolean;
    data: {
      processedCount: number;
      updatedCount: number;
    };
    message: string;
  }> => {
    return authFetch('/ninjarmm/webhook-events/backfill-device-names', {
      method: 'POST',
    });
  },

  // Alert Exclusions
  getExclusions: async (): Promise<{
    success: boolean;
    data: NinjaAlertExclusion[];
  }> => {
    return authFetch('/ninjarmm/exclusions');
  },

  createExclusion: async (data: {
    name: string;
    description?: string;
    matchType: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
    matchField: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
    matchValue: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; data: { id: string }; message: string }> => {
    return authFetch('/ninjarmm/exclusions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateExclusion: async (id: string, data: {
    name?: string;
    description?: string;
    matchType?: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
    matchField?: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
    matchValue?: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/ninjarmm/exclusions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteExclusion: async (id: string): Promise<{ success: boolean; message: string }> => {
    return authFetch(`/ninjarmm/exclusions/${id}`, {
      method: 'DELETE',
    });
  },

  createExclusionFromEvent: async (eventId: string, options?: {
    matchField?: 'message' | 'source_name' | 'condition_name' | 'device_name' | 'severity';
    matchType?: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'regex';
  }): Promise<{
    success: boolean;
    data: { id: string; name: string; matchValue: string };
    message: string;
  }> => {
    return authFetch(`/ninjarmm/exclusions/from-event/${eventId}`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  // Software Inventory
  getDeviceSoftware: async (deviceId: string): Promise<{
    success: boolean;
    data: {
      software: NinjaDeviceSoftware[];
      lastFetched: string | null;
      count: number;
    };
  }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/software`);
  },

  refreshDeviceSoftware: async (deviceId: string): Promise<{
    success: boolean;
    data: {
      software: NinjaDeviceSoftware[];
      lastFetched: string;
      count: number;
    };
  }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/software/refresh`, { method: 'POST' });
  },

  getDeviceOSPatches: async (deviceId: string): Promise<{
    success: boolean;
    data: {
      installed: NinjaDeviceOSPatch[];
      pending: NinjaDeviceOSPatch[];
      lastFetched: string | null;
      installedCount: number;
      pendingCount: number;
    };
  }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/os-patches`);
  },

  refreshDeviceOSPatches: async (deviceId: string): Promise<{
    success: boolean;
    data: {
      installed: NinjaDeviceOSPatch[];
      pending: NinjaDeviceOSPatch[];
      lastFetched: string;
      installedCount: number;
      pendingCount: number;
    };
  }> => {
    return authFetch(`/ninjarmm/devices/${deviceId}/os-patches/refresh`, { method: 'POST' });
  },
};

// ============================================
// Microsoft 365 API Types
// ============================================

export interface Microsoft365Config {
  configured: boolean;
  tenantId: string;
  clientId: string;
  hasClientSecret: boolean;
  mailFrom: string;
  supportMailbox: string;
  invoiceMailbox: string;
  featuresEnabled: {
    email: boolean;
    inboxMonitoring: boolean;
    calendar: boolean;
  };
  lastConnectionTest?: string | null;
  lastConnectionStatus?: string | null;
}

export interface ProcessedInvoice {
  id: string;
  emailId: string | null;
  emailSubject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  receivedAt: string;
  attachmentCount: number;
  documentIds: string[];
  vendorId: string | null;
  vendorName?: string;
  status: 'pending' | 'draft' | 'processed' | 'failed' | 'skipped' | 'imported';
  errorMessage?: string | null;
  processedAt: string | null;
  // SSOT-Felder ab Phase 1
  source?: 'email' | 'manual' | 'sevdesk_import';
  originalFilename?: string | null;
  sevdeskVoucherId?: string | null;
  sevdeskVoucherNumber?: string | null;
  invoiceNumber?: string | null;
  supplierName?: string | null;
  invoiceDate?: string | null;
  netAmount?: number | null;
  grossAmount?: number | null;
  vatAmount?: number | null;
  currency?: string | null;
}

export interface InvoiceDocument {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: string;
}

export interface InvoiceLineItem {
  position: number | null;        // Position number on invoice
  description: string;
  articleNumber: string | null;   // Article/SKU number

  // End customer detection (for MSP/reseller invoices)
  customerName: string | null;    // End customer name
  customerDomain: string | null;  // End customer domain (e.g. "musterfirma.at")
  customerNumber: string | null;  // Customer number at distributor (e.g. "HS-12345")

  quantity: number | null;
  unit: string | null;            // Unit (Stück, Monat, Lizenz, User, GB, etc.)
  unitPrice: number | null;
  totalPrice: number | null;
  vatRate: number | null;         // VAT rate for this line item if different

  period: string | null;          // Original period text e.g. "01.12.2024 - 31.12.2024"
  periodStart: string | null;     // Parsed start date YYYY-MM-DD
  periodEnd: string | null;       // Parsed end date YYYY-MM-DD

  productType: string | null;     // e.g. "Microsoft 365", "Exchange Online", "Hornetsecurity"
  productSku: string | null;      // Product SKU/article number from distributor
}

export interface ExtractedInvoiceData {
  // Supplier/vendor info
  supplierName: string | null;
  supplierAddress: string | null;
  taxId: string | null;           // USt-IdNr. of supplier

  // Recipient info
  recipientName: string | null;   // Invoice recipient
  recipientAddress: string | null;
  customerNumber: string | null;  // Customer number at supplier

  // Invoice identifiers
  invoiceNumber: string | null;
  orderNumber: string | null;     // Order/reference number

  // Dates
  invoiceDate: string | null;
  dueDate: string | null;
  deliveryDate: string | null;    // Delivery/service date

  // Amounts
  netAmount: number | null;
  grossAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  currency: string;

  // Payment info
  paymentMethod: string | null;
  iban: string | null;
  bic: string | null;

  // Metadata
  confidence: number;
  rawText?: string;
  lineItems?: InvoiceLineItem[];

  // sevDesk linking
  sevdeskContactId?: string | null;
}

export interface SupportEmail {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  from: {
    name: string;
    email: string;
  };
  toRecipients: Array<{
    name: string;
    email: string;
  }>;
  ccRecipients: Array<{
    name: string;
    email: string;
  }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
}

export interface TicketEmail {
  id: string;
  message_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  subject: string;
  body_preview: string;
  body_html: string | null;
  body_text: string;
  from_name: string;
  from_email: string;
  to_recipients: Array<{ name: string; email: string }>;
  cc_recipients: Array<{ name: string; email: string }>;
  is_read: boolean;
  importance: 'low' | 'normal' | 'high';
  has_attachments: boolean;
  received_at: string;
  sent_at: string | null;
  created_at: string;
}

// Microsoft 365 API
export const microsoft365Api = {
  getConfig: async (): Promise<{ success: boolean; data: Microsoft365Config }> => {
    return authFetch('/microsoft365/config');
  },

  saveConfig: async (config: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    mailFrom?: string;
    supportMailbox?: string;
    invoiceMailbox?: string;
    featuresEnabled?: {
      email?: boolean;
      inboxMonitoring?: boolean;
      calendar?: boolean;
    };
  }): Promise<{ success: boolean; data: Microsoft365Config }> => {
    return authFetch('/microsoft365/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  testConnection: async (credentials: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    mailFrom?: string;
  }): Promise<{
    success: boolean;
    data?: { displayName: string; email: string };
    error?: string;
  }> => {
    return authFetch('/microsoft365/test', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  deleteConfig: async (): Promise<{ success: boolean }> => {
    return authFetch('/microsoft365/config', { method: 'DELETE' });
  },

  // Invoice Processing
  processInvoices: async (options?: { includeRead?: boolean }): Promise<{
    success: boolean;
    data?: {
      processedCount: number;
      skippedCount: number;
      failedCount: number;
      results: Array<{ emailId: string; status: string; error?: string }>;
    };
    error?: string;
  }> => {
    return authFetch('/microsoft365/invoices/process', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  getProcessedInvoices: async (params?: {
    status?: string;
    source?: string;  // 'email' | 'manual' | 'sevdesk_import' (oder comma-list)
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    data: ProcessedInvoice[];
    total: number;
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.source) searchParams.set('source', params.source);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    const query = searchParams.toString();
    return authFetch(`/microsoft365/invoices${query ? `?${query}` : ''}`);
  },

  getInvoiceDocuments: async (invoiceId: string): Promise<{
    success: boolean;
    data: InvoiceDocument[];
  }> => {
    return authFetch(`/microsoft365/invoices/${invoiceId}/documents`);
  },

  // Full-text search over Belege (PDF-extracted text + metadata). Backend uses
  // German tsvector + prefix matching.
  searchProcessedInvoices: async (query: string, options?: {
    status?: string;
    vendorId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; data: Array<{
    id: string;
    email_subject: string | null;
    sender_email: string | null;
    sender_name: string | null;
    received_at: string;
    status: string;
    vendor_id: string | null;
    vendor_name: string | null;
    attachment_count: number;
    document_ids: string[];
    processed_at: string | null;
    source: 'email' | 'manual' | 'sevdesk_import' | null;
    supplier_name: string | null;
    invoice_number: string | null;
    sevdesk_voucher_number: string | null;
    rank: number;
  }> }> => {
    const params = new URLSearchParams({ q: query });
    if (options?.status) params.append('status', options.status);
    if (options?.vendorId) params.append('vendorId', options.vendorId);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));
    return authFetch(`/microsoft365/invoices/search?${params.toString()}`);
  },

  backfillInvoiceSearchIndex: async (limit?: number): Promise<{
    success: boolean;
    data: { processed: number; errors: number };
  }> => {
    const qs = limit ? `?limit=${limit}` : '';
    return authFetch(`/microsoft365/invoices/backfill-search${qs}`, { method: 'POST' });
  },

  retryInvoiceProcessing: async (invoiceId: string): Promise<{ success: boolean; error?: string }> => {
    return authFetch(`/microsoft365/invoices/${invoiceId}/retry`, { method: 'POST' });
  },

  extractInvoiceData: async (invoiceId: string, options?: { force?: boolean }): Promise<{
    success: boolean;
    data?: ExtractedInvoiceData;
    error?: string;
  }> => {
    const qs = options?.force ? '?force=1' : '';
    return authFetch(`/microsoft365/invoices/${invoiceId}/extract${qs}`);
  },

  // Manual-Upload eines Belegs (PDF/Bild). Backend speichert die Datei,
  // legt einen processed_invoice mit source='manual' an und triggert
  // sofort die Extraktion. Antwort enthaelt die extrahierten Daten,
  // damit das Frontend direkt das Bestaetigungs-Modal oeffnen kann.
  uploadReceipt: async (file: File): Promise<{
    success: boolean;
    data?: { processedInvoiceId: string; extracted: ExtractedInvoiceData | null };
    error?: string;
  }> => {
    const fd = new FormData();
    fd.append('file', file);
    return authFetchMultipart('/microsoft365/invoices/upload', fd);
  },

  // Triggert den sevDesk-Voucher-Sync manuell. Laeuft sonst per Cron alle
  // 30 Minuten. Admin-only.
  syncSevdeskVouchers: async (): Promise<{
    success: boolean;
    data?: { created: number; updated: number; skipped: number; errors: number };
    error?: string;
  }> => {
    return authFetch('/microsoft365/invoices/sync-sevdesk-vouchers', { method: 'POST' });
  },

  approveInvoiceDraft: async (invoiceId: string, extractedData?: ExtractedInvoiceData): Promise<{ success: boolean; error?: string }> => {
    return authFetch(`/microsoft365/invoices/${invoiceId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ extractedData }),
    });
  },

  revertInvoiceToDraft: async (invoiceId: string): Promise<{ success: boolean; error?: string }> => {
    return authFetch(`/microsoft365/invoices/${invoiceId}/revert`, { method: 'POST' });
  },

  deleteInvoiceDraft: async (invoiceId: string): Promise<{ success: boolean; error?: string }> => {
    return authFetch(`/microsoft365/invoices/${invoiceId}`, { method: 'DELETE' });
  },

  clearFailedInvoices: async (): Promise<{ success: boolean; deletedCount?: number; error?: string }> => {
    return authFetch('/microsoft365/invoices/failed', { method: 'DELETE' });
  },

  clearAllInvoices: async (): Promise<{ success: boolean; deletedCount?: number; error?: string }> => {
    return authFetch('/microsoft365/invoices/all', { method: 'DELETE' });
  },

  getDocumentDownloadUrl: (documentId: string, inline?: boolean): string => {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    // baseUrl already contains /api, so don't add it again
    return `${baseUrl}/microsoft365/documents/${documentId}/download${inline ? '?inline=true' : ''}`;
  },

  // Support Email Methods
  getSupportEmails: async (params?: {
    includeRead?: boolean;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: SupportEmail[];
    error?: string;
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.includeRead) searchParams.set('includeRead', 'true');
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const query = searchParams.toString();
    return authFetch(`/microsoft365/support/emails${query ? `?${query}` : ''}`);
  },

  // Check if customer exists for an email before creating ticket
  lookupCustomerForEmail: async (messageId: string): Promise<{
    success: boolean;
    found: boolean;
    customer?: {
      id: string;
      name: string;
      matchType: string;
    };
    sender: {
      email: string;
      name: string;
      domain: string | null;
    };
    error?: string;
  }> => {
    return authFetch(`/microsoft365/support/emails/${messageId}/customer-lookup`);
  },

  createTicketFromEmail: async (
    messageId: string,
    options?: { priority?: string; customerId?: string }
  ): Promise<{
    success: boolean;
    data?: {
      ticketId: string;
      ticketNumber: string;
      title: string;
      customerId?: string;
      customerName?: string;
      linkedToExisting: boolean;
    };
    error?: string;
  }> => {
    return authFetch(`/microsoft365/support/emails/${messageId}/create-ticket`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  linkEmailToTicket: async (
    messageId: string,
    ticketId: string
  ): Promise<{
    success: boolean;
    data?: { ticketId: string; ticketNumber: string };
    error?: string;
  }> => {
    return authFetch(`/microsoft365/support/emails/${messageId}/link-ticket`, {
      method: 'POST',
      body: JSON.stringify({ ticketId }),
    });
  },

  getEmailTicketInfo: async (messageId: string): Promise<{
    success: boolean;
    data?: {
      linked: boolean;
      ticket?: {
        ticket_id: string;
        ticket_number: string;
        title: string;
        status: string;
      };
      suggestedTicket?: {
        ticket_id: string;
        ticket_number: string;
        title: string;
        status: string;
      };
    };
    error?: string;
  }> => {
    return authFetch(`/microsoft365/support/emails/${messageId}/ticket-info`);
  },

  // Save email as CRM interaction for customer
  saveEmailAsInteraction: async (
    messageId: string,
    customerId?: string
  ): Promise<{
    success: boolean;
    alreadyExists?: boolean;
    data?: {
      interactionId: string;
      customerId: string;
      customerName: string;
      subject: string;
    };
    requiresCustomer?: boolean;
    error?: string;
  }> => {
    return authFetch(`/microsoft365/support/emails/${messageId}/save-as-interaction`, {
      method: 'POST',
      body: JSON.stringify({ customerId }),
    });
  },

  getTicketEmails: async (ticketId: string): Promise<{
    success: boolean;
    data: TicketEmail[];
    error?: string;
  }> => {
    return authFetch(`/microsoft365/tickets/${ticketId}/emails`);
  },

  // ============================================
  // PERSONAL INBOX
  // ============================================

  // Get emails from user's personal mailbox
  getPersonalEmails: async (params?: {
    includeRead?: boolean;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: (SupportEmail & {
      matchedCustomer?: {
        id: string;
        name: string;
        matchType: string;
      } | null;
    })[];
    userEmail?: string;
    error?: string;
  }> => {
    const searchParams = new URLSearchParams();
    if (params?.includeRead) searchParams.set('includeRead', 'true');
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const query = searchParams.toString();
    return authFetch(`/microsoft365/personal/emails${query ? `?${query}` : ''}`);
  },

  // Save personal email as CRM interaction
  savePersonalEmailAsInteraction: async (
    messageId: string,
    customerId?: string
  ): Promise<{
    success: boolean;
    alreadyExists?: boolean;
    data?: {
      interactionId: string;
      customerId: string;
      customerName: string;
      subject: string;
      direction: 'inbound' | 'outbound';
    };
    requiresCustomer?: boolean;
    sender?: {
      email: string;
      name: string;
      domain: string | null;
    };
    error?: string;
  }> => {
    return authFetch(`/microsoft365/personal/emails/${messageId}/save-as-interaction`, {
      method: 'POST',
      body: JSON.stringify({ customerId }),
    });
  },

  // Lookup customer for personal email
  lookupCustomerForPersonalEmail: async (messageId: string): Promise<{
    success: boolean;
    found: boolean;
    customer?: {
      id: string;
      name: string;
      matchType: string;
    };
    sender: {
      email: string;
      name: string;
      domain: string | null;
    };
    error?: string;
  }> => {
    return authFetch(`/microsoft365/personal/emails/${messageId}/customer-lookup`);
  },
};
