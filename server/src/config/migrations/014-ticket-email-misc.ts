import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Ticket-E-Mail-Integration, NinjaRMM-Alert-Timestamps, E-Mail-Logs, Kunden-Domains, Portal-Settings, Report-Approval-Reminder
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // ============================================
    // Ticket Email Integration
    // ============================================

    // Add email tracking fields to tickets table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'email_conversation_id'
        ) THEN
          ALTER TABLE tickets ADD COLUMN email_conversation_id TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'email_from'
        ) THEN
          ALTER TABLE tickets ADD COLUMN email_from TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'email_subject'
        ) THEN
          ALTER TABLE tickets ADD COLUMN email_subject TEXT;
        END IF;
      END $$;
    `);

    // Create index for finding tickets by email conversation
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_email_conversation ON tickets(email_conversation_id) WHERE email_conversation_id IS NOT NULL');

    // Ticket emails table - stores all emails linked to a ticket
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_emails (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        -- Email identifiers from Microsoft Graph
        message_id TEXT NOT NULL,
        conversation_id TEXT,
        internet_message_id TEXT,

        -- Direction
        direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),

        -- Email metadata
        subject TEXT,
        body_preview TEXT,
        body_html TEXT,
        body_text TEXT,

        -- Sender/recipients
        from_name TEXT,
        from_email TEXT NOT NULL,
        to_recipients JSONB DEFAULT '[]',
        cc_recipients JSONB DEFAULT '[]',

        -- Status
        is_read BOOLEAN DEFAULT false,
        importance TEXT DEFAULT 'normal' CHECK(importance IN ('low', 'normal', 'high')),
        has_attachments BOOLEAN DEFAULT false,

        -- Timestamps
        received_at TIMESTAMP NOT NULL,
        sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),

        -- Prevent duplicate imports
        UNIQUE(organization_id, message_id)
      )
    `);

    // Ticket attachments (UI/portal uploads). The table predates this schema
    // file on the production DB — IF NOT EXISTS makes fresh installs work
    // without touching existing data.
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size BIGINT,
        mime_type TEXT,
        uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_by_contact_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id)');

    // Ticket email attachments
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_email_attachments (
        id TEXT PRIMARY KEY,
        ticket_email_id TEXT NOT NULL REFERENCES ticket_emails(id) ON DELETE CASCADE,

        -- Attachment info
        attachment_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content_type TEXT,
        size INTEGER,

        -- Storage - can be stored locally or just reference the Graph API
        stored_locally BOOLEAN DEFAULT false,
        local_path TEXT,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for ticket emails
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_emails_ticket ON ticket_emails(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_emails_conversation ON ticket_emails(conversation_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_emails_org ON ticket_emails(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_emails_received ON ticket_emails(received_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_email_attachments_email ON ticket_email_attachments(ticket_email_id)');

    logger.info('✅ Ticket email integration tables created');

    // Fix NinjaRMM alert timestamps that were incorrectly stored (Unix seconds instead of milliseconds)
    // This updates alerts where activity_time is before 1980 (indicating a seconds-based timestamp was used)
    // and recalculates from the activityTime field in alert_data JSON
    // Note: activityTime can be a decimal, so we use NUMERIC and TRUNC to handle it
    await client.query(`
      UPDATE ninjarmm_alerts
      SET activity_time = to_timestamp(TRUNC(CAST((alert_data->>'activityTime') AS NUMERIC) / 1000))
      WHERE activity_time < '1980-01-01'
        AND alert_data IS NOT NULL
        AND alert_data->>'activityTime' IS NOT NULL
        AND CAST((alert_data->>'activityTime') AS NUMERIC) > 1000000000000
    `);
    // Also handle case where activityTime is in seconds
    await client.query(`
      UPDATE ninjarmm_alerts
      SET activity_time = to_timestamp(TRUNC(CAST((alert_data->>'activityTime') AS NUMERIC)))
      WHERE activity_time < '1980-01-01'
        AND alert_data IS NOT NULL
        AND alert_data->>'activityTime' IS NOT NULL
        AND CAST((alert_data->>'activityTime') AS NUMERIC) > 1000000000
        AND CAST((alert_data->>'activityTime') AS NUMERIC) < 10000000000
    `);
    // Fallback: set to created_at for remaining old timestamps
    await client.query(`
      UPDATE ninjarmm_alerts
      SET activity_time = created_at
      WHERE activity_time < '1980-01-01'
        AND created_at IS NOT NULL
        AND created_at > '1980-01-01'
    `);
    logger.info('✅ NinjaRMM alert timestamps fixed');

    // ============================================
    // Extended Email Logs Table
    // ============================================

    // Extended email_logs table for detailed email monitoring
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id TEXT PRIMARY KEY,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

        -- Email details
        email_type TEXT NOT NULL,
        subject TEXT,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT,
        sender_email TEXT,

        -- Provider info
        provider TEXT NOT NULL CHECK(provider IN ('smtp', 'graph', 'test')),
        provider_message_id TEXT,

        -- Status
        status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed', 'bounced')),
        error_message TEXT,
        error_code TEXT,

        -- Performance
        processing_time_ms INTEGER,

        -- Metadata
        metadata JSONB DEFAULT '{}',

        -- Timestamps
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMP
      )
    `);

    // Create indexes for email_logs
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_org ON email_logs(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(email_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email)');

    // Migration: Add columns to existing email_notifications table if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'email_notifications' AND column_name = 'recipient_email'
        ) THEN
          ALTER TABLE email_notifications ADD COLUMN recipient_email TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'email_notifications' AND column_name = 'subject'
        ) THEN
          ALTER TABLE email_notifications ADD COLUMN subject TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'email_notifications' AND column_name = 'provider'
        ) THEN
          ALTER TABLE email_notifications ADD COLUMN provider TEXT;
        END IF;
      END $$;
    `);

    logger.info('✅ Email logs tables created');

    // ============================================
    // Customer Email Domains Table
    // ============================================

    // Table for mapping email domains to customers (for automatic ticket assignment)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_email_domains (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        domain TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(organization_id, domain)
      )
    `);

    // Create indexes for customer_email_domains
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_email_domains_customer ON customer_email_domains(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_email_domains_org ON customer_email_domains(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_email_domains_domain ON customer_email_domains(domain)');

    logger.info('✅ Customer email domains table created');

    // ============================================
    // Portal Settings Table
    // ============================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_name TEXT,
        welcome_message TEXT,
        logo_url TEXT,
        primary_color TEXT DEFAULT '#3b82f6',
        show_knowledge_base BOOLEAN DEFAULT true,
        require_login_for_kb BOOLEAN DEFAULT false,
        teamviewer_link TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_settings_user ON portal_settings(user_id)');

    // Migration: Add teamviewer_link column if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'portal_settings' AND column_name = 'teamviewer_link'
        ) THEN
          ALTER TABLE portal_settings ADD COLUMN teamviewer_link TEXT;
        END IF;
      END $$;
    `);

    logger.info('✅ Portal settings table created');

    // Migration: Extend report_approvals with reminder_sent_at and additional status values
    await client.query(`
      DO $$
      BEGIN
        -- Add reminder_sent_at column if not exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'report_approvals' AND column_name = 'reminder_sent_at'
        ) THEN
          ALTER TABLE report_approvals ADD COLUMN reminder_sent_at TIMESTAMPTZ;
        END IF;

        -- Update status constraint to include new statuses
        ALTER TABLE report_approvals DROP CONSTRAINT IF EXISTS report_approvals_status_check;
        ALTER TABLE report_approvals ADD CONSTRAINT report_approvals_status_check
          CHECK(status IN ('pending', 'approved', 'rejected', 'saved', 'revision_requested', 'superseded'));
      END $$;
    `);
    logger.info('✅ Report approvals reminder support added');
}
