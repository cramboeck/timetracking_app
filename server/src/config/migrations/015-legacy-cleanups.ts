import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * updated_at/Soft-Delete-Migrationen, Theme-Default, Heartbeat, refresh_tokens, Multi-Tenancy-Spalten/Backfill/Indexe, pg_trgm
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // =========================================================================
    // MIGRATION: Add updated_at to core tables that were missing it.
    // Uses DO $$ ... IF NOT EXISTS to be fully idempotent – safe to run
    // on existing databases without touching any existing data.
    // Back-fills updated_at = created_at for existing rows.
    // =========================================================================
    logger.info('🔄 Running updated_at migration...');
    const tablesNeedingUpdatedAt: string[] = [
      'teams', 'customers', 'projects', 'activities', 'time_entries',
      'ticket_comments', 'ticket_tasks', 'lead_activities',
      'task_checklist_items', 'contract_positions', 'invoice_exports',
      'social_media_post_platforms', 'social_media_templates',
      'social_media_hashtag_groups', 'ticket_emails',
    ];
    for (const tbl of tablesNeedingUpdatedAt) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tbl}' AND column_name = 'updated_at'
          ) THEN
            ALTER TABLE ${tbl} ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
            UPDATE ${tbl} SET updated_at = COALESCE(created_at, NOW());
          END IF;
        END $$;
      `);
    }
    logger.info('✅ updated_at migration complete');

    // =========================================================================
    // MIGRATION: Soft-delete for critical entities.
    // Adds deleted_at TIMESTAMP DEFAULT NULL.
    // NULL  → record is active (all existing rows stay active).
    // NOT NULL → record is soft-deleted (hidden from normal queries).
    // Application code must filter WHERE deleted_at IS NULL.
    // =========================================================================
    logger.info('🔄 Running soft-delete migration...');
    const tablesNeedingSoftDelete: string[] = [
      'customers', 'projects', 'activities', 'contracts',
    ];
    for (const tbl of tablesNeedingSoftDelete) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tbl}' AND column_name = 'deleted_at'
          ) THEN
            ALTER TABLE ${tbl} ADD COLUMN deleted_at TIMESTAMP DEFAULT NULL;
            CREATE INDEX IF NOT EXISTS idx_${tbl}_not_deleted
              ON ${tbl}(id) WHERE deleted_at IS NULL;
          END IF;
        END $$;
      `);
    }
    logger.info('✅ Soft-delete migration complete');

    // Migration: Update users.accent_color / gray_tone defaults to RamboFlow brand
    // (idempotent: SET DEFAULT only changes future inserts, existing rows untouched)
    await client.query(`
      ALTER TABLE users ALTER COLUMN accent_color SET DEFAULT 'ramboeck';
      ALTER TABLE users ALTER COLUMN gray_tone SET DEFAULT 'ramboeck';
    `);
    logger.info('✅ Users default theme updated to RamboFlow brand');

    // Migration: Add heartbeat_interval_minutes to users (per-user pref for
    // how often the running timer is persisted server-side — default 5 min)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'heartbeat_interval_minutes'
        ) THEN
          ALTER TABLE users
            ADD COLUMN heartbeat_interval_minutes INTEGER NOT NULL DEFAULT 5
            CHECK (heartbeat_interval_minutes IN (1, 5, 15));
        END IF;
      END $$;
    `);
    logger.info('✅ Users heartbeat_interval_minutes migration complete');

    // Migration: refresh_tokens table for JWT refresh-token rotation
    // (idempotent — CREATE TABLE IF NOT EXISTS). Note: users.id is TEXT
    // (not native UUID), so the FK column type must match.
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        device_info JSONB DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP DEFAULT NULL,
        rotated_to_hash TEXT DEFAULT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
        ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;
    `);
    logger.info('✅ refresh_tokens table ready');

    // ============================================
    // Multi-Tenancy Migration: Add organization_id to remaining tables
    // ============================================
    // Tables that need organization_id for proper multi-tenant isolation
    const tablesNeedingOrgId = [
      'teams',
      'trusted_devices',
      'email_notifications',
      'password_reset_tokens',
      'audit_logs',
      'notification_settings',
      'ninjarmm_alerts',
      'ninjarmm_webhook_events',
      'ninjarmm_alert_exclusions',
      'ticket_comments',
      'ai_config',
      'ticket_ai_suggestions',
      'lead_activities',
      'task_checklist_items',
      'task_comments',
      'task_activity_log',
      'contracts',
      'contract_activity_log',
      'sevdesk_config',
      'invoice_exports',
      'clockodo_config'
    ];

    for (const tableName of tablesNeedingOrgId) {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tableName}' AND column_name = 'organization_id'
          ) THEN
            ALTER TABLE ${tableName} ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          END IF;
        END $$;
      `);
    }
    logger.info('✅ Multi-tenancy: organization_id columns added to all tables');

    // Backfill organization_id from user_id via organization_members
    // Only for tables that have user_id column
    const tablesToBackfill = [
      'trusted_devices',
      'email_notifications',
      'password_reset_tokens',
      'audit_logs',
      'notification_settings',
      'ninjarmm_alerts',
      'ninjarmm_webhook_events',
      'ninjarmm_alert_exclusions',
      'ai_config',
      'ticket_ai_suggestions',
      'task_comments',
      'task_activity_log',
      'contracts',
      'contract_activity_log',
      'sevdesk_config',
      'invoice_exports',
      'clockodo_config'
    ];

    for (const tableName of tablesToBackfill) {
      // Only backfill if the column exists (safe check)
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tableName}' AND column_name = 'organization_id'
          ) AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tableName}' AND column_name = 'user_id'
          ) THEN
            UPDATE ${tableName} t
            SET organization_id = om.organization_id
            FROM organization_members om
            WHERE t.user_id = om.user_id
              AND t.organization_id IS NULL
              AND om.organization_id IS NOT NULL;
          END IF;
        END $$;
      `);
    }

    // Special backfill for teams (uses owner_id instead of user_id)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'teams' AND column_name = 'organization_id'
        ) THEN
          UPDATE teams t
          SET organization_id = om.organization_id
          FROM organization_members om
          WHERE t.owner_id = om.user_id
            AND t.organization_id IS NULL
            AND om.organization_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Special backfill for ticket_comments (uses ticket's organization_id)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'organization_id'
        ) THEN
          UPDATE ticket_comments tc
          SET organization_id = t.organization_id
          FROM tickets t
          WHERE tc.ticket_id = t.id
            AND tc.organization_id IS NULL
            AND t.organization_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Special backfill for lead_activities (uses lead's organization_id)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'lead_activities' AND column_name = 'organization_id'
        ) THEN
          UPDATE lead_activities la
          SET organization_id = l.organization_id
          FROM leads l
          WHERE la.lead_id = l.id
            AND la.organization_id IS NULL
            AND l.organization_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Special backfill for task_checklist_items (uses task's organization_id)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'task_checklist_items' AND column_name = 'organization_id'
        ) THEN
          UPDATE task_checklist_items tci
          SET organization_id = t.organization_id
          FROM tasks t
          WHERE tci.task_id = t.id
            AND tci.organization_id IS NULL
            AND t.organization_id IS NOT NULL;
        END IF;
      END $$;
    `);

    logger.info('✅ Multi-tenancy: organization_id backfilled from user relationships');

    // Create indexes on organization_id for the newly added columns
    // Wrapped in DO $$ to skip if column doesn't exist (safe for partial migrations)
    const indexesToCreate = [
      { table: 'teams', index: 'idx_teams_org' },
      { table: 'trusted_devices', index: 'idx_trusted_devices_org' },
      { table: 'email_notifications', index: 'idx_email_notifications_org' },
      { table: 'password_reset_tokens', index: 'idx_password_reset_tokens_org' },
      { table: 'audit_logs', index: 'idx_audit_logs_org' },
      { table: 'notification_settings', index: 'idx_notification_settings_org' },
      { table: 'ninjarmm_alerts', index: 'idx_ninjarmm_alerts_org' },
      { table: 'ninjarmm_webhook_events', index: 'idx_ninjarmm_webhook_events_org' },
      { table: 'ninjarmm_alert_exclusions', index: 'idx_ninjarmm_alert_exclusions_org' },
      { table: 'ticket_comments', index: 'idx_ticket_comments_org' },
      { table: 'ai_config', index: 'idx_ai_config_org' },
      { table: 'ticket_ai_suggestions', index: 'idx_ticket_ai_suggestions_org' },
      { table: 'lead_activities', index: 'idx_lead_activities_org' },
      { table: 'task_checklist_items', index: 'idx_task_checklist_items_org' },
      { table: 'task_comments', index: 'idx_task_comments_org' },
      { table: 'task_activity_log', index: 'idx_task_activity_log_org' },
      { table: 'contracts', index: 'idx_contracts_org' },
      { table: 'contract_activity_log', index: 'idx_contract_activity_log_org' },
      { table: 'sevdesk_config', index: 'idx_sevdesk_config_org' },
      { table: 'invoice_exports', index: 'idx_invoice_exports_org' },
      { table: 'clockodo_config', index: 'idx_clockodo_config_org' },
      // These tables already have organization_id from earlier schema definitions
      { table: 'ticket_tag_assignments', index: 'idx_ticket_tag_assignments_org' },
      { table: 'ticket_sequences_new', index: 'idx_ticket_sequences_new_org' },
      { table: 'ticket_email_attachments', index: 'idx_ticket_email_attachments_org' }
    ];

    for (const { table, index } of indexesToCreate) {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${table}' AND column_name = 'organization_id'
          ) AND NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = '${index}'
          ) THEN
            CREATE INDEX ${index} ON ${table}(organization_id);
          END IF;
        END $$;
      `);
    }
    logger.info('✅ Multi-tenancy: indexes created on organization_id columns');

    // ========================================
    // Epic G: Invoice Line Items & License Management
    // ========================================

    // Enable pg_trgm extension for fuzzy matching
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    logger.info('✅ pg_trgm extension enabled for fuzzy matching');
}
