import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * processed_invoices SSOT-Erweiterung (Quelle, Extraktionsfelder, Volltextsuche)
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // Indexe für die (durch die Audit-Middleware wachsende) audit_logs
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(user_id, timestamp DESC)');

    // Migration: customer_interactions.type-CHECK um die Werte erweitern, die
    // das Frontend (InteractionsTimeline) tatsächlich anbietet — 'demo' und
    // 'support' etc. wurden bisher von der DB abgelehnt. Constraint neu
    // aufbauen als Union aus altem CHECK + Frontend-/API-Werten.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage
          WHERE table_name = 'customer_interactions' AND constraint_name = 'customer_interactions_type_check'
        ) THEN
          ALTER TABLE customer_interactions DROP CONSTRAINT customer_interactions_type_check;
        END IF;
        ALTER TABLE customer_interactions ADD CONSTRAINT customer_interactions_type_check
          CHECK(type IN ('call', 'email', 'meeting', 'note', 'ticket', 'quote', 'invoice',
                         'contract', 'visit', 'video_call', 'chat', 'task', 'support',
                         'sales', 'demo', 'followup', 'other'));
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'customer_interactions type check migration skipped: %', SQLERRM;
      END $$;
    `);

    // Migration: email_id nullable + partielle UNIQUE-Indexe. Der alte
    // UNIQUE(organization_id, email_id) blockiert sonst alle Manual-Upload-
    // und sevDesk-Sync-Rows (die haben email_id = NULL). Den Constraint dropen
    // und durch zwei partielle UNIQUE-Indexe ersetzen.
    await client.query(`
      DO $$
      DECLARE
        constraint_rec RECORD;
      BEGIN
        ALTER TABLE processed_invoices ALTER COLUMN email_id DROP NOT NULL;
        FOR constraint_rec IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'processed_invoices'::regclass
            AND contype = 'u'
            AND pg_get_constraintdef(oid) LIKE '%email_id%'
        LOOP
          EXECUTE 'ALTER TABLE processed_invoices DROP CONSTRAINT ' || quote_ident(constraint_rec.conname);
        END LOOP;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'email_id nullable migration skipped: %', SQLERRM;
      END $$;
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS processed_invoices_email_unique ON processed_invoices(organization_id, email_id) WHERE email_id IS NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS processed_invoices_sevdesk_voucher_unique ON processed_invoices(organization_id, sevdesk_voucher_id) WHERE sevdesk_voucher_id IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_processed_invoices_source ON processed_invoices(source)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_processed_invoices_invoice_date ON processed_invoices(invoice_date DESC)`);

    // Erweitere status-Check-Constraint um 'imported' (= sevDesk-Sync-Rows,
    // die nie durch den Inbox-Workflow gingen).
    // WICHTIG: Zuerst alle nicht-konformen Zeilen auf 'processed' setzen,
    // DANN die Constraint hinzufügen.
    await client.query(`
      DO $$
      BEGIN
        -- Step 1: Fix any non-compliant status values before adding constraint
        UPDATE processed_invoices
        SET status = 'processed'
        WHERE status IS NULL OR status NOT IN ('pending', 'draft', 'processed', 'failed', 'skipped', 'imported');

        -- Step 2: Drop old constraint if exists
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'processed_invoices_status_check'
          AND table_name = 'processed_invoices'
        ) THEN
          ALTER TABLE processed_invoices DROP CONSTRAINT processed_invoices_status_check;
        END IF;

        -- Step 3: Add new constraint with all status values
        ALTER TABLE processed_invoices
          ADD CONSTRAINT processed_invoices_status_check
          CHECK (status IN ('pending', 'draft', 'processed', 'failed', 'skipped', 'imported'));
      END $$;
    `);

    // Trigger neu definieren: zusaetzlich invoice_number, supplier_name und
    // sevdesk_voucher_number in den tsvector aufnehmen, damit FTS auch
    // direkt strukturierte Felder findet (z. B. "RE-2024-0815").
    await client.query(`
      CREATE OR REPLACE FUNCTION update_processed_invoices_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector := to_tsvector('german',
          COALESCE(NEW.email_subject, '') || ' ' ||
          COALESCE(NEW.sender_name, '') || ' ' ||
          COALESCE(NEW.sender_email, '') || ' ' ||
          COALESCE(NEW.invoice_number, '') || ' ' ||
          COALESCE(NEW.supplier_name, '') || ' ' ||
          COALESCE(NEW.sevdesk_voucher_number, '') || ' ' ||
          COALESCE(NEW.full_text, '')
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Vorhandene Rows neu durch den Trigger jagen, damit die neuen Felder
    // (auch wenn heute noch NULL) im search_vector landen sobald sie befuellt
    // werden. Ein no-op UPDATE reicht.
    await client.query(`UPDATE processed_invoices SET search_vector = search_vector WHERE FALSE`);

    logger.info('✅ processed_invoices SSOT-Erweiterung migriert');
}
