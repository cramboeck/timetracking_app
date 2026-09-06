import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * invoice_line_items (MSP-Rebilling), Customer-Matching, customer_aliases, contract_id, ninjarmm_vulnerabilities
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
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

    // NinjaRMM Vulnerabilities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ninjarmm_vulnerabilities (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES ninjarmm_devices(id) ON DELETE CASCADE,

        -- CVE Information
        cve_id TEXT NOT NULL,
        cve_description TEXT,
        cve_published_date TIMESTAMP,

        -- Vulnerability details
        severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        cvss_score NUMERIC(3,1),
        cvss_vector TEXT,

        -- Affected software
        software_name TEXT,
        software_vendor TEXT,
        software_version TEXT,

        -- Status tracking
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'patched', 'ignored', 'false_positive')),
        first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        patched_at TIMESTAMP,
        ignored_at TIMESTAMP,
        ignored_reason TEXT,

        -- References
        ninja_vulnerability_id TEXT,
        ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

        UNIQUE(device_id, cve_id)
      )
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_vuln_user ON ninjarmm_vulnerabilities(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vuln_org ON ninjarmm_vulnerabilities(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vuln_device ON ninjarmm_vulnerabilities(device_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vuln_cve ON ninjarmm_vulnerabilities(cve_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vuln_severity ON ninjarmm_vulnerabilities(severity)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_vuln_status ON ninjarmm_vulnerabilities(status)');

    logger.info('✅ ninjarmm_vulnerabilities table created');
}
