import { PoolClient } from 'pg';

/**
 * Assetmanagement professionell (AS-4…7, 26.11.2026):
 * - asset_tag: sprechende Inventarnummer (Präfix + laufende Nummer je Org),
 *   asset_tag_sequences hält Präfix + nächste Nummer
 * - label_token: zufälliger, nicht erratbarer Schlüssel für den QR-Link auf
 *   dem Etikett (/l/<token>) — wird erst beim Etikettendruck erzeugt
 * - last_seen_*: Inventur („zuletzt gesehen")
 * - asset_inventories/_items: Inventurläufe pro Kunde
 * - asset_events: Änderungsverlauf
 * - asset_attachments: Fotos/Belege am Gerät (nur authentifiziert abrufbar)
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'asset_tag') THEN
        ALTER TABLE assets ADD COLUMN asset_tag TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'label_token') THEN
        ALTER TABLE assets ADD COLUMN label_token TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_seen_at') THEN
        ALTER TABLE assets ADD COLUMN last_seen_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_seen_by') THEN
        ALTER TABLE assets ADD COLUMN last_seen_by TEXT;
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_tag
      ON assets(organization_id, asset_tag) WHERE asset_tag IS NOT NULL AND deleted_at IS NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_label_token
      ON assets(label_token) WHERE label_token IS NOT NULL
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS asset_tag_sequences (
      organization_id TEXT PRIMARY KEY,
      prefix TEXT NOT NULL DEFAULT 'IT',
      next_value INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Bestandsgeräte ohne Inventarnummer nummerieren (je Org nach Anlagedatum)
  await client.query(`
    INSERT INTO asset_tag_sequences (organization_id)
    SELECT DISTINCT organization_id FROM assets
    ON CONFLICT (organization_id) DO NOTHING
  `);
  await client.query(`
    WITH numbered AS (
      SELECT a.id, a.organization_id,
             s.next_value - 1 + ROW_NUMBER() OVER (PARTITION BY a.organization_id ORDER BY a.created_at, a.id) AS n,
             s.prefix
        FROM assets a
        JOIN asset_tag_sequences s ON s.organization_id = a.organization_id
       WHERE a.asset_tag IS NULL
    )
    UPDATE assets a
       SET asset_tag = numbered.prefix || '-' || LPAD(numbered.n::text, 5, '0')
      FROM numbered
     WHERE a.id = numbered.id
  `);
  await client.query(`
    UPDATE asset_tag_sequences s
       SET next_value = GREATEST(s.next_value, COALESCE((
             SELECT MAX(NULLIF(regexp_replace(a.asset_tag, '^.*-', ''), '')::int) + 1
               FROM assets a
              WHERE a.organization_id = s.organization_id
                AND a.asset_tag ~ ('^' || s.prefix || '-[0-9]+$')), 1))
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS asset_inventories (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      customer_id TEXT,
      title TEXT,
      started_by TEXT,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_asset_inventories_org ON asset_inventories(organization_id)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS asset_inventory_items (
      inventory_id TEXT NOT NULL REFERENCES asset_inventories(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL,
      seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
      seen_by TEXT,
      PRIMARY KEY (inventory_id, asset_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS asset_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      user_id TEXT,
      event_type TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_asset_events_asset ON asset_events(asset_id, created_at DESC)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS asset_attachments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_asset_attachments_asset ON asset_attachments(asset_id)`);
}
