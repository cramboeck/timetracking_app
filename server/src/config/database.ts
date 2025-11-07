import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../database.sqlite');
export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('personal', 'business', 'team')),
      organization_name TEXT,
      team_id TEXT,
      team_role TEXT CHECK(team_role IN ('owner', 'admin', 'member')),
      mfa_enabled INTEGER DEFAULT 0,
      mfa_secret TEXT,
      accent_color TEXT DEFAULT 'blue',
      gray_tone TEXT DEFAULT 'medium',
      time_rounding_interval INTEGER DEFAULT 15,
      created_at TEXT NOT NULL,
      last_login TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
    )
  `);

  // Teams table
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Time entries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration INTEGER,
      description TEXT,
      is_running INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Customers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      customer_number TEXT,
      contact_person TEXT,
      email TEXT,
      address TEXT,
      report_title TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      rate_type TEXT NOT NULL CHECK(rate_type IN ('hourly', 'daily')),
      hourly_rate REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);

  // Activities table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_billable INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Company info table
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_info (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      country TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      website TEXT,
      tax_id TEXT,
      logo TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Team invitations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS team_invitations (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      invitation_code TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      created_by TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_by TEXT,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Email notifications log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'pending')),
      error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('✅ Database initialized successfully');
}

// Export prepared statements for common queries
export const queries = {
  // Users
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  createUser: db.prepare(`
    INSERT INTO users (
      id, username, email, password_hash, account_type, organization_name,
      team_id, team_role, mfa_enabled, accent_color, gray_tone,
      time_rounding_interval, created_at, last_login
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateUserLastLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),

  // Time Entries
  getEntriesByUserId: db.prepare('SELECT * FROM time_entries WHERE user_id = ? ORDER BY start_time DESC'),
  createTimeEntry: db.prepare(`
    INSERT INTO time_entries (
      id, user_id, project_id, start_time, end_time, duration, description, is_running, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateTimeEntry: db.prepare(`
    UPDATE time_entries
    SET end_time = ?, duration = ?, description = ?, is_running = ?
    WHERE id = ?
  `),
  deleteTimeEntry: db.prepare('DELETE FROM time_entries WHERE id = ?'),

  // Projects
  getProjectsByUserId: db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY name'),

  // Customers
  getCustomersByUserId: db.prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY name'),

  // Activities
  getActivitiesByUserId: db.prepare('SELECT * FROM activities WHERE user_id = ? ORDER BY name'),

  // Email notifications
  logEmailNotification: db.prepare(`
    INSERT INTO email_notifications (id, user_id, notification_type, sent_at, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getLastNotification: db.prepare(`
    SELECT * FROM email_notifications
    WHERE user_id = ? AND notification_type = ?
    ORDER BY sent_at DESC LIMIT 1
  `),
};
