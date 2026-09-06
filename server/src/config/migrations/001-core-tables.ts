import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Kern-Tabellen: users/teams/customers/projects/activities/time_entries/tickets + NinjaRMM-Geraete inkl. IP-Historie/Software/Patches
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // Enable UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Teams table (create first because users references it)
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK(account_type IN ('personal', 'business', 'team', 'freelancer')),
        organization_name TEXT,
        customer_number TEXT UNIQUE,
        display_name TEXT,
        team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
        team_role TEXT CHECK(team_role IN ('owner', 'admin', 'member')),
        role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
        mfa_enabled BOOLEAN DEFAULT FALSE,
        mfa_secret TEXT,
        accent_color TEXT DEFAULT 'ramboeck',
        gray_tone TEXT DEFAULT 'ramboeck',
        time_rounding_interval INTEGER DEFAULT 15,
        heartbeat_interval_minutes INTEGER DEFAULT 5 CHECK(heartbeat_interval_minutes IN (1, 5, 15)),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);

    // Migration: Add customer_number and display_name to users if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'customer_number'
        ) THEN
          ALTER TABLE users ADD COLUMN customer_number TEXT UNIQUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'display_name'
        ) THEN
          ALTER TABLE users ADD COLUMN display_name TEXT;
        END IF;
      END $$;
    `);

    // Migration: Add mfa_recovery_codes column to users table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'mfa_recovery_codes'
        ) THEN
          ALTER TABLE users ADD COLUMN mfa_recovery_codes TEXT;
        END IF;
      END $$;
    `);

    // Migration: Add dark_mode column to users table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'dark_mode'
        ) THEN
          ALTER TABLE users ADD COLUMN dark_mode BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Migration: Ensure dark_mode is never NULL (set existing NULLs to FALSE)
    await client.query(`
      UPDATE users SET dark_mode = FALSE WHERE dark_mode IS NULL;
    `);

    // Migration: Add NOT NULL constraint to dark_mode
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'dark_mode' AND is_nullable = 'YES'
        ) THEN
          ALTER TABLE users ALTER COLUMN dark_mode SET NOT NULL;
          ALTER TABLE users ALTER COLUMN dark_mode SET DEFAULT FALSE;
        END IF;
      END $$;
    `);

    // Migration: Add preferences JSONB column to users table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'preferences'
        ) THEN
          ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    // Trusted devices table for "Remember this device" MFA feature
    await client.query(`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

    // Index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_id ON trusted_devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices(device_token);
    `);

    // Add foreign key to teams after users table exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'teams_owner_id_fkey'
        ) THEN
          ALTER TABLE teams ADD CONSTRAINT teams_owner_id_fkey
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Customers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        customer_number TEXT,
        contact_person TEXT,
        email TEXT,
        address TEXT,
        report_title TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        rate_type TEXT NOT NULL CHECK(rate_type IN ('hourly', 'daily')),
        hourly_rate DECIMAL(10, 2),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Activities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_billable BOOLEAN DEFAULT TRUE,
        pricing_type TEXT DEFAULT 'hourly' CHECK(pricing_type IN ('hourly', 'flat')),
        flat_rate DECIMAL(10, 2),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Time entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTEGER,
        description TEXT,
        is_running BOOLEAN DEFAULT FALSE,
        external_id TEXT,
        external_source TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Company info table
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_info (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        zip_code TEXT NOT NULL,
        country TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        website TEXT,
        tax_id TEXT,
        customer_number TEXT,
        logo TEXT
      )
    `);

    // Migration: Add customer_number to company_info if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'company_info' AND column_name = 'customer_number'
        ) THEN
          ALTER TABLE company_info ADD COLUMN customer_number TEXT;
        END IF;
      END $$;
    `);

    // Team invitations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_invitations (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        invitation_code TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Email notifications log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type TEXT NOT NULL,
        sent_at TIMESTAMP NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'pending')),
        error_message TEXT
      )
    `);

    // Password reset tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Audit logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Notification settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        weekly_summary_enabled BOOLEAN DEFAULT TRUE,
        weekly_summary_day INTEGER DEFAULT 5 CHECK(weekly_summary_day BETWEEN 0 AND 6),
        missing_entries_enabled BOOLEAN DEFAULT TRUE,
        missing_entries_threshold INTEGER DEFAULT 3,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for better performance
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_start_time ON time_entries(start_time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

    // Add role column to users table if it doesn't exist (migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'role'
        ) THEN
          ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin'));
          UPDATE users SET role = 'user' WHERE role IS NULL;
        END IF;
      END $$;
    `);

    // Add time_format column to users table if it doesn't exist (migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'time_format'
        ) THEN
          ALTER TABLE users ADD COLUMN time_format TEXT DEFAULT '24h' CHECK(time_format IN ('12h', '24h'));
          UPDATE users SET time_format = '24h' WHERE time_format IS NULL;
        END IF;
      END $$;
    `);

    // Create report_approvals table if it doesn't exist (migration)
    await client.query(`
      CREATE TABLE IF NOT EXISTS report_approvals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT,
        report_data JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
        comment TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create index for report_approvals
    await client.query('CREATE INDEX IF NOT EXISTS idx_report_approvals_user_id ON report_approvals(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_report_approvals_token ON report_approvals(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_report_approvals_status ON report_approvals(status)');

    // Migration: Extend report_approvals to support 'saved' status and nullable recipient_email
    await client.query(`
      DO $$
      BEGIN
        -- Drop and recreate the status check constraint to include 'saved'
        ALTER TABLE report_approvals DROP CONSTRAINT IF EXISTS report_approvals_status_check;
        ALTER TABLE report_approvals ADD CONSTRAINT report_approvals_status_check
          CHECK(status IN ('pending', 'approved', 'rejected', 'saved'));

        -- Make recipient_email nullable for saved reports
        ALTER TABLE report_approvals ALTER COLUMN recipient_email DROP NOT NULL;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);

    // ============================================
    // NinjaRMM Integration Tables
    // ============================================

    // NinjaRMM configuration per user
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_config (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT,
        client_secret TEXT,
        instance_url TEXT DEFAULT 'https://app.ninjarmm.com',
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        auto_sync_devices BOOLEAN DEFAULT FALSE,
        sync_interval_minutes INTEGER DEFAULT 60,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // NinjaRMM organizations (mapped to customers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_organizations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ninja_org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        device_count INTEGER DEFAULT 0,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, ninja_org_id)
      )
    `);

    // NinjaRMM devices
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ninja_device_id TEXT NOT NULL,
        ninja_org_id TEXT NOT NULL,
        organization_id TEXT REFERENCES ninjarmm_organizations(id) ON DELETE CASCADE,
        system_name TEXT NOT NULL,
        dns_name TEXT,
        device_type TEXT,
        os_name TEXT,
        os_version TEXT,
        last_contact TIMESTAMP,
        last_logged_in_user TEXT,
        public_ip TEXT,
        private_ip TEXT,
        offline BOOLEAN DEFAULT FALSE,
        approval_status TEXT,
        notes TEXT,
        custom_fields JSONB,
        last_sync_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, ninja_device_id)
      )
    `);

    // NinjaRMM alerts (for future: alerts → tickets)
    // Note: ticket_id reference added later after tickets table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ninja_alert_id TEXT NOT NULL,
        ninja_device_id TEXT,
        device_id TEXT REFERENCES ninjarmm_devices(id) ON DELETE SET NULL,
        severity TEXT,
        priority TEXT,
        message TEXT,
        source_type TEXT,
        created_at_ninja TIMESTAMP,
        ticket_id TEXT,
        status TEXT DEFAULT 'new' CHECK(status IN ('new', 'acknowledged', 'resolved', 'ticket_created')),
        synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, ninja_alert_id)
      )
    `);

    // Add ninjarmm_organization_id to customers table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'ninjarmm_organization_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN ninjarmm_organization_id TEXT;
        END IF;
      END $$;
    `);

    // Migration: Add time_rounding_interval to customers (for billing)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'time_rounding_interval'
        ) THEN
          ALTER TABLE customers ADD COLUMN time_rounding_interval INTEGER DEFAULT 15;
        END IF;
      END $$;
    `);

    // Migration: Add payment_terms_days to customers (for invoicing)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'payment_terms_days'
        ) THEN
          ALTER TABLE customers ADD COLUMN payment_terms_days INTEGER DEFAULT 14;
        END IF;
      END $$;
    `);

    // Migration: Add display_name and import_aliases to customers (for PDFs and import)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'display_name'
        ) THEN
          ALTER TABLE customers ADD COLUMN display_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'import_aliases'
        ) THEN
          ALTER TABLE customers ADD COLUMN import_aliases TEXT[] DEFAULT '{}';
        END IF;
      END $$;
    `);

    // Migration: Add vendor/supplier support to customers (Lieferanten-Hub)
    await client.query(`
      DO $$
      BEGIN
        -- is_vendor flag to mark customers as vendors/suppliers
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'is_vendor'
        ) THEN
          ALTER TABLE customers ADD COLUMN is_vendor BOOLEAN DEFAULT false;
        END IF;
        -- vendor_domain for email matching (e.g., 'elovade.com')
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'vendor_domain'
        ) THEN
          ALTER TABLE customers ADD COLUMN vendor_domain TEXT;
        END IF;
        -- vendor_notes for additional vendor information
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'vendor_notes'
        ) THEN
          ALTER TABLE customers ADD COLUMN vendor_notes TEXT;
        END IF;
        -- vendor_api_config for external API connections (JSON)
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'vendor_api_config'
        ) THEN
          ALTER TABLE customers ADD COLUMN vendor_api_config JSONB;
        END IF;
      END $$;
    `);

    // Migration: Add missing columns to ninjarmm_alerts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'resolved'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN resolved BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'resolved_at'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN resolved_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'ninja_uid'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN ninja_uid TEXT;
          -- Copy data from ninja_alert_id to ninja_uid
          UPDATE ninjarmm_alerts SET ninja_uid = ninja_alert_id WHERE ninja_uid IS NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'activity_time'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN activity_time TIMESTAMP;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'source_name'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN source_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_alerts' AND column_name = 'alert_data'
        ) THEN
          ALTER TABLE ninjarmm_alerts ADD COLUMN alert_data JSONB;
        END IF;
      END $$;
    `);

    // Create unique index on ninja_uid if it doesn't exist
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ninjarmm_alerts_user_ninja_uid
      ON ninjarmm_alerts(user_id, ninja_uid) WHERE ninja_uid IS NOT NULL
    `);

    // Migration: Add missing columns to ninjarmm_devices
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'ninja_id'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN ninja_id INTEGER;
          -- Copy from ninja_device_id
          UPDATE ninjarmm_devices SET ninja_id = ninja_device_id::INTEGER WHERE ninja_id IS NULL AND ninja_device_id ~ '^[0-9]+$';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'display_name'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN display_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'node_class'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN node_class TEXT;
          UPDATE ninjarmm_devices SET node_class = device_type WHERE node_class IS NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'manufacturer'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN manufacturer TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'model'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN model TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'serial_number'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN serial_number TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'synced_at'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN synced_at TIMESTAMP DEFAULT NOW();
          UPDATE ninjarmm_devices SET synced_at = last_sync_at WHERE synced_at IS NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_devices' AND column_name = 'device_data'
        ) THEN
          ALTER TABLE ninjarmm_devices ADD COLUMN device_data JSONB;
        END IF;
      END $$;
    `);

    // Migration: Add missing columns to ninjarmm_organizations
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_organizations' AND column_name = 'ninja_id'
        ) THEN
          ALTER TABLE ninjarmm_organizations ADD COLUMN ninja_id INTEGER;
          UPDATE ninjarmm_organizations SET ninja_id = ninja_org_id::INTEGER WHERE ninja_id IS NULL AND ninja_org_id ~ '^[0-9]+$';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_organizations' AND column_name = 'synced_at'
        ) THEN
          ALTER TABLE ninjarmm_organizations ADD COLUMN synced_at TIMESTAMP DEFAULT NOW();
          UPDATE ninjarmm_organizations SET synced_at = last_sync_at WHERE synced_at IS NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_organizations' AND column_name = 'userdata'
        ) THEN
          ALTER TABLE ninjarmm_organizations ADD COLUMN userdata JSONB;
        END IF;
      END $$;
    `);

    // Create indexes for NinjaRMM tables (with conditional checks for optional columns)
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_devices_user_id ON ninjarmm_devices(user_id)');
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ninjarmm_devices' AND column_name = 'organization_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ninjarmm_devices_org_id ON ninjarmm_devices(organization_id)';
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_devices_ninja_org_id ON ninjarmm_devices(ninja_org_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_organizations_user_id ON ninjarmm_organizations(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_organizations_customer_id ON ninjarmm_organizations(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alerts_user_id ON ninjarmm_alerts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alerts_device_id ON ninjarmm_alerts(device_id)');
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'ninjarmm_organization_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customers_ninjarmm_org ON customers(ninjarmm_organization_id)';
        END IF;
      END $$;
    `);

    // Migration: Add webhook columns to ninjarmm_config
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_config' AND column_name = 'webhook_secret'
        ) THEN
          ALTER TABLE ninjarmm_config ADD COLUMN webhook_secret TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_config' AND column_name = 'webhook_enabled'
        ) THEN
          ALTER TABLE ninjarmm_config ADD COLUMN webhook_enabled BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_config' AND column_name = 'webhook_auto_create_tickets'
        ) THEN
          ALTER TABLE ninjarmm_config ADD COLUMN webhook_auto_create_tickets BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_config' AND column_name = 'webhook_min_severity'
        ) THEN
          ALTER TABLE ninjarmm_config ADD COLUMN webhook_min_severity TEXT DEFAULT 'MAJOR';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ninjarmm_config' AND column_name = 'webhook_auto_resolve_tickets'
        ) THEN
          ALTER TABLE ninjarmm_config ADD COLUMN webhook_auto_resolve_tickets BOOLEAN DEFAULT TRUE;
        END IF;
      END $$;
    `);

    // NinjaRMM webhook events log
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_webhook_events (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        ninja_alert_id TEXT,
        ninja_device_id TEXT,
        severity TEXT,
        status TEXT DEFAULT 'received' CHECK(status IN ('received', 'processed', 'failed', 'ignored')),
        payload JSONB,
        error_message TEXT,
        alert_id TEXT REFERENCES ninjarmm_alerts(id) ON DELETE SET NULL,
        ticket_id TEXT,
        processing_time_ms INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_webhook_events_user ON ninjarmm_webhook_events(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_webhook_events_created ON ninjarmm_webhook_events(created_at DESC)');

    // Add message and device_name columns to webhook events for better display
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE ninjarmm_webhook_events ADD COLUMN IF NOT EXISTS message TEXT;
        ALTER TABLE ninjarmm_webhook_events ADD COLUMN IF NOT EXISTS device_name TEXT;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);

    // NinjaRMM alert exclusions - rules to ignore certain alerts
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_alert_exclusions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        match_type TEXT NOT NULL DEFAULT 'contains' CHECK(match_type IN ('contains', 'equals', 'regex', 'starts_with', 'ends_with')),
        match_field TEXT NOT NULL DEFAULT 'message' CHECK(match_field IN ('message', 'source_name', 'condition_name', 'device_name', 'severity')),
        match_value TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        hit_count INTEGER DEFAULT 0,
        last_hit_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alert_exclusions_user ON ninjarmm_alert_exclusions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alert_exclusions_active ON ninjarmm_alert_exclusions(user_id, is_active)');

    // ============================================
    // NinjaRMM Device IP History
    // Tracks IP address changes for 30 days
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_device_ip_history (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES ninjarmm_devices(id) ON DELETE CASCADE,
        ip_type TEXT NOT NULL CHECK(ip_type IN ('private', 'public')),
        old_ip TEXT NOT NULL,
        new_ip TEXT NOT NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_ip_history_device ON ninjarmm_device_ip_history(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_ip_history_changed ON ninjarmm_device_ip_history(changed_at)');

    // Auto-cleanup old IP history entries (older than 30 days)
    // This is done via scheduled job, but we can also add trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_ip_history() RETURNS trigger AS $$
      BEGIN
        DELETE FROM ninjarmm_device_ip_history WHERE changed_at < NOW() - INTERVAL '30 days';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger if not exists (only fires occasionally to avoid performance impact)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_cleanup_ip_history'
        ) THEN
          CREATE TRIGGER trigger_cleanup_ip_history
          AFTER INSERT ON ninjarmm_device_ip_history
          FOR EACH STATEMENT
          EXECUTE FUNCTION cleanup_old_ip_history();
        END IF;
      END $$;
    `);

    logger.info('✅ Device IP history table created with 30-day retention');

    // ============================================
    // NinjaRMM Device Software Inventory
    // Stores installed software for devices (loaded on-demand)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_device_software (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES ninjarmm_devices(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        publisher TEXT,
        version TEXT,
        install_date TEXT,
        size_bytes BIGINT,
        ninja_software_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(device_id, name, version)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_software_device ON ninjarmm_device_software(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_software_name ON ninjarmm_device_software(name)');

    logger.info('✅ Device software inventory table created');

    // ============================================
    // NinjaRMM Device OS Patches (Windows Updates)
    // Stores installed and pending OS patches for devices
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_device_os_patches (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES ninjarmm_devices(id) ON DELETE CASCADE,
        patch_type TEXT NOT NULL CHECK(patch_type IN ('installed', 'pending', 'failed', 'rejected')),
        kb_number TEXT,
        name TEXT NOT NULL,
        description TEXT,
        severity TEXT,
        category TEXT,
        install_date TIMESTAMP,
        installed_on TEXT,
        size_bytes BIGINT,
        status TEXT,
        ninja_patch_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(device_id, patch_type, name, kb_number)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_os_patches_device ON ninjarmm_device_os_patches(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_os_patches_type ON ninjarmm_device_os_patches(device_id, patch_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_device_os_patches_kb ON ninjarmm_device_os_patches(kb_number)');

    logger.info('✅ Device OS patches table created');
}
