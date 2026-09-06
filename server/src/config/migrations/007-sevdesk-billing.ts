import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * sevDesk-Integration + Invoice-Exports (Abrechnung)
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // Add FK from customer_interactions to contracts (contracts created after interactions)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_customer_interactions_contract'
        ) THEN
          ALTER TABLE customer_interactions
            ADD CONSTRAINT fk_customer_interactions_contract
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ============================================
    // sevDesk Integration
    // ============================================

    // sevDesk configuration per user
    await client.query(`
      CREATE TABLE IF NOT EXISTS sevdesk_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        api_token TEXT,
        default_hourly_rate DECIMAL(10, 2) DEFAULT 95.00,
        payment_terms_days INTEGER DEFAULT 14,
        tax_rate DECIMAL(5, 2) DEFAULT 19.00,
        auto_sync_customers BOOLEAN DEFAULT FALSE,
        create_as_final BOOLEAN DEFAULT FALSE,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    // sevDesk synced documents (invoices & quotes for search)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sevdesk_documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sevdesk_id TEXT NOT NULL,
        document_type TEXT NOT NULL CHECK(document_type IN ('invoice', 'quote')),
        document_number TEXT,
        contact_id TEXT,
        contact_name TEXT,
        document_date TIMESTAMP,
        status INTEGER,
        status_name TEXT,
        header TEXT,
        head_text TEXT,
        foot_text TEXT,
        sum_net DECIMAL(12, 2),
        sum_gross DECIMAL(12, 2),
        sum_tax DECIMAL(12, 2),
        currency TEXT DEFAULT 'EUR',
        positions_json JSONB DEFAULT '[]',
        full_text TEXT,
        search_vector TSVECTOR,
        synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, sevdesk_id, document_type)
      )
    `);

    // Create search vector trigger for sevdesk_documents
    await client.query(`
      CREATE OR REPLACE FUNCTION update_sevdesk_documents_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector := to_tsvector('german',
          COALESCE(NEW.document_number, '') || ' ' ||
          COALESCE(NEW.contact_name, '') || ' ' ||
          COALESCE(NEW.header, '') || ' ' ||
          COALESCE(NEW.full_text, '')
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_sevdesk_documents_search_vector') THEN
          CREATE TRIGGER trigger_sevdesk_documents_search_vector
          BEFORE INSERT OR UPDATE ON sevdesk_documents
          FOR EACH ROW EXECUTE FUNCTION update_sevdesk_documents_search_vector();
        END IF;
      END $$;
    `);

    // Migration: Add sevdesk_customer_id to customers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'sevdesk_customer_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN sevdesk_customer_id TEXT;
        END IF;
      END $$;
    `);

    // Migration: Add sevdesk_position_template + default_contract_id to customers.
    // Allows per-customer free-text template (with {placeholders}) that gets
    // appended to every invoice position's `text`-field on sevdesk push.
    // default_contract_id is the source for {contractNumber}/{contractTitle}.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'sevdesk_position_template'
        ) THEN
          ALTER TABLE customers ADD COLUMN sevdesk_position_template TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'default_contract_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN default_contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Migration: Add hourly_rate to customers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'hourly_rate'
        ) THEN
          ALTER TABLE customers ADD COLUMN hourly_rate DECIMAL(10, 2);
        END IF;
      END $$;
    `);

    // Create indexes for sevDesk tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_config_user ON sevdesk_config(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_user ON sevdesk_documents(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_type ON sevdesk_documents(document_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_contact ON sevdesk_documents(contact_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_search ON sevdesk_documents USING GIN(search_vector)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_sevdesk ON customers(sevdesk_customer_id)');

    logger.info('✅ sevDesk Integration tables created');

    // ============================================
    // Invoice Export System (for Billing/Finanzen)
    // ============================================

    // Invoice exports table - tracks billing exports
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_exports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        sevdesk_invoice_id TEXT,
        sevdesk_invoice_number TEXT,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_hours DECIMAL(10, 2) NOT NULL,
        total_amount DECIMAL(12, 2) NOT NULL,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'cancelled')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: Add invoice_export_id to time_entries if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'invoice_export_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN invoice_export_id TEXT REFERENCES invoice_exports(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Create indexes for invoice_exports
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_exports_user ON invoice_exports(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_exports_customer ON invoice_exports(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_exports_period ON invoice_exports(period_start, period_end)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_export ON time_entries(invoice_export_id)');

    logger.info('✅ Invoice Export tables created');
}
