import { PoolClient } from 'pg';

/**
 * CRM-4 „Kunden-Dialog professionalisieren" (Flow-Review CRM, 11/2026):
 * customers hatte weder Telefon noch Website, und die Adresse war ein
 * einziger Freitext-Blob — die Kontaktdaten-Karte im CustomerHub konnte
 * deshalb fast nichts anzeigen, und das Nominatim-Geocoding (GPS-Stempelung)
 * musste den Blob parsen. Neue nullable Spalten; das alte address-Feld
 * bleibt als Legacy-Fallback erhalten (Rückwärtskompatibilität, Regel 12).
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'phone') THEN
        ALTER TABLE customers ADD COLUMN phone TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'website') THEN
        ALTER TABLE customers ADD COLUMN website TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'address_street') THEN
        ALTER TABLE customers ADD COLUMN address_street TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'address_zip') THEN
        ALTER TABLE customers ADD COLUMN address_zip TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'customers' AND column_name = 'address_city') THEN
        ALTER TABLE customers ADD COLUMN address_city TEXT;
      END IF;
    END $$;
  `);
}
