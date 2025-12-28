import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { transformRows } from '../utils/dbTransform';
import * as clockodoService from '../services/clockodoService';
import fs from 'fs';
import path from 'path';

const router = Router();

// Import log file path
const IMPORT_LOG_PATH = process.env.IMPORT_LOG_PATH || path.join(__dirname, '../../logs/import.log');

// Ensure log directory exists
try {
  const logDir = path.dirname(IMPORT_LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  console.warn('Could not create import log directory:', err);
}

// Helper function to log import events
function logImport(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = data
    ? `[${timestamp}] ${message} | ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${message}\n`;

  console.log(`📥 Import: ${message}`, data || '');

  try {
    fs.appendFileSync(IMPORT_LOG_PATH, logLine);
  } catch (err) {
    // Silently fail if we can't write to log file
  }
}

interface ClockodoRow {
  kunde: string;
  kundennummer: string;
  projekt: string;
  projektnummer: string;
  tag: string;
  beschreibung: string;
  leistung: string;
  stunden: string;
  umsatz: string;
}

// Parse "hh:mm" or "h:mm" duration string to seconds
function parseDurationToSeconds(durationStr: string): number {
  const match = durationStr.match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return (hours * 3600) + (minutes * 60);
}

// Parse German date format (DD.MM.YYYY) or ISO format (YYYY-MM-DD) to YYYY-MM-DD
function parseDateToISO(dateStr: string): string | null {
  // Try German format: DD.MM.YYYY
  const germanMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanMatch) {
    const day = germanMatch[1].padStart(2, '0');
    const month = germanMatch[2].padStart(2, '0');
    const year = germanMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Try ISO format: YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return dateStr;
  }

  return null;
}

