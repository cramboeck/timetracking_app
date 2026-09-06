import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Schema-Sweep-Angleichung an Prod (21.8.) + tickets.customer_id nullable (interne Tickets)
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // ========================================================================
    // Schema-Sweep-Angleichung (21.08.2026): Objekte, die die Prod-DB längst
    // hat (von älteren Code-Versionen angelegt), die hier aber nie definiert
    // wurden — ohne sie scheitert jede Neu-Installation an den ersten
    // Requests. Auf Prod sind alle Statements No-ops (IF NOT EXISTS/guarded).
    // Referenz: docs/prod-schema-columns.md
    // ========================================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_activities (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        customer_contact_id TEXT,
        action_type TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket ON ticket_activities(ticket_id)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_categories (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_articles (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES kb_categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        slug TEXT,
        content TEXT,
        excerpt TEXT,
        is_published BOOLEAN DEFAULT false,
        is_featured BOOLEAN DEFAULT false,
        view_count INTEGER DEFAULT 0,
        helpful_yes INTEGER DEFAULT 0,
        helpful_no INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        published_at TIMESTAMP
      )
    `);

    await client.query(`
      DO $$
      BEGIN
        -- tickets: in Prod vorhandene Spalten (SLA-Duplikate, Merge,
        -- Zufriedenheit), die das CREATE hier nie kannte
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='satisfaction_rating') THEN
          ALTER TABLE tickets ADD COLUMN satisfaction_rating INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='satisfaction_feedback') THEN
          ALTER TABLE tickets ADD COLUMN satisfaction_feedback TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='sla_policy_id') THEN
          ALTER TABLE tickets ADD COLUMN sla_policy_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='first_response_due_at') THEN
          ALTER TABLE tickets ADD COLUMN first_response_due_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='resolution_due_at') THEN
          ALTER TABLE tickets ADD COLUMN resolution_due_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='sla_first_response_breached') THEN
          ALTER TABLE tickets ADD COLUMN sla_first_response_breached BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='merged_into_id') THEN
          ALTER TABLE tickets ADD COLUMN merged_into_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='assigned_to_user_id') THEN
          ALTER TABLE tickets ADD COLUMN assigned_to_user_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='email_subject') THEN
          ALTER TABLE tickets ADD COLUMN email_subject TEXT;
        END IF;

        -- customer_contacts: Portal-Berechtigungen + Login-Zeitpunkt + Push
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_contacts' AND column_name='can_create_tickets') THEN
          ALTER TABLE customer_contacts ADD COLUMN can_create_tickets BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_contacts' AND column_name='can_view_all_tickets') THEN
          ALTER TABLE customer_contacts ADD COLUMN can_view_all_tickets BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_contacts' AND column_name='last_login') THEN
          ALTER TABLE customer_contacts ADD COLUMN last_login TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_contacts' AND column_name='push_enabled') THEN
          ALTER TABLE customer_contacts ADD COLUMN push_enabled BOOLEAN DEFAULT true;
          ALTER TABLE customer_contacts ADD COLUMN push_on_ticket_reply BOOLEAN DEFAULT true;
          ALTER TABLE customer_contacts ADD COLUMN push_on_status_change BOOLEAN DEFAULT true;
        END IF;

        -- users / customers / activities / social_media_posts
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='has_ticket_access') THEN
          ALTER TABLE users ADD COLUMN has_ticket_access BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='customer_type') THEN
          ALTER TABLE customers ADD COLUMN customer_type TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='description') THEN
          ALTER TABLE activities ADD COLUMN description TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='pricing_type') THEN
          ALTER TABLE activities ADD COLUMN pricing_type TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='flat_rate') THEN
          ALTER TABLE activities ADD COLUMN flat_rate NUMERIC(10,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='social_media_posts' AND column_name='metadata') THEN
          ALTER TABLE social_media_posts ADD COLUMN metadata JSONB;
        END IF;
      END $$;
    `);
    logger.info('✅ Schema-Sweep-Angleichung (Prod-Parität) ready');

    // Interne Tickets (customer_id NULL): die gewachsene Prod-Tabelle trägt
    // noch NOT NULL auf tickets.customer_id — der Interne-Tickets-Sprint
    // (8dfc505) lieferte die Migration nicht mit, dadurch schlug JEDES
    // interne Ticket in Prod mit einem NOT-NULL-Verstoß fehl (500).
    // Frische Installationen sind bereits nullable (CREATE TABLE oben).
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tickets' AND column_name='customer_id' AND is_nullable='NO'
        ) THEN
          ALTER TABLE tickets ALTER COLUMN customer_id DROP NOT NULL;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='tickets' AND column_name='project_id' AND is_nullable='NO'
        ) THEN
          ALTER TABLE tickets ALTER COLUMN project_id DROP NOT NULL;
        END IF;
      END $$;
    `);
    logger.info('✅ tickets.customer_id nullable (interne Tickets) ready');
}
