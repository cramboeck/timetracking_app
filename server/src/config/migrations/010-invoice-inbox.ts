import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Rechnungseingang: processed_invoices/invoice_documents, Status-Constraint, Infinigate, Zahlstatus + Lieferanten-Gedaechtnis
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // Processed Invoices table - tracks emails processed from invoice mailbox
    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_invoices (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email_id TEXT NOT NULL,
        email_subject TEXT,
        sender_email TEXT,
        sender_name TEXT,
        received_at TIMESTAMP,
        attachment_count INTEGER DEFAULT 0,
        document_ids JSONB DEFAULT '[]',
        vendor_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'draft', 'processed', 'failed', 'skipped')),
        error_message TEXT,
        processed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, email_id)
      )
    `);

    // Invoice Documents table - stores attachments from processed emails
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_documents (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        processed_invoice_id TEXT REFERENCES processed_invoices(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/pdf',
        size INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes for invoice processing tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_invoices_org ON processed_invoices(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_invoices_status ON processed_invoices(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_invoices_vendor ON processed_invoices(vendor_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_invoices_received ON processed_invoices(received_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_documents_org ON invoice_documents(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_documents_invoice ON invoice_documents(processed_invoice_id)');

    // Migration: Add full-text-search columns to processed_invoices.
    // full_text = concatenated PDF-extracted text + structured extraction fields,
    // populated by invoiceProcessorService when an invoice is parsed.
    // search_vector = auto-derived German tsvector via trigger.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'processed_invoices' AND column_name = 'full_text'
        ) THEN
          ALTER TABLE processed_invoices ADD COLUMN full_text TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'processed_invoices' AND column_name = 'search_vector'
        ) THEN
          ALTER TABLE processed_invoices ADD COLUMN search_vector TSVECTOR;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION update_processed_invoices_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector := to_tsvector('german',
          COALESCE(NEW.email_subject, '') || ' ' ||
          COALESCE(NEW.sender_name, '') || ' ' ||
          COALESCE(NEW.sender_email, '') || ' ' ||
          COALESCE(NEW.full_text, '')
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_processed_invoices_search_vector') THEN
          CREATE TRIGGER trigger_processed_invoices_search_vector
          BEFORE INSERT OR UPDATE ON processed_invoices
          FOR EACH ROW EXECUTE FUNCTION update_processed_invoices_search_vector();
        END IF;
      END $$;
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_processed_invoices_search ON processed_invoices USING GIN(search_vector)');

    logger.info('✅ Invoice processing tables created');

    // Migration: Update processed_invoices status check constraint to include 'draft'
    await client.query(`
      DO $$
      BEGIN
        -- Step 1: Fix any non-compliant status values before adding constraint
        UPDATE processed_invoices
        SET status = 'processed'
        WHERE status IS NULL OR status NOT IN ('pending', 'draft', 'processed', 'failed', 'skipped');

        -- Step 2: Drop old constraint if it exists
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'processed_invoices_status_check'
          AND table_name = 'processed_invoices'
        ) THEN
          ALTER TABLE processed_invoices DROP CONSTRAINT processed_invoices_status_check;
        END IF;
        -- Step 3: Add new constraint with all status values including 'draft'
        ALTER TABLE processed_invoices
          ADD CONSTRAINT processed_invoices_status_check
          CHECK (status IN ('pending', 'draft', 'processed', 'failed', 'skipped'));
      EXCEPTION
        WHEN duplicate_object THEN
          -- Constraint already exists with correct definition
          NULL;
      END $$;
    `);
    logger.info('✅ processed_invoices status constraint updated');

    // Migration: Add sevdesk_voucher_id to processed_invoices for linking to sevDesk vouchers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'processed_invoices' AND column_name = 'sevdesk_voucher_id'
        ) THEN
          ALTER TABLE processed_invoices ADD COLUMN sevdesk_voucher_id TEXT;
        END IF;
      END $$;
    `);

    // Migration: SSOT-Erweiterung von processed_invoices.
    // Belege haben jetzt drei moegliche Quellen (E-Mail, Manual-Upload, sevDesk-
    // Sync) und Extraktionsergebnisse werden strukturiert persistiert. Vorher
    // landete nur full_text in der DB, der Rest war fluechtig.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='source') THEN
          ALTER TABLE processed_invoices ADD COLUMN source TEXT NOT NULL DEFAULT 'email';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='original_filename') THEN
          ALTER TABLE processed_invoices ADD COLUMN original_filename TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='sevdesk_voucher_number') THEN
          ALTER TABLE processed_invoices ADD COLUMN sevdesk_voucher_number TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='invoice_number') THEN
          ALTER TABLE processed_invoices ADD COLUMN invoice_number TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='supplier_name') THEN
          ALTER TABLE processed_invoices ADD COLUMN supplier_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='supplier_address') THEN
          ALTER TABLE processed_invoices ADD COLUMN supplier_address TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='supplier_tax_id') THEN
          ALTER TABLE processed_invoices ADD COLUMN supplier_tax_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='invoice_date') THEN
          ALTER TABLE processed_invoices ADD COLUMN invoice_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='due_date') THEN
          ALTER TABLE processed_invoices ADD COLUMN due_date DATE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='net_amount') THEN
          ALTER TABLE processed_invoices ADD COLUMN net_amount NUMERIC(12,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='gross_amount') THEN
          ALTER TABLE processed_invoices ADD COLUMN gross_amount NUMERIC(12,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='vat_amount') THEN
          ALTER TABLE processed_invoices ADD COLUMN vat_amount NUMERIC(12,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='vat_rate') THEN
          ALTER TABLE processed_invoices ADD COLUMN vat_rate NUMERIC(5,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='currency') THEN
          ALTER TABLE processed_invoices ADD COLUMN currency TEXT DEFAULT 'EUR';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='iban') THEN
          ALTER TABLE processed_invoices ADD COLUMN iban TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='bic') THEN
          ALTER TABLE processed_invoices ADD COLUMN bic TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='payment_method') THEN
          ALTER TABLE processed_invoices ADD COLUMN payment_method TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='customer_number') THEN
          ALTER TABLE processed_invoices ADD COLUMN customer_number TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='extracted_at') THEN
          ALTER TABLE processed_invoices ADD COLUMN extracted_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='extraction_confidence') THEN
          ALTER TABLE processed_invoices ADD COLUMN extraction_confidence NUMERIC(3,2);
        END IF;
      END $$;
    `);

    // Infinigate-Integration: Config-Tabelle (per-User wie sevdesk_config),
    // Dedup-Spalte für per API importierte Rechnungen und Lizenzfelder auf
    // den Positionen (contractInformationDto der Infinigate-API).
    await client.query(`
      CREATE TABLE IF NOT EXISTS infinigate_config (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT,
        client_secret TEXT,
        api_key TEXT,
        environment TEXT NOT NULL DEFAULT 'production' CHECK(environment IN ('production', 'test')),
        auto_sync BOOLEAN DEFAULT FALSE,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='infinigate_document_guid') THEN
          ALTER TABLE processed_invoices ADD COLUMN infinigate_document_guid TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoice_line_items')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_items' AND column_name='license_id') THEN
          ALTER TABLE invoice_line_items ADD COLUMN license_id TEXT;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoice_line_items')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_items' AND column_name='serial_number') THEN
          ALTER TABLE invoice_line_items ADD COLUMN serial_number TEXT;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_invoices_infinigate_guid
      ON processed_invoices(organization_id, infinigate_document_guid)
      WHERE infinigate_document_guid IS NOT NULL
    `);
    logger.info('✅ Infinigate integration tables/columns ready');

    // Rechnungseingang Teil 2: Zahlstatus aus sevDesk (Fälligkeits-Radar
    // soll bezahlte Belege nicht anmahnen) + Lieferanten-Gedächtnis
    // (supplier → sevDesk-Kontakt beim Bestätigen merken)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='payment_status') THEN
          ALTER TABLE processed_invoices ADD COLUMN payment_status TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='processed_invoices' AND column_name='paid_at') THEN
          ALTER TABLE processed_invoices ADD COLUMN paid_at TIMESTAMP;
        END IF;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_sevdesk_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        supplier_key TEXT NOT NULL,
        sevdesk_contact_id TEXT NOT NULL,
        sevdesk_contact_name TEXT,
        last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, supplier_key)
      )
    `);
    logger.info('✅ Invoice payment status + supplier contact memory ready');
}
