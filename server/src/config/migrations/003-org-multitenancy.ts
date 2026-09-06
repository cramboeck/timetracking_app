import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Organisationen/Mitglieder/Einladungen, Org-Migration der Kerntabellen, ticket_sequences org-basiert, Ticket-Task-Erweiterungen
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // ============================================
    // Security Alerts Table
    // ============================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS security_alerts (
        id TEXT PRIMARY KEY,
        alert_type TEXT NOT NULL CHECK(alert_type IN ('brute_force', 'suspicious_login', 'account_lockout')),
        ip_address TEXT NOT NULL,
        username TEXT,
        details TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_security_alerts_ip ON security_alerts(ip_address)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_security_alerts_created ON security_alerts(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(alert_type)');

    // ============================================
    // Ticket Solution and Resolution Type
    // ============================================

    // Migration: Add solution and resolution_type columns to tickets
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'solution'
        ) THEN
          ALTER TABLE tickets ADD COLUMN solution TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'resolution_type'
        ) THEN
          ALTER TABLE tickets ADD COLUMN resolution_type TEXT CHECK(resolution_type IN ('solved', 'not_reproducible', 'duplicate', 'wont_fix', 'resolved_itself', 'workaround'));
        END IF;
      END $$;
    `);

    // ============================================
    // Ticket Tasks Table
    // ============================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tasks (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        visible_to_customer BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tasks_ticket ON ticket_tasks(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tasks_order ON ticket_tasks(ticket_id, sort_order)');

    // ============================================
    // Multi-Tenant Organizations System
    // ============================================

    // Organizations table - each organization can have multiple users
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

    // Organization members - links users to organizations with roles
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
        invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, user_id)
      )
    `);

    // Organization invitations
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_invitations (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member', 'viewer')),
        invitation_code TEXT UNIQUE NOT NULL,
        invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for organizations
    await client.query('CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organization_invitations(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_org_invitations_code ON organization_invitations(invitation_code)');

    // Migration: Add organization_id to all relevant tables
    // This is done as nullable first, then populated via migration
    await client.query(`
      DO $$
      BEGIN
        -- Add organization_id to customers
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
        END IF;

        -- Add organization_id to projects
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE projects ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
        END IF;

        -- Add organization_id to activities
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'activities' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE activities ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_activities_org ON activities(organization_id);
        END IF;

        -- Add organization_id to time_entries
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_time_entries_org ON time_entries(organization_id);
        END IF;

        -- Add organization_id to tickets
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE tickets ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
        END IF;

        -- Add organization_id to company_info
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'company_info' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE company_info ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to ninjarmm_config
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_config' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE ninjarmm_config ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to ninjarmm_organizations
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_organizations' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE ninjarmm_organizations ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to ninjarmm_devices
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'org_id'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to maintenance_announcements
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'maintenance_announcements' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE maintenance_announcements ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to maintenance_templates
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'maintenance_templates' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE maintenance_templates ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to customer_portal_roles
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_roles' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE customer_portal_roles ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to customer_portal_users
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add portal permission columns to customer_portal_users
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_create_tickets'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_create_tickets BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_all_tickets'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_all_tickets BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_devices'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_devices BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_invoices'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_invoices BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_quotes'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_quotes BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'notify_ticket_created'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN notify_ticket_created BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'notify_ticket_status_changed'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN notify_ticket_status_changed BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'notify_ticket_reply'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN notify_ticket_reply BOOLEAN DEFAULT true;
        END IF;

        -- Add can_view_time_report to customer_portal_users (Sprint C)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_time_report'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_time_report BOOLEAN NOT NULL DEFAULT false;
        END IF;

        -- Add can_view_contract to customer_portal_users (Sprint C)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_contract'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_contract BOOLEAN NOT NULL DEFAULT false;
        END IF;

        -- Add can_view_licenses to customer_portal_users (Go-Live-Härtung:
        -- der Lizenzen-Tab zeigt Lieferanten-Positionen mit Beträgen und war
        -- bis dahin für JEDEN Portal-User ungefragt sichtbar)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'can_view_licenses'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN can_view_licenses BOOLEAN NOT NULL DEFAULT false;
        END IF;

        -- Passwort-Reset fuer Portal-User (Self-Service statt Support-Anruf)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'reset_token'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN reset_token TEXT;
          ALTER TABLE customer_portal_users ADD COLUMN reset_token_expires_at TIMESTAMP;
        END IF;

        -- MFA-Spalten fehlten auf customer_portal_users komplett (existierten
        -- nur auf users/customer_contacts) — der Portal-Login selektiert
        -- cpu.mfa_enabled/cpu.mfa_secret und lief damit in einen 500er
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'mfa_enabled'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN mfa_enabled BOOLEAN DEFAULT false;
          ALTER TABLE customer_portal_users ADD COLUMN mfa_secret TEXT;
        END IF;

        -- updated_at-Absicherung fuer Alt-Tabellen, die vor der Aufnahme der
        -- Spalte ins CREATE TABLE angelegt wurden
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_portal_users' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE customer_portal_users ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();
        END IF;

        -- Add organization_id to feature_packages
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'feature_packages' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE feature_packages ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to report_approvals
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'report_approvals' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE report_approvals ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;

        -- Add organization_id to ticket_sequences
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_sequences' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE ticket_sequences ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          -- Create new unique constraint on organization_id
          CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_sequences_org ON ticket_sequences(organization_id) WHERE organization_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // ============================================
    // Data Migration: Create organizations for existing users
    // Each existing user gets their own organization (no data loss)
    // ============================================

    await client.query(`
      DO $$
      DECLARE
        user_rec RECORD;
        new_org_id TEXT;
        org_slug TEXT;
      BEGIN
        -- For each user who doesn't have an organization yet
        FOR user_rec IN
          SELECT u.id, u.username, u.organization_name, u.display_name
          FROM users u
          WHERE NOT EXISTS (
            SELECT 1 FROM organization_members om WHERE om.user_id = u.id
          )
        LOOP
          -- Generate organization ID
          new_org_id := gen_random_uuid()::TEXT;

          -- Generate slug from username (lowercase, replace spaces)
          org_slug := LOWER(REGEXP_REPLACE(user_rec.username, '[^a-zA-Z0-9]', '-', 'g'));

          -- Ensure slug is unique by appending random chars if needed
          WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = org_slug) LOOP
            org_slug := org_slug || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 4);
          END LOOP;

          -- Create organization for user
          INSERT INTO organizations (id, name, slug, owner_user_id)
          VALUES (
            new_org_id,
            COALESCE(user_rec.organization_name, user_rec.display_name, user_rec.username),
            org_slug,
            user_rec.id
          );

          -- Add user as owner of their organization
          INSERT INTO organization_members (id, organization_id, user_id, role)
          VALUES (gen_random_uuid()::TEXT, new_org_id, user_rec.id, 'owner');

          -- Migrate existing data to the new organization
          UPDATE customers SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE projects SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE activities SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE time_entries SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE tickets SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE company_info SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE ninjarmm_config SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE ninjarmm_organizations SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE ninjarmm_devices SET org_id = new_org_id WHERE user_id = user_rec.id AND org_id IS NULL;
          UPDATE maintenance_announcements SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE maintenance_templates SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE customer_portal_roles SET organization_id = new_org_id WHERE owner_user_id = user_rec.id AND organization_id IS NULL;
          UPDATE customer_portal_users SET organization_id = new_org_id WHERE owner_user_id = user_rec.id AND organization_id IS NULL;
          UPDATE feature_packages SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          UPDATE report_approvals SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;

          -- Only update ticket_sequences if it still has the old user_id column (pre-migration)
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'ticket_sequences' AND column_name = 'user_id'
          ) THEN
            UPDATE ticket_sequences SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;
          END IF;

          RAISE NOTICE 'Created organization % for user %', new_org_id, user_rec.username;
        END LOOP;
      END $$;
    `);

    logger.info('✅ Multi-tenant organization migration completed');

    // Migration: Add organization_id to sla_policies if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sla_policies' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE sla_policies ADD COLUMN organization_id TEXT;
        END IF;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);

    // ============================================
    // Add organization_id to canned_responses and ticket_tags (migration for existing DBs)
    // ============================================
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'canned_responses' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE canned_responses ADD COLUMN organization_id TEXT;
          CREATE INDEX IF NOT EXISTS idx_canned_responses_org ON canned_responses(organization_id);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_tags' AND column_name = 'organization_id'
        ) THEN
          ALTER TABLE ticket_tags ADD COLUMN organization_id TEXT;
          CREATE INDEX IF NOT EXISTS idx_ticket_tags_org ON ticket_tags(organization_id);
        END IF;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);
    logger.info('✅ canned_responses and ticket_tags organization_id columns ensured');

    // ============================================
    // Fix ticket_sequences - migrate from user_id to organization_id based
    // ============================================
    await client.query(`
      DO $$
      BEGIN
        -- Drop the partial unique index if it exists
        DROP INDEX IF EXISTS idx_ticket_sequences_org;

        -- Check if old table structure exists (has user_id column)
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_sequences' AND column_name = 'user_id'
        ) THEN
          -- Create a new table with correct structure
          CREATE TABLE IF NOT EXISTS ticket_sequences_new (
            organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
            last_number INTEGER NOT NULL DEFAULT 0
          );

          -- Migrate data: get the max last_number per organization
          INSERT INTO ticket_sequences_new (organization_id, last_number)
          SELECT organization_id, MAX(last_number)
          FROM ticket_sequences
          WHERE organization_id IS NOT NULL
          GROUP BY organization_id
          ON CONFLICT (organization_id) DO UPDATE SET last_number = GREATEST(ticket_sequences_new.last_number, EXCLUDED.last_number);

          -- Drop old table and rename new one
          DROP TABLE ticket_sequences;
          ALTER TABLE ticket_sequences_new RENAME TO ticket_sequences;

          RAISE NOTICE 'ticket_sequences table migrated to organization-based';
        END IF;
      END $$;
    `);
    logger.info('✅ Ticket sequences migrated to organization-based');

    // ============================================
    // Add assigned_to to ticket_tasks (migration)
    // ============================================
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_tasks' AND column_name = 'assigned_to'
        ) THEN
          ALTER TABLE ticket_tasks ADD COLUMN assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_tasks' AND column_name = 'due_date'
        ) THEN
          ALTER TABLE ticket_tasks ADD COLUMN due_date TIMESTAMP;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_tasks' AND column_name = 'description'
        ) THEN
          ALTER TABLE ticket_tasks ADD COLUMN description TEXT;
        END IF;
      END $$;
    `);
    logger.info('✅ Ticket tasks extended with assigned_to, due_date, description');
}
