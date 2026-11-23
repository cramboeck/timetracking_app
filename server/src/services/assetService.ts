import crypto from 'crypto';
import { query } from '../config/database';
import { getUserOrganizationId } from '../middleware/organization';
import { logger } from '../utils/logger';

/**
 * Assetmanagement (AS-1): `assets` ist die eine Geraete-Wahrheit, NinjaOne
 * nur eine Quelle. Dieser Service haelt die NinjaOne-Geraete als Assets
 * aktuell — idempotent, ohne Dubletten und ohne manuelle Pflege zu
 * ueberschreiben.
 */

export const ASSET_TYPES = [
  'workstation', 'laptop', 'server', 'printer', 'network', 'firewall',
  'storage', 'phone', 'mobile', 'monitor', 'other',
] as const;
export const ASSET_STATUSES = ['active', 'stock', 'defective', 'retired'] as const;

/** Spaltenliste fuer `assets a` (kein SELECT *). */
export const ASSET_COLUMNS = `
  a.id, a.organization_id, a.customer_id, a.asset_type, a.name, a.manufacturer,
  a.model, a.serial_number, a.inventory_number, a.status, a.location,
  a.assigned_to, to_char(a.purchase_date, 'YYYY-MM-DD') AS purchase_date,
  to_char(a.warranty_until, 'YYYY-MM-DD') AS warranty_until, a.supplier, a.ip_address,
  a.os_name, a.notes, a.ninja_device_ref, a.source_line_item_id, a.created_by,
  a.created_at, a.updated_at
`;

/** Expliziter Mapper statt transformRow: dessen Zahl-Heuristik wuerde rein
 *  numerische Serien-/Inventarnummern zu Number machen. */
export interface AssetDto {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerColor: string | null;
  customerLogoUrl: string | null;
  assetType: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  status: string;
  location: string | null;
  assignedTo: string | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  supplier: string | null;
  ipAddress: string | null;
  osName: string | null;
  notes: string | null;
  ninjaDeviceRef: string | null;
  sourceLineItemId: string | null;
  createdAt: string;
  updatedAt: string;
  /** nur bei NinjaOne-verknuepften Geraeten */
  ninja: { offline: boolean; lastContact: string | null; nodeClass: string | null } | null;
  openTickets: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : str(v));

export function mapAsset(r: Row): AssetDto {
  return {
    id: String(r.id),
    customerId: str(r.customer_id),
    customerName: str(r.customer_name),
    customerColor: str(r.customer_color),
    customerLogoUrl: str(r.customer_logo_url),
    assetType: String(r.asset_type),
    name: String(r.name),
    manufacturer: str(r.manufacturer),
    model: str(r.model),
    serialNumber: str(r.serial_number),
    inventoryNumber: str(r.inventory_number),
    status: String(r.status),
    location: str(r.location),
    assignedTo: str(r.assigned_to),
    purchaseDate: str(r.purchase_date),
    warrantyUntil: str(r.warranty_until),
    supplier: str(r.supplier),
    ipAddress: str(r.ip_address),
    osName: str(r.os_name),
    notes: str(r.notes),
    ninjaDeviceRef: str(r.ninja_device_ref),
    sourceLineItemId: str(r.source_line_item_id),
    createdAt: iso(r.created_at) || '',
    updatedAt: iso(r.updated_at) || '',
    ninja: r.ninja_device_ref && r.ninja_exists
      ? { offline: r.ninja_offline === true, lastContact: iso(r.ninja_last_contact), nodeClass: str(r.ninja_node_class) }
      : null,
    openTickets: Number(r.open_tickets || 0),
  };
}

/** SELECT-Teil inkl. Kunde, NinjaOne-Live-Status und offener Tickets. */
export const ASSET_SELECT = `
  SELECT ${ASSET_COLUMNS},
         c.name AS customer_name, c.color AS customer_color, c.logo_url AS customer_logo_url,
         (d.id IS NOT NULL) AS ninja_exists, d.offline AS ninja_offline,
         d.last_contact AS ninja_last_contact, d.node_class AS ninja_node_class,
         (SELECT COUNT(*) FROM tickets t
           WHERE t.organization_id = a.organization_id
             AND (t.asset_id = a.id OR (a.ninja_device_ref IS NOT NULL AND t.device_id = a.ninja_device_ref))
             AND t.status NOT IN ('resolved', 'closed', 'archived')) AS open_tickets
    FROM assets a
    LEFT JOIN customers c ON c.id = a.customer_id
    LEFT JOIN ninjarmm_devices d ON d.id = a.ninja_device_ref
`;

/** NinjaOne node_class → Asset-Typ (Vorbelegung, manuell aenderbar). */
export function assetTypeFromNodeClass(nodeClass: string | null | undefined): string {
  const nc = (nodeClass || '').toUpperCase();
  if (nc.includes('SERVER')) return 'server';
  if (nc.includes('LAPTOP')) return 'laptop';
  if (nc.includes('WORKSTATION') || nc.includes('WINDOWS') || nc.includes('MAC') || nc.includes('LINUX')) return 'workstation';
  if (nc.includes('PRINTER')) return 'printer';
  if (nc.includes('NMS') || nc.includes('NETWORK') || nc.includes('SWITCH') || nc.includes('ROUTER')) return 'network';
  if (nc.includes('FIREWALL')) return 'firewall';
  if (nc.includes('NAS') || nc.includes('STORAGE')) return 'storage';
  if (nc.includes('MOBILE') || nc.includes('ANDROID') || nc.includes('IOS')) return 'mobile';
  return 'other';
}

