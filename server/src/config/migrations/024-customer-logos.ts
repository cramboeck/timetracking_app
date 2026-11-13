import { PoolClient } from 'pg';

/**
 * CRM-Politur „Kundenliste" (13.11.2026): echte Firmenlogos statt
 * Vollton-Farbquadrate. logo_url = relativer Serving-Pfad
 * (/api/uploads/customer-logos/…), logo_fetched_at = letzter
 * Favicon-Abrufversuch (auch bei Fehlschlag gesetzt — kein Retry-Sturm,
 * gleiches Muster wie geocoded_at).
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'logo_url') THEN
        ALTER TABLE customers ADD COLUMN logo_url TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'logo_fetched_at') THEN
        ALTER TABLE customers ADD COLUMN logo_fetched_at TIMESTAMP;
      END IF;
    END $$;
  `);
}
