import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, getUserOrganizationId, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { emailService } from '../services/emailService';
import { mailboxMonitorService } from '../services/mailboxMonitorService';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import { logger } from '../utils/logger';
import { hashToken } from '../utils/tokenHash';
import { geocodeCustomer } from '../services/geocodingService';
import { fetchCustomerLogo, extractLogoDomain, saveUploadedLogo, removeLogo } from '../services/logoService';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

// Explicit column lists (no SELECT *)
const CUSTOMER_COLUMNS = `
  id, user_id, organization_id, name, color, customer_number, contact_person,
  email, phone, website, address, address_street, address_zip, address_city,
  report_title, hourly_rate, payment_terms_days, time_rounding_interval,
  logo_url, ninjarmm_organization_id, display_name, import_aliases, sla_policy_id,
  sevdesk_customer_id, sevdesk_position_template, default_contract_id, default_project_id,
  is_vendor, vendor_domain, vendor_notes, vendor_api_config,
  created_at, deleted_at
`;

// ⚠️ Nur Spalten, die wirklich existieren (Regel 7): invitation_token/
// invitation_expires_at/invitation_sent_at waren hier erfunden — die
// Einladungs-Tokens liegen in password_reset_token/password_reset_expires.
// Der Verify-SELECT in PUT/DELETE/send-invite/set-password crashte damit.
const PORTAL_USER_COLUMNS = `
  id, organization_id, customer_id, email, name, password_hash, is_primary_contact,
  can_create_tickets, can_view_all_tickets, can_view_devices, can_view_invoices, can_view_quotes,
  mfa_enabled, mfa_secret, password_reset_token, password_reset_expires,
  created_at, updated_at
`;

// Validation schemas
const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  website: z.string().max(300).optional(),
  address: z.string().max(500).optional(),
  addressStreet: z.string().max(200).optional(),
  addressZip: z.string().max(20).optional(),
  addressCity: z.string().max(100).optional(),
  reportTitle: z.string().max(200).optional(),
  hourlyRate: z.number().min(0).optional(),
  paymentTermsDays: z.number().min(1).max(365).optional(),
  ninjarmmOrganizationId: z.string().max(100).optional(),
  displayName: z.string().max(100).optional(),
  importAliases: z.array(z.string().max(200)).optional(),
  customerType: z.enum(['company', 'individual']).optional()
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  address: z.string().max(500).optional(),
  addressStreet: z.string().max(200).nullable().optional(),
  addressZip: z.string().max(20).nullable().optional(),
  addressCity: z.string().max(100).nullable().optional(),
  reportTitle: z.string().max(200).optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  paymentTermsDays: z.number().min(1).max(365).nullable().optional(),
  ninjarmmOrganizationId: z.string().max(100).nullable().optional(),
  displayName: z.string().max(100).nullable().optional(),
  importAliases: z.array(z.string().max(200)).nullable().optional(),
  customerType: z.enum(['company', 'individual']).nullable().optional(),
  // sevdesk position template (per-customer text appended to every invoice
  // position; supports {placeholders}). default_contract_id is the source for
  // {contractNumber}/{contractTitle}.
  sevdeskPositionTemplate: z.string().max(2000).nullable().optional(),
  defaultContractId: z.string().nullable().optional(),
  // Vendor/Supplier fields
  isVendor: z.boolean().optional(),
  vendorDomain: z.string().max(100).nullable().optional(),
  vendorNotes: z.string().max(5000).nullable().optional(),
});

