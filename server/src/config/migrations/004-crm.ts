import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * CRM: Leads, Lead-Aktivitaeten, Kundenkontakte, Interaktionen, SLA-Policies, Customer-Metrics/Churn/Health, Pipeline + Opportunities
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
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
        user_id TEXT,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        priority TEXT,
        first_response_minutes INTEGER,
        resolution_minutes INTEGER,
        business_hours_only BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT true,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // ⚠️ Form entspricht der Prod-DB und dem SLA-CRUD in tickets.ts
    // (priority + first_response_minutes/resolution_minutes). Die frühere
    // Definition (response_time_low/... pro Priorität) existierte nur hier
    // und in der toten Zweitimplementierung sla-policies.ts (entfernt).

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
}
