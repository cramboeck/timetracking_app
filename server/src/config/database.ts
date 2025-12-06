import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const pool = new Pool({
  connectionString,
  // Disable SSL for Docker internal connections (database hostname)
  // Enable SSL only for external database connections (e.g., managed databases)
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to run queries
export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Query error:', { text, error });
    throw error;
  }
}

// Helper function to get a client from the pool
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

// Initialize database schema
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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
        accent_color TEXT DEFAULT 'blue',
        gray_tone TEXT DEFAULT 'medium',
        time_rounding_interval INTEGER DEFAULT 15,
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

    // Create indexes for NinjaRMM tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_devices_user_id ON ninjarmm_devices(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_devices_org_id ON ninjarmm_devices(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_devices_ninja_org_id ON ninjarmm_devices(ninja_org_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_organizations_user_id ON ninjarmm_organizations(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_organizations_customer_id ON ninjarmm_organizations(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alerts_user_id ON ninjarmm_alerts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ninjarmm_alerts_device_id ON ninjarmm_alerts(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_ninjarmm_org ON customers(ninjarmm_organization_id)');

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
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
        category TEXT,
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'portal', 'email', 'ninja_alert')),
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
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE tickets ADD COLUMN ninja_alert_id TEXT;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
        WHEN others THEN NULL;
      END $$;
    `);

    // Migration: Add portal_user_id to ticket_comments if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_comments' AND column_name = 'portal_user_id'
        ) THEN
          ALTER TABLE ticket_comments ADD COLUMN portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Ticket comments/updates
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL,
        comment TEXT NOT NULL,
        is_internal BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
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
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_device ON tickets(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_ticket ON time_entries(ticket_id)');

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
    // Canned Responses (for quick ticket replies)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS canned_responses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        shortcut TEXT,
        category TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_canned_responses_org ON canned_responses(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_canned_responses_user ON canned_responses(user_id)');

    // ============================================
    // Ticket Tags
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tags (
        id TEXT PRIMARY KEY,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3B82F6',
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tags_org ON ticket_tags(organization_id)');

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
    console.log('✅ Customer contact notification preferences added');

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
          UPDATE ticket_sequences SET organization_id = new_org_id WHERE user_id = user_rec.id AND organization_id IS NULL;

          RAISE NOTICE 'Created organization % for user %', new_org_id, user_rec.username;
        END LOOP;
      END $$;
    `);

    console.log('✅ Multi-tenant organization migration completed');

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
    console.log('✅ Ticket sequences migrated to organization-based');

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
    console.log('✅ Ticket tasks extended with assigned_to, due_date, description');

    // ============================================
    // Lead Management System
    // ============================================

    // Lead status tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,

        -- Basic info
        name TEXT NOT NULL,
        company TEXT,
        email TEXT,
        phone TEXT,
        website TEXT,

        -- Lead qualification
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
        source TEXT CHECK(source IN ('website', 'referral', 'cold_call', 'email', 'event', 'social_media', 'advertising', 'other')),
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'hot')),

        -- Value
        estimated_value DECIMAL(12, 2),
        probability INTEGER CHECK(probability >= 0 AND probability <= 100),

        -- Assignment
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,

        -- Dates
        expected_close_date DATE,
        last_contact_date TIMESTAMP,
        next_follow_up DATE,

        -- Additional info
        description TEXT,
        notes TEXT,
        tags TEXT[],
        custom_fields JSONB DEFAULT '{}',

        -- Timestamps
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        converted_at TIMESTAMP,
        lost_reason TEXT
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(organization_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to)');
    console.log('✅ Leads table created');

    // Lead activities/interactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_activities (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

        activity_type TEXT NOT NULL CHECK(activity_type IN ('call', 'email', 'meeting', 'note', 'task', 'status_change', 'demo', 'proposal_sent')),
        title TEXT NOT NULL,
        description TEXT,

        -- For scheduled activities
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        is_completed BOOLEAN DEFAULT false,

        -- Metadata
        outcome TEXT,
        duration_minutes INTEGER,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_lead_activities_user ON lead_activities(user_id)');
    console.log('✅ Lead activities table created');

    // ============================================
    // Unified Task Hub - Standalone Tasks System
    // ============================================

    // Main tasks table - can exist independently or linked to tickets/projects
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        -- Basic info
        title TEXT NOT NULL,
        description TEXT,

        -- Status and priority
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

        -- Optional linking - tasks can be standalone or connected
        ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,

        -- Assignment
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

        -- Time management
        due_date TIMESTAMP,
        due_time TIME,
        reminder_at TIMESTAMP,
        estimated_minutes INTEGER,

        -- Recurrence (for recurring tasks)
        is_recurring BOOLEAN DEFAULT false,
        recurrence_pattern TEXT CHECK(recurrence_pattern IN ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
        recurrence_interval INTEGER DEFAULT 1,
        recurrence_days TEXT[], -- For weekly: ['monday', 'wednesday', 'friday']
        recurrence_end_date DATE,
        parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,

        -- Categorization
        category TEXT,
        tags TEXT[],
        color TEXT,

        -- Completion tracking
        completed_at TIMESTAMP,
        completed_by TEXT REFERENCES users(id) ON DELETE SET NULL,

        -- Ordering
        sort_order INTEGER DEFAULT 0,

        -- Timestamps
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Task time entries - link time tracking directly to tasks
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'task_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Task checklist items (subtasks)
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_checklist_items (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Task comments/notes
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Task activity log
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_activity_log (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Task templates for quick task creation
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_templates (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
        estimated_minutes INTEGER,
        category TEXT,
        tags TEXT[],
        checklist_items JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, name)
      )
    `);

    // Create indexes for tasks
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(organization_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_ticket ON tasks(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_templates_org ON task_templates(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id)');

    console.log('✅ Unified Task Hub tables created');

    await client.query('COMMIT');
    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Database pool has ended');
  });
});