// GET /api/customers - Get all customers for current organization
router.get('/', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name`, [organizationId]);
    let customers = transformRows(result.rows);

    // Stundensaetze sind Umsatzdaten — Nicht-Admins bekommen sie nicht
    const role = orgReq.organization.role;
    if (role !== 'admin' && role !== 'owner') {
      customers = customers.map((c: Record<string, unknown>) => ({ ...c, hourlyRate: null }));
    }

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    logger.error('Get customers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Kundengesundheit — die EINE Quelle für CRM-Dashboard + CustomerHub.
// Ersetzt die beiden alten Berechnungen (Dashboard: Math.random-Platzhalter!,
// CustomerHub: clientseitiges 5-Faktoren-Mittel, das ruhige Kunden bestrafte).
// MSP-Semantik: keine offenen Tickets = GESUND; fehlende Aktivität zählt nur
// als Risiko, wenn ein aktiver Vertrag laufende Betreuung erwarten lässt.
// Keine Preisdaten in der Response → member-zugänglich.
// ⚠️ Mount VOR den /:customerId-Routen (Route-Shadowing).
// ============================================

interface HealthFactor { label: string; impact: 'positive' | 'neutral' | 'negative' }

function computeMspHealth(row: {
  open_tickets: number; critical_tickets: number; sla_breaches: number;
  overdue_tasks: number; active_contracts: number; last_activity_at: string | null;
}): { score: number; trend: 'up' | 'down' | 'stable'; factors: HealthFactor[] } {
  const factors: HealthFactor[] = [];
  let penalty = 0;

  // Offene Tickets (kritisch/hoch wiegt stärker), Deckel 40
  const ticketPenalty = Math.min(40, row.open_tickets * 10 + row.critical_tickets * 15);
  penalty += ticketPenalty;
  factors.push({
    label: `${row.open_tickets} offene Tickets`,
    impact: row.open_tickets === 0 ? 'positive' : row.critical_tickets > 0 ? 'negative' : 'neutral',
  });

  // SLA-Verletzungen der letzten 90 Tage, Deckel 30
  penalty += Math.min(30, row.sla_breaches * 10);
  if (row.sla_breaches > 0) {
    factors.push({ label: `${row.sla_breaches} SLA-Verletzungen (90 Tage)`, impact: 'negative' });
  }

  // Überfällige Aufgaben, Deckel 20
  penalty += Math.min(20, row.overdue_tasks * 10);
  factors.push({
    label: `${row.overdue_tasks} überfällige Aufgaben`,
    impact: row.overdue_tasks === 0 ? 'positive' : 'negative',
  });

  // Betreuung: nur bei aktivem Vertrag ist lange Inaktivität ein Risiko —
  // ein ruhiger Kunde ohne Vertrag ist neutral, nicht "krank"
  const daysSinceActivity = row.last_activity_at
    ? Math.floor((Date.now() - new Date(row.last_activity_at).getTime()) / 86400000)
    : null;
  if (row.active_contracts > 0) {
    factors.push({ label: `${row.active_contracts} aktive Verträge`, impact: 'positive' });
    if (daysSinceActivity === null) {
      penalty += 20;
      factors.push({ label: 'Noch keine Aktivität erfasst', impact: 'negative' });
    } else if (daysSinceActivity > 90) {
      penalty += 20;
      factors.push({ label: `Zuletzt aktiv vor ${daysSinceActivity} Tagen`, impact: 'negative' });
    } else if (daysSinceActivity > 60) {
      penalty += 10;
      factors.push({ label: `Zuletzt aktiv vor ${daysSinceActivity} Tagen`, impact: 'neutral' });
    } else {
      factors.push({ label: `Zuletzt aktiv vor ${daysSinceActivity} Tagen`, impact: 'positive' });
    }
  } else {
    factors.push({ label: 'Kein aktiver Vertrag', impact: 'neutral' });
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const trend: 'up' | 'down' | 'stable' =
    row.critical_tickets > 0 || row.overdue_tasks > 2 ? 'down'
    : score >= 85 && daysSinceActivity !== null && daysSinceActivity <= 30 ? 'up'
    : 'stable';

  return { score, trend, factors };
}

// GET /api/customers/health-overview?customerId= - Gesundheit aller Org-Kunden
router.get('/health-overview', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : null;

    const result = await pool.query(`
      WITH t AS (
        SELECT customer_id,
          COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed', 'archived')) AS open_count,
          COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed', 'archived') AND priority IN ('critical', 'high')) AS critical_count,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days'
                           AND (sla_first_response_breached = true OR sla_resolution_breached = true)) AS sla_breaches,
          MAX(created_at) AS last_ticket
        FROM tickets
        WHERE organization_id = $1 AND customer_id IS NOT NULL
        GROUP BY customer_id
      ),
      ta AS (
        SELECT customer_id, COUNT(*) AS overdue_count
        FROM tasks
        WHERE organization_id = $1 AND customer_id IS NOT NULL
          AND status NOT IN ('completed', 'cancelled') AND due_date < NOW()
        GROUP BY customer_id
      ),
      ct AS (
        SELECT customer_id, COUNT(*) FILTER (WHERE status = 'active') AS active_count
        FROM contracts
        WHERE organization_id = $1 AND deleted_at IS NULL
        GROUP BY customer_id
      ),
      i AS (
        SELECT customer_id, MAX(occurred_at) AS last_interaction
        FROM customer_interactions
        WHERE organization_id = $1
        GROUP BY customer_id
      ),
      te AS (
        SELECT p.customer_id, MAX(e.start_time) AS last_entry
        FROM time_entries e
        JOIN projects p ON p.id = e.project_id
        WHERE e.organization_id = $1 AND p.customer_id IS NOT NULL
        GROUP BY p.customer_id
      )
      SELECT c.id, c.name,
        COALESCE(t.open_count, 0)::int AS open_tickets,
        COALESCE(t.critical_count, 0)::int AS critical_tickets,
        COALESCE(t.sla_breaches, 0)::int AS sla_breaches,
        COALESCE(ta.overdue_count, 0)::int AS overdue_tasks,
        COALESCE(ct.active_count, 0)::int AS active_contracts,
        GREATEST(i.last_interaction, te.last_entry, t.last_ticket) AS last_activity_at
      FROM customers c
      LEFT JOIN t ON t.customer_id = c.id
      LEFT JOIN ta ON ta.customer_id = c.id
      LEFT JOIN ct ON ct.customer_id = c.id
      LEFT JOIN i ON i.customer_id = c.id
      LEFT JOIN te ON te.customer_id = c.id
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND ($2::text IS NULL OR c.id = $2)
      ORDER BY c.name
    `, [organizationId, customerId]);

    const customers = result.rows.map((row) => {
      const health = computeMspHealth(row);
      return {
        id: row.id,
        name: row.name,
        score: health.score,
        trend: health.trend,
        factors: health.factors,
        openTickets: row.open_tickets,
        activeContracts: row.active_contracts,
        lastActivityAt: row.last_activity_at,
      };
    });

    const averageScore = customers.length > 0
      ? Math.round(customers.reduce((sum, c) => sum + c.score, 0) / customers.length)
      : null;

    res.json({ success: true, customers, averageScore });
  } catch (error) {
    logger.error('Health overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Geocoding-Eingabe: strukturierte Adresse („Straße, PLZ Ort") vor dem
// Legacy-Freitext-Blob — Nominatim matcht strukturiert deutlich besser
function composeGeocodeAddress(c: {
  addressStreet?: string | null; addressZip?: string | null;
  addressCity?: string | null; address?: string | null;
}): string | null {
  const zipCity = [c.addressZip, c.addressCity].filter(v => v && String(v).trim()).join(' ');
  const structured = [c.addressStreet, zipCity].filter(v => v && String(v).trim()).join(', ');
  if (structured.trim()) return structured;
  return c.address && c.address.trim() ? c.address : null;
}

// POST /api/customers - Create new customer (requires member role)
router.post('/', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, color, customerNumber, contactPerson, email, phone, website, address, addressStreet, addressZip, addressCity, reportTitle, hourlyRate, timeRoundingInterval, paymentTermsDays, ninjarmmOrganizationId, displayName, importAliases, customerType } = req.body;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO customers (id, user_id, organization_id, name, color, customer_number, contact_person, email, phone, website, address, address_street, address_zip, address_city, report_title, hourly_rate, time_rounding_interval, payment_terms_days, ninjarmm_organization_id, display_name, import_aliases, customer_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [id, userId, organizationId, name, color, customerNumber || null, contactPerson || null, email || null, phone || null, website || null, address || null, addressStreet || null, addressZip || null, addressCity || null, reportTitle || null, hourlyRate || null, timeRoundingInterval || 15, paymentTermsDays || 14, ninjarmmOrganizationId || null, displayName || null, importAliases || [], customerType || 'company', createdAt]
    );

    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id]);
    const newCustomer = transformRow(customerResult.rows[0]);

    // GPS-Kunden-Zuordnung (A6 Phase 2): Adresse geocodieren — best effort,
    // blockiert das Anlegen nie. Strukturierte Felder haben Vorrang vor dem
    // Legacy-Freitext (bessere Nominatim-Trefferquote).
    const geocodeInput = composeGeocodeAddress({ addressStreet, addressZip, addressCity, address });
    if (geocodeInput) {
      geocodeCustomer(id, geocodeInput).catch(err =>
        logger.error(`Geocoding beim Kunden-Anlegen fehlgeschlagen: ${err.message}`));
    }

    // Logo aus dem Favicon der Kunden-Domain holen (fire-and-forget)
    const logoDomain = extractLogoDomain({ website: website || null, email: email || null });
    if (logoDomain) {
      fetchCustomerLogo(id, logoDomain).catch(() => {});
    }

    auditLog.log({
      userId,
      action: 'customer.create',
      details: JSON.stringify({ name, organizationId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: newCustomer
    });
  } catch (error) {
    logger.error('Create customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customers/:id - Update customer (requires member role)
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push(`color = $${paramCount++}`);
      values.push(updates.color);
    }
    if (updates.customerNumber !== undefined) {
      fields.push(`customer_number = $${paramCount++}`);
      values.push(updates.customerNumber || null);
    }
    if (updates.contactPerson !== undefined) {
      fields.push(`contact_person = $${paramCount++}`);
      values.push(updates.contactPerson || null);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email || null);
    }
    const addressChanged = ['address', 'addressStreet', 'addressZip', 'addressCity']
      .some(f => updates[f] !== undefined);
    if (updates.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(updates.address || null);
    }
    if (updates.addressStreet !== undefined) {
      fields.push(`address_street = $${paramCount++}`);
      values.push(updates.addressStreet || null);
    }
    if (updates.addressZip !== undefined) {
      fields.push(`address_zip = $${paramCount++}`);
      values.push(updates.addressZip || null);
    }
    if (updates.addressCity !== undefined) {
      fields.push(`address_city = $${paramCount++}`);
      values.push(updates.addressCity || null);
    }
    if (addressChanged) {
      // Adressaenderung (Freitext ODER strukturiert): alte Koordinaten
      // verwerfen; neues Geocoding unten
      fields.push(`latitude = NULL`, `longitude = NULL`, `geocoded_at = NULL`);
    }
    if (updates.phone !== undefined) {
      fields.push(`phone = $${paramCount++}`);
      values.push(updates.phone || null);
    }
    if (updates.website !== undefined) {
      fields.push(`website = $${paramCount++}`);
      values.push(updates.website || null);
    }
    if (updates.reportTitle !== undefined) {
      fields.push(`report_title = $${paramCount++}`);
      values.push(updates.reportTitle || null);
    }
    if (updates.hourlyRate !== undefined) {
      fields.push(`hourly_rate = $${paramCount++}`);
      values.push(updates.hourlyRate);
    }
    if (updates.timeRoundingInterval !== undefined) {
      fields.push(`time_rounding_interval = $${paramCount++}`);
      values.push(updates.timeRoundingInterval || 15);
    }
    if (updates.paymentTermsDays !== undefined) {
      fields.push(`payment_terms_days = $${paramCount++}`);
      values.push(updates.paymentTermsDays || 14);
    }
    if (updates.ninjarmmOrganizationId !== undefined) {
      fields.push(`ninjarmm_organization_id = $${paramCount++}`);
      values.push(updates.ninjarmmOrganizationId || null);
    }
    if (updates.displayName !== undefined) {
      fields.push(`display_name = $${paramCount++}`);
      values.push(updates.displayName || null);
    }
    if (updates.importAliases !== undefined) {
      fields.push(`import_aliases = $${paramCount++}`);
      values.push(updates.importAliases || []);
    }
    if (updates.customerType !== undefined) {
      fields.push(`customer_type = $${paramCount++}`);
      values.push(updates.customerType || null);
    }
    // Vendor fields
    if (updates.isVendor !== undefined) {
      fields.push(`is_vendor = $${paramCount++}`);
      values.push(updates.isVendor);
    }
    if (updates.vendorDomain !== undefined) {
      fields.push(`vendor_domain = $${paramCount++}`);
      values.push(updates.vendorDomain || null);
    }
    if (updates.vendorNotes !== undefined) {
      fields.push(`vendor_notes = $${paramCount++}`);
      values.push(updates.vendorNotes || null);
    }
    if (updates.sevdeskPositionTemplate !== undefined) {
      fields.push(`sevdesk_position_template = $${paramCount++}`);
      values.push(updates.sevdeskPositionTemplate || null);
    }
    if (updates.defaultContractId !== undefined) {
      // Validate the contract belongs to this customer (organization-scoped already
      // by the customer FK chain). Empty string / null clears the link.
      if (updates.defaultContractId) {
        const contractCheck = await pool.query(
          'SELECT id FROM contracts WHERE id = $1 AND customer_id = $2',
          [updates.defaultContractId, id]
        );
        if (contractCheck.rows.length === 0) {
          return res.status(400).json({ error: 'defaultContractId belongs to a different customer or does not exist' });
        }
      }
      fields.push(`default_contract_id = $${paramCount++}`);
      values.push(updates.defaultContractId || null);
    }
    if (updates.defaultProjectId !== undefined) {
      fields.push(`default_project_id = $${paramCount++}`);
      values.push(updates.defaultProjectId || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE customers SET ${fields.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL`;
    await pool.query(query, values);

    const updatedResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND deleted_at IS NULL`, [id]);
    const updatedCustomer = transformRow(updatedResult.rows[0]);

    // Adressaenderung: neu geocodieren (fire-and-forget) — mit dem
    // Endstand nach dem Update, strukturierte Felder bevorzugt
    if (addressChanged) {
      const geocodeInput = composeGeocodeAddress(updatedCustomer as {
        addressStreet?: string | null; addressZip?: string | null;
        addressCity?: string | null; address?: string | null;
      });
      if (geocodeInput) {
        geocodeCustomer(id, geocodeInput).catch(err =>
          logger.error(`Geocoding beim Kunden-Update fehlgeschlagen: ${err.message}`));
      }
    }

    // Website geändert → Logo neu von der neuen Domain holen (force
    // überschreibt das alte — Domainwechsel heißt neues Logo). E-Mail-Änderung
    // füllt nur nach, wenn noch kein Logo existiert.
    if (updates.website !== undefined || updates.email !== undefined) {
      const uc = updatedCustomer as { website?: string | null; email?: string | null };
      const logoDomain = extractLogoDomain({ website: uc.website || null, email: uc.email || null });
      if (logoDomain) {
        fetchCustomerLogo(id, logoDomain, updates.website !== undefined).catch(() => {});
      }
    }

    auditLog.log({
      userId,
      action: 'customer.update',
      details: JSON.stringify(updates),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedCustomer
    });
  } catch (error) {
    logger.error('Update customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Kunden-Logo (CRM-Politur 13.11.): manueller Upload + Entfernen.
// Serverseitige Magic-Byte-Prüfung im logoService (nur Raster-Bilder,
// kein SVG) — das Multer-fileFilter-MIME ist nur die erste Hürde.
// ============================================
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'].includes(file.mimetype);
    cb(null, ok);
  },
});

// POST /api/customers/:id/logo - Logo hochladen (requires admin role)
router.post('/:id/logo', authenticateToken, attachOrganization, requireOrgRole('admin'), logoUpload.single('logo'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const customerResult = await pool.query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Bitte ein Bild (PNG, JPG, GIF, WebP oder ICO, max. 1 MB) hochladen' });
    }

    const logoUrl = await saveUploadedLogo(id, req.file.buffer);
    if (!logoUrl) {
      return res.status(400).json({ error: 'Datei ist kein gültiges Bildformat (PNG, JPG, GIF, WebP, ICO)' });
    }

    auditLog.log({
      userId: req.userId!,
      action: 'customer.update',
      details: JSON.stringify({ id, logoUploaded: true }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, data: { logoUrl } });
  } catch (error) {
    logger.error('Upload customer logo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:id/logo - Logo entfernen (requires admin role)
router.delete('/:id/logo', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const customerResult = await pool.query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await removeLogo(id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Remove customer logo error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:id - Delete customer (requires admin role)
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has projects
    const countResult = await pool.query('SELECT COUNT(*) as count FROM projects WHERE customer_id = $1', [id]);
    const projectCount = countResult.rows[0];
    if (projectCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with existing projects. Please delete projects first.' });
    }

    await pool.query('UPDATE customers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);

    auditLog.log({
      userId,
      action: 'customer.delete',
      details: JSON.stringify({ id }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    logger.error('Delete customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// CUSTOMER CONTACTS MANAGEMENT
// ========================================================================

// Validation schemas for contacts
const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  isPrimary: z.boolean().optional().default(false),
  canCreateTickets: z.boolean().optional().default(true),
  canViewAllTickets: z.boolean().optional().default(false),
  canViewDevices: z.boolean().optional().default(false),
  canViewInvoices: z.boolean().optional().default(false),
  canViewQuotes: z.boolean().optional().default(false),
  canViewTimeReport: z.boolean().optional().default(false),
  canViewContract: z.boolean().optional().default(false),
  canViewLicenses: z.boolean().optional().default(false),
  notifyTicketCreated: z.boolean().optional().default(true),
  notifyTicketStatusChanged: z.boolean().optional().default(true),
  notifyTicketReply: z.boolean().optional().default(true),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  isPrimary: z.boolean().optional(),
  canCreateTickets: z.boolean().optional(),
  canViewAllTickets: z.boolean().optional(),
  canViewDevices: z.boolean().optional(),
  canViewInvoices: z.boolean().optional(),
  canViewQuotes: z.boolean().optional(),
  canViewTimeReport: z.boolean().optional(),
  canViewContract: z.boolean().optional(),
  canViewLicenses: z.boolean().optional(),
  notifyTicketCreated: z.boolean().optional(),
  notifyTicketStatusChanged: z.boolean().optional(),
  notifyTicketReply: z.boolean().optional(),
});

// GET /api/customers/:customerId/contacts - Get all contacts for a customer
router.get('/:customerId/contacts', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Use customer_portal_users table for portal contacts
    const result = await pool.query(
      `SELECT id, customer_id, name, email, is_primary_contact as is_primary,
              can_create_tickets, can_view_all_tickets,
              can_view_devices, can_view_invoices, can_view_quotes,
              COALESCE(can_view_time_report, false) as can_view_time_report,
              COALESCE(can_view_contract, false) as can_view_contract,
              COALESCE(can_view_licenses, false) as can_view_licenses,
              notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
              last_login, created_at, password_hash IS NOT NULL AND password_hash != '' as is_activated
       FROM customer_portal_users
       WHERE customer_id = $1 AND organization_id = $2
       ORDER BY is_primary_contact DESC, name`,
      [customerId, organizationId]
    );

    const contacts = result.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      email: row.email,
      isPrimary: row.is_primary,
      canCreateTickets: row.can_create_tickets ?? true,
      canViewAllTickets: row.can_view_all_tickets ?? false,
      canViewDevices: row.can_view_devices ?? false,
      canViewInvoices: row.can_view_invoices ?? false,
      canViewQuotes: row.can_view_quotes ?? false,
      canViewTimeReport: row.can_view_time_report ?? false,
      canViewContract: row.can_view_contract ?? false,
      canViewLicenses: row.can_view_licenses ?? false,
      notifyTicketCreated: row.notify_ticket_created ?? true,
      notifyTicketStatusChanged: row.notify_ticket_status_changed ?? true,
      notifyTicketReply: row.notify_ticket_reply ?? true,
      isActivated: row.is_activated,
      lastLogin: row.last_login,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    logger.error('Get contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRM-5 „Eine Kontakt-Wahrheit": Jeder Portal-User bekommt automatisch
// seinen customer_contacts-Eintrag (bzw. wird mit einem bestehenden per
// E-Mail verknüpft) — vorher waren in den Settings angelegte Kontakte im
// CRM unsichtbar, weil beide UIs auf getrennte Tabellen zeigten.
async function syncContactForPortalUser(params: {
  portalUserId: string;
  customerId: string;
  organizationId: string;
  name: string;
  email: string;
  isPrimary: boolean;
}): Promise<void> {
  const { portalUserId, customerId, organizationId, name, email, isPrimary } = params;
  try {
    // Bestehenden Kontakt (gleiche Mail, gleicher Kunde) verknüpfen
    const linked = await pool.query(
      `UPDATE customer_contacts
       SET portal_user_id = $1, updated_at = NOW()
       WHERE customer_id = $2 AND portal_user_id IS NULL
         AND email IS NOT NULL AND LOWER(email) = LOWER($3)
         AND NOT EXISTS (SELECT 1 FROM customer_contacts WHERE portal_user_id = $1)
       RETURNING id`,
      [portalUserId, customerId, email]
    );
    if ((linked.rowCount || 0) > 0) return;

    // Sonst neuen Kontakt anlegen (letztes Wort = Nachname, NOT NULL)
    const trimmed = (name || '').trim();
    const lastSpace = trimmed.lastIndexOf(' ');
    const firstName = lastSpace > 0 ? trimmed.slice(0, lastSpace).trim() : null;
    const lastName = (lastSpace > 0 ? trimmed.slice(lastSpace + 1) : trimmed) || email || 'Kontakt';

    await pool.query(
      `INSERT INTO customer_contacts (
         id, organization_id, customer_id, first_name, last_name, email,
         is_primary, portal_user_id, created_at, updated_at
       )
       SELECT gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM customer_contacts WHERE portal_user_id = $7)`,
      [organizationId, customerId, firstName, lastName, email, isPrimary, portalUserId]
    );
  } catch (error) {
    // Best effort: ein fehlgeschlagener Kontakt-Sync darf das Anlegen des
    // Portal-Zugangs nicht scheitern lassen
    logger.error('Kontakt-Sync für Portal-User fehlgeschlagen:', error);
  }
}

// POST /api/customers/:customerId/contacts - Create new portal contact (requires member role)
router.post('/:customerId/contacts', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createContactSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;
    const {
      name, email, isPrimary, canCreateTickets, canViewAllTickets,
      canViewDevices, canViewInvoices, canViewQuotes,
      canViewTimeReport, canViewContract, canViewLicenses,
      notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply
    } = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if email already exists for this customer in portal users
    const existingContact = await pool.query(
      'SELECT id FROM customer_portal_users WHERE customer_id = $1 AND LOWER(email) = LOWER($2)',
      [customerId, email]
    );
    if (existingContact.rows.length > 0) {
      return res.status(400).json({ error: 'A contact with this email already exists for this customer' });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      await pool.query('UPDATE customer_portal_users SET is_primary_contact = FALSE WHERE customer_id = $1', [customerId]);
    }

    const id = crypto.randomUUID();
    // Create portal user with empty password_hash (will be set when activated)
    await pool.query(
      `INSERT INTO customer_portal_users (
        id, owner_user_id, organization_id, customer_id, name, email, password_hash,
        is_primary_contact, is_active, can_create_tickets, can_view_all_tickets,
        can_view_devices, can_view_invoices, can_view_quotes,
        can_view_time_report, can_view_contract, can_view_licenses,
        notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, '', $7, true, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())`,
      [id, userId, organizationId, customerId, name, email, isPrimary ?? false,
       canCreateTickets ?? true, canViewAllTickets ?? false,
       canViewDevices ?? false, canViewInvoices ?? false, canViewQuotes ?? false,
       canViewTimeReport ?? false, canViewContract ?? false, canViewLicenses ?? false,
       notifyTicketCreated ?? true, notifyTicketStatusChanged ?? true, notifyTicketReply ?? true]
    );

    // CRM-Kontakt anlegen/verknüpfen, damit der neue Portal-Zugang auch im
    // CustomerHub-Kontakte-Tab erscheint
    await syncContactForPortalUser({
      portalUserId: id, customerId, organizationId,
      name, email, isPrimary: isPrimary ?? false,
    });

    auditLog.log({
      userId,
      action: 'customer_contact.create',
      details: JSON.stringify({ customerId, name, email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: {
        id,
        customerId,
        name,
        email,
        isPrimary: isPrimary ?? false,
        canCreateTickets: canCreateTickets ?? true,
        canViewAllTickets: canViewAllTickets ?? false,
        canViewDevices: canViewDevices ?? false,
        canViewInvoices: canViewInvoices ?? false,
        canViewQuotes: canViewQuotes ?? false,
        canViewTimeReport: canViewTimeReport ?? false,
        canViewContract: canViewContract ?? false,
        canViewLicenses: canViewLicenses ?? false,
        notifyTicketCreated: notifyTicketCreated ?? true,
        notifyTicketStatusChanged: notifyTicketStatusChanged ?? true,
        notifyTicketReply: notifyTicketReply ?? true,
        isActivated: false,
        lastLogin: null,
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    logger.error('Create contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customers/:customerId/contacts/:contactId - Update portal contact (requires member role)
router.put('/:customerId/contacts/:contactId', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateContactSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;
    const updates = req.body;

    // Portal-Berechtigungen entscheiden, welche Finanz-/Gerätedaten ein KUNDE
    // sieht — das darf nur Org-Admin/Owner setzen (Architektur-Entscheidung
    // „customer_visibility nur Admin/Manager"); Member dürfen weiterhin
    // Stammdaten (Name/E-Mail/Benachrichtigungen) pflegen.
    const orgRole = orgReq.organization.role;
    const portalPermissionFields = [
      'canCreateTickets', 'canViewAllTickets', 'canViewDevices', 'canViewInvoices',
      'canViewQuotes', 'canViewLicenses', 'canViewTimeReport', 'canViewContract',
    ];
    if (orgRole !== 'admin' && orgRole !== 'owner' &&
        portalPermissionFields.some(f => updates[f] !== undefined)) {
      return res.status(403).json({ error: 'Portal-Berechtigungen kann nur ein Admin ändern' });
    }

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify portal user exists
    const contactResult = await pool.query(`SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3`, [contactId, customerId, organizationId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as primary, unset other primary contacts
    if (updates.isPrimary) {
      await pool.query('UPDATE customer_portal_users SET is_primary_contact = FALSE WHERE customer_id = $1 AND id != $2', [customerId, contactId]);
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      // Check if email already exists
      const existingContact = await pool.query(
        'SELECT id FROM customer_portal_users WHERE customer_id = $1 AND LOWER(email) = LOWER($2) AND id != $3',
        [customerId, updates.email, contactId]
      );
      if (existingContact.rows.length > 0) {
        return res.status(400).json({ error: 'A contact with this email already exists' });
      }
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }
    if (updates.isPrimary !== undefined) {
      fields.push(`is_primary_contact = $${paramCount++}`);
      values.push(updates.isPrimary);
    }
    if (updates.canCreateTickets !== undefined) {
      fields.push(`can_create_tickets = $${paramCount++}`);
      values.push(updates.canCreateTickets);
    }
    if (updates.canViewAllTickets !== undefined) {
      fields.push(`can_view_all_tickets = $${paramCount++}`);
      values.push(updates.canViewAllTickets);
    }
    if (updates.canViewDevices !== undefined) {
      fields.push(`can_view_devices = $${paramCount++}`);
      values.push(updates.canViewDevices);
    }
    if (updates.canViewInvoices !== undefined) {
      fields.push(`can_view_invoices = $${paramCount++}`);
      values.push(updates.canViewInvoices);
    }
    if (updates.canViewQuotes !== undefined) {
      fields.push(`can_view_quotes = $${paramCount++}`);
      values.push(updates.canViewQuotes);
    }
    if (updates.canViewTimeReport !== undefined) {
      fields.push(`can_view_time_report = $${paramCount++}`);
      values.push(updates.canViewTimeReport);
    }
    if (updates.canViewContract !== undefined) {
      fields.push(`can_view_contract = $${paramCount++}`);
      values.push(updates.canViewContract);
    }
    if (updates.canViewLicenses !== undefined) {
      fields.push(`can_view_licenses = $${paramCount++}`);
      values.push(updates.canViewLicenses);
    }
    if (updates.notifyTicketCreated !== undefined) {
      fields.push(`notify_ticket_created = $${paramCount++}`);
      values.push(updates.notifyTicketCreated);
    }
    if (updates.notifyTicketStatusChanged !== undefined) {
      fields.push(`notify_ticket_status_changed = $${paramCount++}`);
      values.push(updates.notifyTicketStatusChanged);
    }
    if (updates.notifyTicketReply !== undefined) {
      fields.push(`notify_ticket_reply = $${paramCount++}`);
      values.push(updates.notifyTicketReply);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(contactId);
    const query = `UPDATE customer_portal_users SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    // Stammdaten-Änderungen auf den verknüpften CRM-Kontakt spiegeln
    // (eine Kontakt-Wahrheit; fehlt die Verknüpfung noch, wird sie angelegt)
    if (updates.name !== undefined || updates.email !== undefined || updates.isPrimary !== undefined) {
      const current = contactResult.rows[0];
      const effectiveName: string = updates.name ?? current.name ?? '';
      const effectiveEmail: string = updates.email ?? current.email;
      await syncContactForPortalUser({
        portalUserId: contactId, customerId, organizationId,
        name: effectiveName, email: effectiveEmail,
        isPrimary: updates.isPrimary ?? current.is_primary_contact ?? false,
      });
      const trimmed = effectiveName.trim();
      const lastSpace = trimmed.lastIndexOf(' ');
      await pool.query(
        `UPDATE customer_contacts SET
           first_name = $2,
           last_name = $3,
           email = COALESCE($4, email),
           is_primary = $5,
           updated_at = NOW()
         WHERE portal_user_id = $1`,
        [
          contactId,
          lastSpace > 0 ? trimmed.slice(0, lastSpace).trim() : null,
          (lastSpace > 0 ? trimmed.slice(lastSpace + 1) : trimmed) || effectiveEmail || 'Kontakt',
          effectiveEmail ?? null,
          updates.isPrimary ?? current.is_primary_contact ?? false,
        ]
      );
    }

    const updatedResult = await pool.query(
      `SELECT id, customer_id, name, email, is_primary_contact as is_primary,
              can_create_tickets, can_view_all_tickets,
              can_view_devices, can_view_invoices, can_view_quotes,
              COALESCE(can_view_time_report, false) as can_view_time_report,
              COALESCE(can_view_contract, false) as can_view_contract,
              COALESCE(can_view_licenses, false) as can_view_licenses,
              notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
              last_login, created_at, password_hash IS NOT NULL AND password_hash != '' as is_activated
       FROM customer_portal_users WHERE id = $1`,
      [contactId]
    );
    const updated = updatedResult.rows[0];

    res.json({
      success: true,
      data: {
        id: updated.id,
        customerId: updated.customer_id,
        name: updated.name,
        email: updated.email,
        isPrimary: updated.is_primary,
        canCreateTickets: updated.can_create_tickets ?? true,
        canViewAllTickets: updated.can_view_all_tickets ?? false,
        canViewDevices: updated.can_view_devices ?? false,
        canViewInvoices: updated.can_view_invoices ?? false,
        canViewQuotes: updated.can_view_quotes ?? false,
        canViewTimeReport: updated.can_view_time_report ?? false,
        canViewContract: updated.can_view_contract ?? false,
        canViewLicenses: updated.can_view_licenses ?? false,
        notifyTicketCreated: updated.notify_ticket_created ?? true,
        notifyTicketStatusChanged: updated.notify_ticket_status_changed ?? true,
        notifyTicketReply: updated.notify_ticket_reply ?? true,
        isActivated: updated.is_activated,
        lastLogin: updated.last_login,
        createdAt: updated.created_at,
      }
    });
  } catch (error) {
    logger.error('Update contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:customerId/contacts/:contactId - Delete portal contact (requires admin role)
router.delete('/:customerId/contacts/:contactId', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify portal user exists
    const contactResult = await pool.query(`SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3`, [contactId, customerId, organizationId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.query('DELETE FROM customer_portal_users WHERE id = $1', [contactId]);

    auditLog.log({
      userId,
      action: 'customer_contact.delete',
      details: JSON.stringify({ customerId, contactId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    logger.error('Delete contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/contacts/:contactId/send-invite - Send activation invite (requires member role)
router.post('/:customerId/contacts/:contactId/send-invite', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get portal user
    const contactResult = await pool.query(
      `SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3`,
      [contactId, customerId, organizationId]
    );
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Generate activation token (UUID stored in DB, consistent with /invitation/activate flow)
    const activationToken = crypto.randomUUID();
    const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store token in database (nur SHA-256-Hash — Klartext geht in den Mail-Link)
    await pool.query(
      `UPDATE customer_portal_users
       SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [hashToken(activationToken), tokenExpires, contact.id]
    );

    // Get user info for email
    const userResult = await pool.query('SELECT username, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Send activation email (PORTAL_URL = dedizierter Portal-Host, z.B. portal.ramboeck.it)
    const portalUrl = process.env.PORTAL_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationUrl = `${portalUrl}/portal/activate?token=${activationToken}`;

    await emailService.sendEmail({
      to: contact.email,
      subject: `Kundenportal-Einladung von ${user.username}`,
      html: `
        <h2>Willkommen im Kundenportal!</h2>
        <p>Hallo ${contact.name},</p>
        <p>${user.username} hat Sie zum Kundenportal eingeladen. Dort können Sie:</p>
        <ul>
          <li>Support-Tickets erstellen und verfolgen</li>
          <li>Den Status Ihrer Anfragen einsehen</li>
          <li>Mit dem Support-Team kommunizieren</li>
        </ul>
        <p>Um Ihr Konto zu aktivieren, klicken Sie bitte auf folgenden Link:</p>
        <p><a href="${activationUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Konto aktivieren</a></p>
        <p>Dieser Link ist 7 Tage gültig.</p>
        <p>Mit freundlichen Grüßen,<br>${user.username}</p>
      `,
      text: `Hallo ${contact.name}, ${user.username} hat Sie zum Kundenportal eingeladen. Aktivieren Sie Ihr Konto: ${activationUrl}`,
    });

    auditLog.log({
      userId,
      action: 'customer_contact.send_invite',
      details: JSON.stringify({ customerId, contactId, email: contact.email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    logger.error('Send invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/contacts/:contactId/set-password - Set password directly (requires admin role)
router.post('/:customerId/contacts/:contactId/set-password', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify customer belongs to organization
    const customerResult = await pool.query(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get portal user
    const contactResult = await pool.query(
      `SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3`,
      [contactId, customerId, organizationId]
    );
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Hash password and update
    const passwordHash = await bcrypt.hash(password, 10);
    logger.info(`🔑 Setting password for portal user "${contact.email}" (id: ${contactId}), hash length: ${passwordHash.length}`);

    const updateResult = await pool.query(
      'UPDATE customer_portal_users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, password_hash IS NOT NULL AND password_hash != \'\' as has_password',
      [passwordHash, contactId]
    );

    // Also update the linked customer_contacts entry (login checks this table)
    await pool.query(
      `UPDATE customer_contacts SET password_hash = $1, updated_at = NOW()
       WHERE portal_user_id = $2`,
      [passwordHash, contactId]
    );

    logger.info(`🔑 Password set result:`, updateResult.rows[0]);

    auditLog.log({
      userId,
      action: 'customer_contact.set_password',
      details: JSON.stringify({ customerId, contactId, email: contact.email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password set successfully'
    });
  } catch (error) {
    logger.error('Set password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// VENDOR/SUPPLIER HUB ENDPOINTS
// ========================================================================

// GET /api/customers/vendors - Get all vendors (customers with is_vendor = true)
router.get('/vendors/list', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM processed_invoices pi WHERE pi.vendor_id = c.id) as invoice_count
       FROM customers c
       WHERE c.organization_id = $1 AND c.deleted_at IS NULL AND c.is_vendor = true
       ORDER BY c.name`,
      [organizationId]
    );

    const vendors = transformRows(result.rows);

    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    logger.error('Get vendors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/:id/hub - Get vendor hub data (emails, invoices, summary)
router.get('/:id/hub', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = transformRow(customerResult.rows[0]);

    // Get processed invoices for this vendor
    const invoicesResult = await pool.query(
      `SELECT id, email_id, email_subject, sender_email, sender_name, received_at,
              attachment_count, status, error_message, processed_at
       FROM processed_invoices
       WHERE organization_id = $1 AND vendor_id = $2
       ORDER BY received_at DESC
       LIMIT 50`,
      [organizationId, id]
    );

    // Also get invoices matched by email domain if vendor_domain is set
    let domainInvoices: any[] = [];
    if (customer.vendorDomain) {
      const domainResult = await pool.query(
        `SELECT id, email_id, email_subject, sender_email, sender_name, received_at,
                attachment_count, status, error_message, processed_at
         FROM processed_invoices
         WHERE organization_id = $1
         AND vendor_id IS NULL
         AND LOWER(sender_email) LIKE $2
         ORDER BY received_at DESC
         LIMIT 50`,
        [organizationId, `%@${customer.vendorDomain.toLowerCase()}`]
      );
      domainInvoices = domainResult.rows;
    }

    // Combine and deduplicate
    const allInvoiceIds = new Set<string>();
    const invoices = [...invoicesResult.rows, ...domainInvoices].filter(inv => {
      if (allInvoiceIds.has(inv.id)) return false;
      allInvoiceIds.add(inv.id);
      return true;
    }).map(row => ({
      id: row.id,
      emailId: row.email_id,
      emailSubject: row.email_subject,
      senderEmail: row.sender_email,
      senderName: row.sender_name,
      receivedAt: row.received_at,
      attachmentCount: row.attachment_count,
      status: row.status,
      errorMessage: row.error_message,
      processedAt: row.processed_at,
    }));

    // Get invoice documents
    const invoiceIds = invoices.map(i => i.id);
    let documents: any[] = [];
    if (invoiceIds.length > 0) {
      const docsResult = await pool.query(
        `SELECT id, processed_invoice_id, filename, original_filename, mime_type, size, created_at
         FROM invoice_documents WHERE processed_invoice_id = ANY($1)`,
        [invoiceIds]
      );
      documents = docsResult.rows.map(row => ({
        id: row.id,
        processedInvoiceId: row.processed_invoice_id,
        filename: row.filename,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        size: row.size,
        createdAt: row.created_at,
      }));
    }

    // Summary statistics
    const stats = {
      totalInvoices: invoices.length,
      draftInvoices: invoices.filter(i => i.status === 'draft').length,
      processedInvoices: invoices.filter(i => i.status === 'processed').length,
      failedInvoices: invoices.filter(i => i.status === 'failed').length,
      totalDocuments: documents.length,
    };

    res.json({
      success: true,
      data: {
        customer,
        invoices,
        documents,
        stats,
        // Emails will be fetched client-side via Microsoft 365 API
      }
    });
  } catch (error) {
    logger.error('Get vendor hub error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/:id/emails - Get all emails from vendor (from support + invoice mailbox)
router.get('/:id/emails', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const maxResults = parseInt(req.query.maxResults as string) || 50;

    // Verify customer belongs to organization and get vendor domain
    const customerResult = await pool.query(
      `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = transformRow(customerResult.rows[0]);
    const vendorDomain = customer.vendorDomain || customer.email?.split('@')[1];

    if (!vendorDomain) {
      return res.json({
        success: true,
        data: {
          emails: [],
          message: 'Keine Domain konfiguriert. Bitte Vendor-Domain oder E-Mail setzen.'
        }
      });
    }

    // Fetch emails from both mailboxes
    const allEmails: any[] = [];

    // Support mailbox
    try {
      const supportResult = await mailboxMonitorService.getUnreadEmails(organizationId, {
        maxResults,
        mailboxType: 'support',
      });
      if (supportResult.success && supportResult.emails) {
        // Filter by vendor domain
        const filtered = supportResult.emails.filter(email =>
          email.from.email.toLowerCase().endsWith(`@${vendorDomain.toLowerCase()}`)
        );
        allEmails.push(...filtered.map(e => ({ ...e, mailboxType: 'support' })));
      }
    } catch (err) {
      logger.info('Support mailbox not configured or error:', err);
    }

    // Invoice mailbox
    try {
      const invoiceResult = await mailboxMonitorService.getUnreadEmails(organizationId, {
        maxResults,
        mailboxType: 'invoice',
      });
      if (invoiceResult.success && invoiceResult.emails) {
        // Filter by vendor domain
        const filtered = invoiceResult.emails.filter(email =>
          email.from.email.toLowerCase().endsWith(`@${vendorDomain.toLowerCase()}`)
        );
        allEmails.push(...filtered.map(e => ({ ...e, mailboxType: 'invoice' })));
      }
    } catch (err) {
      logger.info('Invoice mailbox not configured or error:', err);
    }

    // Sort by date descending
    allEmails.sort((a, b) =>
      new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
    );

    res.json({
      success: true,
      data: {
        emails: allEmails.slice(0, maxResults),
        vendorDomain,
        totalFound: allEmails.length,
      }
    });
  } catch (error) {
    logger.error('Get vendor emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Customer Email Domains Management
// ============================================

// Validation schema for email domain
const emailDomainSchema = z.object({
  domain: z.string().min(3).max(100).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Ungültiges Domain-Format'),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(500).optional()
});

// GET /api/customers/:customerId/email-domains - List all email domains for a customer
router.get('/:customerId/email-domains', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [customerId, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    const domainsResult = await pool.query(`
      SELECT ced.*, u.username as created_by_name
      FROM customer_email_domains ced
      LEFT JOIN users u ON ced.created_by = u.id
      WHERE ced.customer_id = $1 AND ced.organization_id = $2
      ORDER BY ced.is_primary DESC, ced.domain ASC
    `, [customerId, organizationId]);

    res.json({
      success: true,
      data: transformRows(domainsResult.rows)
    });
  } catch (error) {
    logger.error('Get email domains error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/email-domains - Add email domain to customer
router.post('/:customerId/email-domains', authenticateToken, attachOrganization, validate(emailDomainSchema), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;
    const { domain, isPrimary, notes } = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [customerId, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    // Check if domain already exists for any customer in this organization
    const existingDomain = await pool.query(
      'SELECT ced.*, c.name as customer_name FROM customer_email_domains ced JOIN customers c ON ced.customer_id = c.id WHERE ced.organization_id = $1 AND LOWER(ced.domain) = LOWER($2)',
      [organizationId, domain]
    );
    if (existingDomain.rows.length > 0) {
      const existing = existingDomain.rows[0];
      return res.status(409).json({
        error: `Domain "${domain}" ist bereits dem Kunden "${existing.customer_name}" zugeordnet`
      });
    }

    const domainId = crypto.randomUUID();

    // If this is set as primary, unset other primary domains for this customer
    if (isPrimary) {
      await pool.query(
        'UPDATE customer_email_domains SET is_primary = false WHERE customer_id = $1',
        [customerId]
      );
    }

    await pool.query(`
      INSERT INTO customer_email_domains (id, customer_id, organization_id, domain, is_primary, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [domainId, customerId, organizationId, domain.toLowerCase(), isPrimary || false, notes || null, authReq.user!.id]);

    auditLog.log({
      action: 'customer_domain.add',
      userId: authReq.user!.id,
      details: JSON.stringify({ domain, isPrimary, customerId, organizationId }),
    });

    res.status(201).json({
      success: true,
      data: {
        id: domainId,
        customerId,
        domain: domain.toLowerCase(),
        isPrimary: isPrimary || false,
        notes
      }
    });
  } catch (error) {
    logger.error('Add email domain error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:customerId/email-domains/:domainId - Remove email domain
router.delete('/:customerId/email-domains/:domainId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, domainId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [customerId, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    // Get domain info before deleting
    const domainResult = await pool.query(
      'SELECT domain FROM customer_email_domains WHERE id = $1 AND customer_id = $2',
      [domainId, customerId]
    );
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain nicht gefunden' });
    }

    const deletedDomain = domainResult.rows[0].domain;

    await pool.query(
      'DELETE FROM customer_email_domains WHERE id = $1 AND customer_id = $2',
      [domainId, customerId]
    );

    auditLog.log({
      action: 'customer_domain.remove',
      userId: authReq.user!.id,
      details: JSON.stringify({ domain: deletedDomain, customerId, organizationId }),
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete email domain error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/email-domains/lookup - Find customer by email domain
router.get('/email-domains/lookup', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const email = req.query.email as string;

    if (!email) {
      return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
    }

    // Extract domain from email
    const domainMatch = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (!domainMatch) {
      return res.status(400).json({ error: 'Ungültiges E-Mail-Format' });
    }
    const domain = domainMatch[1].toLowerCase();

    // Look up in customer_email_domains
    const result = await pool.query(`
      SELECT c.id, c.name, c.customer_number, ced.domain, ced.is_primary
      FROM customers c
      JOIN customer_email_domains ced ON c.id = ced.customer_id
      WHERE ced.organization_id = $1 AND LOWER(ced.domain) = $2 AND c.deleted_at IS NULL
      LIMIT 1
    `, [organizationId, domain]);

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        found: true,
        matchType: 'domain_mapping',
        data: transformRow(result.rows[0])
      });
    }

    // Fallback to vendor_domain
    const vendorResult = await pool.query(`
      SELECT id, name, customer_number, vendor_domain as domain
      FROM customers
      WHERE organization_id = $1 AND deleted_at IS NULL AND LOWER(vendor_domain) = $2
      LIMIT 1
    `, [organizationId, domain]);

    if (vendorResult.rows.length > 0) {
      return res.json({
        success: true,
        found: true,
        matchType: 'vendor_domain',
        data: transformRow(vendorResult.rows[0])
      });
    }

    res.json({
      success: true,
      found: false,
      searchedDomain: domain,
      message: 'Kein Kunde für diese Domain gefunden'
    });
  } catch (error) {
    logger.error('Domain lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/email-domains/all - List all domain mappings (admin view)
router.get('/email-domains/all', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(`
      SELECT ced.*, c.name as customer_name, c.customer_number, u.username as created_by_name
      FROM customer_email_domains ced
      JOIN customers c ON ced.customer_id = c.id
      LEFT JOIN users u ON ced.created_by = u.id
      WHERE ced.organization_id = $1
      ORDER BY c.name ASC, ced.domain ASC
    `, [organizationId]);

    res.json({
      success: true,
      data: transformRows(result.rows)
    });
  } catch (error) {
    logger.error('Get all domains error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/migrate-contacts - Auto-create contacts and domain mappings
router.post('/migrate-contacts', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const stats = {
      contactsFromEmail: 0,
      contactsFromTickets: 0,
      domainsFromWebsite: 0,
      domainsFromEmail: 0,
      skippedExisting: 0,
      errors: [] as string[]
    };

    // 1. Create contacts from customer email addresses
    const customersWithEmail = await pool.query(`
      SELECT c.id, c.name, c.email, c.contact_person
      FROM customers c
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND c.email IS NOT NULL
        AND c.email != ''
        AND NOT EXISTS (
          SELECT 1 FROM customer_contacts cc
          WHERE cc.customer_id = c.id AND LOWER(cc.email) = LOWER(c.email)
        )
    `, [organizationId]);

    for (const customer of customersWithEmail.rows) {
      try {
        const contactId = crypto.randomUUID();
        const contactName = customer.contact_person || customer.name;

        // Split contact name into first and last name
        const nameParts = contactName.trim().split(/\s+/);
        const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : contactName;

        await pool.query(`
          INSERT INTO customer_contacts (
            id, organization_id, customer_id, first_name, last_name, email, is_primary, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
        `, [contactId, organizationId, customer.id, firstName, lastName, customer.email]);

        stats.contactsFromEmail++;
      } catch (err: any) {
        if (err.code !== '23505') { // Not a duplicate key error
          stats.errors.push(`Contact for ${customer.name}: ${err.message}`);
        } else {
          stats.skippedExisting++;
        }
      }
    }

    // 2. Extract domains from primary_domain / customer email.
    // ⚠️ customers hat KEINE website-Spalte (Schema-Sweep) — die alte Query
    // crashte hier und brach die Migration ab. Domain-Quellen sind
    // primary_domain (falls gepflegt) bzw. die Domain der Kunden-E-Mail.
    const customersWithWebsite = await pool.query(`
      SELECT c.id, c.name, c.primary_domain, c.email
      FROM customers c
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND (
          (c.primary_domain IS NOT NULL AND c.primary_domain != '')
          OR (c.email IS NOT NULL AND c.email LIKE '%@%')
        )
    `, [organizationId]);

    for (const customer of customersWithWebsite.rows) {
      try {
        const rawSource: string = customer.primary_domain && customer.primary_domain.trim() !== ''
          ? customer.primary_domain
          : (customer.email?.split('@')[1] ?? '');
        let domain = rawSource
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .split('/')[0]
          .toLowerCase();

        if (domain && domain.includes('.')) {
          // Check if domain already exists
          const existing = await pool.query(`
            SELECT 1 FROM customer_email_domains
            WHERE organization_id = $1 AND LOWER(domain) = $2
          `, [organizationId, domain]);

          if (existing.rows.length === 0) {
            const domainId = crypto.randomUUID();
            await pool.query(`
              INSERT INTO customer_email_domains (
                id, customer_id, organization_id, domain, is_primary, created_at, created_by
              ) VALUES ($1, $2, $3, $4, true, NOW(), $5)
            `, [domainId, customer.id, organizationId, domain, userId]);

            stats.domainsFromWebsite++;
          } else {
            stats.skippedExisting++;
          }
        }
      } catch (err: any) {
        if (err.code !== '23505') {
          stats.errors.push(`Domain for ${customer.name}: ${err.message}`);
        } else {
          stats.skippedExisting++;
        }
      }
    }

    // 3. Extract domains from customer email addresses
    const customersWithEmailNoDomain = await pool.query(`
      SELECT c.id, c.name, c.email
      FROM customers c
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND c.email IS NOT NULL
        AND c.email != ''
        AND c.email LIKE '%@%'
    `, [organizationId]);

    for (const customer of customersWithEmailNoDomain.rows) {
      try {
        const domainMatch = customer.email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
        if (domainMatch) {
          const domain = domainMatch[1].toLowerCase();

          // Skip common free email providers
          const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'gmx.de', 'gmx.at', 'web.de', 'aon.at', 't-online.de', 'icloud.com', 'me.com'];
          if (freeProviders.includes(domain)) {
            continue;
          }

          // Check if domain already exists
          const existing = await pool.query(`
            SELECT 1 FROM customer_email_domains
            WHERE organization_id = $1 AND LOWER(domain) = $2
          `, [organizationId, domain]);

          if (existing.rows.length === 0) {
            const domainId = crypto.randomUUID();
            await pool.query(`
              INSERT INTO customer_email_domains (
                id, customer_id, organization_id, domain, is_primary, notes, created_at, created_by
              ) VALUES ($1, $2, $3, $4, false, 'Auto-extracted from customer email', NOW(), $5)
            `, [domainId, customer.id, organizationId, domain, userId]);

            stats.domainsFromEmail++;
          } else {
            stats.skippedExisting++;
          }
        }
      } catch (err: any) {
        if (err.code !== '23505') {
          stats.errors.push(`Email domain for ${customer.name}: ${err.message}`);
        } else {
          stats.skippedExisting++;
        }
      }
    }

    // 4. Create contacts from ticket emails (if tickets exist)
    try {
      const ticketEmails = await pool.query(`
        SELECT DISTINCT te.from_email, te.from_name, t.customer_id, c.name as customer_name
        FROM ticket_emails te
        JOIN tickets t ON te.ticket_id = t.id
        JOIN customers c ON t.customer_id = c.id
        WHERE t.organization_id = $1
          AND te.from_email IS NOT NULL
          AND te.from_email != ''
          AND te.direction = 'inbound'
          AND NOT EXISTS (
            SELECT 1 FROM customer_contacts cc
            WHERE cc.customer_id = t.customer_id AND LOWER(cc.email) = LOWER(te.from_email)
          )
      `, [organizationId]);

      for (const email of ticketEmails.rows) {
        try {
          const contactId = crypto.randomUUID();
          const contactName = email.from_name || email.from_email.split('@')[0];

          // Split contact name into first and last name
          const nameParts = contactName.trim().split(/\s+/);
          const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : contactName;

          await pool.query(`
            INSERT INTO customer_contacts (
              id, organization_id, customer_id, first_name, last_name, email, is_primary, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
          `, [contactId, organizationId, email.customer_id, firstName, lastName, email.from_email]);

          stats.contactsFromTickets++;
        } catch (err: any) {
          if (err.code !== '23505') {
            stats.errors.push(`Ticket contact ${email.from_email}: ${err.message}`);
          } else {
            stats.skippedExisting++;
          }
        }
      }
    } catch (err: any) {
      // Ticket tables might not exist - ignore
      logger.info('Note: Ticket contacts migration skipped (table may not exist)');
    }

    auditLog.log({
      userId,
      action: 'customers.migrate_contacts',
      details: JSON.stringify(stats),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Migration abgeschlossen',
      stats
    });
  } catch (error) {
    logger.error('Migrate contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
