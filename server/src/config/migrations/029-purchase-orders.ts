import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * WE-1 „Bestell-Postfach“ (27.11.2026): Bestellvorgänge aus Mails —
 * egal wo bestellt wurde. Quelle ist ein eigenes Postfach (z.B.
 * bestellung@…); Bestellbestätigung, Versandmitteilung und Rechnung
 * werden über die Bestellnummer zu EINEM Vorgang zusammengeführt.
 * Zuordnung: Ticketnummer in der Bestellreferenz (TKT-000123) →
 * Ticket + Kunde; „INTERN“ → Eigenbedarf; sonst Zuordnungsliste.
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`ALTER TABLE microsoft365_config ADD COLUMN IF NOT EXISTS order_mailbox TEXT`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ordered'
        CHECK (status IN ('expected', 'ordered', 'shipped', 'received', 'cancelled')),
      supplier_name TEXT,
      supplier_email TEXT,
      order_number TEXT,
      order_date DATE,
      reference_text TEXT,
      ticket_id TEXT,
      customer_id TEXT,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      assignment_source TEXT,
      delivery_address TEXT,
      net_amount NUMERIC(12, 2),
      gross_amount NUMERIC(12, 2),
      currency TEXT DEFAULT 'EUR',
      tracking JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'manual', 'ticket', 'infinigate')),
      created_by TEXT,
      received_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_org ON purchase_orders(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_ticket ON purchase_orders(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(organization_id, lower(order_number));
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      position INTEGER,
      description TEXT NOT NULL,
      article_number TEXT,
      quantity NUMERIC(12, 2),
      unit_price NUMERIC(12, 2),
      total_price NUMERIC(12, 2),
      item_type TEXT,
      received_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_order ON purchase_order_lines(order_id)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_messages (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id TEXT NOT NULL,
      order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
      email_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('order_confirmation', 'shipping', 'invoice', 'other')),
      subject TEXT,
      sender_email TEXT,
      sender_name TEXT,
      received_at TIMESTAMP,
      extracted JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (organization_id, email_id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_purchase_order_messages_order ON purchase_order_messages(order_id)`);

  logger.info('✅ Bestellvorgänge (Bestell-Postfach) bereit');
}
