import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Portal-Lizenz-Self-Service (Sprint J):
 * Kunden fragen im Portal Lizenzänderungen an (mehr/weniger Seats, neues
 * Produkt, Kündigung). Genehmigungsworkflow: pending → approved/rejected →
 * completed (Provisionierung passiert manuell beim Distributor, der Admin
 * markiert die Anfrage danach als erledigt).
 * requested_by_id trägt die Portal-Identität (customer_portal_users.id ODER
 * customer_contacts.id — der JWT kann beide tragen), daher bewusst ohne FK.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS license_requests (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      requested_by_id TEXT,
      requested_by_name TEXT,
      requested_by_email TEXT,
      request_type TEXT NOT NULL CHECK(request_type IN ('increase', 'decrease', 'new', 'cancel')),
      product_description TEXT NOT NULL,
      product_sku TEXT,
      current_quantity INTEGER,
      requested_quantity INTEGER,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
      admin_note TEXT,
      decided_by TEXT,
      decided_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_license_requests_org_status') THEN
        CREATE INDEX idx_license_requests_org_status ON license_requests(organization_id, status);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_license_requests_customer') THEN
        CREATE INDEX idx_license_requests_customer ON license_requests(customer_id);
      END IF;
    END $$;
  `);

  logger.info('✅ license_requests ready (Portal-Lizenz-Self-Service)');
}
