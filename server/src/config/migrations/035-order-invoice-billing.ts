import { PoolClient } from 'pg';

/**
 * WE-3 Abrechnungs-Sicherung (28.11.2026):
 *  - processed_invoices.purchase_order_id: Lieferantenrechnung ↔ Bestellvorgang
 *  - purchase_orders.billing_cleared_*: „ohne Weiterberechnung erledigt“
 *  - match_method erlaubt 'purchase_order' (Kunde aus der Bestellung) und die
 *    Werte, die der CustomerMatchingService schon immer schreibt
 *    (customer_number/distributor_id/fuzzy) — die scheiterten bisher am CHECK.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE processed_invoices ADD COLUMN IF NOT EXISTS purchase_order_id TEXT`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_processed_invoices_po ON processed_invoices(purchase_order_id) WHERE purchase_order_id IS NOT NULL`);
  await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS billing_cleared_at TIMESTAMP`);
  await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS billing_cleared_by TEXT`);
  await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS billing_note TEXT`);
  await client.query(`ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_match_method_check`);
  await client.query(`
    ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_match_method_check
      CHECK (match_method IN (
        'exact_name', 'fuzzy_name', 'fuzzy', 'domain', 'alias', 'distributor_number', 'distributor_id',
        'customer_number', 'manual', 'unmatched', 'purchase_order'
      ))
  `);
}
