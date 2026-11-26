import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { attachOrganization, requireOrgRole, OrganizationRequest } from '../middleware/organization';
import { logger } from '../utils/logger';
import {
  ASSET_SELECT, ASSET_STATUSES, ASSET_TYPES, mapAsset, syncAssetsFromNinja,
  nextAssetTag, logAssetEvent,
} from '../services/assetService';

/**
 * Assetmanagement (AS-1/2/3): Geraete unabhaengig von NinjaOne.
 * Lesen fuer alle Org-Mitglieder (Support braucht die Geraete), Anlegen/
 * Bearbeiten ab member, Loeschen + NinjaOne-Abgleich nur Admin/Owner.
 */
const router = Router();
router.use(authenticateToken, attachOrganization);

const orgId = (req: AuthRequest) => (req as unknown as OrganizationRequest).organization.id;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT').nullable().optional();
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

const assetBodySchema = z.object({
  // customers.id ist TEXT — kein .uuid() erzwingen
  customerId: z.string().min(1).max(100).nullable().optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  name: z.string().trim().min(1, 'Name fehlt').max(200),
  manufacturer: optText(200),
  model: optText(200),
  serialNumber: optText(200),
  inventoryNumber: optText(100),
  status: z.enum(ASSET_STATUSES).optional(),
  location: optText(200),
  assignedTo: optText(200),
  purchaseDate: dateStr,
  warrantyUntil: dateStr,
  supplier: optText(200),
  ipAddress: optText(100),
  osName: optText(200),
  notes: optText(5000),
});
const updateAssetSchema = assetBodySchema.partial();

/** Feld → Spalte fuer INSERT/UPDATE (nur Whitelist). */
const FIELD_COLUMNS: Record<string, string> = {
  customerId: 'customer_id', assetType: 'asset_type', name: 'name', manufacturer: 'manufacturer',
  model: 'model', serialNumber: 'serial_number', inventoryNumber: 'inventory_number',
  status: 'status', location: 'location', assignedTo: 'assigned_to', purchaseDate: 'purchase_date',
  warrantyUntil: 'warranty_until', supplier: 'supplier', ipAddress: 'ip_address',
  osName: 'os_name', notes: 'notes',
};

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

async function customerBelongsToOrg(customerId: string, organizationId: string): Promise<boolean> {
  const r = await query(
    'SELECT 1 FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [customerId, organizationId]
  );
  return r.rows.length > 0;
}

async function loadAsset(id: string, organizationId: string) {
  const r = await query(
    `${ASSET_SELECT} WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL`,
    [id, organizationId]
  );
  return r.rows[0] ? mapAsset(r.rows[0]) : null;
}

