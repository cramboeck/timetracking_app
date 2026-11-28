import crypto from 'crypto';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { guessAssetType } from '../utils/assetTypeGuess';
import { ASSET_TYPES, logAssetEvent, nextAssetTag } from './assetService';

/**
 * WE-2 Wareneingang: Gelieferte Mengen je Bestellposition buchen und aus
 * gescannten Seriennummern direkt Geräte (Assets) anlegen — dem Kunden der
 * Bestellung zugeordnet, mit fortlaufender Asset-ID für das Etikett.
 *
 * Regeln:
 *  - Mengen werden nie über die bestellte Menge hinaus gebucht.
 *  - Eine Seriennummer, die es in der Organisation schon gibt, erzeugt KEIN
 *    zweites Gerät (wird als „bereits vorhanden“ zurückgemeldet).
 *  - Status geht nur vorwärts: vollständig geliefert → „received“.
 */

export interface ReceiveLineInput {
  lineId: string;
  quantity: number;
  serials?: string[];
  assetType?: string;
}

/** Artikel, die (noch) nicht als Position am Vorgang stehen — z.B. weil aus
 *  der Mail keine Positionen erkannt wurden. Werden als Position angelegt. */
export interface ReceiveExtraLineInput {
  description: string;
  quantity: number;
  serials?: string[];
  assetType?: string;
}

export interface ReceiveResult {
  status: string;
  complete: boolean;
  created: Array<{ id: string; assetTag: string | null; name: string; serialNumber: string; lineId: string }>;
  existing: Array<{ id: string; assetTag: string | null; name: string; serialNumber: string }>;
  received: Array<{ lineId: string; quantity: number }>;
}

export class GoodsReceiptError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const normalizeSerial = (s: string) => s.trim().replace(/\s+/g, ' ');

