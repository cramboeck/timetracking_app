import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { transformRows } from '../utils/dbTransform';

const router = Router();

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

    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    if (!defaultProjectId && !createMissingProjects) {
      return res.status(400).json({ error: 'Either defaultProjectId or createMissingProjects must be provided' });
    }

    // Parse CSV
    const { rows } = parseClockodoCsv(csvContent);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No valid entries found in CSV' });
    }

    // Get existing data
    const customersResult = await pool.query(
      'SELECT id, name, customer_number, import_aliases FROM customers WHERE organization_id = $1',
      [organizationId]
    );
    const allCustomers = customersResult.rows;
    const existingCustomers = new Map(allCustomers.map(c => [c.name.toLowerCase(), c]));

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

    // Get existing time entries for duplicate detection
    const existingEntriesResult = await pool.query(
      `SELECT DATE(start_time) as entry_date, duration, description, project_id
       FROM time_entries WHERE organization_id = $1`,
      [organizationId]
    );
    const existingEntryKeys = new Set(
      existingEntriesResult.rows.map(e =>
        `${e.entry_date}|${e.duration}|${(e.description || '').substring(0, 100)}|${e.project_id}`
      )
    );

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

        // Fall back to default project
        if (!projectId) {
          projectId = defaultProjectId;
        }

        if (!projectId) {
          errors.push(`Row ${importedCount + skippedCount + 1}: No project found for "${row.kunde} - ${row.projekt}"`);
          skippedCount++;
          continue;
        }

        // Parse date and create times (start at 08:00)
        const date = parseDateToISO(row.tag);
        const durationSeconds = parseDurationToSeconds(row.stunden);

        if (!date) {
          errors.push(`Row ${importedCount + skippedCount + duplicateCount + 1}: Ungültiges Datum "${row.tag}"`);
          skippedCount++;
          continue;
        }

        if (durationSeconds <= 0) {
          skippedCount++;
          continue;
        }

        // Check for duplicates
        const entryKey = `${date}|${durationSeconds}|${(row.beschreibung || '').substring(0, 100)}|${projectId}`;
        if (skipDuplicates !== false && existingEntryKeys.has(entryKey)) {
          duplicateCount++;
          continue;
        }

        const startTime = new Date(`${date}T08:00:00`).toISOString();
        const endTime = new Date(new Date(`${date}T08:00:00`).getTime() + durationSeconds * 1000).toISOString();

        // Create time entry
        const entryId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO time_entries (id, user_id, organization_id, project_id, start_time, end_time, duration, description, is_running, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
          [entryId, userId, organizationId, projectId, startTime, endTime, durationSeconds, row.beschreibung || '']
        );

        // Add to existing keys to prevent duplicates within same import
        existingEntryKeys.add(entryKey);
        importedCount++;
      } catch (err) {
        console.error('Error importing row:', err);
        errors.push(`Row ${importedCount + skippedCount + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skippedCount++;
      }
    }

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
        errors: errors.slice(0, 10) // Only return first 10 errors
      }
    });
  } catch (error) {
    console.error('Clockodo import error:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

export default router;
