import { PoolClient } from 'pg';

/**
 * Assetmanagement ohne NinjaOne-Pflicht (AS-1, 23.11.2026).
 *
 * `assets` ist die EINE Geraete-Wahrheit: manuell gepflegte Geraete
 * (Drucker, Firewall, NAS, Telefone …) UND automatisch aus NinjaOne
 * uebernommene. NinjaOne ist nur noch eine Quelle: `ninja_device_ref`
 * verweist auf ninjarmm_devices.id (lokale Cache-ID), die Live-Daten
 * (online/offline, Software, Patches) bleiben dort.
 *
 * source_line_item_id: Herkunft aus dem Rechnungseingang (Hardware-Kauf,
 * AS-3) — der Einkaufspreis bleibt in invoice_line_items und wird NIE an
 * das Portal ausgeliefert.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
      asset_type TEXT NOT NULL DEFAULT 'other',
      name TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      serial_number TEXT,
      inventory_number TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      location TEXT,
      assigned_to TEXT,
      purchase_date DATE,
      warranty_until DATE,
      supplier TEXT,
      ip_address TEXT,
      os_name TEXT,
      notes TEXT,
      ninja_device_ref TEXT,
      source_line_item_id TEXT,
      created_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_assets_org ON assets(organization_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_assets_customer ON assets(customer_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets(organization_id, lower(serial_number))`);
  // Ein NinjaOne-Geraet erscheint pro Organisation hoechstens EINMAL als Asset
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_ninja_ref
      ON assets(organization_id, ninja_device_ref)
      WHERE ninja_device_ref IS NOT NULL AND deleted_at IS NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_line_item
      ON assets(organization_id, source_line_item_id)
      WHERE source_line_item_id IS NOT NULL AND deleted_at IS NULL
  `);

  // Ticket ↔ Asset: tickets.device_id bleibt (NinjaOne-Verknuepfung, Altbestand),
  // asset_id ist die neue, quellenunabhaengige Verknuepfung.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'tickets' AND column_name = 'asset_id') THEN
        ALTER TABLE tickets ADD COLUMN asset_id TEXT;
      END IF;
    END $$;
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tickets_asset ON tickets(asset_id)`);
}
