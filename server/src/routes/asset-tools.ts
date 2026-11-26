import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { attachOrganization, requireOrgRole, OrganizationRequest } from '../middleware/organization';
import { logger } from '../utils/logger';
import {
  ASSET_SELECT, ASSET_STATUSES, ASSET_TYPES, mapAsset, nextAssetTag, ensureLabelToken, logAssetEvent,
} from '../services/assetService';

/**
 * Geräte-Werkzeuge (AS-4…7): Asset-ID-Einstellungen, Code-Auflösung (Scan),
 * Etiketten-Daten, Inventur, Import, Anhänge.
 *
 * ⚠️ Wird in index.ts VOR dem allgemeinen /api/assets-Router gemountet, damit
 * die festen Pfade (/settings, /resolve, /labels, /inventories, /import)
 * nicht von GET /:id geschluckt werden (Route-Shadowing).
 */
const router = Router();
router.use(authenticateToken, attachOrganization);

const orgId = (req: AuthRequest) => (req as unknown as OrganizationRequest).organization.id;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

const APP_URL = () => (process.env.FRONTEND_URL || 'https://app.ramboeck.it').replace(/\/$/, '');
const PORTAL_URL = () => (process.env.PORTAL_URL || process.env.FRONTEND_URL || 'https://app.ramboeck.it').replace(/\/$/, '');
export const labelUrl = (token: string) => `${APP_URL()}/l/${token}`;

async function loadAsset(id: string, organizationId: string) {
  const r = await query(`${ASSET_SELECT} WHERE a.id = $1 AND a.organization_id = $2 AND a.deleted_at IS NULL`, [id, organizationId]);
  return r.rows[0] ? mapAsset(r.rows[0]) : null;
}

/**
 * Gescannten/eingetippten Code auflösen: QR-Link (…/l/<token>), Label-Token,
 * Asset-ID (IT-00042) oder Seriennummer (nur wenn eindeutig).
 */
export async function resolveAssetCode(code: string, organizationId: string): Promise<string | null> {
  const raw = code.trim();
  if (!raw) return null;
  const fromUrl = raw.match(/\/l\/([A-Za-z0-9_-]{8,64})/);
  const token = fromUrl?.[1] ?? (/^[A-Za-z0-9_-]{16}$/.test(raw) ? raw : null);
  if (token) {
    const r = await query('SELECT id FROM assets WHERE label_token = $1 AND organization_id = $2 AND deleted_at IS NULL', [token, organizationId]);
    if (r.rows[0]) return r.rows[0].id;
  }
  const byTag = await query(
    'SELECT id FROM assets WHERE organization_id = $1 AND deleted_at IS NULL AND lower(asset_tag) = lower($2)',
    [organizationId, raw]
  );
  if (byTag.rows[0]) return byTag.rows[0].id;
  const bySerial = await query(
    'SELECT id FROM assets WHERE organization_id = $1 AND deleted_at IS NULL AND lower(serial_number) = lower($2) LIMIT 2',
    [organizationId, raw]
  );
  return bySerial.rows.length === 1 ? bySerial.rows[0].id : null;
}

