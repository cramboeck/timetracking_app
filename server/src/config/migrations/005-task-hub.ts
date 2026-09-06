import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Unified Task Hub: tasks, checklist items, comments, activity log, templates
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
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
}
