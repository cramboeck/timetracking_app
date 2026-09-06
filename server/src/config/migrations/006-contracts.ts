import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Vertragsverwaltung: contracts, Positionen, Stunden-Tracking, Activity-Log
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
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
}
