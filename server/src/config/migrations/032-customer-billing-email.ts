import { PoolClient } from 'pg';

/** Eigene Rechnungs-E-Mail pro Kunde (z.B. buchhaltung@kunde.de) — hat beim
 *  Rechnung-Erstellen Vorrang vor der allgemeinen Kunden-E-Mail. */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_email TEXT`);
}
