import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

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
  logger.info('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to run queries
export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Query error', { text, error });
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

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'organization_id') THEN
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id)';
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(organization_id, status)';
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to)');
    logger.info('✅ Leads table created');

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
    logger.info('✅ Lead activities table created');

    // ============================================
    // CRM - Customer Contacts & Interactions
    // ============================================

    // Migration: Handle pre-existing customer_contacts table that may lack organization_id
    // (from earlier portal-only version). Drop and recreate with full CRM schema.
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'customer_contacts'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_contacts' AND column_name = 'organization_id'
        ) THEN
          -- Remove dependent objects first
          DROP TABLE IF EXISTS customer_contact_push_subscriptions CASCADE;
          DROP TABLE IF EXISTS customer_contact_notification_log CASCADE;
          DROP TABLE customer_contacts CASCADE;
        END IF;
      END $$
    `);

    // Customer Contacts - Real CRM contacts (not just portal users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_contacts (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

        -- Basic info
        first_name TEXT,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        mobile TEXT,

        -- Position
        job_title TEXT,
        department TEXT,

        -- Role in company
        role TEXT DEFAULT 'contact' CHECK(role IN ('decision_maker', 'technical', 'billing', 'contact', 'executive')),
        is_primary BOOLEAN DEFAULT false,

        -- Portal link (optional - if they also have portal access)
        portal_user_id TEXT REFERENCES customer_portal_users(id) ON DELETE SET NULL,

        -- Communication preferences
        preferred_contact_method TEXT DEFAULT 'email' CHECK(preferred_contact_method IN ('email', 'phone', 'mobile', 'portal')),
        notify_on_ticket_update BOOLEAN DEFAULT true,
        notify_on_maintenance BOOLEAN DEFAULT true,

        -- Social profiles
        linkedin_url TEXT,

        -- Notes
        notes TEXT,

        -- Avatar/Photo
        avatar_url TEXT,

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_contacts_org ON customer_contacts(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email)');
    logger.info('✅ Customer contacts table created');

    // Customer Interactions - Communication log
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_interactions (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        contact_id TEXT REFERENCES customer_contacts(id) ON DELETE SET NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

        -- Interaction type
        type TEXT NOT NULL CHECK(type IN ('call', 'email', 'meeting', 'note', 'ticket', 'quote', 'invoice', 'contract', 'visit', 'video_call', 'chat')),
        direction TEXT CHECK(direction IN ('inbound', 'outbound')),

        -- Details
        subject TEXT,
        content TEXT,
        summary TEXT,

        -- Links to other entities
        ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
        lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
        contract_id TEXT, -- FK to contracts added later (contracts table created after this)

        -- Timing
        duration_minutes INTEGER,
        scheduled_at TIMESTAMP,
        occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),

        -- Follow-up
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date DATE,
        follow_up_assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        follow_up_notes TEXT,
        follow_up_completed BOOLEAN DEFAULT false,

        -- Sentiment/outcome
        outcome TEXT CHECK(outcome IN ('positive', 'neutral', 'negative', 'pending')),
        tags TEXT[],

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_org ON customer_interactions(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_contact ON customer_interactions(contact_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_user ON customer_interactions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_date ON customer_interactions(occurred_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_followup ON customer_interactions(follow_up_date) WHERE follow_up_required = true AND follow_up_completed = false');

    // Migration: Add external_id and external_source columns for email integration
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_interactions' AND column_name = 'external_id'
        ) THEN
          ALTER TABLE customer_interactions ADD COLUMN external_id TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer_interactions' AND column_name = 'external_source'
        ) THEN
          ALTER TABLE customer_interactions ADD COLUMN external_source TEXT;
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_interactions_external ON customer_interactions(organization_id, external_id, external_source) WHERE external_id IS NOT NULL');

    logger.info('✅ Customer interactions table created');

    // CLEANUP: crm_interactions war ein ungenutztes Duplikat von customer_interactions.
    // Alle Felder (external_id, external_source, updated_at) wurden in customer_interactions migriert.
    // Die Tabelle wird sicher entfernt, da sie nie im Code referenziert wurde.
    await client.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'crm_interactions') THEN
          -- Sicherheitscheck: Nur löschen wenn leer (keine Produktionsdaten)
          IF (SELECT COUNT(*) FROM crm_interactions) = 0 THEN
            DROP TABLE crm_interactions CASCADE;
            RAISE NOTICE 'crm_interactions (leer, ungenutzt) wurde entfernt';
          ELSE
            RAISE NOTICE 'crm_interactions hat Daten – wird nicht gelöscht. Bitte manuell prüfen.';
          END IF;
        END IF;
      END $$;
    `);
    logger.info('✅ crm_interactions Cleanup abgeschlossen');

    // SLA Policies - Missing table that was referenced but not created
    await client.query(`
      CREATE TABLE IF NOT EXISTS sla_policies (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        name TEXT NOT NULL,
        description TEXT,
        is_default BOOLEAN DEFAULT false,

        -- Response times (in hours)
        response_time_low INTEGER DEFAULT 24,
        response_time_normal INTEGER DEFAULT 8,
        response_time_high INTEGER DEFAULT 4,
        response_time_critical INTEGER DEFAULT 1,

        -- Resolution times (in hours)
        resolution_time_low INTEGER DEFAULT 120,
        resolution_time_normal INTEGER DEFAULT 48,
        resolution_time_high INTEGER DEFAULT 24,
        resolution_time_critical INTEGER DEFAULT 8,

        -- Business hours
        business_hours_only BOOLEAN DEFAULT true,
        business_hours_start TIME DEFAULT '08:00',
        business_hours_end TIME DEFAULT '18:00',
        business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],

        -- Escalation
        escalation_enabled BOOLEAN DEFAULT false,
        escalation_after_percent INTEGER DEFAULT 80,
        escalation_notify_users TEXT[],

        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_sla_policies_org ON sla_policies(organization_id)');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_policies_default ON sla_policies(organization_id) WHERE is_default = true');
    logger.info('✅ SLA policies table created');

    // Link SLA policies to customers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'sla_policy_id') THEN
          ALTER TABLE customers ADD COLUMN sla_policy_id TEXT REFERENCES sla_policies(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Customer Metrics - For health dashboard and analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_metrics (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        -- Period
        period_type TEXT NOT NULL CHECK(period_type IN ('monthly', 'quarterly', 'yearly')),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,

        -- Revenue metrics
        revenue DECIMAL(12,2) DEFAULT 0,
        hours_billed DECIMAL(8,2) DEFAULT 0,
        hours_unbilled DECIMAL(8,2) DEFAULT 0,

        -- Ticket metrics
        tickets_opened INTEGER DEFAULT 0,
        tickets_resolved INTEGER DEFAULT 0,
        tickets_escalated INTEGER DEFAULT 0,
        avg_resolution_time_hours DECIMAL(8,2),
        avg_first_response_time_hours DECIMAL(8,2),
        sla_breaches INTEGER DEFAULT 0,

        -- Engagement metrics
        interactions_count INTEGER DEFAULT 0,
        last_interaction_date TIMESTAMP,

        -- Contract metrics
        active_contracts INTEGER DEFAULT 0,
        contract_value DECIMAL(12,2) DEFAULT 0,

        -- Calculated health score (0-100)
        health_score INTEGER,
        health_trend TEXT CHECK(health_trend IN ('improving', 'stable', 'declining')),

        -- Risk indicators
        churn_risk TEXT CHECK(churn_risk IN ('low', 'medium', 'high')),
        risk_factors TEXT[],

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

        UNIQUE(customer_id, period_type, period_start)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_metrics_org ON customer_metrics(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_metrics_customer ON customer_metrics(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_metrics_period ON customer_metrics(period_start, period_end)');
    logger.info('✅ Customer metrics table created');

    // Churn Risk Warnings - Generated by health score job
    await client.query(`
      CREATE TABLE IF NOT EXISTS churn_risk_warnings (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        -- Warning details
        health_score INTEGER NOT NULL,
        churn_risk TEXT NOT NULL CHECK(churn_risk IN ('medium', 'high')),
        risk_factors TEXT[],

        -- Timestamps
        generated_at TIMESTAMP NOT NULL DEFAULT NOW(),

        -- Acknowledgment
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_at TIMESTAMP,
        acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Unique constraint: one warning per customer per day (using expression index)
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_churn_warnings_unique_day ON churn_risk_warnings(customer_id, DATE(generated_at))');
    await client.query('CREATE INDEX IF NOT EXISTS idx_churn_warnings_org ON churn_risk_warnings(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_churn_warnings_customer ON churn_risk_warnings(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_churn_warnings_unack ON churn_risk_warnings(organization_id, acknowledged) WHERE acknowledged = false');
    await client.query('CREATE INDEX IF NOT EXISTS idx_churn_warnings_risk ON churn_risk_warnings(organization_id, churn_risk)');
    logger.info('✅ Churn risk warnings table created');

    // Health Score Job Runs - Track job execution history
    await client.query(`
      CREATE TABLE IF NOT EXISTS health_score_job_runs (
        id TEXT PRIMARY KEY,
        started_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP NOT NULL,
        duration_ms INTEGER NOT NULL,

        -- Results
        success BOOLEAN NOT NULL,
        customers_processed INTEGER DEFAULT 0,
        customers_updated INTEGER DEFAULT 0,
        customers_skipped INTEGER DEFAULT 0,
        warnings_generated INTEGER DEFAULT 0,

        -- Errors (JSON array)
        errors TEXT,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_job_runs_date ON health_score_job_runs(started_at DESC)');
    logger.info('✅ Health score job runs table created');

    // ============================================
    // Sales Pipeline - Opportunities
    // ============================================

    // Pipeline stages - configurable per organization
    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#3B82F6',

        -- Win probability at this stage
        probability INTEGER DEFAULT 0 CHECK(probability >= 0 AND probability <= 100),
        sort_order INTEGER NOT NULL,

        -- Stage type
        is_won BOOLEAN DEFAULT false,
        is_lost BOOLEAN DEFAULT false,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org ON pipeline_stages(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON pipeline_stages(organization_id, sort_order)');
    logger.info('✅ Pipeline stages table created');

    // Opportunities - Sales deals
    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
        contact_id TEXT REFERENCES customer_contacts(id) ON DELETE SET NULL,

        -- Basic info
        name TEXT NOT NULL,
        description TEXT,

        -- Pipeline position
        stage_id TEXT REFERENCES pipeline_stages(id) ON DELETE SET NULL,

        -- Value
        value DECIMAL(12,2),
        currency TEXT DEFAULT 'EUR',
        probability INTEGER CHECK(probability >= 0 AND probability <= 100),
        weighted_value DECIMAL(12,2), -- calculated: value * probability / 100

        -- Dates
        expected_close_date DATE,
        actual_close_date DATE,

        -- Assignment
        assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,

        -- Status
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'won', 'lost')),
        lost_reason TEXT,
        lost_to_competitor TEXT,

        -- Source tracking
        source TEXT,
        campaign TEXT,

        -- Next steps
        next_step TEXT,
        next_step_date DATE,

        -- Notes
        notes TEXT,
        tags TEXT[],

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunities_org ON opportunities(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunities_customer ON opportunities(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON opportunities(assigned_to)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(organization_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunities_close_date ON opportunities(expected_close_date) WHERE status = \'open\'');
    logger.info('✅ Opportunities table created');

    // Opportunity activities
    await client.query(`
      CREATE TABLE IF NOT EXISTS opportunity_activities (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

        activity_type TEXT NOT NULL CHECK(activity_type IN ('note', 'call', 'email', 'meeting', 'stage_change', 'value_change', 'task', 'demo', 'proposal', 'negotiation')),
        title TEXT NOT NULL,
        description TEXT,

        -- For stage changes
        old_stage_id TEXT REFERENCES pipeline_stages(id),
        new_stage_id TEXT REFERENCES pipeline_stages(id),

        -- For value changes
        old_value DECIMAL(12,2),
        new_value DECIMAL(12,2),

        -- Scheduling
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        is_completed BOOLEAN DEFAULT false,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunity_activities_opp ON opportunity_activities(opportunity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_opportunity_activities_user ON opportunity_activities(user_id)');
    logger.info('✅ Opportunity activities table created');

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

    logger.info('✅ Unified Task Hub tables created');

    // ============================================
    // Contract Management System
    // ============================================

    // Main contracts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

        -- Contract details
        contract_number TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,

        -- Contract type and category
        contract_type TEXT NOT NULL CHECK(contract_type IN ('service', 'support', 'maintenance', 'project', 'subscription', 'framework', 'other')),

        -- Status and lifecycle
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'paused', 'expiring', 'expired', 'cancelled', 'terminated')),

        -- Contract period
        start_date DATE NOT NULL,
        end_date DATE,
        is_indefinite BOOLEAN DEFAULT false,

        -- Termination/Notice
        notice_period_days INTEGER DEFAULT 30,
        auto_renew BOOLEAN DEFAULT false,
        renewal_period_months INTEGER DEFAULT 12,

        -- Financial
        billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'one_time', 'per_call')),
        base_price DECIMAL(12, 2),
        currency TEXT DEFAULT 'EUR',

        -- Included hours (for service contracts)
        included_hours_monthly DECIMAL(6, 2),
        hourly_rate DECIMAL(10, 2),
        overage_rate DECIMAL(10, 2),

        -- SLA
        sla_response_hours INTEGER,
        sla_resolution_hours INTEGER,
        support_hours TEXT, -- e.g., "Mo-Fr 08:00-18:00"

        -- Documents and attachments
        document_url TEXT,

        -- Notes and internal info
        internal_notes TEXT,

        -- Linked project (optional)
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,

        -- Tracking
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Contract positions/services
    await client.query(`
      CREATE TABLE IF NOT EXISTS contract_positions (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,

        -- Position details
        position_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,

        -- Pricing
        quantity DECIMAL(10, 2) DEFAULT 1,
        unit TEXT DEFAULT 'Stück',
        unit_price DECIMAL(12, 2),
        total_price DECIMAL(12, 2),

        -- Type
        position_type TEXT DEFAULT 'service' CHECK(position_type IN ('service', 'product', 'license', 'hours', 'flat_fee', 'other')),

        -- Recurrence
        is_recurring BOOLEAN DEFAULT true,
        billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly', 'quarterly', 'semi_annual', 'annual', 'one_time')),

        -- Ordering
        sort_order INTEGER DEFAULT 0,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Contract hourly budget tracking (for tracking used hours per month)
    await client.query(`
      CREATE TABLE IF NOT EXISTS contract_hourly_tracking (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,

        -- Period
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,

        -- Hours
        included_hours DECIMAL(6, 2) NOT NULL,
        used_hours DECIMAL(8, 2) DEFAULT 0,
        overage_hours DECIMAL(8, 2) DEFAULT 0,

        -- Rollover from previous month
        rollover_hours DECIMAL(6, 2) DEFAULT 0,

        -- Financial
        overage_amount DECIMAL(12, 2) DEFAULT 0,

        -- Notes
        notes TEXT,

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

        UNIQUE(contract_id, year, month)
      )
    `);

    // Contract activity log
    await client.query(`
      CREATE TABLE IF NOT EXISTS contract_activity_log (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

        action TEXT NOT NULL,
        details JSONB,

        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Link time entries to contracts
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'contract_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Migration: Add user_id column to contracts if it doesn't exist (for existing tables with organization_id)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'contracts' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE contracts ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // Create indexes for contracts
    await client.query('CREATE INDEX IF NOT EXISTS idx_contracts_user ON contracts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(user_id, status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(user_id, contract_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contract_positions_contract ON contract_positions(contract_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contract_hourly_tracking ON contract_hourly_tracking(contract_id, year, month)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_contract_activity_contract ON contract_activity_log(contract_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_contract ON time_entries(contract_id)');

    logger.info('✅ Contract Management tables created');

    // Add FK from customer_interactions to contracts (contracts created after interactions)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_customer_interactions_contract'
        ) THEN
          ALTER TABLE customer_interactions
            ADD CONSTRAINT fk_customer_interactions_contract
            FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ============================================
    // sevDesk Integration
    // ============================================

    // sevDesk configuration per user
    await client.query(`
      CREATE TABLE IF NOT EXISTS sevdesk_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        api_token TEXT,
        default_hourly_rate DECIMAL(10, 2) DEFAULT 95.00,
        payment_terms_days INTEGER DEFAULT 14,
        tax_rate DECIMAL(5, 2) DEFAULT 19.00,
        auto_sync_customers BOOLEAN DEFAULT FALSE,
        create_as_final BOOLEAN DEFAULT FALSE,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    // sevDesk synced documents (invoices & quotes for search)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sevdesk_documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sevdesk_id TEXT NOT NULL,
        document_type TEXT NOT NULL CHECK(document_type IN ('invoice', 'quote')),
        document_number TEXT,
        contact_id TEXT,
        contact_name TEXT,
        document_date TIMESTAMP,
        status INTEGER,
        status_name TEXT,
        header TEXT,
        head_text TEXT,
        foot_text TEXT,
        sum_net DECIMAL(12, 2),
        sum_gross DECIMAL(12, 2),
        sum_tax DECIMAL(12, 2),
        currency TEXT DEFAULT 'EUR',
        positions_json JSONB DEFAULT '[]',
        full_text TEXT,
        search_vector TSVECTOR,
        synced_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, sevdesk_id, document_type)
      )
    `);

    // Create search vector trigger for sevdesk_documents
    await client.query(`
      CREATE OR REPLACE FUNCTION update_sevdesk_documents_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector := to_tsvector('german',
          COALESCE(NEW.document_number, '') || ' ' ||
          COALESCE(NEW.contact_name, '') || ' ' ||
          COALESCE(NEW.header, '') || ' ' ||
          COALESCE(NEW.full_text, '')
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_sevdesk_documents_search_vector') THEN
          CREATE TRIGGER trigger_sevdesk_documents_search_vector
          BEFORE INSERT OR UPDATE ON sevdesk_documents
          FOR EACH ROW EXECUTE FUNCTION update_sevdesk_documents_search_vector();
        END IF;
      END $$;
    `);

    // Migration: Add sevdesk_customer_id to customers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'sevdesk_customer_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN sevdesk_customer_id TEXT;
        END IF;
      END $$;
    `);

    // Migration: Add sevdesk_position_template + default_contract_id to customers.
    // Allows per-customer free-text template (with {placeholders}) that gets
    // appended to every invoice position's `text`-field on sevdesk push.
    // default_contract_id is the source for {contractNumber}/{contractTitle}.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'sevdesk_position_template'
        ) THEN
          ALTER TABLE customers ADD COLUMN sevdesk_position_template TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'default_contract_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN default_contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Migration: Add hourly_rate to customers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'hourly_rate'
        ) THEN
          ALTER TABLE customers ADD COLUMN hourly_rate DECIMAL(10, 2);
        END IF;
      END $$;
    `);

    // Create indexes for sevDesk tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_config_user ON sevdesk_config(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_user ON sevdesk_documents(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_type ON sevdesk_documents(document_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_contact ON sevdesk_documents(contact_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sevdesk_documents_search ON sevdesk_documents USING GIN(search_vector)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customers_sevdesk ON customers(sevdesk_customer_id)');

    logger.info('✅ sevDesk Integration tables created');

    // ============================================
    // Invoice Export System (for Billing/Finanzen)
    // ============================================

    // Invoice exports table - tracks billing exports
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_exports (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        sevdesk_invoice_id TEXT,
        sevdesk_invoice_number TEXT,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_hours DECIMAL(10, 2) NOT NULL,
        total_amount DECIMAL(12, 2) NOT NULL,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'cancelled')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: Add invoice_export_id to time_entries if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'invoice_export_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN invoice_export_id TEXT REFERENCES invoice_exports(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Create indexes for invoice_exports
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_exports_user ON invoice_exports(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_exports_customer ON invoice_exports(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoice_exports_period ON invoice_exports(period_start, period_end)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_export ON time_entries(invoice_export_id)');

    logger.info('✅ Invoice Export tables created');

    // Add is_billable column to time_entries (defaults to true for backward compatibility)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'is_billable'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN is_billable BOOLEAN DEFAULT TRUE;
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON time_entries(is_billable)');

    // Migration: Add external_id and external_source columns for import tracking (prevents duplicates)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'external_id'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN external_id TEXT;
          ALTER TABLE time_entries ADD COLUMN external_source TEXT;
        END IF;
      END $$;
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_external ON time_entries(organization_id, external_source, external_id)');

    // ============================================
    // Sprint A: Internal Time Tracking & Customer Visibility
    // ============================================
    // entry_scope: 'customer_project' (default), 'internal', 'absence'
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'entry_scope'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN entry_scope TEXT NOT NULL DEFAULT 'customer_project';
          ALTER TABLE time_entries ADD CONSTRAINT chk_entry_scope CHECK (entry_scope IN ('customer_project', 'internal', 'absence'));
        END IF;
      END $$;
    `);

    // internal_category: Admin, Vertrieb, Marketing, Weiterbildung, Meeting, Interner Support, Reise
    // For absence: Urlaub, Krankheit, Sonderurlaub
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'internal_category'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN internal_category TEXT;
        END IF;
      END $$;
    `);

    // customer_visibility: 'hidden' (default), 'summary', 'detailed'
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'time_entries' AND column_name = 'customer_visibility'
        ) THEN
          ALTER TABLE time_entries ADD COLUMN customer_visibility TEXT NOT NULL DEFAULT 'hidden';
          ALTER TABLE time_entries ADD CONSTRAINT chk_customer_visibility CHECK (customer_visibility IN ('hidden', 'summary', 'detailed'));
        END IF;
      END $$;
    `);

    // Drop NOT NULL constraint from project_id (internal/absence entries don't have a project)
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE time_entries ALTER COLUMN project_id DROP NOT NULL;
      EXCEPTION
        WHEN others THEN NULL; -- Constraint might already be dropped or column might not exist
      END $$;
    `);

    // Indexes for Sprint A queries
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_scope ON time_entries(user_id, entry_scope, start_time)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_visibility ON time_entries(project_id, customer_visibility)');

    // Migration: Add default_project_id to customers (fallback for imports)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'default_project_id'
        ) THEN
          ALTER TABLE customers ADD COLUMN default_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // ============================================
    // Clockodo Integration
    // ============================================

    // Clockodo configuration per user
    await client.query(`
      CREATE TABLE IF NOT EXISTS clockodo_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        api_email TEXT,
        api_key TEXT,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_clockodo_config_user ON clockodo_config(user_id)');

    logger.info('✅ Clockodo Integration tables created');

    // ============================================
    // Microsoft 365 Integration
    // ============================================

    // Microsoft 365 configuration per organization
    await client.query(`
      CREATE TABLE IF NOT EXISTS microsoft365_config (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        tenant_id TEXT,
        client_id TEXT,
        client_secret TEXT,
        mail_from TEXT,
        support_mailbox TEXT,
        invoice_mailbox TEXT,
        is_configured BOOLEAN DEFAULT FALSE,
        last_connection_test TIMESTAMP,
        last_connection_status TEXT,
        features_enabled JSONB DEFAULT '{"email": false, "inbox_monitoring": false, "calendar": false}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_microsoft365_config_org ON microsoft365_config(organization_id)');

    // Migration: Add invoice_mailbox if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'microsoft365_config' AND column_name = 'invoice_mailbox'
        ) THEN
          ALTER TABLE microsoft365_config ADD COLUMN invoice_mailbox TEXT;
        END IF;
      END $$
    `);

    logger.info('✅ Microsoft 365 Integration tables created');

    // ============================================
    // Social Media Manager
    // ============================================

    // Social media accounts - connected platform accounts
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK(platform IN ('linkedin', 'twitter', 'facebook', 'instagram')),
        account_name TEXT NOT NULL,
        account_id TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media posts - planned and published posts
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        title TEXT,
        content TEXT NOT NULL,
        media_urls TEXT[],
        hashtags TEXT[],
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed')),
        scheduled_at TIMESTAMP,
        published_at TIMESTAMP,
        ai_generated BOOLEAN DEFAULT false,
        ai_prompt TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media post platforms - which platforms each post targets
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_post_platforms (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES social_media_posts(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES social_media_accounts(id) ON DELETE CASCADE,
        platform_post_id TEXT,
        platform_content TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
        error_message TEXT,
        published_at TIMESTAMP,
        engagement_likes INTEGER DEFAULT 0,
        engagement_comments INTEGER DEFAULT 0,
        engagement_shares INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media templates - reusable content templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        platform TEXT CHECK(platform IN ('linkedin', 'twitter', 'facebook', 'instagram', 'all')),
        category TEXT,
        hashtags TEXT[],
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media hashtag groups - collections of hashtags
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_hashtag_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        hashtags TEXT[] NOT NULL,
        category TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media queue settings - auto-scheduling configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_queue_settings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT true,
        posts_per_day INTEGER DEFAULT 2,
        preferred_times TEXT[] DEFAULT ARRAY['09:00', '15:00'],
        weekend_posting BOOLEAN DEFAULT false,
        content_mix JSONB DEFAULT '{"educational": 40, "promotional": 30, "behindTheScenes": 20, "news": 10}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media content categories - for organizing and balancing content
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_content_categories (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        target_percentage INTEGER DEFAULT 25,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, name)
      )
    `);

    // Add content_category column to posts if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'content_category') THEN
          ALTER TABLE social_media_posts ADD COLUMN content_category TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'evergreen') THEN
          ALTER TABLE social_media_posts ADD COLUMN evergreen BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'recycle_count') THEN
          ALTER TABLE social_media_posts ADD COLUMN recycle_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'last_recycled_at') THEN
          ALTER TABLE social_media_posts ADD COLUMN last_recycled_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // Social media autopilot settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_autopilot_settings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT false,
        posts_per_week INTEGER DEFAULT 5,
        content_themes TEXT[] DEFAULT '{}',
        target_audience TEXT,
        brand_voice TEXT DEFAULT 'professional',
        approval_mode TEXT DEFAULT 'review' CHECK(approval_mode IN ('auto', 'review')),
        platforms TEXT[] DEFAULT ARRAY['linkedin'],
        content_mix JSONB DEFAULT '{"educational": 40, "promotional": 20, "behindTheScenes": 20, "trending": 20}',
        last_generated TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media competitors for tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_competitors (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        profiles JSONB DEFAULT '{}',
        notes TEXT,
        last_analyzed TIMESTAMP,
        analysis_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media engagement bot settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_engagement_settings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT false,
        platforms TEXT[] DEFAULT '{}',
        target_keywords TEXT[] DEFAULT '{}',
        target_accounts TEXT[] DEFAULT '{}',
        response_style TEXT DEFAULT 'thoughtful' CHECK(response_style IN ('thoughtful', 'supportive', 'inquisitive', 'expert')),
        daily_limit INTEGER DEFAULT 10,
        exclude_keywords TEXT[] DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media engagement history
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_engagement_history (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        post_url TEXT,
        author_name TEXT,
        original_content TEXT,
        response_content TEXT,
        response_type TEXT DEFAULT 'comment' CHECK(response_type IN ('comment', 'like', 'share', 'reply')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social Media Stories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_stories (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        content_type TEXT NOT NULL CHECK(content_type IN ('image', 'video', 'carousel', 'poll', 'quiz', 'countdown', 'link')),
        media_urls JSONB DEFAULT '[]',
        text_overlays JSONB DEFAULT '[]',
        background_color TEXT,
        background_gradient TEXT,
        music_suggestion TEXT,
        stickers JSONB DEFAULT '[]',
        link_url TEXT,
        link_text TEXT,
        poll_question TEXT,
        poll_options JSONB DEFAULT '[]',
        scheduled_at TIMESTAMP,
        platforms JSONB DEFAULT '["instagram"]',
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed', 'expired')),
        duration_seconds INTEGER DEFAULT 15,
        ai_generated BOOLEAN DEFAULT false,
        ai_prompt TEXT,
        template_id TEXT,
        engagement_data JSONB,
        expires_at TIMESTAMP,
        published_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // AI Image Generation Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_image_settings (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider TEXT DEFAULT 'openai' CHECK(provider IN ('openai', 'stability', 'leonardo', 'replicate')),
        api_key_encrypted TEXT,
        default_style TEXT DEFAULT 'modern',
        default_aspect_ratio TEXT DEFAULT '9:16',
        quality TEXT DEFAULT 'hd' CHECK(quality IN ('standard', 'hd')),
        credits_used INTEGER DEFAULT 0,
        credits_limit INTEGER DEFAULT 100,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Generated Images History
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_generated_images (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        revised_prompt TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_data TEXT,
        aspect_ratio TEXT DEFAULT '9:16',
        style TEXT,
        size TEXT,
        cost_cents INTEGER,
        used_in_story_id TEXT REFERENCES social_media_stories(id) ON DELETE SET NULL,
        used_in_post_id TEXT REFERENCES social_media_posts(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Story Templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_story_templates (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        content_type TEXT NOT NULL CHECK(content_type IN ('image', 'video', 'carousel', 'poll', 'quiz')),
        layout JSONB NOT NULL,
        text_styles JSONB DEFAULT '{}',
        color_scheme JSONB DEFAULT '{}',
        is_system BOOLEAN DEFAULT false,
        preview_url TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for social media tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_accounts_user ON social_media_accounts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_accounts_org ON social_media_accounts(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_user ON social_media_posts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_org ON social_media_posts(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_status ON social_media_posts(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_scheduled ON social_media_posts(scheduled_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_post_platforms_post ON social_media_post_platforms(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_templates_user ON social_media_templates(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_hashtags_user ON social_media_hashtag_groups(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_competitors_org ON social_media_competitors(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_engagement_history_org ON social_media_engagement_history(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_org ON social_media_stories(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_user ON social_media_stories(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_status ON social_media_stories(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_scheduled ON social_media_stories(scheduled_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_generated_images_org ON social_media_generated_images(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_story_templates_org ON social_media_story_templates(organization_id)');

    logger.info('✅ Social Media Manager tables created');

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

    // Invoice Line Items table - individual positions from distributor invoices
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_line_items (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        processed_invoice_id TEXT NOT NULL REFERENCES processed_invoices(id) ON DELETE CASCADE,

        -- Position from invoice
        position_number INTEGER,
        description TEXT NOT NULL,
        article_number TEXT,

        -- Quantities and prices
        quantity NUMERIC(12,4),
        unit TEXT,
        unit_price NUMERIC(12,4),
        total_price NUMERIC(12,4),
        vat_rate NUMERIC(5,2),

        -- Period
        period_start DATE,
        period_end DATE,
        period_text TEXT,

        -- Product categorization
        product_type TEXT,
        product_sku TEXT,

        -- Customer detection (AI-extracted)
        extracted_customer_name TEXT,
        extracted_customer_domain TEXT,
        extracted_customer_number TEXT,

        -- Customer assignment (after matching/manual)
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        match_confidence NUMERIC(3,2),
        match_method TEXT CHECK(match_method IN (
          'exact_name', 'fuzzy_name', 'domain', 'alias',
          'distributor_number', 'manual', 'unmatched'
        )),

        -- Rebilling workflow status
        rebilling_status TEXT DEFAULT 'pending' CHECK(rebilling_status IN (
          'pending', 'included', 'billed', 'skipped'
        )),
        rebilling_invoice_id TEXT,
        rebilling_markup_percent NUMERIC(5,2),
        rebilling_notes TEXT,

        -- Audit
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP
      )
    `);

    // Indexes for invoice_line_items
    await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(processed_invoice_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_org ON invoice_line_items(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_customer ON invoice_line_items(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_rebilling ON invoice_line_items(rebilling_status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_period ON invoice_line_items(period_start, period_end)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_line_items_extracted_name ON invoice_line_items USING gin(extracted_customer_name gin_trgm_ops)');

    logger.info('✅ invoice_line_items table created');

    // Migration: Add primary_domain and distributor_identifiers to customers
    await client.query(`
      DO $$
      BEGIN
        -- primary_domain for domain-based matching
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'primary_domain'
        ) THEN
          ALTER TABLE customers ADD COLUMN primary_domain TEXT;
        END IF;

        -- distributor_identifiers for matching by distributor-specific IDs
        -- Schema: { "microsoft_tenant_id": "...", "hornetsecurity_id": "...", "elovade_number": "..." }
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'distributor_identifiers'
        ) THEN
          ALTER TABLE customers ADD COLUMN distributor_identifiers JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    // Index for domain matching
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_primary_domain') THEN
          CREATE INDEX idx_customers_primary_domain ON customers(primary_domain);
        END IF;
      END $$;
    `);

    // GIN index for fuzzy name matching on customers
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_name_trgm') THEN
          CREATE INDEX idx_customers_name_trgm ON customers USING gin(name gin_trgm_ops);
        END IF;
      END $$;
    `);

    logger.info('✅ Customer matching columns added (primary_domain, distributor_identifiers)');

    // Customer aliases table for matching invoice names to customers
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_aliases (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        source TEXT DEFAULT 'manual' CHECK(source IN ('manual', 'invoice_assignment')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, alias)
      )
    `);

    // Index for fast alias lookup
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customer_aliases_lookup') THEN
          CREATE INDEX idx_customer_aliases_lookup ON customer_aliases(organization_id, LOWER(TRIM(alias)));
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customer_aliases_customer') THEN
          CREATE INDEX idx_customer_aliases_customer ON customer_aliases(customer_id);
        END IF;
      END $$;
    `);

    logger.info('✅ customer_aliases table created');

    // Migration: Add contract_id to invoice_line_items for contract linking
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'invoice_line_items' AND column_name = 'contract_id'
        ) THEN
          ALTER TABLE invoice_line_items ADD COLUMN contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_line_items_contract') THEN
          CREATE INDEX idx_line_items_contract ON invoice_line_items(contract_id);
        END IF;
      END $$;
    `);

    logger.info('✅ invoice_line_items.contract_id column added');

    await client.query('COMMIT');
    logger.info('✅ Database schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    logger.info('Database pool has ended');
  });
});
