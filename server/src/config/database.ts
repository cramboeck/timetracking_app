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

    // Add has_ticket_access column to users table if it doesn't exist (migration)
    // This is a feature flag for the ticket system add-on
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'has_ticket_access'
        ) THEN
          ALTER TABLE users ADD COLUMN has_ticket_access BOOLEAN DEFAULT FALSE;
          UPDATE users SET has_ticket_access = FALSE WHERE has_ticket_access IS NULL;
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

    // ========================================================================
    // TICKET SYSTEM TABLES
    // ========================================================================

    // Customer contacts table (for customer portal login)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_contacts (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT,
        is_primary BOOLEAN DEFAULT FALSE,
        can_create_tickets BOOLEAN DEFAULT TRUE,
        can_view_all_tickets BOOLEAN DEFAULT FALSE,
        last_login TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(customer_id, email)
      )
    `);

    // Tickets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        ticket_number TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        created_by_contact_id TEXT REFERENCES customer_contacts(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
        assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMP,
        closed_at TIMESTAMP
      )
    `);

    // Ticket comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        customer_contact_id TEXT REFERENCES customer_contacts(id) ON DELETE SET NULL,
        is_internal BOOLEAN DEFAULT FALSE,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Ticket attachments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        comment_id TEXT REFERENCES ticket_comments(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_by_contact_id TEXT REFERENCES customer_contacts(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Add ticket_id to time_entries if not exists
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

    // Ticket number sequence table (for generating TKT-000001, TKT-000002, etc.)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_sequences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_number INTEGER DEFAULT 0
      )
    `);

    // Migration: Add 'archived' to ticket status CHECK constraint
    await client.query(`
      DO $$
      BEGIN
        -- Drop the old constraint if it exists
        ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
        -- Add the new constraint with 'archived'
        ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
          CHECK(status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed', 'archived'));
      EXCEPTION WHEN OTHERS THEN
        -- Constraint might not exist or already updated, ignore
        NULL;
      END $$;
    `);

    // Migration: Add satisfaction rating columns to tickets
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'satisfaction_rating'
        ) THEN
          ALTER TABLE tickets ADD COLUMN satisfaction_rating INTEGER CHECK(satisfaction_rating BETWEEN 1 AND 5);
          ALTER TABLE tickets ADD COLUMN satisfaction_feedback TEXT;
        END IF;
      END $$;
    `);

    // Add merged_into_id column for ticket merging
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'merged_into_id'
        ) THEN
          ALTER TABLE tickets ADD COLUMN merged_into_id TEXT REFERENCES tickets(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Create indexes for tickets
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets(ticket_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_time_entries_ticket_id ON time_entries(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id)');

    // ========================================================================
    // CANNED RESPONSES (Textbausteine) TABLE
    // ========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS canned_responses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        shortcut TEXT,
        category TEXT,
        is_shared BOOLEAN DEFAULT FALSE,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_canned_responses_user_id ON canned_responses(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_canned_responses_shortcut ON canned_responses(shortcut)');

    // ========================================================================
    // TICKET TAGS TABLES
    // ========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#6b7280',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_tag_assignments (
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES ticket_tags(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (ticket_id, tag_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tags_user_id ON ticket_tags(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tag_assignments_ticket_id ON ticket_tag_assignments(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_tag_assignments_tag_id ON ticket_tag_assignments(tag_id)');

    // ========================================================================
    // TICKET ACTIVITIES TABLE (Activity Timeline / Audit Trail)
    // ========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS ticket_activities (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        customer_contact_id TEXT REFERENCES customer_contacts(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL CHECK(action_type IN (
          'created', 'status_changed', 'priority_changed', 'assigned', 'unassigned',
          'comment_added', 'internal_comment_added', 'attachment_added',
          'tag_added', 'tag_removed', 'title_changed', 'description_changed',
          'resolved', 'closed', 'reopened', 'archived', 'rating_added'
        )),
        old_value TEXT,
        new_value TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket_id ON ticket_activities(ticket_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_activities_user_id ON ticket_activities(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_activities_created_at ON ticket_activities(created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_ticket_activities_action_type ON ticket_activities(action_type)');

    // ========================================================================
    // SLA POLICIES TABLE
    // ========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS sla_policies (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high', 'critical', 'all')),
        first_response_minutes INTEGER NOT NULL,
        resolution_minutes INTEGER NOT NULL,
        business_hours_only BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_sla_policies_user_id ON sla_policies(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sla_policies_priority ON sla_policies(priority)');
    // Partial unique index: only one default per user/priority combo
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_policies_default ON sla_policies(user_id, priority) WHERE is_default = TRUE');

    // Migration: Add SLA columns to tickets table
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'sla_policy_id'
        ) THEN
          ALTER TABLE tickets ADD COLUMN sla_policy_id TEXT REFERENCES sla_policies(id) ON DELETE SET NULL;
          ALTER TABLE tickets ADD COLUMN first_response_due_at TIMESTAMP;
          ALTER TABLE tickets ADD COLUMN resolution_due_at TIMESTAMP;
          ALTER TABLE tickets ADD COLUMN first_response_at TIMESTAMP;
          ALTER TABLE tickets ADD COLUMN sla_first_response_breached BOOLEAN DEFAULT FALSE;
          ALTER TABLE tickets ADD COLUMN sla_resolution_breached BOOLEAN DEFAULT FALSE;
        END IF;
      END $$;
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_first_response_due_at ON tickets(first_response_due_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tickets_resolution_due_at ON tickets(resolution_due_at)');

    // ========================================================================
    // KNOWLEDGE BASE TABLES
    // ========================================================================

    // Knowledge base categories
    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT 'folder',
        sort_order INTEGER DEFAULT 0,
        is_public BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_kb_categories_user_id ON kb_categories(user_id)');

    // Knowledge base articles
    await client.query(`
      CREATE TABLE IF NOT EXISTS kb_articles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id TEXT REFERENCES kb_categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        content TEXT NOT NULL,
        excerpt TEXT,
        is_published BOOLEAN DEFAULT FALSE,
        is_featured BOOLEAN DEFAULT FALSE,
        view_count INTEGER DEFAULT 0,
        helpful_yes INTEGER DEFAULT 0,
        helpful_no INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        published_at TIMESTAMP,
        UNIQUE(user_id, slug)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_kb_articles_user_id ON kb_articles(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_kb_articles_category_id ON kb_articles(category_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_kb_articles_is_published ON kb_articles(is_published)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(slug)');

    // Portal settings/branding
    await client.query(`
      CREATE TABLE IF NOT EXISTS portal_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        company_name TEXT,
        welcome_message TEXT,
        logo_url TEXT,
        primary_color TEXT DEFAULT '#3b82f6',
        show_knowledge_base BOOLEAN DEFAULT TRUE,
        require_login_for_kb BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_portal_settings_user_id ON portal_settings(user_id)');

    // ========================================================================
    // PUSH NOTIFICATION SUBSCRIPTIONS TABLE
    // ========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        device_name TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint)');

    // User notification preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        push_enabled BOOLEAN DEFAULT TRUE,
        push_on_new_ticket BOOLEAN DEFAULT TRUE,
        push_on_ticket_comment BOOLEAN DEFAULT TRUE,
        push_on_ticket_assigned BOOLEAN DEFAULT TRUE,
        push_on_status_change BOOLEAN DEFAULT TRUE,
        push_on_sla_warning BOOLEAN DEFAULT TRUE,
        email_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id)');

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
