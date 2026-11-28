import { PoolClient } from 'pg';

/** WE-2 Wareneingang: Geräte, die beim Wareneingang aus einer Bestellposition
 *  entstehen, merken sich ihre Herkunft (Nachdruck, Abgleich, WE-3). */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_order_line_id TEXT`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_assets_po_line ON assets(purchase_order_line_id) WHERE purchase_order_line_id IS NOT NULL`);
}