// GET /api/assets — Liste (paginiert; ?all=true fuer Auswahllisten)
//   ?customerId= (none = ohne Kunde)  ?status= (Default: alles ausser ausgemustert; all = alle)
//   ?type=  ?search=  ?warrantyWithinDays=
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const { customerId, status, type, search } = req.query;
    const params: unknown[] = [organizationId];
    let where = 'WHERE a.organization_id = $1 AND a.deleted_at IS NULL';

    if (customerId === 'none') {
      where += ' AND a.customer_id IS NULL';
    } else if (typeof customerId === 'string' && customerId) {
      params.push(customerId);
      where += ` AND a.customer_id = $${params.length}`;
    }
    if (status === 'all') {
      // keine Einschraenkung
    } else if (typeof status === 'string' && (ASSET_STATUSES as readonly string[]).includes(status)) {
      params.push(status);
      where += ` AND a.status = $${params.length}`;
    } else {
      where += ` AND a.status <> 'retired'`;
    }
    if (typeof type === 'string' && (ASSET_TYPES as readonly string[]).includes(type)) {
      params.push(type);
      where += ` AND a.asset_type = $${params.length}`;
    }
    if (typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim()}%`);
      const p = `$${params.length}`;
      where += ` AND (a.name ILIKE ${p} OR a.asset_tag ILIKE ${p} OR a.serial_number ILIKE ${p} OR a.model ILIKE ${p}
                     OR a.manufacturer ILIKE ${p} OR a.inventory_number ILIKE ${p}
                     OR a.assigned_to ILIKE ${p} OR a.location ILIKE ${p} OR c.name ILIKE ${p})`;
    }
    const warrantyDays = parseInt(String(req.query.warrantyWithinDays ?? ''), 10);
    if (Number.isFinite(warrantyDays)) {
      params.push(Math.min(Math.max(warrantyDays, 1), 730));
      where += ` AND a.warranty_until IS NOT NULL AND a.status <> 'retired'
                 AND a.warranty_until <= CURRENT_DATE + make_interval(days => $${params.length}::int)
                 AND a.warranty_until >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    const order = Number.isFinite(warrantyDays)
      ? 'ORDER BY a.warranty_until ASC'
      : 'ORDER BY c.name ASC NULLS LAST, a.name ASC';

    if (req.query.all === 'true') {
      const r = await query(`${ASSET_SELECT} ${where} ${order} LIMIT 2000`, params);
      return res.json({ success: true, data: r.rows.map(mapAsset) });
    }

    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
    const count = await query(
      `SELECT COUNT(*) AS n FROM assets a LEFT JOIN customers c ON c.id = a.customer_id ${where}`,
      params
    );
    const total = Number(count.rows[0]?.n || 0);
    const r = await query(
      `${ASSET_SELECT} ${where} ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params
    );
    res.json({
      success: true,
      data: r.rows.map(mapAsset),
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
  } catch (error) {
    logger.error('Get assets error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// POST /api/assets/sync-ninja — NinjaOne-Geraete jetzt als Assets abgleichen
router.post('/sync-ninja', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await syncAssetsFromNinja(req.userId!);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Asset Ninja sync error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// POST /api/assets/from-line-item/:lineItemId — Hardware-Kauf aus dem
// Rechnungseingang als Gerät übernehmen (AS-3). Admin/Owner (Einkaufsdaten).
// Body = Formularwerte aus dem Dialog; Kunde/Kaufdatum/Lieferant/Seriennummer
// werden aus der Position vorbelegt, falls der Dialog sie leer lässt.
// Einkaufspreis wird NICHT übernommen — er bleibt in invoice_line_items.
router.post('/from-line-item/:lineItemId', requireOrgRole('admin'), validate(assetBodySchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const body = assetBodySchema.parse(req.body);
    const li = await query(
      `SELECT li.id, li.customer_id, li.serial_number, li.description,
              to_char(COALESCE(pi.invoice_date, pi.received_at), 'YYYY-MM-DD') AS purchase_date,
              COALESCE(pi.supplier_name, pi.sender_name) AS supplier
         FROM invoice_line_items li
         LEFT JOIN processed_invoices pi ON pi.id = li.processed_invoice_id
        WHERE li.id = $1 AND li.organization_id = $2`,
      [req.params.lineItemId, organizationId]
    );
    if (li.rows.length === 0) return res.status(404).json({ error: 'Position nicht gefunden' });
    const row = li.rows[0];

    const existing = await query(
      'SELECT id FROM assets WHERE source_line_item_id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [row.id, organizationId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Diese Position wurde bereits als Gerät übernommen', assetId: existing.rows[0].id });
    }

    const customerId = body.customerId ?? row.customer_id ?? null;
    if (customerId && !(await customerBelongsToOrg(customerId, organizationId))) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO assets (id, organization_id, customer_id, asset_type, name, manufacturer, model,
                           serial_number, inventory_number, status, location, assigned_to,
                           purchase_date, warranty_until, supplier, ip_address, os_name, notes,
                           source_line_item_id, created_by, asset_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        id, organizationId, customerId, body.assetType ?? 'other', body.name,
        emptyToNull(body.manufacturer ?? null), emptyToNull(body.model ?? null),
        emptyToNull(body.serialNumber ?? null) ?? row.serial_number ?? null,
        emptyToNull(body.inventoryNumber ?? null), body.status ?? 'active',
        emptyToNull(body.location ?? null), emptyToNull(body.assignedTo ?? null),
        emptyToNull(body.purchaseDate ?? null) ?? row.purchase_date ?? null,
        emptyToNull(body.warrantyUntil ?? null),
        emptyToNull(body.supplier ?? null) ?? row.supplier ?? null,
        emptyToNull(body.ipAddress ?? null), emptyToNull(body.osName ?? null), emptyToNull(body.notes ?? null),
        row.id, req.userId, await nextAssetTag(organizationId),
      ]
    );
    await logAssetEvent(organizationId, id, req.userId ?? null, 'from_purchase', { lineItemId: row.id, description: row.description });
    res.status(201).json({ success: true, data: await loadAsset(id, organizationId) });
  } catch (error) {
    logger.error('Create asset from line item error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// GET /api/assets/:id — Detail inkl. Verlauf (Tickets + Wartungen)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const asset = await loadAsset(req.params.id, organizationId);
    if (!asset) return res.status(404).json({ error: 'Gerät nicht gefunden' });

    const tickets = await query(
      `SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.created_at
         FROM tickets t
        WHERE t.organization_id = $1
          AND (t.asset_id = $2 OR ($3::text IS NOT NULL AND t.device_id = $3))
        ORDER BY t.created_at DESC
        LIMIT 50`,
      [organizationId, asset.id, asset.ninjaDeviceRef]
    );
    let maintenance: { id: string; title: string; scheduledStart: string | null; status: string }[] = [];
    if (asset.ninjaDeviceRef) {
      const m = await query(
        `SELECT ma.id, ma.title, ma.scheduled_start, mad.status
           FROM maintenance_announcement_devices mad
           JOIN maintenance_announcements ma ON ma.id = mad.announcement_id
          WHERE mad.device_id = $1
          ORDER BY ma.scheduled_start DESC NULLS LAST
          LIMIT 20`,
        [asset.ninjaDeviceRef]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      maintenance = m.rows.map(r => ({
        id: String(r.id),
        title: String(r.title),
        scheduledStart: r.scheduled_start instanceof Date ? r.scheduled_start.toISOString() : (r.scheduled_start ? String(r.scheduled_start) : null),
        status: String(r.status ?? ''),
      }));
    }

    const events = await query(
      `SELECT e.id, e.event_type, e.details, e.created_at,
              COALESCE(u.display_name, u.username) AS user_name
         FROM asset_events e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE e.asset_id = $1 AND e.organization_id = $2
        ORDER BY e.created_at DESC
        LIMIT 100`,
      [asset.id, organizationId]
    );
    const attachments = await query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
         FROM asset_attachments
        WHERE asset_id = $1 AND organization_id = $2
        ORDER BY created_at DESC`,
      [asset.id, organizationId]
    );

    res.json({
      success: true,
      data: {
        ...asset,
        attachments: attachments.rows.map(a => ({
          id: String(a.id),
          originalName: String(a.original_name),
          mimeType: String(a.mime_type),
          sizeBytes: Number(a.size_bytes),
          createdAt: a.created_at instanceof Date ? a.created_at.toISOString() : String(a.created_at),
        })),
        history: {
          events: events.rows.map(e => ({
            id: String(e.id),
            eventType: String(e.event_type),
            details: e.details ?? null,
            userName: e.user_name ? String(e.user_name) : null,
            createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
          })),
          tickets: tickets.rows.map(t => ({
            id: String(t.id),
            ticketNumber: String(t.ticket_number),
            title: String(t.title),
            status: String(t.status),
            priority: String(t.priority),
            createdAt: t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
          })),
          maintenance,
        },
      },
    });
  } catch (error) {
    logger.error('Get asset error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// POST /api/assets — anlegen
router.post('/', requireOrgRole('member'), validate(assetBodySchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const body = assetBodySchema.parse(req.body);
    if (body.customerId && !(await customerBelongsToOrg(body.customerId, organizationId))) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    const id = crypto.randomUUID();
    const cols = ['id', 'organization_id', 'created_by', 'asset_tag'];
    const vals: unknown[] = [id, organizationId, req.userId, await nextAssetTag(organizationId)];
    for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
      const v = (body as Record<string, unknown>)[field];
      if (v !== undefined) {
        cols.push(column);
        vals.push(emptyToNull(v));
      }
    }
    await query(
      `INSERT INTO assets (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
      vals
    );
    await logAssetEvent(organizationId, id, req.userId ?? null, 'created', { source: 'manual' });
    const asset = await loadAsset(id, organizationId);
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    logger.error('Create asset error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// PUT /api/assets/:id — Teil-Update
router.put('/:id', requireOrgRole('member'), validate(updateAssetSchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const body = updateAssetSchema.parse(req.body);
    const existing = await loadAsset(req.params.id, organizationId);
    if (!existing) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    if (body.customerId && !(await customerBelongsToOrg(body.customerId, organizationId))) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
      const v = (body as Record<string, unknown>)[field];
      if (v !== undefined) {
        vals.push(emptyToNull(v));
        sets.push(`${column} = $${vals.length}`);
      }
    }
    // Änderungsverlauf: nur tatsächlich geänderte Felder
    const changes: Record<string, [unknown, unknown]> = {};
    const before = existing as unknown as Record<string, unknown>;
    for (const field of Object.keys(FIELD_COLUMNS)) {
      const v = (body as Record<string, unknown>)[field];
      if (v === undefined) continue;
      const next = emptyToNull(v);
      const prev = before[field] ?? null;
      if (String(prev ?? '') !== String(next ?? '')) changes[field] = [prev, next];
    }
    if (sets.length > 0) {
      vals.push(req.params.id, organizationId);
      await query(
        `UPDATE assets SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${vals.length - 1} AND organization_id = $${vals.length} AND deleted_at IS NULL`,
        vals
      );
    }
    if (Object.keys(changes).length > 0) {
      await logAssetEvent(organizationId, req.params.id, req.userId ?? null, 'updated', { changes });
    }
    res.json({ success: true, data: await loadAsset(req.params.id, organizationId) });
  } catch (error) {
    logger.error('Update asset error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// DELETE /api/assets/:id — Soft-Delete (Admin/Owner). NinjaOne-Geraete
// kaemen beim naechsten Sync zurueck → dafuer Status „ausgemustert" nutzen.
router.delete('/:id', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `UPDATE assets SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [req.params.id, orgId(req)]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    await query('UPDATE tickets SET asset_id = NULL WHERE asset_id = $1', [req.params.id]);
    await logAssetEvent(orgId(req), req.params.id, req.userId ?? null, 'deleted');
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete asset error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

export default router;
