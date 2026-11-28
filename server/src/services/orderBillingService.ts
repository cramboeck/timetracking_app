import { query } from '../config/database';
import { logger } from '../utils/logger';
import { extractTicketNumbers } from '../utils/orderMailParser';

/**
 * WE-3 Abrechnungs-Sicherung: Lieferantenrechnung ↔ Bestellvorgang.
 *
 * Eine Eingangsrechnung wird einem Vorgang zugeordnet (Bestell-Postfach:
 * direkt; Rechnungseingang: über Bestellnummer oder Ticketnummer im Text).
 * Ihre Positionen erben dann den Kunden der Bestellung — und tauchen damit
 * automatisch als Weiterberechnung im Rechnungsdialog des Kunden auf.
 * Eigenbedarf-Bestellungen werden als „intern“ markiert.
 */

/** Kunde/Eigenbedarf der Bestellung auf die (noch unzugeordneten) Positionen übertragen. */
export async function applyOrderToInvoiceItems(processedInvoiceId: string): Promise<number> {
  const r = await query(
    `SELECT o.customer_id, o.is_internal
       FROM processed_invoices pi JOIN purchase_orders o ON o.id = pi.purchase_order_id
      WHERE pi.id = $1 AND o.organization_id = pi.organization_id`,
    [processedInvoiceId]
  );
  const o = r.rows[0];
  if (!o) return 0;
  if (o.customer_id && !o.is_internal) {
    const u = await query(
      `UPDATE invoice_line_items
          SET customer_id = $2, match_method = 'purchase_order', match_confidence = 1.0, updated_at = NOW()
        WHERE processed_invoice_id = $1 AND customer_id IS NULL`,
      [processedInvoiceId, o.customer_id]
    );
    return u.rowCount ?? 0;
  }
  if (o.is_internal) {
    const u = await query(
      `UPDATE invoice_line_items SET rebilling_status = 'internal', updated_at = NOW()
        WHERE processed_invoice_id = $1 AND customer_id IS NULL AND rebilling_status = 'pending'`,
      [processedInvoiceId]
    );
    return u.rowCount ?? 0;
  }
  return 0;
}

export async function linkInvoiceToOrder(organizationId: string, processedInvoiceId: string, orderId: string): Promise<boolean> {
  const u = await query(
    `UPDATE processed_invoices SET purchase_order_id = $3
      WHERE id = $1 AND organization_id = $2
        AND EXISTS (SELECT 1 FROM purchase_orders o WHERE o.id = $3 AND o.organization_id = $2)`,
    [processedInvoiceId, organizationId, orderId]
  );
  if (!u.rowCount) return false;
  await applyOrderToInvoiceItems(processedInvoiceId);
  return true;
}

/** Rechnung aus dem Bestell-Postfach: per Mail-ID der passenden processed_invoice zuordnen. */
export async function linkInvoiceEmailToOrder(organizationId: string, emailId: string, orderId: string): Promise<void> {
  try {
    const r = await query(
      `SELECT id FROM processed_invoices WHERE organization_id = $1 AND email_id = $2 AND purchase_order_id IS NULL`,
      [organizationId, emailId]
    );
    if (r.rows[0]) await linkInvoiceToOrder(organizationId, String(r.rows[0].id), orderId);
  } catch (err) {
    logger.error('Rechnung ↔ Bestellung: Verknüpfung per Mail fehlgeschlagen', err);
  }
}

/**
 * Nach dem Auslesen einer Rechnung: Vorgang über Bestellnummer bzw.
 * Ticketnummer im Rechnungstext finden — nur bei EINDEUTIGEM Treffer.
 */
export async function autoLinkInvoice(processedInvoiceId: string): Promise<string | null> {
  try {
    const r = await query(
      `SELECT organization_id, purchase_order_id, full_text, email_subject FROM processed_invoices WHERE id = $1`,
      [processedInvoiceId]
    );
    const inv = r.rows[0];
    if (!inv) return null;
    if (inv.purchase_order_id) {
      await applyOrderToInvoiceItems(processedInvoiceId);
      return String(inv.purchase_order_id);
    }
    const text = `${inv.email_subject ?? ''}\n${inv.full_text ?? ''}`;
    if (!text.trim()) return null;

    const byNumber = await query(
      `SELECT id FROM purchase_orders
        WHERE organization_id = $1 AND status <> 'cancelled'
          AND order_number IS NOT NULL AND length(order_number) >= 5
          AND position(lower(order_number) IN lower($2)) > 0
        LIMIT 2`,
      [inv.organization_id, text]
    );
    let orderId: string | null = byNumber.rows.length === 1 ? String(byNumber.rows[0].id) : null;

    if (!orderId && byNumber.rows.length === 0) {
      const tickets = extractTicketNumbers(text);
      if (tickets.length > 0) {
        const byTicket = await query(
          `SELECT o.id FROM purchase_orders o JOIN tickets t ON t.id = o.ticket_id
            WHERE o.organization_id = $1 AND o.status <> 'cancelled' AND t.ticket_number = ANY($2)
              AND NOT EXISTS (SELECT 1 FROM processed_invoices pi WHERE pi.purchase_order_id = o.id)
            LIMIT 2`,
          [inv.organization_id, tickets]
        );
        if (byTicket.rows.length === 1) orderId = String(byTicket.rows[0].id);
      }
    }
    if (!orderId) return null;
    await linkInvoiceToOrder(String(inv.organization_id), processedInvoiceId, orderId);
    logger.info(`🧾 Rechnung ${processedInvoiceId} automatisch Bestellung ${orderId} zugeordnet`);
    return orderId;
  } catch (err) {
    logger.error('Rechnung ↔ Bestellung: automatische Zuordnung fehlgeschlagen', err);
    return null;
  }
}