// Parse CSV with semicolon separator and quoted fields
function parseClockodoCsv(csvContent: string): { rows: ClockodoRow[]; skippedRows: Array<{ line: number; reason: string; data: string }> } {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return { rows: [], skippedRows: [] };

  // Parse header to get column indices
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Map German column names to our keys
  const columnMap: Record<string, keyof ClockodoRow> = {
    'kunde': 'kunde',
    'kundennummer': 'kundennummer',
    'projekt': 'projekt',
    'projektnummer': 'projektnummer',
    'tag': 'tag',
    'beschreibung': 'beschreibung',
    'leistung': 'leistung',
    'stunden (hh:mm)': 'stunden',
    'umsatz in eur': 'umsatz'
  };

  const headerIndices: Partial<Record<keyof ClockodoRow, number>> = {};
  headers.forEach((h, idx) => {
    const key = columnMap[h.toLowerCase().trim()];
    if (key) {
      headerIndices[key] = idx;
    }
  });

  const rows: ClockodoRow[] = [];
  const skippedRows: Array<{ line: number; reason: string; data: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    const row: ClockodoRow = {
      kunde: values[headerIndices.kunde ?? -1] || '',
      kundennummer: values[headerIndices.kundennummer ?? -1] || '',
      projekt: values[headerIndices.projekt ?? -1] || '',
      projektnummer: values[headerIndices.projektnummer ?? -1] || '',
      tag: values[headerIndices.tag ?? -1] || '',
      beschreibung: values[headerIndices.beschreibung ?? -1] || '',
      leistung: values[headerIndices.leistung ?? -1] || '',
      stunden: values[headerIndices.stunden ?? -1] || '',
      umsatz: values[headerIndices.umsatz ?? -1] || ''
    };

    // Check for required fields and track why rows are skipped
    const missingFields: string[] = [];
    if (!row.tag) missingFields.push('Datum');
    if (!row.stunden) missingFields.push('Stunden');
    if (!row.kunde) missingFields.push('Kunde');

    if (missingFields.length > 0) {
      skippedRows.push({
        line: i + 1,
        reason: `Fehlende Felder: ${missingFields.join(', ')}`,
        data: `${row.kunde || '?'} | ${row.tag || '?'} | ${row.stunden || '?'}`
      });
      continue;
    }

    // Check if date is valid
    const parsedDate = parseDateToISO(row.tag);
    if (!parsedDate) {
      skippedRows.push({
        line: i + 1,
        reason: `Ungültiges Datum: "${row.tag}" (erwartet: DD.MM.YYYY oder YYYY-MM-DD)`,
        data: `${row.kunde} | ${row.tag} | ${row.stunden}`
      });
      continue;
    }

    // Check if duration is valid
    const durationSeconds = parseDurationToSeconds(row.stunden);
    if (durationSeconds <= 0) {
      skippedRows.push({
        line: i + 1,
        reason: `Ungültige Dauer: "${row.stunden}"`,
        data: `${row.kunde} | ${row.tag} | ${row.stunden}`
      });
      continue;
    }

    rows.push(row);
  }

  return { rows, skippedRows };
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// POST /api/import/clockodo/preview - Preview import data
router.post('/clockodo/preview', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    // Parse CSV
    const { rows, skippedRows } = parseClockodoCsv(csvContent);

    if (rows.length === 0) {
      return res.status(400).json({
        error: 'No valid entries found in CSV',
        skippedRows: skippedRows.slice(0, 20)
      });
    }

    // Get existing customers and projects
    const customersResult = await pool.query(
      'SELECT id, name, customer_number, import_aliases FROM customers WHERE organization_id = $1',
      [organizationId]
    );
    const customers = customersResult.rows;

    const projectsResult = await pool.query(
      'SELECT p.id, p.name, p.customer_id, c.name as customer_name FROM projects p JOIN customers c ON p.customer_id = c.id WHERE p.organization_id = $1',
      [organizationId]
    );
    const projects = projectsResult.rows;

    // Helper function to match customer by number, name, or aliases
    const findMatchingCustomer = (csvName: string, csvNumber: string) => {
      // Priority 1: Match by customer number (if provided and not empty)
      if (csvNumber && csvNumber.trim()) {
        const byNumber = customers.find(c => c.customer_number === csvNumber);
        if (byNumber) return byNumber;
      }

      // Priority 2: Match by exact name (case-insensitive)
      const byName = customers.find(c => c.name.toLowerCase() === csvName.toLowerCase());
      if (byName) return byName;

      // Priority 3: Match by import aliases
      const byAlias = customers.find(c =>
        c.import_aliases && Array.isArray(c.import_aliases) &&
        c.import_aliases.some((alias: string) => alias.toLowerCase() === csvName.toLowerCase())
      );
      if (byAlias) return byAlias;

      return null;
    };

    // Analyze rows and find matches
    const uniqueCustomers = new Map<string, { name: string; nummer: string; matchedId?: string; matchedName?: string; matchedBy?: string }>();
    const uniqueProjects = new Map<string, { name: string; customerName: string; matchedId?: string }>();

    for (const row of rows) {
      // Track unique customers
      const customerKey = row.kunde;
      if (!uniqueCustomers.has(customerKey)) {
        const matchedCustomer = findMatchingCustomer(row.kunde, row.kundennummer);
        let matchedBy: string | undefined;
        if (matchedCustomer) {
          if (row.kundennummer && matchedCustomer.customer_number === row.kundennummer) {
            matchedBy = 'Kundennummer';
          } else if (matchedCustomer.name.toLowerCase() === row.kunde.toLowerCase()) {
            matchedBy = 'Name';
          } else {
            matchedBy = 'Alias';
          }
        }
        uniqueCustomers.set(customerKey, {
          name: row.kunde,
          nummer: row.kundennummer,
          matchedId: matchedCustomer?.id,
          matchedName: matchedCustomer?.name,
          matchedBy
        });
      }

      // Track unique projects (only if not "-")
      if (row.projekt && row.projekt !== '-') {
        const projectKey = `${row.kunde}|${row.projekt}`;
        if (!uniqueProjects.has(projectKey)) {
          const matchedProject = projects.find(
            p => p.name.toLowerCase() === row.projekt.toLowerCase() &&
                 p.customer_name.toLowerCase() === row.kunde.toLowerCase()
          );
          uniqueProjects.set(projectKey, {
            name: row.projekt,
            customerName: row.kunde,
            matchedId: matchedProject?.id
          });
        }
      }
    }

    // Calculate totals
    let totalDuration = 0;
    for (const row of rows) {
      totalDuration += parseDurationToSeconds(row.stunden);
    }

    res.json({
      success: true,
      data: {
        rowCount: rows.length,
        skippedCount: skippedRows.length,
        skippedRows: skippedRows.slice(0, 20), // Show first 20 skipped rows
        totalDuration,
        totalHours: (totalDuration / 3600).toFixed(2),
        customers: Array.from(uniqueCustomers.values()),
        projects: Array.from(uniqueProjects.values()),
        sampleRows: rows.slice(0, 20), // Show first 20 rows instead of 5
        existingCustomers: customers.map(c => ({ id: c.id, name: c.name, customerNumber: c.customer_number, importAliases: c.import_aliases || [] })),
        existingProjects: projects.map(p => ({ id: p.id, name: p.name, customerName: p.customer_name, customerId: p.customer_id }))
      }
    });
  } catch (error) {
    console.error('Clockodo preview error:', error);
    res.status(500).json({ error: 'Failed to parse CSV' });
  }
});