async function companyInfo(organizationId: string) {
  const r = await query(
    `SELECT ci.name, ci.email, ci.phone, ci.website
       FROM company_info ci
      WHERE ci.organization_id = $1
         OR ci.user_id = (SELECT owner_user_id FROM organizations WHERE id = $1)
      ORDER BY (ci.organization_id = $1) DESC NULLS LAST
      LIMIT 1`,
    [organizationId]
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const org = await query('SELECT name FROM organizations WHERE id = $1', [organizationId]);
  const c = r.rows[0] ?? {};
  return {
    name: (c.name as string) || (org.rows[0]?.name as string) || null,
    email: (c.email as string) || null,
    phone: (c.phone as string) || null,
    website: (c.website as string) || null,
  };
}

// ---------------------------------------------------------------------------
// Einstellungen: Präfix der Asset-ID
// ---------------------------------------------------------------------------
router.get('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const r = await query('SELECT prefix, next_value FROM asset_tag_sequences WHERE organization_id = $1', [orgId(req)]);
    res.json({ success: true, data: { prefix: r.rows[0]?.prefix ?? 'IT', nextValue: Number(r.rows[0]?.next_value ?? 1) } });
  } catch (error) {
    logger.error('Asset settings error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

const settingsSchema = z.object({ prefix: z.string().trim().regex(/^[A-Za-z0-9]{1,8}$/, '1–8 Buchstaben/Ziffern') });
router.put('/settings', requireOrgRole('admin'), validate(settingsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const prefix = settingsSchema.parse(req.body).prefix.toUpperCase();
    await query(
      `INSERT INTO asset_tag_sequences (organization_id, prefix) VALUES ($1, $2)
       ON CONFLICT (organization_id) DO UPDATE SET prefix = EXCLUDED.prefix, updated_at = NOW()`,
      [orgId(req), prefix]
    );
    res.json({ success: true, data: { prefix } });
  } catch (error) {
    logger.error('Asset settings update error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Scan / Handscanner: Code → Gerät
// ---------------------------------------------------------------------------
router.get('/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const code = String(req.query.code ?? '').slice(0, 500);
    const id = await resolveAssetCode(code, orgId(req));
    if (!id) return res.status(404).json({ error: 'Kein Gerät zu diesem Code gefunden' });
    res.json({ success: true, data: await loadAsset(id, orgId(req)) });
  } catch (error) {
    logger.error('Asset resolve error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Etiketten: Daten für den PDF-Druck (Token wird hier erzeugt)
// ---------------------------------------------------------------------------
const labelsSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(500) });
router.post('/labels', requireOrgRole('member'), validate(labelsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const { ids } = labelsSchema.parse(req.body);
    const labels = [];
    for (const id of ids) {
      const asset = await loadAsset(id, organizationId);
      if (!asset) continue;
      let tag = asset.assetTag;
      if (!tag) {
        tag = await nextAssetTag(organizationId);
        await query('UPDATE assets SET asset_tag = $1 WHERE id = $2', [tag, id]);
      }
      const token = await ensureLabelToken(id, organizationId);
      if (!token) continue;
      labels.push({
        id,
        assetTag: tag,
        name: asset.name,
        customerName: asset.customerName,
        serialNumber: asset.serialNumber,
        location: asset.location,
        url: labelUrl(token),
      });
      await logAssetEvent(organizationId, id, req.userId ?? null, 'label_printed');
    }
    res.json({ success: true, data: { labels, company: await companyInfo(organizationId) } });
  } catch (error) {
    logger.error('Asset labels error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// Label-Token → Geräte-ID (für eingeloggte Techniker nach dem QR-Scan)
router.get('/by-label/:token', async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      'SELECT id FROM assets WHERE label_token = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [req.params.token, orgId(req)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Gerät nicht gefunden' });
    res.json({ success: true, data: { id: r.rows[0].id } });
  } catch (error) {
    logger.error('Asset by-label error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Inventur
// ---------------------------------------------------------------------------
async function loadInventory(id: string, organizationId: string) {
  const inv = await query(
    `SELECT i.id, i.customer_id, i.title, i.started_at, i.completed_at, c.name AS customer_name,
            COALESCE(u.display_name, u.username) AS started_by_name
       FROM asset_inventories i
       LEFT JOIN customers c ON c.id = i.customer_id
       LEFT JOIN users u ON u.id = i.started_by
      WHERE i.id = $1 AND i.organization_id = $2`,
    [id, organizationId]
  );
  if (!inv.rows[0]) return null;
  const i = inv.rows[0];
  const expected = await query(
    `SELECT a.id, a.asset_tag, a.name, a.asset_type, a.location, a.assigned_to, a.serial_number,
            it.seen_at
       FROM assets a
       LEFT JOIN asset_inventory_items it ON it.asset_id = a.id AND it.inventory_id = $1
      WHERE a.organization_id = $2 AND a.deleted_at IS NULL AND a.status <> 'retired'
        AND ($3::text IS NULL AND a.customer_id IS NULL OR a.customer_id = $3)
      ORDER BY (it.seen_at IS NULL) DESC, a.name`,
    [id, organizationId, i.customer_id]
  );
  const extra = await query(
    `SELECT a.id, a.asset_tag, a.name, a.asset_type, it.seen_at, c.name AS customer_name
       FROM asset_inventory_items it
       JOIN assets a ON a.id = it.asset_id
       LEFT JOIN customers c ON c.id = a.customer_id
      WHERE it.inventory_id = $1
        AND NOT (($2::text IS NULL AND a.customer_id IS NULL) OR a.customer_id = $2)`,
    [id, i.customer_id]
  );
  const mapItem = (r: Record<string, unknown>) => ({
    id: String(r.id), assetTag: r.asset_tag ? String(r.asset_tag) : null, name: String(r.name),
    assetType: String(r.asset_type), location: r.location ? String(r.location) : null,
    assignedTo: r.assigned_to ? String(r.assigned_to) : null, serialNumber: r.serial_number ? String(r.serial_number) : null,
    customerName: r.customer_name ? String(r.customer_name) : null, seenAt: iso(r.seen_at),
  });
  return {
    id: String(i.id),
    customerId: i.customer_id ? String(i.customer_id) : null,
    customerName: i.customer_name ? String(i.customer_name) : null,
    title: i.title ? String(i.title) : null,
    startedAt: iso(i.started_at),
    startedByName: i.started_by_name ? String(i.started_by_name) : null,
    completedAt: iso(i.completed_at),
    expected: expected.rows.map(mapItem),
    unexpected: extra.rows.map(mapItem),
  };
}

router.get('/inventories', async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `SELECT i.id, i.title, i.started_at, i.completed_at, c.name AS customer_name,
              (SELECT COUNT(*) FROM asset_inventory_items it WHERE it.inventory_id = i.id) AS seen_count
         FROM asset_inventories i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.organization_id = $1
        ORDER BY i.started_at DESC
        LIMIT 30`,
      [orgId(req)]
    );
    res.json({
      success: true,
      data: r.rows.map(x => ({
        id: String(x.id), title: x.title ? String(x.title) : null,
        customerName: x.customer_name ? String(x.customer_name) : null,
        startedAt: iso(x.started_at), completedAt: iso(x.completed_at), seenCount: Number(x.seen_count),
      })),
    });
  } catch (error) {
    logger.error('Inventories list error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

const inventoryCreateSchema = z.object({
  customerId: z.string().min(1).max(100).nullable(),
  title: z.string().trim().max(200).optional(),
});
router.post('/inventories', requireOrgRole('member'), validate(inventoryCreateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const body = inventoryCreateSchema.parse(req.body);
    if (body.customerId) {
      const c = await query('SELECT 1 FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [body.customerId, organizationId]);
      if (c.rows.length === 0) return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    const id = crypto.randomUUID();
    await query(
      'INSERT INTO asset_inventories (id, organization_id, customer_id, title, started_by) VALUES ($1, $2, $3, $4, $5)',
      [id, organizationId, body.customerId, body.title || null, req.userId]
    );
    res.status(201).json({ success: true, data: await loadInventory(id, organizationId) });
  } catch (error) {
    logger.error('Inventory create error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

router.get('/inventories/:id', async (req: AuthRequest, res: Response) => {
  try {
    const inv = await loadInventory(req.params.id, orgId(req));
    if (!inv) return res.status(404).json({ error: 'Inventur nicht gefunden' });
    res.json({ success: true, data: inv });
  } catch (error) {
    logger.error('Inventory get error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

const seenSchema = z.object({
  code: z.string().max(500).optional(),
  assetId: z.string().max(100).optional(),
}).refine(v => !!(v.code || v.assetId), { message: 'code oder assetId angeben' });
router.post('/inventories/:id/seen', requireOrgRole('member'), validate(seenSchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const body = seenSchema.parse(req.body);
    const inv = await query('SELECT id, customer_id, completed_at FROM asset_inventories WHERE id = $1 AND organization_id = $2', [req.params.id, organizationId]);
    if (!inv.rows[0]) return res.status(404).json({ error: 'Inventur nicht gefunden' });
    if (inv.rows[0].completed_at) return res.status(400).json({ error: 'Diese Inventur ist bereits abgeschlossen' });

    const assetId = body.assetId
      ? (await query('SELECT id FROM assets WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [body.assetId, organizationId])).rows[0]?.id ?? null
      : await resolveAssetCode(body.code ?? '', organizationId);
    if (!assetId) return res.status(404).json({ error: 'Kein Gerät zu diesem Code gefunden' });

    const ins = await query(
      `INSERT INTO asset_inventory_items (inventory_id, asset_id, seen_by) VALUES ($1, $2, $3)
       ON CONFLICT (inventory_id, asset_id) DO NOTHING`,
      [req.params.id, assetId, req.userId]
    );
    await query('UPDATE assets SET last_seen_at = NOW(), last_seen_by = $1 WHERE id = $2', [req.userId, assetId]);
    const alreadySeen = (ins.rowCount ?? 0) === 0;
    if (!alreadySeen) await logAssetEvent(organizationId, assetId, req.userId ?? null, 'inventory_seen', { inventoryId: req.params.id });
    const asset = await loadAsset(assetId, organizationId);
    const expected = inv.rows[0].customer_id ? asset?.customerId === inv.rows[0].customer_id : !asset?.customerId;
    res.json({ success: true, data: { asset, alreadySeen, expected } });
  } catch (error) {
    logger.error('Inventory seen error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

router.post('/inventories/:id/complete', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      'UPDATE asset_inventories SET completed_at = NOW() WHERE id = $1 AND organization_id = $2 AND completed_at IS NULL',
      [req.params.id, orgId(req)]
    );
    if ((r.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Inventur nicht gefunden oder bereits abgeschlossen' });
    res.json({ success: true, data: await loadInventory(req.params.id, orgId(req)) });
  } catch (error) {
    logger.error('Inventory complete error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Import (CSV/Excel — Spaltenzuordnung macht der Client)
// ---------------------------------------------------------------------------
const TYPE_ALIASES: Record<string, string> = {
  pc: 'workstation', arbeitsplatz: 'workstation', 'arbeitsplatz-pc': 'workstation', desktop: 'workstation', workstation: 'workstation',
  laptop: 'laptop', notebook: 'laptop', server: 'server', drucker: 'printer', printer: 'printer', mfp: 'printer', multifunktionsgerät: 'printer',
  switch: 'network', router: 'network', 'access point': 'network', ap: 'network', netzwerk: 'network', network: 'network', wlan: 'network',
  firewall: 'firewall', nas: 'storage', storage: 'storage', speicher: 'storage', telefon: 'phone', phone: 'phone', voip: 'phone',
  smartphone: 'mobile', handy: 'mobile', tablet: 'mobile', mobile: 'mobile', ipad: 'mobile', iphone: 'mobile',
  monitor: 'monitor', bildschirm: 'monitor', sonstiges: 'other', other: 'other',
  // Anzeige-Labels der App (Export → Re-Import)
  'netzwerk (switch/ap/router)': 'network', 'nas / storage': 'storage', 'smartphone / tablet': 'mobile',
};
const STATUS_ALIASES: Record<string, string> = {
  active: 'active', aktiv: 'active', 'im einsatz': 'active', einsatz: 'active',
  stock: 'stock', lager: 'stock', defective: 'defective', defekt: 'defective', kaputt: 'defective',
  retired: 'retired', ausgemustert: 'retired', entsorgt: 'retired',
};
function normDate(v: string | undefined): string | null | 'invalid' {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return 'invalid';
}

const importRowSchema = z.object({
  name: z.string().max(200).optional(),
  assetType: z.string().max(100).optional(),
  customer: z.string().max(200).optional(),
  manufacturer: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  serialNumber: z.string().max(200).optional(),
  inventoryNumber: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  assignedTo: z.string().max(200).optional(),
  purchaseDate: z.string().max(20).optional(),
  warrantyUntil: z.string().max(20).optional(),
  supplier: z.string().max(200).optional(),
  ipAddress: z.string().max(100).optional(),
  osName: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});
const importSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(2000),
  dryRun: z.boolean().optional(),
  /** Kunde für alle Zeilen ohne eigene Kundenspalte (CustomerHub-Import) */
  defaultCustomerId: z.string().max(100).nullable().optional(),
});

router.post('/import', requireOrgRole('member'), validate(importSchema), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const { rows, dryRun, defaultCustomerId } = importSchema.parse(req.body);
    const customers = await query(
      'SELECT id, name, customer_number FROM customers WHERE organization_id = $1 AND deleted_at IS NULL',
      [organizationId]
    );
    const byName = new Map<string, string>();
    for (const c of customers.rows) {
      byName.set(String(c.name).toLowerCase().trim(), c.id);
      if (c.customer_number) byName.set(String(c.customer_number).toLowerCase().trim(), c.id);
    }
    if (defaultCustomerId && !customers.rows.some(c => c.id === defaultCustomerId)) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    const serials = await query(
      'SELECT lower(serial_number) AS sn, asset_tag FROM assets WHERE organization_id = $1 AND deleted_at IS NULL AND serial_number IS NOT NULL',
      [organizationId]
    );
    const knownSerials = new Map<string, string>(serials.rows.map(r => [String(r.sn), String(r.asset_tag ?? '')]));

    const results: { row: number; status: 'created' | 'ready' | 'skipped' | 'error'; message?: string; assetTag?: string; name?: string }[] = [];
    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const t = (v?: string) => (v ?? '').trim() || null;
      const name = t(r.name) ?? [t(r.manufacturer), t(r.model)].filter(Boolean).join(' ') ?? null;
      if (!name) { results.push({ row: i + 1, status: 'error', message: 'Name fehlt (oder Hersteller/Modell)' }); continue; }

      let customerId: string | null = defaultCustomerId ?? null;
      if (t(r.customer)) {
        customerId = byName.get(t(r.customer)!.toLowerCase()) ?? null;
        if (!customerId) { results.push({ row: i + 1, status: 'error', name, message: `Kunde „${t(r.customer)}“ nicht gefunden` }); continue; }
      }
      const type = t(r.assetType) ? TYPE_ALIASES[t(r.assetType)!.toLowerCase()] ?? ((ASSET_TYPES as readonly string[]).includes(t(r.assetType)!) ? t(r.assetType)! : 'other') : 'other';
      const status = t(r.status) ? STATUS_ALIASES[t(r.status)!.toLowerCase()] ?? null : 'active';
      if (!status || !(ASSET_STATUSES as readonly string[]).includes(status)) {
        results.push({ row: i + 1, status: 'error', name, message: `Unbekannter Status „${t(r.status)}“` }); continue;
      }
      const purchaseDate = normDate(r.purchaseDate);
      const warrantyUntil = normDate(r.warrantyUntil);
      if (purchaseDate === 'invalid' || warrantyUntil === 'invalid') {
        results.push({ row: i + 1, status: 'error', name, message: 'Datum nicht lesbar (TT.MM.JJJJ oder JJJJ-MM-TT)' }); continue;
      }
      const serial = t(r.serialNumber);
      if (serial && knownSerials.has(serial.toLowerCase())) {
        results.push({ row: i + 1, status: 'skipped', name, message: `Seriennummer existiert bereits (${knownSerials.get(serial.toLowerCase()) || 'vorhanden'})` });
        continue;
      }
      if (dryRun) { results.push({ row: i + 1, status: 'ready', name }); if (serial) knownSerials.set(serial.toLowerCase(), 'in dieser Datei'); continue; }

      const id = crypto.randomUUID();
      const tag = await nextAssetTag(organizationId);
      await query(
        `INSERT INTO assets (id, organization_id, customer_id, asset_type, name, manufacturer, model, serial_number,
                             inventory_number, status, location, assigned_to, purchase_date, warranty_until,
                             supplier, ip_address, os_name, notes, created_by, asset_tag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [id, organizationId, customerId, type, name, t(r.manufacturer), t(r.model), serial, t(r.inventoryNumber),
         status, t(r.location), t(r.assignedTo), purchaseDate, warrantyUntil, t(r.supplier), t(r.ipAddress),
         t(r.osName), t(r.notes), req.userId, tag]
      );
      if (serial) knownSerials.set(serial.toLowerCase(), tag);
      await logAssetEvent(organizationId, id, req.userId ?? null, 'imported');
      created++;
      results.push({ row: i + 1, status: 'created', name, assetTag: tag });
    }
    res.json({ success: true, data: { created, results } });
  } catch (error) {
    logger.error('Asset import error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Anhänge (Fotos, Belege, Handbücher) — NICHT statisch ausgeliefert
// ---------------------------------------------------------------------------
const ATTACH_DIR = path.join(process.env.UPLOADS_DIR || '/app/uploads', 'assets');
const ATTACH_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'application/pdf': '.pdf', 'text/plain': '.txt', 'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};
const INLINE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const attachUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ATTACH_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error(`Dateityp ${file.mimetype} ist nicht erlaubt`));
  },
});

router.post('/:id/attachments', requireOrgRole('member'), (req: Request, res: Response, next) => {
  attachUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'Datei ist größer als 15 MB'
        : err instanceof Error ? err.message : 'Upload fehlgeschlagen';
      return res.status(400).json({ error: message });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'Keine Datei' });
    const asset = await query('SELECT id FROM assets WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [req.params.id, organizationId]);
    if (!asset.rows[0]) return res.status(404).json({ error: 'Gerät nicht gefunden' });

    fs.mkdirSync(ATTACH_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const filename = `${id}${ATTACH_TYPES[file.mimetype]}`;
    fs.writeFileSync(path.join(ATTACH_DIR, filename), file.buffer);
    const originalName = path.basename(file.originalname).slice(0, 200);
    await query(
      `INSERT INTO asset_attachments (id, organization_id, asset_id, filename, original_name, mime_type, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, organizationId, req.params.id, filename, originalName, file.mimetype, file.size, req.userId]
    );
    await logAssetEvent(organizationId, req.params.id, req.userId ?? null, 'attachment_added', { name: originalName });
    res.status(201).json({ success: true, data: { id, originalName, mimeType: file.mimetype, sizeBytes: file.size, createdAt: new Date().toISOString() } });
  } catch (error) {
    logger.error('Asset attachment upload error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

router.get('/:id/attachments/:attId/download', async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `SELECT filename, original_name, mime_type FROM asset_attachments
        WHERE id = $1 AND asset_id = $2 AND organization_id = $3`,
      [req.params.attId, req.params.id, orgId(req)]
    );
    const a = r.rows[0];
    if (!a) return res.status(404).json({ error: 'Anhang nicht gefunden' });
    const filePath = path.join(ATTACH_DIR, path.basename(String(a.filename)));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht mehr vorhanden' });
    const mime = String(a.mime_type);
    const inline = INLINE_TYPES.has(mime);
    res.setHeader('Content-Type', inline ? mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(String(a.original_name))}`);
    if (!inline) res.setHeader('Content-Security-Policy', 'sandbox');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.error('Asset attachment download error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

router.delete('/:id/attachments/:attId', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const r = await query(
      'DELETE FROM asset_attachments WHERE id = $1 AND asset_id = $2 AND organization_id = $3 RETURNING filename, original_name',
      [req.params.attId, req.params.id, organizationId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Anhang nicht gefunden' });
    fs.promises.unlink(path.join(ATTACH_DIR, path.basename(String(r.rows[0].filename)))).catch(() => undefined);
    await logAssetEvent(organizationId, req.params.id, req.userId ?? null, 'attachment_removed', { name: r.rows[0].original_name });
    res.json({ success: true });
  } catch (error) {
    logger.error('Asset attachment delete error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

export default router;

// ---------------------------------------------------------------------------
// ÖFFENTLICH (ohne Login): Etiketten-Link /l/<token>
// Verrät nur die Asset-ID (steht ohnehin auf dem Etikett) und die Support-
// Kontaktdaten — keine Gerätedaten, keine Kundendaten.
// ---------------------------------------------------------------------------
export const publicAssetLabelRouter = Router();
publicAssetLabelRouter.get('/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return res.status(404).json({ error: 'Unbekanntes Etikett' });
    const r = await query(
      'SELECT asset_tag, organization_id FROM assets WHERE label_token = $1 AND deleted_at IS NULL',
      [token]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Unbekanntes Etikett' });
    const company = await companyInfo(String(r.rows[0].organization_id));
    res.json({
      success: true,
      data: {
        assetTag: r.rows[0].asset_tag ? String(r.rows[0].asset_tag) : null,
        support: company,
        portalUrl: PORTAL_URL(),
        // Kunde scannt → Portal-Login → Ticket mit vorausgewähltem Gerät
        portalTicketUrl: process.env.PORTAL_URL
          ? `${PORTAL_URL()}/?label=${token}`
          : `${APP_URL()}/portal?label=${token}`,
      },
    });
  } catch (error) {
    logger.error('Public asset label error:', error);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});