export async function receiveGoods(
  organizationId: string,
  userId: string,
  orderId: string,
  input: { lines: ReceiveLineInput[]; extraLines?: ReceiveExtraLineInput[]; complete?: boolean }
): Promise<ReceiveResult> {
  const o = await query(
    `SELECT id, status, order_number, supplier_name, to_char(order_date, 'YYYY-MM-DD') AS order_date,
            customer_id, ticket_id, is_internal
       FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
    [orderId, organizationId]
  );
  const order = o.rows[0];
  if (!order) throw new GoodsReceiptError('Bestellung nicht gefunden', 404);
  if (order.status === 'cancelled') throw new GoodsReceiptError('Die Bestellung ist storniert');

  const linesRes = await query(
    `SELECT id, description, quantity, received_quantity, item_type FROM purchase_order_lines WHERE order_id = $1`,
    [orderId]
  );
  const lineMap = new Map(linesRes.rows.map(l => [String(l.id), l]));

  // --- Prüfen, bevor irgendetwas geschrieben wird ---------------------------
  const seen = new Set<string>();
  const plan: Array<{ line: Record<string, unknown>; qty: number; serials: string[]; assetType: string }> = [];
  for (const item of input.lines) {
    const line = lineMap.get(item.lineId);
    if (!line) throw new GoodsReceiptError('Position gehört nicht zu dieser Bestellung');
    const ordered = line.quantity !== null ? Number(line.quantity) : null;
    const already = Number(line.received_quantity ?? 0);
    const remaining = ordered !== null ? Math.max(0, ordered - already) : Number.POSITIVE_INFINITY;
    const qty = Math.min(item.quantity, remaining);
    const serials = (item.serials ?? []).map(normalizeSerial).filter(Boolean);
    if (serials.length > Math.max(qty, 0)) {
      throw new GoodsReceiptError(`Mehr Seriennummern als gelieferte Stück bei „${String(line.description).slice(0, 60)}“`);
    }
    for (const s of serials) {
      const k = s.toLowerCase();
      if (seen.has(k)) throw new GoodsReceiptError(`Seriennummer ${s} ist doppelt erfasst`);
      seen.add(k);
    }
    const assetType = item.assetType && (ASSET_TYPES as readonly string[]).includes(item.assetType)
      ? item.assetType : guessAssetType(String(line.description));
    if (qty > 0 || serials.length > 0) plan.push({ line, qty, serials, assetType });
  }
  // Freie Artikel (ohne bestehende Position)
  const extras: typeof plan = [];
  for (const item of input.extraLines ?? []) {
    const description = item.description.trim();
    if (!description) throw new GoodsReceiptError('Bitte eine Bezeichnung für jeden Artikel angeben');
    const serials = (item.serials ?? []).map(normalizeSerial).filter(Boolean);
    const qty = Math.max(item.quantity, serials.length);
    if (qty <= 0) continue;
    for (const sn of serials) {
      const k = sn.toLowerCase();
      if (seen.has(k)) throw new GoodsReceiptError(`Seriennummer ${sn} ist doppelt erfasst`);
      seen.add(k);
    }
    const assetType = item.assetType && (ASSET_TYPES as readonly string[]).includes(item.assetType)
      ? item.assetType : guessAssetType(description);
    extras.push({ line: { id: null, description }, qty, serials, assetType });
  }
  if (plan.length === 0 && extras.length === 0 && !input.complete) throw new GoodsReceiptError('Nichts zu buchen — alle Positionen sind schon vollständig geliefert');

  // Bereits vorhandene Seriennummern (keine Dubletten anlegen)
  // Freie Artikel erst jetzt (nach allen Prüfungen) als Position anlegen
  if (extras.length > 0) {
    const pos = await query(`SELECT COALESCE(MAX(position), 0)::int AS p FROM purchase_order_lines WHERE order_id = $1`, [orderId]);
    let next = Number(pos.rows[0]?.p ?? 0);
    for (const e of extras) {
      const ins = await query(
        `INSERT INTO purchase_order_lines (order_id, position, description, quantity, item_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orderId, ++next, String(e.line.description).slice(0, 500), e.qty, e.serials.length > 0 ? 'hardware' : null]
      );
      e.line.id = ins.rows[0].id;
      plan.push(e);
    }
  }

  const allSerials = plan.flatMap(p => p.serials);
  const existingRes = allSerials.length
    ? await query(
        `SELECT id, asset_tag, name, serial_number FROM assets
          WHERE organization_id = $1 AND deleted_at IS NULL AND lower(serial_number) = ANY($2)`,
        [organizationId, allSerials.map(s => s.toLowerCase())]
      )
    : { rows: [] as Record<string, unknown>[] };
  const existingBySerial = new Map(existingRes.rows.map(r => [String(r.serial_number).toLowerCase(), r]));

  const result: ReceiveResult = { status: String(order.status), complete: false, created: [], existing: [], received: [] };
  const status = order.customer_id ? 'active' : 'stock';
  const purchaseDate = order.order_date ?? new Date().toISOString().slice(0, 10);
  const note = `Wareneingang${order.order_number ? ` Bestellung ${order.order_number}` : ''}${order.supplier_name ? ` (${order.supplier_name})` : ''}`;

  for (const p of plan) {
    const lineId = String(p.line.id);
    if (p.qty > 0) {
      await query(
        `UPDATE purchase_order_lines SET received_quantity = received_quantity + $2 WHERE id = $1`,
        [lineId, p.qty]
      );
      result.received.push({ lineId, quantity: p.qty });
    }
    for (const serial of p.serials) {
      const ex = existingBySerial.get(serial.toLowerCase());
      if (ex) {
        result.existing.push({ id: String(ex.id), assetTag: (ex.asset_tag as string) ?? null, name: String(ex.name), serialNumber: serial });
        continue;
      }
      const id = crypto.randomUUID();
      const name = String(p.line.description).slice(0, 200);
      const tag = await nextAssetTag(organizationId);
      await query(
        `INSERT INTO assets (id, organization_id, customer_id, asset_type, name, serial_number, status,
                             purchase_date, supplier, notes, purchase_order_line_id, created_by, asset_tag)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, organizationId, order.customer_id ?? null, p.assetType, name, serial, status,
          purchaseDate, order.supplier_name ?? null, note, lineId, userId, tag]
      );
      await logAssetEvent(organizationId, id, userId, 'from_purchase', { orderId, orderNumber: order.order_number ?? null, lineId });
      result.created.push({ id, assetTag: tag, name, serialNumber: serial, lineId });
    }
  }

  // Vollständig? (Positionen ohne bekannte Menge zählen, sobald etwas kam)
  const after = await query(
    `SELECT COUNT(*) FILTER (WHERE (quantity IS NOT NULL AND received_quantity < quantity)
                                OR (quantity IS NULL AND received_quantity <= 0))::int AS open,
            COUNT(*)::int AS total
       FROM purchase_order_lines WHERE order_id = $1`,
    [orderId]
  );
  const complete = input.complete === true || (Number(after.rows[0]?.total ?? 0) > 0 && Number(after.rows[0]?.open ?? 0) === 0);
  if (complete && order.status !== 'received') {
    await query(
      `UPDATE purchase_orders SET status = 'received', received_at = COALESCE(received_at, NOW()), updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    result.status = 'received';
  } else {
    await query(`UPDATE purchase_orders SET updated_at = NOW() WHERE id = $1`, [orderId]);
  }
  result.complete = complete;

  // Ticket-Verlauf: wer hat was angenommen
  if (order.ticket_id && (result.received.length > 0 || complete)) {
    const parts = plan.filter(p => p.qty > 0).map(p => {
      const serials = p.serials.length ? ` (SN ${p.serials.join(', ')})` : '';
      return `${p.qty}× ${String(p.line.description).slice(0, 80)}${serials}`;
    });
    const text = `Wareneingang${order.order_number ? ` ${order.order_number}` : ''}: ${parts.join('; ') || 'vollständig'}${complete ? ' — vollständig geliefert' : ' — Teillieferung'}`;
    try {
      await query(
        `INSERT INTO ticket_activities (id, ticket_id, user_id, action_type, new_value, metadata, created_at)
         VALUES ($5, $1, $2, 'order_update', $3, $4, NOW())`,
        [order.ticket_id, userId, text.slice(0, 1000),
          JSON.stringify({ orderId, goodsReceipt: true, assetIds: result.created.map(c => c.id) }), crypto.randomUUID()]
      );
    } catch (err) {
      logger.error('Wareneingang: Ticket-Aktivität fehlgeschlagen', err);
    }
  }

  return result;
}
