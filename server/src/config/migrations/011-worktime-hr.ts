import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Arbeitszeiterfassung: work_sessions, absence_requests, invoice_line_items item_type, Device-Health-Zaehler, time_entry_changes
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // Migration: processed_at nullable machen. revertToDraft setzt beim
    // Zurücksetzen auf Entwurf processed_at = NULL — mit dem NOT-NULL-
    // Constraint aus dem CREATE TABLE schlug das Zurücksetzen immer fehl.
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE processed_invoices ALTER COLUMN processed_at DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'processed_at DROP NOT NULL skipped: %', SQLERRM;
      END $$;
    `);

    // Arbeitszeiterfassung (Kommen/Gehen/Pausen) — getrennt von time_entries:
    // time_entries = Projekt-/Tätigkeitszeit, work_sessions = gesetzliche
    // Arbeitszeit (ArbZG/EuGH: Beginn, Ende, Pausen pro Tag). Eine Row pro
    // Kommen…Gehen-Block; mehrere Blöcke pro Tag möglich. Eine laufende Pause
    // wird über break_started_at abgebildet und beim Fortsetzen/Ausstempeln
    // in break_seconds aufsummiert.
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_sessions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        started_at TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        break_seconds INTEGER NOT NULL DEFAULT 0,
        break_started_at TIMESTAMP,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_work_sessions_user_date ON work_sessions(user_id, work_date DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_work_sessions_org_date ON work_sessions(organization_id, work_date DESC)');
    // Pro User maximal EINE offene Session (ended_at IS NULL)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_work_sessions_one_open
      ON work_sessions(user_id) WHERE ended_at IS NULL
    `);
    // Soll-Wochenstunden für das Arbeitszeitkonto (Mein Bereich)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='weekly_hours') THEN
          ALTER TABLE users ADD COLUMN weekly_hours NUMERIC(4,1) DEFAULT 40;
        END IF;
      END $$;
    `);
    logger.info('✅ work_sessions (Arbeitszeiterfassung) ready');

    // Urlaubsanträge mit Genehmigungsworkflow (Mein Bereich, V3 Phase 2).
    // Genehmigte Anträge erzeugen automatisch time_entries-Abwesenheits-
    // Einträge (entry_scope='absence') für jeden Werktag im Zeitraum.
    await client.query(`
      CREATE TABLE IF NOT EXISTS absence_requests (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK(category IN ('vacation', 'sick', 'special_leave')),
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
        decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        decided_at TIMESTAMP,
        decision_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CHECK (end_date >= start_date)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_absence_requests_user ON absence_requests(user_id, start_date DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_absence_requests_org_status ON absence_requests(organization_id, status)');
    logger.info('✅ absence_requests (Urlaubsanträge) ready');

    // Positions-Klassifizierung: item_type (Lizenz/Abo/Hardware/Dienstleistung)
    // + rebilling_status 'internal' für interne Ausgaben/Bestellungen ohne
    // Endkunden-Bezug. Der alte CHECK kannte 'internal' nicht.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoice_line_items')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_items' AND column_name='item_type') THEN
          ALTER TABLE invoice_line_items ADD COLUMN item_type TEXT CHECK(item_type IN ('license', 'subscription', 'hardware', 'service', 'other'));
        END IF;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage
          WHERE table_name = 'invoice_line_items' AND constraint_name = 'invoice_line_items_rebilling_status_check'
        ) THEN
          ALTER TABLE invoice_line_items DROP CONSTRAINT invoice_line_items_rebilling_status_check;
        END IF;
        ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_rebilling_status_check
          CHECK(rebilling_status IN ('pending', 'included', 'billed', 'skipped', 'internal'));
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'invoice_line_items rebilling_status check migration skipped: %', SQLERRM;
      END $$;
    `);
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='invoice_line_items') THEN
          CREATE INDEX IF NOT EXISTS idx_line_items_type ON invoice_line_items(item_type);
        END IF;
      END $$;
    `);
    logger.info('✅ invoice_line_items item_type/internal ready');

    // NinjaRMM device-health Aggregatzähler (einzige per Public-API lesbare
    // Vulnerability-Information — CVE-Details gibt die API nicht her, siehe
    // Limitierungs-Box in CLAUDE.md)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ninjarmm_devices' AND column_name='critical_vuln_count') THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN critical_vuln_count INTEGER;
          ALTER TABLE ninjarmm_devices ADD COLUMN high_vuln_count INTEGER;
          ALTER TABLE ninjarmm_devices ADD COLUMN medium_vuln_count INTEGER;
          ALTER TABLE ninjarmm_devices ADD COLUMN low_vuln_count INTEGER;
          ALTER TABLE ninjarmm_devices ADD COLUMN health_status TEXT;
          ALTER TABLE ninjarmm_devices ADD COLUMN health_synced_at TIMESTAMP;
        END IF;
      END $$;
    `);
    logger.info('✅ ninjarmm_devices health counts ready');

    // Nachtrags-Protokoll: jede Anlage/Änderung/Löschung von Zeiteinträgen,
    // deren Datum in einem abgeschlossenen (vergangenen) Monat liegt, wird
    // hier mit Vorher/Nachher-Snapshot festgehalten und den Org-Admins per
    // E-Mail gemeldet. entry_id bewusst ohne FK — der Eintrag kann gelöscht
    // sein, das Protokoll bleibt.
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_entry_changes (
        id TEXT PRIMARY KEY,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        entry_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
        entry_date DATE,
        before_data JSONB,
        after_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entry_changes_org_time ON time_entry_changes(organization_id, created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entry_changes_user ON time_entry_changes(user_id, created_at DESC)');
    logger.info('✅ time_entry_changes ready');
}
