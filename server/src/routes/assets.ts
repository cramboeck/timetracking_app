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
      where += ` AND (a.name ILIKE ${p} OR a.serial_number ILIKE ${p} OR a.model ILIKE ${p}
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

    res.json({
      success: true,
      data: {
        ...asset,
        history: {
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
    const cols = ['id', 'organization_id', 'created_by'];
    const vals: unknown[] = [id, organizationId, req.userId];
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
    if (sets.length > 0) {
      vals.push(req.params.id, organizationId);
      await query(
        `UPDATE assets SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${vals.length - 1} AND organization_id = $${vals.length} AND deleted_at IS NULL`,
        vals
      );
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
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete asset error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

export default router;
