import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Kundenportal-Auth, Kontakt-Notification-Prefs, Push-Subscriptions (Portal + intern, vereinheitlicht), AI-Config/Suggestions, Ticket-Basistabellen-Erweiterungen
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // ============================================
    // Feature Flags System
    // ============================================

    // Add feature_flags JSONB column to users table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'feature_flags'
        ) THEN
          ALTER TABLE users ADD COLUMN feature_flags JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    // ============================================
    // Customer Portal System
    // ============================================

    // Portal roles (predefined + custom)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_roles (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        permissions JSONB NOT NULL DEFAULT '{}',
        is_system_role BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(owner_user_id, name)
      )
    `);

    // Permissions structure:
    // {
    //   "invoices": { "view": true, "download": true },
    //   "quotes": { "view": true, "accept": true },
    //   "reports": { "view": true, "download": true },
    //   "devices": { "scope": "all|assigned|none", "view_details": true, "request_support": true },
    //   "tickets": { "create": true, "view_own": true, "view_all": false }
    // }

    // Portal users (customers' employees who can log into the portal)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_users (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        position TEXT,
        is_primary_contact BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP,
        password_reset_token TEXT,
        password_reset_expires TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(owner_user_id, email)
      )
    `);

    // Portal user ↔ role assignments
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_user_roles (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL REFERENCES customer_portal_users(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES customer_portal_roles(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(portal_user_id, role_id)
      )
    `);

    // Portal user ↔ device assignments (for "only assigned devices" permission)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_user_devices (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL REFERENCES customer_portal_users(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES ninjarmm_devices(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(portal_user_id, device_id)
      )
    `);

    // Portal sessions for authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_sessions (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT NOT NULL REFERENCES customer_portal_users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Portal activity log (audit trail)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_portal_activity_log (
        id TEXT PRIMARY KEY,
        portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details JSONB,
        ip_address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for Customer Portal tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_users_owner ON customer_portal_users(owner_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_users_customer ON customer_portal_users(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_users_email ON customer_portal_users(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_user_roles_user ON customer_portal_user_roles(portal_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_user_roles_role ON customer_portal_user_roles(role_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_user_devices_user ON customer_portal_user_devices(portal_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_user_devices_device ON customer_portal_user_devices(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON customer_portal_sessions(portal_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON customer_portal_sessions(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_activity_user ON customer_portal_activity_log(portal_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_activity_owner ON customer_portal_activity_log(owner_user_id)');

    // ============================================
    // Organizations (VORGEZOGEN: tickets referenziert organizations(id) —
    // ohne diese Reihenfolge scheitert jede Neu-Installation. Der spätere
    // CREATE im Organizations-Abschnitt ist idempotent und überspringt.)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB DEFAULT '{}',
        logo TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ============================================
    // Tickets System (referenced by alerts)
    // ============================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        device_id TEXT REFERENCES ninjarmm_devices(id) ON DELETE SET NULL,
        portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL,
        ticket_number TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed', 'archived')),
        -- 'critical' (not 'urgent') is the app-wide ticket priority set: frontend
        -- TicketPriority, ticketPrioritySchema and the live production constraint
        -- all use low/normal/high/critical. Tasks use 'urgent' — tickets do not.
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
        category TEXT,
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'portal', 'email', 'ninja_alert', 'ninja_webhook')),
        ninja_alert_id TEXT,
        due_date TIMESTAMP,
        resolved_at TIMESTAMP,
        closed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: Add new columns to existing tickets table if they don't exist
    // Use DO $$ blocks with EXCEPTION handling to avoid transaction abort
    // Note: Foreign keys are NOT added here because referenced tables might not exist yet
    // The CREATE TABLE statement handles foreign keys for new installations
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN organization_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN device_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN portal_user_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN source TEXT DEFAULT 'manual';
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    // Migration: normalize ticket priority values to the app-wide set
    // low/normal/high/critical. Older installs may carry a constraint with
    // 'urgent', which no code path writes for tickets (tasks use 'urgent',
    // tickets use 'critical'). Atomic: on any failure the block rolls back.
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_priority_check;
        ALTER TABLE tickets ADD CONSTRAINT tickets_priority_check
          CHECK(priority IN ('low', 'normal', 'high', 'critical'));
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    // Migration: allow 'ninja_webhook' as ticket source (written by the
    // NinjaRMM webhook auto-ticket path) alongside the original values.
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_source_check;
        ALTER TABLE tickets ADD CONSTRAINT tickets_source_check
          CHECK(source IN ('manual', 'portal', 'email', 'ninja_alert', 'ninja_webhook'));
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN ninja_alert_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN category TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN assigned_to TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    // Migration: Add SLA and project columns to tickets for Sprint 3 SELECT * elimination
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN project_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN first_response_at TIMESTAMP;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN sla_policy_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN sla_response_due TIMESTAMP;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN sla_resolution_due TIMESTAMP;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN sla_response_breached BOOLEAN DEFAULT false;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN sla_resolution_breached BOOLEAN DEFAULT false;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN created_by_contact_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN due_date TIMESTAMP;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN resolved_at TIMESTAMP;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN closed_at TIMESTAMP;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);

    // Ticket comments/updates
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL,
        customer_contact_id TEXT,
        content TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migration NACH dem CREATE (vorher lief sie davor und riss jede
    // Neu-Installation): portal_user_id für Alt-Tabellen nachrüsten;
    // ausserdem comment→content-Angleichung (Prod heisst die Spalte
    // content — das alte CREATE hier nannte sie comment)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'portal_user_id'
        ) THEN
          ALTER TABLE ticket_comments ADD COLUMN portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL;
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'comment'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'content'
        ) THEN
          ALTER TABLE ticket_comments RENAME COLUMN comment TO content;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'customer_contact_id'
        ) THEN
          ALTER TABLE ticket_comments ADD COLUMN customer_contact_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE ticket_comments ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
        END IF;
      END $$;
    `);

    // Ticket time entries (link existing time entries to tickets)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'ticket_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Create indexes for Tickets
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id)');
    // Create index on organization_id only if column exists
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'organization_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id)';
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id)');
    // Create index on device_id only if column exists
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'device_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_device ON tickets(device_id)';
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_ticket ON time_entries(ticket_id)');

    // ticket_sequences hatte NIE ein CREATE TABLE (Fund Schema-Sweep) —
    // Prod-Form: (organization_id, last_number); UNIQUE für das
    // ON CONFLICT (organization_id) der Ticketnummern-Vergabe
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_sequences (
        organization_id TEXT UNIQUE,
        last_number INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Add foreign key from ninjarmm_alerts to tickets (now that tickets exists)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ninjarmm_alerts_ticket_id_fkey'
        ) THEN
          ALTER TABLE ninjarmm_alerts
          ADD CONSTRAINT ninjarmm_alerts_ticket_id_fkey
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alerts_ticket ON ninjarmm_alerts(ticket_id)');

    // ============================================
    // Ticket Templates (for quick ticket creation)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_templates (
        id TEXT PRIMARY KEY,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        title_template TEXT,
        description_template TEXT,
        default_priority TEXT CHECK(default_priority IN ('low', 'normal', 'high', 'critical')),
        default_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        default_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        category TEXT,
        is_active BOOLEAN DEFAULT true,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_templates_org ON ticket_templates(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_templates_category ON ticket_templates(category)');

    // ============================================
    // Canned Responses (for quick ticket replies)
    // ============================================
    // Note: canned_responses and ticket_tags are created WITHOUT foreign keys here
    // because organizations table may not exist yet. Foreign keys added later.
    await client.query(`
      CREATE TABLE IF NOT EXISTS canned_responses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        shortcut TEXT,
        category TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'canned_responses' AND column_name = 'organization_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_canned_responses_org ON canned_responses(organization_id)';
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_canned_responses_user ON canned_responses(user_id)');

    // ============================================
    // Ticket Tags
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tags (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3B82F6',
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ticket_tags' AND column_name = 'organization_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ticket_tags_org ON ticket_tags(organization_id)';
        END IF;
      END $$;
    `);

    // Ticket-Tag junction table (many-to-many)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tag_assignments (
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES ticket_tags(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        PRIMARY KEY (ticket_id, tag_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tag_assignments_ticket ON ticket_tag_assignments(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tag_assignments_tag ON ticket_tag_assignments(tag_id)');

    // ============================================
    // AI Configuration & Ticket Suggestions
    // ============================================

    // AI Provider Configuration (per user)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'openai' CHECK(provider IN ('openai', 'anthropic')),
        api_key TEXT,
        model TEXT DEFAULT 'gpt-4o-mini',
        enabled BOOLEAN DEFAULT false,
        max_tokens INTEGER DEFAULT 1000,
        temperature NUMERIC(3,2) DEFAULT 0.7,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    // Prod-Angleichung (22.8.2026): email_on_new_ticket fehlt in der gewachsenen
    // Prod-Tabelle (stand nur im CREATE fuer Frischinstallationen), wird aber in
    // expliziten SELECTs (tickets.ts, customer-portal.ts) referenziert.
    // ⚠️ Auf Tabellen-Existenz guarden: bei Frischinstallationen wird
    // notification_preferences erst SPÄTER angelegt — ungeguarded brach hier
    // jeder Fresh-Install-Boot ab (relation does not exist).
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
          ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_on_new_ticket BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);

    // AI Suggestions for Tickets (internal only)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_ai_suggestions (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        suggestion_type TEXT NOT NULL DEFAULT 'solution' CHECK(suggestion_type IN ('solution', 'category', 'priority', 'response')),
        content TEXT NOT NULL,
        confidence NUMERIC(3,2),
        context_used JSONB,
        model_used TEXT,
        tokens_used INTEGER,
        is_helpful BOOLEAN,
        applied BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_ai_config_user ON ai_config(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_ai_suggestions_ticket ON ticket_ai_suggestions(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_ai_suggestions_user ON ticket_ai_suggestions(user_id)');

    // Migration: Add system_prompt and assistant_type columns to ai_config
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ai_config' AND column_name = 'system_prompt'
        ) THEN
          ALTER TABLE ai_config ADD COLUMN system_prompt TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'ai_config' AND column_name = 'prompt_templates'
        ) THEN
          ALTER TABLE ai_config ADD COLUMN prompt_templates JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    // Feature subscriptions for add-on packages
    await client.query(`
      CREATE TABLE IF NOT EXISTS feature_packages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        package_name TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        enabled_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, package_name)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_feature_packages_user ON feature_packages(user_id)');

    // ============================================
    // Maintenance Announcements System
    // ============================================

    // Maintenance announcements (the main announcement)
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_announcements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        maintenance_type TEXT NOT NULL CHECK(maintenance_type IN ('patch', 'reboot', 'security_update', 'firmware', 'general')),
        affected_systems TEXT,
        scheduled_start TIMESTAMP NOT NULL,
        scheduled_end TIMESTAMP,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sent', 'in_progress', 'completed', 'cancelled')),
        require_approval BOOLEAN DEFAULT true,
        approval_deadline TIMESTAMP,
        auto_proceed_on_no_response BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Customer-specific announcements (links announcement to customers with approval status)
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_announcement_customers (
        id TEXT PRIMARY KEY,
        announcement_id TEXT NOT NULL REFERENCES maintenance_announcements(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        approval_token TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'no_response')),
        approved_by TEXT,
        approved_at TIMESTAMP,
        rejection_reason TEXT,
        notification_sent_at TIMESTAMP,
        reminder_sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(announcement_id, customer_id)
      )
    `);

    // Device-specific maintenance tracking (optional - link to specific devices)
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_announcement_devices (
        id TEXT PRIMARY KEY,
        announcement_id TEXT NOT NULL REFERENCES maintenance_announcements(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES ninjarmm_devices(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'in_progress', 'completed', 'skipped', 'failed')),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(announcement_id, device_id)
      )
    `);

    // Maintenance templates for recurring announcements
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        maintenance_type TEXT NOT NULL CHECK(maintenance_type IN ('patch', 'reboot', 'security_update', 'firmware', 'general')),
        affected_systems TEXT,
        estimated_duration_minutes INTEGER,
        require_approval BOOLEAN DEFAULT true,
        auto_proceed_on_no_response BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      )
    `);

    // Activity log for maintenance
    await client.query(`
      CREATE TABLE IF NOT EXISTS maintenance_activity_log (
        id TEXT PRIMARY KEY,
        announcement_id TEXT NOT NULL REFERENCES maintenance_announcements(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        actor_type TEXT CHECK(actor_type IN ('admin', 'customer', 'system')),
        actor_id TEXT,
        actor_name TEXT,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: Add ticket_id to maintenance_announcements
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'maintenance_announcements' AND column_name = 'ticket_id'
        ) THEN
          ALTER TABLE maintenance_announcements ADD COLUMN ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Create indexes for Maintenance tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_announcements_user ON maintenance_announcements(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_announcements_status ON maintenance_announcements(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_announcements_scheduled ON maintenance_announcements(scheduled_start)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_announcements_ticket ON maintenance_announcements(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_customers_announcement ON maintenance_announcement_customers(announcement_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_customers_customer ON maintenance_announcement_customers(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_customers_token ON maintenance_announcement_customers(approval_token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_customers_status ON maintenance_announcement_customers(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_devices_announcement ON maintenance_announcement_devices(announcement_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_devices_device ON maintenance_announcement_devices(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_templates_user ON maintenance_templates(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_maintenance_activity_announcement ON maintenance_activity_log(announcement_id)');

    // customer_contacts VORGEZOGEN (Fresh-Install-Ordering): die folgenden
    // ALTER-Migrationen liefen bisher VOR dem CREATE weiter unten und
    // rissen jede Neu-Installation. Idempotente Kopie; das spätere CREATE
    // im CRM-Abschnitt überspringt dann.
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_contacts (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        first_name TEXT,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        mobile TEXT,
        job_title TEXT,
        department TEXT,
        role TEXT DEFAULT 'contact' CHECK(role IN ('decision_maker', 'technical', 'billing', 'contact', 'executive')),
        is_primary BOOLEAN DEFAULT false,
        portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL,
        preferred_contact_method TEXT DEFAULT 'email' CHECK(preferred_contact_method IN ('email', 'phone', 'mobile', 'portal')),
        notify_on_ticket_update BOOLEAN DEFAULT true,
        notify_on_maintenance BOOLEAN DEFAULT true,
        linkedin_url TEXT,
        notes TEXT,
        avatar_url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: Add new portal permission columns to customer_contacts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'can_view_devices'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN can_view_devices BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'can_view_invoices'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN can_view_invoices BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'can_view_quotes'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN can_view_quotes BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    // Migration: Add MFA columns to customer_contacts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'mfa_enabled'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN mfa_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'mfa_secret'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN mfa_secret TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'mfa_recovery_codes'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN mfa_recovery_codes TEXT;
        END IF;
      END $$;
    `);

    // Migration: Add portal authentication columns to customer_contacts
    // This allows contacts to log in directly to the portal without a separate customer_portal_users entry
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'password_hash'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN password_hash TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'password_reset_token'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN password_reset_token TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'password_reset_expires'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN password_reset_expires TIMESTAMP;
        END IF;
      END $$;
    `);
    logger.info('✅ Customer contact portal authentication columns added');

    // Migration: Add email notification preferences to customer_contacts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'notify_ticket_created'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN notify_ticket_created BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'notify_ticket_status_changed'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN notify_ticket_status_changed BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'notify_ticket_reply'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN notify_ticket_reply BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    logger.info('✅ Customer contact notification preferences added');

    // Portal trusted devices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS portal_trusted_devices (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES customer_contacts(id) ON DELETE CASCADE,
        device_token TEXT NOT NULL UNIQUE,
        device_name TEXT,
        browser TEXT,
        os TEXT,
        ip_address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_trusted_devices_contact ON portal_trusted_devices(contact_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_trusted_devices_token ON portal_trusted_devices(device_token)');

    // ============================================
    // Portal Push Subscriptions Table
    // ============================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS portal_push_subscriptions (
        id TEXT PRIMARY KEY,
        contact_id TEXT NOT NULL REFERENCES customer_contacts(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        device_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_push_subs_contact ON portal_push_subscriptions(contact_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_push_subs_endpoint ON portal_push_subscriptions(endpoint)');

    // Migration: Add push notification preferences to customer_contacts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'push_enabled'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN push_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'push_on_ticket_reply'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN push_on_ticket_reply BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'push_on_status_change'
        ) THEN
          ALTER TABLE customer_contacts ADD COLUMN push_on_status_change BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);

    logger.info('✅ Portal push subscriptions table created');

    // ============================================
    // Internal User Push Subscriptions & Notification Preferences
    // ============================================

    // Push subscriptions for internal users (employees/team members)
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        device_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subs_org ON push_subscriptions(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint)');

    // Notification preferences for internal users
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        -- Push notification settings
        push_enabled BOOLEAN DEFAULT true,
        push_on_new_ticket BOOLEAN DEFAULT true,
        push_on_ticket_assigned BOOLEAN DEFAULT true,
        push_on_ticket_comment BOOLEAN DEFAULT true,
        push_on_status_change BOOLEAN DEFAULT true,
        push_on_sla_warning BOOLEAN DEFAULT true,
        push_on_mention BOOLEAN DEFAULT true,
        -- Email notification settings
        email_enabled BOOLEAN DEFAULT true,
        email_on_new_ticket BOOLEAN DEFAULT true,
        email_on_ticket_assigned BOOLEAN DEFAULT true,
        email_on_ticket_comment BOOLEAN DEFAULT true,
        email_on_status_change BOOLEAN DEFAULT false,
        email_on_sla_warning BOOLEAN DEFAULT true,
        email_on_mention BOOLEAN DEFAULT true,
        email_daily_digest BOOLEAN DEFAULT false,
        -- Quiet hours (e.g., "22:00" to "07:00")
        quiet_hours_enabled BOOLEAN DEFAULT false,
        quiet_hours_start TEXT DEFAULT '22:00',
        quiet_hours_end TEXT DEFAULT '07:00',
        -- Timestamps
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id)');

    logger.info('✅ Internal user push subscriptions and notification preferences tables created');

    // ============================================
    // Push Subscriptions Unification Migration
    // Merge portal_push_subscriptions into push_subscriptions
    // ============================================

    // Add subscription_type column to push_subscriptions
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'push_subscriptions' AND column_name = 'subscription_type'
        ) THEN
          ALTER TABLE push_subscriptions ADD COLUMN subscription_type TEXT DEFAULT 'user' CHECK(subscription_type IN ('user', 'contact'));
        END IF;
      END $$;
    `);

    // Add contact_id column to push_subscriptions
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'push_subscriptions' AND column_name = 'contact_id'
        ) THEN
          ALTER TABLE push_subscriptions ADD COLUMN contact_id TEXT REFERENCES customer_contacts(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Make user_id nullable (for contact subscriptions)
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE push_subscriptions ALTER COLUMN user_id DROP NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);

    // Create index on contact_id
    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subs_contact ON push_subscriptions(contact_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subs_type ON push_subscriptions(subscription_type)');

    // Migrate data from portal_push_subscriptions to push_subscriptions
    // Only copy records where contact_id still exists (skip orphaned records)
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'portal_push_subscriptions') THEN
          INSERT INTO push_subscriptions (id, contact_id, endpoint, p256dh, auth, device_name, created_at, last_used_at, subscription_type)
          SELECT pps.id, pps.contact_id, pps.endpoint, pps.p256dh, pps.auth, pps.device_name, pps.created_at, pps.last_used_at, 'contact'
          FROM portal_push_subscriptions pps
          WHERE EXISTS (SELECT 1 FROM customer_contacts cc WHERE cc.id = pps.contact_id)
          ON CONFLICT (endpoint) DO NOTHING;
        END IF;
      END $$;
    `);

    logger.info('✅ Push subscriptions unified (user + portal contact in one table)');
}
