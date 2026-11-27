import { PoolClient } from 'pg';

/**
 * sevDesk liest `InvoicePos.price` je nach Kontoeinstellung als NETTO oder
 * BRUTTO. Wir merken uns pro Konfiguration, wie das Konto rechnet
 * ('net' | 'gross'); nach jeder Rechnung prüft der Server die Nettosumme in
 * sevDesk gegen und stellt den Wert bei Abweichung selbst um.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE sevdesk_config ADD COLUMN IF NOT EXISTS price_entry_mode TEXT NOT NULL DEFAULT 'net'`);
}