export type BillingCheckState = 'no_invoice' | 'not_extracted' | 'pending';

export interface BillingCheckItem {
  orderId: string;
  orderNumber: string | null;
  supplierName: string | null;
  customerId: string;
  customerName: string | null;
  customerColor: string | null;
  customerLogoUrl: string | null;
  ticketId: string | null;
  ticketNumber: string | null;
  receivedAt: string | null;
  orderNet: number | null;
  state: BillingCheckState;
  invoiceCount: number;
  invoiceNet: number | null;
  pendingCount: number;
  pendingAmount: number;
  amountMismatch: boolean;
}

/**
 * Gelieferte Kunden-Bestellungen (letzte 180 Tage), die noch nicht
 * weiterberechnet sind: Lieferantenrechnung fehlt / nicht ausgelesen /
 * Positionen noch offen. Erledigt = alle Positionen berechnet, inklusive,
 * übersprungen oder manuell „ohne Rechnung erledigt“.
 */
export async function getBillingCheck(organizationId: string): Promise<BillingCheckItem[]> {
  const r = await query(
    `SELECT o.id, o.order_number, o.supplier_name, o.customer_id, o.ticket_id, o.received_at, o.net_amount,
            c.name AS customer_name, c.color AS customer_color, c.logo_url AS customer_logo_url,
            t.ticket_number,
            inv.invoice_count, inv.invoice_net,
            li.item_count, li.pending_count, li.pending_amount
       FROM purchase_orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN tickets t ON t.id = o.ticket_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS invoice_count, SUM(pi.net_amount) AS invoice_net
           FROM processed_invoices pi WHERE pi.purchase_order_id = o.id
       ) inv ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS item_count,
                COUNT(*) FILTER (WHERE li.rebilling_status = 'pending')::int AS pending_count,
                COALESCE(SUM(li.total_price) FILTER (WHERE li.rebilling_status = 'pending'), 0) AS pending_amount
           FROM invoice_line_items li JOIN processed_invoices pi ON pi.id = li.processed_invoice_id
          WHERE pi.purchase_order_id = o.id
       ) li ON true
      WHERE o.organization_id = $1 AND o.status = 'received' AND o.is_internal = false
        AND o.billing_cleared_at IS NULL
        AND COALESCE(o.received_at, o.updated_at) >= NOW() - INTERVAL '180 days'
        AND c.deleted_at IS NULL
      ORDER BY o.received_at DESC NULLS LAST
      LIMIT 100`,
    [organizationId]
  );
  const out: BillingCheckItem[] = [];
  for (const row of r.rows) {
    const invoiceCount = Number(row.invoice_count ?? 0);
    const itemCount = Number(row.item_count ?? 0);
    const pendingCount = Number(row.pending_count ?? 0);
    let state: BillingCheckState | null = null;
    if (invoiceCount === 0) state = 'no_invoice';
    else if (itemCount === 0) state = 'not_extracted';
    else if (pendingCount > 0) state = 'pending';
    if (!state) continue; // alles berechnet/inklusive/übersprungen
    const orderNet = row.net_amount !== null ? Number(row.net_amount) : null;
    const invoiceNet = row.invoice_net !== null ? Number(row.invoice_net) : null;
    const amountMismatch = orderNet !== null && invoiceNet !== null && orderNet > 0
      && Math.abs(orderNet - invoiceNet) > Math.max(1, orderNet * 0.02);
    out.push({
      orderId: String(row.id),
      orderNumber: row.order_number ?? null,
      supplierName: row.supplier_name ?? null,
      customerId: String(row.customer_id),
      customerName: row.customer_name ?? null,
      customerColor: row.customer_color ?? null,
      customerLogoUrl: row.customer_logo_url ?? null,
      ticketId: row.ticket_id ?? null,
      ticketNumber: row.ticket_number ?? null,
      receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at ? String(row.received_at) : null,
      orderNet,
      state,
      invoiceCount,
      invoiceNet,
      pendingCount,
      pendingAmount: Number(row.pending_amount ?? 0),
      amountMismatch,
    });
  }
  return out;
}
