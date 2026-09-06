import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Clockodo-Import + Microsoft-365-Konfiguration
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // Add is_billable column to time_entries (defaults to true for backward compatibility)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'is_billable'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN is_billable BOOLEAN DEFAULT TRUE;
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(is_billable)');

    // Migration: Add external_id and external_source columns for import tracking (prevents duplicates)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'external_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN external_id TEXT;
          ALTER TABLE time_entries ADD COLUMN external_source TEXT;
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_external ON time_entries(organization_id, external_source, external_id)');

    // ============================================
    // Sprint A: Internal Time Tracking & Customer Visibility
    // ============================================
    // entry_scope: 'customer_project' (default), 'internal', 'absence'
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'entry_scope'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN entry_scope TEXT NOT NULL DEFAULT 'customer_project';
          ALTER TABLE time_entries ADD CONSTRAINT chk_entry_scope CHECK (entry_scope IN ('customer_project', 'internal', 'absence'));
        END IF;
      END $$;
    `);

    // internal_category: Admin, Vertrieb, Marketing, Weiterbildung, Meeting, Interner Support, Reise
    // For absence: Urlaub, Krankheit, Sonderurlaub
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'internal_category'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN internal_category TEXT;
        END IF;
      END $$;
    `);

    // customer_visibility: 'hidden' (default), 'summary', 'detailed'
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'customer_visibility'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN customer_visibility TEXT NOT NULL DEFAULT 'hidden';
          ALTER TABLE time_entries ADD CONSTRAINT chk_customer_visibility CHECK (customer_visibility IN ('hidden', 'summary', 'detailed'));
        END IF;
      END $$;
    `);

    // Drop NOT NULL constraint from project_id (internal/absence entries don't have a project)
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE time_entries ALTER COLUMN project_id DROP NOT NULL;
      EXCEPTION
        WHEN others THEN NULL; -- Constraint might already be dropped or column might not exist
      END $$;
    `);

    // Indexes for Sprint A queries
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_scope ON time_entries(user_id, entry_scope, start_time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_visibility ON time_entries(project_id, customer_visibility)');

    // Migration: Add default_project_id to customers (fallback for imports)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'default_project_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN default_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ============================================
    // Clockodo Integration
    // ============================================

    // Clockodo configuration per user
    await client.query(`
      CREATE TABLE IF NOT EXISTS clockodo_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        api_email TEXT,
        api_key TEXT,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_clockodo_config_user ON clockodo_config(user_id)');

    logger.info('✅ Clockodo Integration tables created');

    // ============================================
    // Microsoft 365 Integration
    // ============================================

    // Microsoft 365 configuration per organization
    await client.query(`
      CREATE TABLE IF NOT EXISTS microsoft365_config (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        tenant_id TEXT,
        client_id TEXT,
        client_secret TEXT,
        mail_from TEXT,
        support_mailbox TEXT,
        invoice_mailbox TEXT,
        is_configured BOOLEAN DEFAULT FALSE,
        last_connection_test TIMESTAMP,
        last_connection_status TEXT,
        features_enabled JSONB DEFAULT '{"email": false, "inbox_monitoring": false, "calendar": false}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_microsoft365_config_org ON microsoft365_config(organization_id)');

    // Migration: Add invoice_mailbox if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'microsoft365_config' AND column_name = 'invoice_mailbox'
        ) THEN
          ALTER TABLE microsoft365_config ADD COLUMN invoice_mailbox TEXT;
        END IF;
      END $$
    `);

    logger.info('✅ Microsoft 365 Integration tables created');
}