interface NinjaDeviceRow {
  id: string;
  system_name: string | null;
  display_name: string | null;
  node_class: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  os_name: string | null;
  private_ip: string | null;
  customer_id: string | null;
}

/**
 * Uebernimmt die gecachten NinjaOne-Geraete eines Users als Assets seiner
 * Organisation.
 * - schon verknuepft → Stammdaten aus NinjaOne nachziehen (Name/Modell/OS/IP);
 *   Kunde nur, wenn das Asset noch keinen hat (manuelle Zuordnung gewinnt)
 * - manuelles Asset mit gleicher Seriennummer, aber ohne Verknuepfung →
 *   verknuepfen statt Dublette
 * - sonst neu anlegen
 */
export async function syncAssetsFromNinja(userId: string): Promise<{ created: number; linked: number; updated: number }> {
  const organizationId = await getUserOrganizationId(userId);
  if (!organizationId) return { created: 0, linked: 0, updated: 0 };

  const devices = await query(
    `SELECT d.id, d.system_name, d.display_name, d.node_class, d.manufacturer, d.model,
            d.serial_number, d.os_name, d.private_ip,
            COALESCE(c1.id, c2.id) AS customer_id
       FROM ninjarmm_devices d
       LEFT JOIN customers c1
              ON c1.ninjarmm_organization_id = d.organization_id
             AND c1.organization_id = $2 AND c1.deleted_at IS NULL
       LEFT JOIN ninjarmm_organizations o ON o.id = d.organization_id
       LEFT JOIN customers c2
              ON c2.id = o.customer_id AND c2.organization_id = $2 AND c2.deleted_at IS NULL
      WHERE d.user_id = $1`,
    [userId, organizationId]
  );

  let created = 0, linked = 0, updated = 0;
  for (const d of devices.rows as NinjaDeviceRow[]) {
    const name = d.display_name || d.system_name || 'Unbenanntes Gerät';
    const serial = d.serial_number && d.serial_number.trim() ? d.serial_number.trim() : null;

    // Name bleibt nach der Anlage in Nutzerhand (manuelle Umbenennung gewinnt);
    // technische Stammdaten zieht NinjaOne nach.
    const upd = await query(
      `UPDATE assets SET
          name = COALESCE(NULLIF(name, ''), $3), manufacturer = COALESCE($4, manufacturer), model = COALESCE($5, model),
          serial_number = COALESCE($6, serial_number), os_name = COALESCE($7, os_name),
          ip_address = COALESCE($8, ip_address),
          customer_id = COALESCE(customer_id, $9),
          updated_at = NOW()
        WHERE organization_id = $1 AND ninja_device_ref = $2 AND deleted_at IS NULL`,
      [organizationId, d.id, name, d.manufacturer, d.model, serial, d.os_name, d.private_ip, d.customer_id]
    );
    if ((upd.rowCount ?? 0) > 0) { updated++; continue; }

    if (serial) {
      const link = await query(
        `UPDATE assets SET ninja_device_ref = $2, os_name = COALESCE(os_name, $4),
                ip_address = COALESCE(ip_address, $5), customer_id = COALESCE(customer_id, $6),
                updated_at = NOW()
          WHERE id = (
            SELECT id FROM assets
             WHERE organization_id = $1 AND ninja_device_ref IS NULL AND deleted_at IS NULL
               AND lower(serial_number) = lower($3)
             ORDER BY created_at LIMIT 1)`,
        [organizationId, d.id, serial, d.os_name, d.private_ip, d.customer_id]
      );
      if ((link.rowCount ?? 0) > 0) { linked++; continue; }
    }

    await query(
      `INSERT INTO assets (id, organization_id, customer_id, asset_type, name, manufacturer, model,
                           serial_number, os_name, ip_address, ninja_device_ref, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12)
       ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), organizationId, d.customer_id, assetTypeFromNodeClass(d.node_class),
       name, d.manufacturer, d.model, serial, d.os_name, d.private_ip, d.id, userId]
    );
    created++;
  }

  if (created || linked) {
    logger.info(`🖥️ Assets aus NinjaOne: ${created} neu, ${linked} verknüpft, ${updated} aktualisiert (Org ${organizationId})`);
  }
  return { created, linked, updated };
}

/** Einmaliger Abgleich aller NinjaOne-Bestaende beim Serverstart. */
export async function backfillAssetsFromNinja(): Promise<void> {
  try {
    const users = await query(`SELECT DISTINCT user_id FROM ninjarmm_devices`);
    for (const row of users.rows) {
      await syncAssetsFromNinja(row.user_id).catch(err =>
        logger.error('Asset-Backfill fehlgeschlagen:', err));
    }
  } catch (err) {
    logger.error('Asset-Backfill fehlgeschlagen:', err);
  }
}
