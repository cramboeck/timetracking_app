import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// Clockodo API Base URL (without version - version is specified per endpoint)
const CLOCKODO_API_URL = 'https://my.clockodo.com/api';

// Types
export interface ClockodoConfig {
  id: string;
  userId: string;
  apiEmail: string | null;
  apiKey: string | null;
  lastSyncAt: string | null;
}

export interface ClockodoEntry {
  id: number;
  customersId: number;
  projectsId: number | null;
  usersId: number;
  servicesId: number | null;
  billable: number;
  timeSince: string;
  timeUntil: string | null;
  duration: number; // in seconds
  text: string | null;
  lumpsumValue: number | null;
  lumpsumServicesId: number | null;
  hourlyRate: number | null;
}

export interface ClockodoCustomer {
  id: number;
  name: string;
  number: string | null;
  active: boolean;
}

export interface ClockodoProject {
  id: number;
  customersId: number;
  name: string;
  number: string | null;
  active: boolean;
}

export interface ClockodoService {
  id: number;
  name: string;
  number: string | null;
}

// Helper to normalize text and handle German special characters (ä, ö, ü, ß)
function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  // Ensure proper UTF-8 handling - the text should already be UTF-8 from the API
  // Just clean up any potential encoding issues
  try {
    // If the text contains mojibake (wrongly decoded UTF-8), try to fix it
    // This handles cases like "Ã¤" -> "ä", "Ã¶" -> "ö", etc.
    const fixed = text
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã„/g, 'Ä')
      .replace(/Ã–/g, 'Ö')
      .replace(/Ãœ/g, 'Ü')
      .replace(/ÃŸ/g, 'ß')
      .replace(/Ã©/g, 'é')
      .replace(/Ã¨/g, 'è');
    return fixed.trim();
  } catch {
    return text.trim();
  }
}