// POST /api/import/clockodo/execute - Execute import
router.post('/clockodo/execute', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { csvContent, customerMapping, projectMapping, defaultProjectId, createMissingProjects, skipDuplicates } = req.body;

    logImport('=== CLOCKODO IMPORT STARTED ===', { userId, organizationId });

    if (!csvContent) {
      logImport('ERROR: CSV content is required');
      return res.status(400).json({ error: 'CSV content is required' });
    }

    // Note: defaultProjectId is no longer required - all unmatched projects must be manually mapped
    // The frontend enforces this by disabling the import button when unmapped projects exist

    // Parse CSV
    const { rows, skippedRows } = parseClockodoCsv(csvContent);
    logImport('CSV parsed', { totalRows: rows.length, skippedRows: skippedRows.length });

    // Log all skipped rows from CSV parsing
    if (skippedRows.length > 0) {
      logImport('Skipped rows during CSV parsing:');
      skippedRows.forEach(sr => {
        logImport(`  Line ${sr.line}: ${sr.reason}`, { data: sr.data });
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid entries found in CSV' });
    }

    // Get existing data
    const customersResult = await pool.query(
      'SELECT id, name, customer_number, import_aliases, default_project_id FROM customers WHERE organization_id = $1',
      [organizationId]
    );
    const allCustomers = customersResult.rows;
    const existingCustomers = new Map(allCustomers.map(c => [c.name.toLowerCase(), c]));
    // Map customer ID to default project ID
    const customerDefaultProjects = new Map(allCustomers.filter(c => c.default_project_id).map(c => [c.id, c.default_project_id]));

    // Helper function to find customer by number, name, or aliases
    const findCustomer = (csvName: string, csvNumber: string) => {
      // Priority 1: Match by customer number
      if (csvNumber && csvNumber.trim()) {
        const byNumber = allCustomers.find(c => c.customer_number === csvNumber);
        if (byNumber) return byNumber;
      }
      // Priority 2: Match by exact name
      const byName = existingCustomers.get(csvName.toLowerCase());
      if (byName) return byName;
      // Priority 3: Match by import aliases
      const byAlias = allCustomers.find(c =>
        c.import_aliases && Array.isArray(c.import_aliases) &&
        c.import_aliases.some((alias: string) => alias.toLowerCase() === csvName.toLowerCase())
      );
      if (byAlias) return byAlias;
      return null;
    };

    const projectsResult = await pool.query(
      'SELECT p.id, p.name, p.customer_id, c.name as customer_name FROM projects p JOIN customers c ON p.customer_id = c.id WHERE p.organization_id = $1',
      [organizationId]
    );
    const existingProjects = new Map(projectsResult.rows.map(p => [`${p.customer_name.toLowerCase()}|${p.name.toLowerCase()}`, p]));

    // Get existing external IDs for 100% reliable duplicate detection
    const existingEntriesResult = await pool.query(
      `SELECT external_id FROM time_entries
       WHERE organization_id = $1 AND external_source = 'clockodo_csv' AND external_id IS NOT NULL`,
      [organizationId]
    );
    const existingExternalIds = new Set(
      existingEntriesResult.rows.map(e => e.external_id)
    );

    // Helper function to generate a consistent external_id from CSV row data
    const generateCsvExternalId = (row: ClockodoRow, projectId: string): string => {
      // Create a deterministic ID from the row data
      const data = `${row.tag}|${row.stunden}|${row.kunde}|${row.projekt}|${(row.beschreibung || '').substring(0, 100)}|${projectId}`;
      // Simple hash function
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return `csv_${Math.abs(hash).toString(36)}`;
    };

    // Validate project mapping - ensure all mapped projects exist
    if (projectMapping) {
      const mappedProjectIds = new Set(Object.values(projectMapping) as string[]);
      for (const projectId of mappedProjectIds) {
        if (projectId) {
          const exists = projectsResult.rows.some(p => p.id === projectId);
          if (!exists) {
            return res.status(400).json({ error: `Invalid project mapping: Project ${projectId} not found` });
          }
        }
      }
    }

    // Validate default project exists
    if (defaultProjectId) {
      const defaultExists = projectsResult.rows.some(p => p.id === defaultProjectId);
      if (!defaultExists) {
        return res.status(400).json({ error: 'Default project not found' });
      }
    }

    // Customer mapping (CSV customer name -> DB customer ID)
    const customerIdMap = new Map<string, string>(Object.entries(customerMapping || {}));

    // Project mapping (CSV "customer|project" -> DB project ID)
    const projectIdMap = new Map<string, string>(Object.entries(projectMapping || {}));

    // Created customers/projects cache
    const createdCustomers = new Map<string, string>();
    const createdProjects = new Map<string, string>();

    let importedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Determine project ID for this entry
        let projectId: string | undefined;

        const customerKey = row.kunde.toLowerCase();
        const projectKey = `${row.kunde}|${row.projekt}`;

        // Check explicit mapping first
        if (projectIdMap.has(projectKey)) {
          projectId = projectIdMap.get(projectKey);
        } else if (row.projekt && row.projekt !== '-') {
          // First try to find the customer to get their actual name (might be matched via alias)
          const matchedCustomer = findCustomer(row.kunde, row.kundennummer);
          const actualCustomerName = matchedCustomer?.name.toLowerCase() || customerKey;

          // Try to find existing project using both CSV customer name and actual matched customer name
          let existingProject = existingProjects.get(`${customerKey}|${row.projekt.toLowerCase()}`);
          if (!existingProject && actualCustomerName !== customerKey) {
            existingProject = existingProjects.get(`${actualCustomerName}|${row.projekt.toLowerCase()}`);
          }
          if (existingProject) {
            projectId = existingProject.id;
          } else if (createMissingProjects) {
            // Create customer if needed
            let customerId = customerIdMap.get(row.kunde);
            if (!customerId) {
              // Reuse the matched customer from above (already found via number, name, or alias)
              if (matchedCustomer) {
                customerId = matchedCustomer.id;
              } else if (createdCustomers.has(customerKey)) {
                customerId = createdCustomers.get(customerKey);
              } else {
                // Create new customer
                const newCustomerId = crypto.randomUUID();
                await pool.query(
                  `INSERT INTO customers (id, organization_id, name, customer_number, email, color, created_at)
                   VALUES ($1, $2, $3, $4, '', $5, NOW())`,
                  [newCustomerId, organizationId, row.kunde, row.kundennummer || null, '#6366f1']
                );
                customerId = newCustomerId;
                createdCustomers.set(customerKey, newCustomerId);
              }
            }

            // Create new project
            if (customerId && !createdProjects.has(projectKey)) {
              const newProjectId = crypto.randomUUID();
              await pool.query(
                `INSERT INTO projects (id, organization_id, customer_id, name, hourly_rate, is_active, created_at)
                 VALUES ($1, $2, $3, $4, 0, true, NOW())`,
                [newProjectId, organizationId, customerId, row.projekt]
              );
              projectId = newProjectId;
              createdProjects.set(projectKey, newProjectId);
            } else if (createdProjects.has(projectKey)) {
              projectId = createdProjects.get(projectKey);
            }
          }
        }

        // Fall back to customer's default project
        if (!projectId) {
          // Find the customer to get their default project
          const matchedCustomer = findCustomer(row.kunde, row.kundennummer);
          if (matchedCustomer && customerDefaultProjects.has(matchedCustomer.id)) {
            projectId = customerDefaultProjects.get(matchedCustomer.id);
            logImport(`Using customer default project for "${row.kunde}"`, { projectId });
          }
        }

        // Fall back to global default project (legacy)
        if (!projectId) {
          projectId = defaultProjectId;
        }

        if (!projectId) {
          const errorMsg = `No project found for "${row.kunde} - ${row.projekt}" (kein Standard-Projekt definiert)`;
          logImport(`SKIP Row: ${errorMsg}`, { row });
          errors.push(`Row ${importedCount + skippedCount + 1}: ${errorMsg}`);
          skippedCount++;
          continue;
        }

        // Parse date and create times (start at 08:00)
        const date = parseDateToISO(row.tag);
        const durationSeconds = parseDurationToSeconds(row.stunden);

        if (!date) {
          const errorMsg = `Ungültiges Datum "${row.tag}"`;
          logImport(`SKIP Row: ${errorMsg}`, { row });
          errors.push(`Row ${importedCount + skippedCount + duplicateCount + 1}: ${errorMsg}`);
          skippedCount++;
          continue;
        }

        if (durationSeconds <= 0) {
          logImport(`SKIP Row: Invalid duration "${row.stunden}"`, { row });
          skippedCount++;
          continue;
        }

        // Check for duplicates using external_id (100% reliable)
        const externalId = generateCsvExternalId(row, projectId!);
        if (skipDuplicates !== false && existingExternalIds.has(externalId)) {
          logImport(`DUPLICATE: ${row.kunde} | ${row.tag} | ${row.stunden}`, { externalId });
          duplicateCount++;
          continue;
        }

        const startTime = new Date(`${date}T08:00:00`).toISOString();
        const endTime = new Date(new Date(`${date}T08:00:00`).getTime() + durationSeconds * 1000).toISOString();

        // Create time entry with external_id for future duplicate detection
        const entryId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO time_entries (id, user_id, organization_id, project_id, start_time, end_time, duration, description, is_running, is_billable, external_id, external_source, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, true, $9, 'clockodo_csv', NOW())`,
          [entryId, userId, organizationId, projectId, startTime, endTime, durationSeconds, row.beschreibung || '', externalId]
        );

        // Add to existing IDs to prevent duplicates within same import
        existingExternalIds.add(externalId);
        importedCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        logImport(`ERROR importing row: ${errorMsg}`, { row, error: errorMsg });
        errors.push(`Row ${importedCount + skippedCount + 1}: ${errorMsg}`);
        skippedCount++;
      }
    }

    logImport('=== CLOCKODO IMPORT COMPLETED ===', {
      importedCount,
      skippedCount,
      duplicateCount,
      totalRows: rows.length,
      createdCustomers: createdCustomers.size,
      createdProjects: createdProjects.size,
      errors: errors.length
    });

    auditLog.log({
      userId,
      action: 'import.clockodo',
      details: JSON.stringify({ importedCount, skippedCount, duplicateCount, totalRows: rows.length }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: {
        importedCount,
        skippedCount,
        duplicateCount,
        totalRows: rows.length,
        createdCustomers: createdCustomers.size,
        createdProjects: createdProjects.size,
        errors // Return all errors now
      }
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logImport('=== CLOCKODO IMPORT FAILED ===', { error: errorMsg, stack: error instanceof Error ? error.stack : undefined });
    console.error('Clockodo import error:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// ============================================
// Clockodo API Import (direct API access)
// ============================================

// GET /api/import/clockodo/api/config - Get Clockodo API config
router.get('/clockodo/api/config', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const config = await clockodoService.getConfig(userId);

    if (!config) {
      return res.json({
        success: true,
        data: { configured: false }
      });
    }

    // Don't return the actual API key for security
    res.json({
      success: true,
      data: {
        configured: true,
        apiEmail: config.apiEmail,
        hasApiKey: !!config.apiKey,
        lastSyncAt: config.lastSyncAt
      }
    });
  } catch (error) {
    console.error('Get Clockodo config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// POST /api/import/clockodo/api/config - Save Clockodo API config
router.post('/clockodo/api/config', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { apiEmail, apiKey } = req.body;

    if (!apiEmail) {
      return res.status(400).json({ error: 'API email is required' });
    }

    const config = await clockodoService.saveConfig(userId, {
      apiEmail,
      apiKey: apiKey || undefined,
    });

    res.json({
      success: true,
      data: {
        configured: true,
        apiEmail: config.apiEmail,
        hasApiKey: !!config.apiKey
      }
    });
  } catch (error) {
    console.error('Save Clockodo config error:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /api/import/clockodo/api/test - Test Clockodo API connection
router.post('/clockodo/api/test', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    console.log('[Clockodo Test] Request body:', JSON.stringify(req.body));
    console.log('[Clockodo Test] Content-Type:', req.headers['content-type']);

    const { apiEmail, apiKey } = req.body;

    if (!apiEmail || !apiKey) {
      console.log('[Clockodo Test] Missing credentials - apiEmail:', !!apiEmail, 'apiKey:', !!apiKey);
      return res.status(400).json({
        error: 'API email and key are required',
        debug: { hasEmail: !!apiEmail, hasKey: !!apiKey, bodyKeys: Object.keys(req.body || {}) }
      });
    }

    const result = await clockodoService.testConnection(apiEmail, apiKey);

    if (result.success) {
      res.json({
        success: true,
        data: {
          userName: result.userName,
          companyName: result.companyName
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('Clockodo connection test error:', error);
    res.status(500).json({ error: error.message || 'Connection test failed' });
  }
});

// POST /api/import/clockodo/api/preview - Preview Clockodo API import
router.post('/clockodo/api/preview', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { apiEmail, apiKey, timeSince, timeUntil } = req.body;

    console.log('[Clockodo Preview] Request body:', JSON.stringify({ apiEmail: !!apiEmail, apiKey: !!apiKey, timeSince, timeUntil }));

    if (!apiEmail || !apiKey) {
      return res.status(400).json({ error: 'API credentials are required' });
    }

    if (!timeSince || !timeUntil) {
      return res.status(400).json({ error: 'Date range is required' });
    }

    logImport('=== CLOCKODO API PREVIEW STARTED ===', { userId, organizationId, timeSince, timeUntil });

    console.log('[Clockodo Preview] Calling previewApiImport...');
    const preview = await clockodoService.previewApiImport(
      userId,
      organizationId,
      apiEmail,
      apiKey,
      timeSince,
      timeUntil
    );
    console.log('[Clockodo Preview] Preview completed, rowCount:', preview.rowCount);

    logImport('Clockodo API preview completed', {
      rowCount: preview.rowCount,
      skippedCount: preview.skippedCount,
      customers: preview.customers.length,
      projects: preview.projects.length
    });

    res.json({
      success: true,
      data: preview
    });
  } catch (error: any) {
    console.error('Clockodo API preview error:', error);
    logImport('=== CLOCKODO API PREVIEW FAILED ===', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to preview import' });
  }
});

// POST /api/import/clockodo/api/execute - Execute Clockodo API import
router.post('/clockodo/api/execute', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const {
      apiEmail,
      apiKey,
      timeSince,
      timeUntil,
      projectMapping,
      defaultProjectId,
      createMissingProjects,
      skipDuplicates
    } = req.body;

    if (!apiEmail || !apiKey) {
      return res.status(400).json({ error: 'API credentials are required' });
    }

    if (!timeSince || !timeUntil) {
      return res.status(400).json({ error: 'Date range is required' });
    }

    logImport('=== CLOCKODO API IMPORT STARTED ===', { userId, organizationId, timeSince, timeUntil });

    const result = await clockodoService.executeApiImport(
      userId,
      organizationId,
      apiEmail,
      apiKey,
      timeSince,
      timeUntil,
      {
        projectMapping,
        defaultProjectId,
        createMissingProjects,
        skipDuplicates
      }
    );

    logImport('=== CLOCKODO API IMPORT COMPLETED ===', {
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      duplicateCount: result.duplicateCount,
      totalRows: result.totalRows,
      createdCustomers: result.createdCustomers,
      createdProjects: result.createdProjects,
      errors: result.errors.length
    });

    auditLog.log({
      userId,
      action: 'import.clockodo_api',
      details: JSON.stringify({
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        duplicateCount: result.duplicateCount,
        totalRows: result.totalRows,
        timeSince,
        timeUntil
      }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Clockodo API import error:', error);
    logImport('=== CLOCKODO API IMPORT FAILED ===', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to import data' });
  }
});

// ============================================
// Create default projects for all customers
// ============================================
router.post('/create-default-projects', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const userId = req.userId!;
    const organizationId = orgReq.organization.id;

    logImport('=== CREATE DEFAULT PROJECTS STARTED ===', { userId, organizationId });

    // Get all customers without a default project
    const customersResult = await pool.query(
      `SELECT c.id, c.name
       FROM customers c
       WHERE c.organization_id = $1
         AND (c.default_project_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM projects p WHERE p.id = c.default_project_id
         ))`,
      [organizationId]
    );

    const customersWithoutDefault = customersResult.rows;
    logImport(`Found ${customersWithoutDefault.length} customers without default project`);

    let created = 0;
    let updated = 0;
    const results: { customerId: string; customerName: string; projectId: string; projectName: string }[] = [];

    for (const customer of customersWithoutDefault) {
      // Check if customer has any existing projects (use oldest one as default)
      const existingProjectsResult = await pool.query(
        `SELECT id, name FROM projects WHERE customer_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [customer.id]
      );

      let projectId: string;
      let projectName: string;

      if (existingProjectsResult.rows.length > 0) {
        // Use oldest existing project as default
        projectId = existingProjectsResult.rows[0].id;
        projectName = existingProjectsResult.rows[0].name;
        logImport(`Using oldest project "${projectName}" as default for customer "${customer.name}"`, { projectId });
      } else {
        // No projects exist - create new "Standard" project
        const { v4: uuidv4 } = await import('uuid');
        projectId = uuidv4();
        projectName = 'Standard';
        await pool.query(
          `INSERT INTO projects (id, user_id, organization_id, customer_id, name, hourly_rate, is_active, rate_type, created_at)
           VALUES ($1, $2, $3, $4, $5, 0, true, 'hourly', NOW())`,
          [projectId, userId, organizationId, customer.id, projectName]
        );
        created++;
        logImport(`Created "Standard" project for customer "${customer.name}"`, { projectId });
      }

      // Set as default project for this customer
      await pool.query(
        `UPDATE customers SET default_project_id = $1 WHERE id = $2`,
        [projectId, customer.id]
      );
      updated++;

      results.push({
        customerId: customer.id,
        customerName: customer.name,
        projectId,
        projectName
      });
    }

    logImport('=== CREATE DEFAULT PROJECTS COMPLETED ===', { created, updated });

    res.json({
      success: true,
      created,
      updated,
      results
    });
  } catch (error: any) {
    console.error('Create default projects error:', error);
    logImport('=== CREATE DEFAULT PROJECTS FAILED ===', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to create default projects' });
  }
});

export default router;
