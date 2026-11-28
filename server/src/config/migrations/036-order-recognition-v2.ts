import { PoolClient } from 'pg';

/**
 * Bestellerkennung v2 (28.11.2026):
 *  - purchase_orders.alt_numbers: ALLE Nummern eines Vorgangs (normalisiert) —
 *    Lieferanten nennen Auftrags-, Bestell- und Belegnummern; jede führt zum
 *    selben Vorgang (vorher: je Nummer ein eigener Vorgang)
 *  - purchase_orders.supplier_key: Absender-Domain (Zusammenführen ohne Nummer)
 *  - purchase_orders.lines_source: aus welcher Mailart die Positionen stammen
 *  - purchase_order_messages.body_text/forwarded: Mailtext für erneutes Auslesen
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS alt_numbers TEXT[] NOT NULL DEFAULT '{}'`);
  await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_key TEXT`);
  await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS lines_source TEXT`);
  await client.query(`ALTER TABLE purchase_order_messages ADD COLUMN IF NOT EXISTS body_text TEXT`);
  await client.query(`ALTER TABLE purchase_order_messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN NOT NULL DEFAULT false`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_alt_numbers ON purchase_orders USING GIN (alt_numbers)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_key ON purchase_orders(organization_id, supplier_key)`);
  // Bestand: Hauptnummer in alt_numbers übernehmen (idempotent)
  await client.query(`
    UPDATE purchase_orders
       SET alt_numbers = ARRAY[regexp_replace(upper(order_number), '[^A-Z0-9]', '', 'g')]
     WHERE order_number IS NOT NULL AND cardinality(alt_numbers) = 0
  `);
}
