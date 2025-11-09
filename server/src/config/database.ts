import { Pool, PoolClient, QueryResult } from 'pg';

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
        team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
        team_role TEXT CHECK(team_role IN ('owner', 'admin', 'member')),
        mfa_enabled BOOLEAN DEFAULT FALSE,
        mfa_secret TEXT,
        accent_color TEXT DEFAULT 'blue',
        gray_tone TEXT DEFAULT 'medium',
        time_rounding_interval INTEGER DEFAULT 15,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_login TIMESTAMP
      )
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
        logo TEXT
      )
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