// Helper to make Clockodo API requests with proper UTF-8 handling
async function clockodoFetch(
  apiEmail: string,
  apiKey: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `${CLOCKODO_API_URL}${endpoint}`;
  console.log(`Clockodo API call: ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-ClockodoApiUser': apiEmail,
      'X-ClockodoApiKey': apiKey,
      'X-Clockodo-External-Application': 'TimeTrackingApp;support@example.com',
      'Accept': 'application/json',
      'Accept-Charset': 'utf-8',
      'Content-Type': 'application/json; charset=utf-8',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Clockodo API error: ${response.status} ${response.statusText}`, errorText);
    let errorMessage = `Clockodo API error: ${response.status}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.message || errorData.error?.message || errorMessage;
    } catch {
      // Ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  // Parse response as UTF-8 text first, then JSON
  const responseText = await response.text();
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('Invalid JSON response from Clockodo API');
  }
}

// Get or create Clockodo config for user
export async function getConfig(userId: string): Promise<ClockodoConfig | null> {
  const result = await query(
    'SELECT * FROM clockodo_config WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    apiEmail: row.api_email,
    apiKey: row.api_key,
    lastSyncAt: row.last_sync_at,
  };
}

// Save Clockodo config
export async function saveConfig(
  userId: string,
  config: Partial<Omit<ClockodoConfig, 'id' | 'userId'>>
): Promise<ClockodoConfig> {
  const existing = await getConfig(userId);

  if (existing) {
    // Update existing config
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (config.apiEmail !== undefined) {
      updates.push(`api_email = $${paramCount++}`);
      values.push(config.apiEmail);
    }
    if (config.apiKey !== undefined) {
      updates.push(`api_key = $${paramCount++}`);
      values.push(config.apiKey);
    }
    if (config.lastSyncAt !== undefined) {
      updates.push(`last_sync_at = $${paramCount++}`);
      values.push(config.lastSyncAt);
    }

    updates.push('updated_at = NOW()');
    values.push(userId);

    await query(
      `UPDATE clockodo_config SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
      values
    );

    return (await getConfig(userId))!;
  } else {
    // Create new config
    const id = uuidv4();
    await query(
      `INSERT INTO clockodo_config (id, user_id, api_email, api_key, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        id,
        userId,
        config.apiEmail || null,
        config.apiKey || null,
      ]
    );

    return (await getConfig(userId))!;
  }
}

// Test Clockodo connection
export async function testConnection(
  apiEmail: string,
  apiKey: string
): Promise<{ success: boolean; userName?: string; companyName?: string; error?: string }> {
  try {
    // Use /v2/aggregates/users/me to get current user info
    // See: https://www.clockodo.com/en/api/aggregates/users/me/
    const response = await clockodoFetch(apiEmail, apiKey, '/v2/aggregates/users/me');
    const user = response.user;
    const company = response.company;

    if (user) {
      return {
        success: true,
        userName: normalizeText(user.name),
        companyName: normalizeText(company?.name || user.companiesName),
      };
    }

    return { success: false, error: 'Keine Benutzerdaten gefunden' };
  } catch (error: any) {
    console.error('Clockodo testConnection error:', error);
    return { success: false, error: error.message };
  }
}

// Get customers from Clockodo (API v3)
export async function getClockodoCustomers(
  apiEmail: string,
  apiKey: string
): Promise<ClockodoCustomer[]> {
  const response = await clockodoFetch(apiEmail, apiKey, '/v3/customers');

  // v3 API returns data in 'data' array
  return (response.data || []).map((c: any) => ({
    id: c.id,
    name: normalizeText(c.name),
    number: c.number || null,
    active: c.active === true,
  }));
}

// Get projects from Clockodo (API v4)
export async function getClockodoProjects(
  apiEmail: string,
  apiKey: string
): Promise<ClockodoProject[]> {
  const response = await clockodoFetch(apiEmail, apiKey, '/v4/projects');

  // v4 API returns data in 'data' array with snake_case fields
  return (response.data || []).map((p: any) => ({
    id: p.id,
    customersId: p.customers_id,
    name: normalizeText(p.name),
    number: p.number || null,
    active: p.active === true,
  }));
}

// Get services from Clockodo (API v2)
export async function getClockodoServices(
  apiEmail: string,
  apiKey: string
): Promise<ClockodoService[]> {
  const response = await clockodoFetch(apiEmail, apiKey, '/v2/services');

  return (response.services || []).map((s: any) => ({
    id: s.id,
    name: normalizeText(s.name),
    number: s.number || null,
  }));
}

// Get time entries from Clockodo with pagination
export async function getClockodoEntries(
  apiEmail: string,
  apiKey: string,
  timeSince: string,
  timeUntil: string,
  options: { page?: number; itemsPerPage?: number } = {}
): Promise<{ entries: ClockodoEntry[]; paging: { countPages: number; countItems: number } }> {
  const { page = 1, itemsPerPage = 1000 } = options;

  // Format dates for API (YYYY-MM-DD HH:MM:SS)
  const formattedSince = formatDateForApi(timeSince);
  const formattedUntil = formatDateForApi(timeUntil);

  const params = new URLSearchParams({
    time_since: formattedSince,
    time_until: formattedUntil,
    page: page.toString(),
    items_per_page: itemsPerPage.toString(),
    enhanced_list: 'true', // Required to get text and names
  });

  const response = await clockodoFetch(apiEmail, apiKey, `/v2/entries?${params.toString()}`);

  // API returns snake_case field names
  const entries = (response.entries || []).map((e: any) => ({
    id: e.id,
    customersId: e.customers_id,
    projectsId: e.projects_id || null,
    usersId: e.users_id,
    servicesId: e.services_id || null,
    billable: e.billable || 0,
    timeSince: e.time_since,
    timeUntil: e.time_until || null,
    duration: e.duration || 0,
    text: normalizeText(e.text),
    lumpsumValue: e.lumpsum_value || null,
    lumpsumServicesId: e.lumpsum_services_id || null,
    hourlyRate: e.hourly_rate || null,
  }));

  return {
    entries,
    paging: {
      countPages: response.paging?.count_pages || 1,
      countItems: response.paging?.count_items || entries.length,
    },
  };
}

// Format date for Clockodo API (expects ISO 8601: YYYY-MM-DDTHH:MM:SSZ)
function formatDateForApi(dateStr: string): string {
  // If already in ISO format, return as-is
  if (dateStr.includes('T') && dateStr.endsWith('Z')) {
    return dateStr;
  }

  // Handle "YYYY-MM-DD HH:MM:SS" format (with space)
  if (dateStr.includes(' ') && !dateStr.includes('T')) {
    // Replace space with T and add Z for UTC
    return dateStr.replace(' ', 'T') + 'Z';
  }

  // Parse the date string and convert to ISO 8601 format
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // If parsing failed, try to fix common formats
    console.error('Failed to parse date:', dateStr);
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  return date.toISOString();
}

// Parse Clockodo date to ISO string
function parseClockodoDate(dateStr: string): string {
  // Clockodo returns dates in format "YYYY-MM-DD HH:MM:SS"
  // Convert to ISO format for PostgreSQL
  return new Date(dateStr.replace(' ', 'T') + 'Z').toISOString();
}

// Get all entries for a date range (handles pagination)
export async function getAllClockodoEntries(
  apiEmail: string,
  apiKey: string,
  timeSince: string,
  timeUntil: string
): Promise<ClockodoEntry[]> {
  const allEntries: ClockodoEntry[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await getClockodoEntries(apiEmail, apiKey, timeSince, timeUntil, {
      page,
      itemsPerPage: 1000,
    });

    allEntries.push(...result.entries);

    if (page >= result.paging.countPages) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allEntries;
}

// Preview import from Clockodo API
export interface ClockodoImportPreview {
  rowCount: number;
  skippedCount: number;
  duplicateCount: number;
  totalDuration: number;
  totalHours: string;
  dateRange: { from: string; to: string };
  customers: Array<{
    clockodoId: number;
    name: string;
    nummer: string | null;
    matchedId?: string;
    matchedName?: string;
    matchedBy?: string;
  }>;
  projects: Array<{
    clockodoId: number;
    name: string;
    customerName: string;
    matchedId?: string;
  }>;
  sampleRows: Array<{
    tag: string;
    kunde: string;
    projekt: string | null;
    beschreibung: string | null;
    stunden: string;
    isDuplicate?: boolean;
  }>;
  existingCustomers: Array<{ id: string; name: string; customerNumber?: string; importAliases?: string[] }>;
  existingProjects: Array<{ id: string; name: string; customerName: string; customerId: string }>;
  // Potential duplicates found - entries that already exist for customer on same day
  potentialDuplicates: Array<{
    date: string;
    customerName: string;
    existingEntries: number;
    newEntries: number;
  }>;
}

export async function previewApiImport(
  userId: string,
  organizationId: string,
  apiEmail: string,
  apiKey: string,
  timeSince: string,
  timeUntil: string
): Promise<ClockodoImportPreview> {
  // Fetch data from Clockodo
  const [entries, clockodoCustomers, clockodoProjects] = await Promise.all([
    getAllClockodoEntries(apiEmail, apiKey, timeSince, timeUntil),
    getClockodoCustomers(apiEmail, apiKey),
    getClockodoProjects(apiEmail, apiKey),
  ]);

  // Build lookup maps for Clockodo data
  const customerMap = new Map(clockodoCustomers.map(c => [c.id, c]));
  const projectMap = new Map(clockodoProjects.map(p => [p.id, p]));

  // Get existing local customers and projects
  const customersResult = await query(
    'SELECT id, name, customer_number, import_aliases FROM customers WHERE organization_id = $1',
    [organizationId]
  );
  const customers = customersResult.rows;

  const projectsResult = await query(
    'SELECT p.id, p.name, p.customer_id, c.name as customer_name FROM projects p JOIN customers c ON p.customer_id = c.id WHERE p.organization_id = $1',
    [organizationId]
  );
  const projects = projectsResult.rows;

  // Query existing time entries for the date range to detect duplicates
  // Group by customer and date to find potential conflicts
  const existingEntriesResult = await query(
    `SELECT
       DATE(te.start_time) as entry_date,
       c.name as customer_name,
       c.id as customer_id,
       COUNT(*) as entry_count
     FROM time_entries te
     JOIN projects p ON te.project_id = p.id
     JOIN customers c ON p.customer_id = c.id
     WHERE te.organization_id = $1
       AND te.start_time >= $2
       AND te.start_time <= $3
     GROUP BY DATE(te.start_time), c.name, c.id`,
    [organizationId, timeSince, timeUntil]
  );

  // Build a map of existing entries: "customerId|date" -> count
  const existingEntriesMap = new Map<string, { customerName: string; count: number }>();
  for (const row of existingEntriesResult.rows) {
    const key = `${row.customer_id}|${row.entry_date}`;
    existingEntriesMap.set(key, {
      customerName: row.customer_name,
      count: parseInt(row.entry_count, 10),
    });
  }

  // Helper function to match customer by name or aliases
  const findMatchingCustomer = (clockodoName: string, clockodoNumber: string | null) => {
    // Priority 1: Match by customer number
    if (clockodoNumber) {
      const byNumber = customers.find(c => c.customer_number === clockodoNumber);
      if (byNumber) return byNumber;
    }

    // Priority 2: Match by exact name (case-insensitive)
    const normalizedName = clockodoName.toLowerCase();
    const byName = customers.find(c => c.name.toLowerCase() === normalizedName);
    if (byName) return byName;

    // Priority 3: Match by import aliases
    const byAlias = customers.find(c =>
      c.import_aliases && Array.isArray(c.import_aliases) &&
      c.import_aliases.some((alias: string) => alias.toLowerCase() === normalizedName)
    );
    if (byAlias) return byAlias;

    return null;
  };

  // Analyze entries
  const uniqueCustomers = new Map<number, { clockodoId: number; name: string; nummer: string | null; matchedId?: string; matchedName?: string; matchedBy?: string }>();
  const uniqueProjects = new Map<number, { clockodoId: number; name: string; customerName: string; matchedId?: string }>();
  const sampleRows: ClockodoImportPreview['sampleRows'] = [];
  let totalDuration = 0;
  let skippedCount = 0;
  let duplicateCount = 0;

  // Track new entries per customer+date for duplicate detection
  const newEntriesPerCustomerDate = new Map<string, { customerName: string; count: number }>();

  for (const entry of entries) {
    // Skip entries without duration (running entries)
    if (!entry.duration || entry.duration <= 0 || !entry.timeUntil) {
      skippedCount++;
      continue;
    }

    const clockodoCustomer = customerMap.get(entry.customersId);
    const clockodoProject = entry.projectsId ? projectMap.get(entry.projectsId) : null;

    if (!clockodoCustomer) {
      skippedCount++;
      continue;
    }

    totalDuration += entry.duration;

    // Track entries per customer+date for duplicate detection
    const matchedCustomer = findMatchingCustomer(clockodoCustomer.name, clockodoCustomer.number);
    const entryDate = entry.timeSince.split('T')[0]; // Get just the date part
    let isDuplicate = false;

    if (matchedCustomer) {
      const key = `${matchedCustomer.id}|${entryDate}`;
      // Check if there are existing entries for this customer on this date
      if (existingEntriesMap.has(key)) {
        isDuplicate = true;
        duplicateCount++;
      }
      // Track new entries
      const existing = newEntriesPerCustomerDate.get(key);
      if (existing) {
        existing.count++;
      } else {
        newEntriesPerCustomerDate.set(key, { customerName: clockodoCustomer.name, count: 1 });
      }
    }

    // Track unique customers
    if (!uniqueCustomers.has(entry.customersId)) {
      const matchedCustomer = findMatchingCustomer(clockodoCustomer.name, clockodoCustomer.number);
      let matchedBy: string | undefined;
      if (matchedCustomer) {
        if (clockodoCustomer.number && matchedCustomer.customer_number === clockodoCustomer.number) {
          matchedBy = 'Kundennummer';
        } else if (matchedCustomer.name.toLowerCase() === clockodoCustomer.name.toLowerCase()) {
          matchedBy = 'Name';
        } else {
          matchedBy = 'Alias';
        }
      }
      uniqueCustomers.set(entry.customersId, {
        clockodoId: entry.customersId,
        name: clockodoCustomer.name,
        nummer: clockodoCustomer.number,
        matchedId: matchedCustomer?.id,
        matchedName: matchedCustomer?.name,
        matchedBy,
      });
    }

    // Track unique projects
    if (clockodoProject && !uniqueProjects.has(clockodoProject.id)) {
      const matchedProject = projects.find(
        p => p.name.toLowerCase() === clockodoProject.name.toLowerCase() &&
             p.customer_name.toLowerCase() === clockodoCustomer.name.toLowerCase()
      );
      uniqueProjects.set(clockodoProject.id, {
        clockodoId: clockodoProject.id,
        name: clockodoProject.name,
        customerName: clockodoCustomer.name,
        matchedId: matchedProject?.id,
      });
    }

    // Add sample rows (up to 20)
    if (sampleRows.length < 20) {
      const hours = Math.floor(entry.duration / 3600);
      const minutes = Math.floor((entry.duration % 3600) / 60);
      sampleRows.push({
        tag: new Date(entry.timeSince).toLocaleDateString('de-DE'),
        kunde: clockodoCustomer.name,
        projekt: clockodoProject?.name || null,
        beschreibung: entry.text,
        stunden: `${hours}:${String(minutes).padStart(2, '0')}`,
        isDuplicate,
      });
    }
  }

  // Build potential duplicates list
  const potentialDuplicates: ClockodoImportPreview['potentialDuplicates'] = [];
  for (const [key, newData] of newEntriesPerCustomerDate.entries()) {
    const existingData = existingEntriesMap.get(key);
    if (existingData) {
      const date = key.split('|')[1];
      potentialDuplicates.push({
        date: new Date(date).toLocaleDateString('de-DE'),
        customerName: newData.customerName,
        existingEntries: existingData.count,
        newEntries: newData.count,
      });
    }
  }

  return {
    rowCount: entries.length - skippedCount,
    skippedCount,
    duplicateCount,
    totalDuration,
    totalHours: (totalDuration / 3600).toFixed(2),
    dateRange: { from: timeSince, to: timeUntil },
    customers: Array.from(uniqueCustomers.values()),
    projects: Array.from(uniqueProjects.values()),
    sampleRows,
    existingCustomers: customers.map(c => ({
      id: c.id,
      name: c.name,
      customerNumber: c.customer_number,
      importAliases: c.import_aliases || [],
    })),
    existingProjects: projects.map(p => ({
      id: p.id,
      name: p.name,
      customerName: p.customer_name,
      customerId: p.customer_id,
    })),
    potentialDuplicates,
  };
}

// Execute import from Clockodo API
export async function executeApiImport(
  userId: string,
  organizationId: string,
  apiEmail: string,
  apiKey: string,
  timeSince: string,
  timeUntil: string,
  options: {
    projectMapping?: Record<string, string>;
    defaultProjectId?: string;
    createMissingProjects?: boolean;
    skipDuplicates?: boolean;
  } = {}
): Promise<{
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  totalRows: number;
  createdCustomers: number;
  createdProjects: number;
  errors: string[];
}> {
  const { projectMapping = {}, defaultProjectId, createMissingProjects = true, skipDuplicates = true } = options;

  // Fetch data from Clockodo
  const [entries, clockodoCustomers, clockodoProjects] = await Promise.all([
    getAllClockodoEntries(apiEmail, apiKey, timeSince, timeUntil),
    getClockodoCustomers(apiEmail, apiKey),
    getClockodoProjects(apiEmail, apiKey),
  ]);

  // Build lookup maps for Clockodo data
  const customerMap = new Map(clockodoCustomers.map(c => [c.id, c]));
  const projectMap = new Map(clockodoProjects.map(p => [p.id, p]));

  // Get existing local customers and projects
  const customersResult = await query(
    'SELECT id, name, customer_number, import_aliases, default_project_id FROM customers WHERE organization_id = $1',
    [organizationId]
  );
  const allLocalCustomers = customersResult.rows;
  const existingCustomers = new Map(allLocalCustomers.map(c => [c.name.toLowerCase(), c]));
  // Map customer ID to default project ID
  const customerDefaultProjects = new Map(allLocalCustomers.filter(c => c.default_project_id).map(c => [c.id, c.default_project_id]));

  // Helper function to find customer
  const findCustomer = (clockodoName: string, clockodoNumber: string | null) => {
    // Priority 1: Match by customer number
    if (clockodoNumber) {
      const byNumber = allLocalCustomers.find(c => c.customer_number === clockodoNumber);
      if (byNumber) return byNumber;
    }
    // Priority 2: Match by exact name
    const byName = existingCustomers.get(clockodoName.toLowerCase());
    if (byName) return byName;
    // Priority 3: Match by import aliases
    const byAlias = allLocalCustomers.find(c =>
      c.import_aliases && Array.isArray(c.import_aliases) &&
      c.import_aliases.some((alias: string) => alias.toLowerCase() === clockodoName.toLowerCase())
    );
    if (byAlias) return byAlias;
    return null;
  };

  const projectsResult = await query(
    'SELECT p.id, p.name, p.customer_id, c.name as customer_name FROM projects p JOIN customers c ON p.customer_id = c.id WHERE p.organization_id = $1',
    [organizationId]
  );
  const existingProjects = new Map(projectsResult.rows.map(p => [`${p.customer_name.toLowerCase()}|${p.name.toLowerCase()}`, p]));

  // Get existing Clockodo entry IDs for 100% reliable duplicate detection
  const existingEntriesResult = await query(
    `SELECT external_id FROM time_entries
     WHERE organization_id = $1 AND external_source = 'clockodo' AND external_id IS NOT NULL`,
    [organizationId]
  );
  const existingClockodoIds = new Set(
    existingEntriesResult.rows.map(e => e.external_id)
  );

  // Caches for created customers/projects
  const createdCustomers = new Map<number, string>(); // Clockodo ID -> Local ID
  const createdProjects = new Map<string, string>(); // "customerId|projectName" -> Local ID

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      // Skip entries without duration (running entries)
      if (!entry.duration || entry.duration <= 0 || !entry.timeUntil) {
        skippedCount++;
        continue;
      }

      const clockodoCustomer = customerMap.get(entry.customersId);
      const clockodoProject = entry.projectsId ? projectMap.get(entry.projectsId) : null;

      if (!clockodoCustomer) {
        errors.push(`Eintrag ${entry.id}: Kunde nicht gefunden`);
        skippedCount++;
        continue;
      }

      // Find or create customer
      let localCustomerId: string | undefined;
      const matchedCustomer = findCustomer(clockodoCustomer.name, clockodoCustomer.number);

      if (matchedCustomer) {
        localCustomerId = matchedCustomer.id;
      } else if (createdCustomers.has(entry.customersId)) {
        localCustomerId = createdCustomers.get(entry.customersId);
      } else if (createMissingProjects) {
        // Create new customer
        const newCustomerId = uuidv4();
        await query(
          `INSERT INTO customers (id, organization_id, name, customer_number, email, color, created_at)
           VALUES ($1, $2, $3, $4, '', $5, NOW())`,
          [newCustomerId, organizationId, clockodoCustomer.name, clockodoCustomer.number || null, '#6366f1']
        );
        localCustomerId = newCustomerId;
        createdCustomers.set(entry.customersId, newCustomerId);
        // Add to existingCustomers for subsequent matching
        existingCustomers.set(clockodoCustomer.name.toLowerCase(), { id: newCustomerId, name: clockodoCustomer.name });
      }

      if (!localCustomerId) {
        errors.push(`Eintrag ${entry.id}: Kunde "${clockodoCustomer.name}" konnte nicht zugeordnet werden`);
        skippedCount++;
        continue;
      }

      // Find or create project
      let projectId: string | undefined;

      // Check explicit mapping first
      if (clockodoProject && projectMapping[`${clockodoCustomer.name}|${clockodoProject.name}`]) {
        projectId = projectMapping[`${clockodoCustomer.name}|${clockodoProject.name}`];
      } else if (clockodoProject) {
        // Try to find existing project
        const projectKey = `${clockodoCustomer.name.toLowerCase()}|${clockodoProject.name.toLowerCase()}`;
        const existingProject = existingProjects.get(projectKey);

        if (existingProject) {
          projectId = existingProject.id;
        } else if (createMissingProjects) {
          // Check if we already created this project in this run
          const createdProjectKey = `${localCustomerId}|${clockodoProject.name.toLowerCase()}`;
          if (createdProjects.has(createdProjectKey)) {
            projectId = createdProjects.get(createdProjectKey);
          } else {
            // Create new project
            const newProjectId = uuidv4();
            await query(
              `INSERT INTO projects (id, organization_id, customer_id, name, hourly_rate, is_active, created_at)
               VALUES ($1, $2, $3, $4, 0, true, NOW())`,
              [newProjectId, organizationId, localCustomerId, clockodoProject.name]
            );
            projectId = newProjectId;
            createdProjects.set(createdProjectKey, newProjectId);
          }
        }
      }

      // Fall back to customer's default project
      if (!projectId && localCustomerId && customerDefaultProjects.has(localCustomerId)) {
        projectId = customerDefaultProjects.get(localCustomerId);
      }

      // Fall back to global default project (legacy)
      if (!projectId) {
        projectId = defaultProjectId;
      }

      if (!projectId) {
        errors.push(`Eintrag ${entry.id}: Kein Projekt für "${clockodoCustomer.name} - ${clockodoProject?.name || 'Ohne Projekt'}" (kein Standard-Projekt definiert)`);
        skippedCount++;
        continue;
      }

      // Parse dates
      const startTime = parseClockodoDate(entry.timeSince);
      const endTime = parseClockodoDate(entry.timeUntil);

      // Check for duplicates using Clockodo entry ID (100% reliable)
      const clockodoEntryId = String(entry.id);
      if (skipDuplicates && existingClockodoIds.has(clockodoEntryId)) {
        duplicateCount++;
        continue;
      }

      // Create time entry with external_id for future duplicate detection
      const entryId = uuidv4();
      await query(
        `INSERT INTO time_entries (id, user_id, organization_id, project_id, start_time, end_time, duration, description, is_running, is_billable, external_id, external_source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, true, $9, 'clockodo', NOW())`,
        [entryId, userId, organizationId, projectId, startTime, endTime, entry.duration, entry.text || '', clockodoEntryId]
      );

      // Add to existing IDs to prevent duplicates within same import
      existingClockodoIds.add(clockodoEntryId);
      importedCount++;
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Eintrag ${entry.id}: ${errorMsg}`);
      skippedCount++;
    }
  }

  // Update last sync time
  await saveConfig(userId, { lastSyncAt: new Date().toISOString() });

  return {
    importedCount,
    skippedCount,
    duplicateCount,
    totalRows: entries.length,
    createdCustomers: createdCustomers.size,
    createdProjects: createdProjects.size,
    errors,
  };
}
