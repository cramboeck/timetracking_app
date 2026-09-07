import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * VK-Preiskonzept (Sprint J, Voraussetzung für die Portal-Lizenzansicht):
 * - invoice_line_items.resell_price = fest angebotener VK-Preis PRO EINHEIT
 *   (kein Prozentaufschlag!). NULL = kein Preis hinterlegt → Portal zeigt
 *   für diese Position keinen Betrag.
 * - customer_product_prices = Preis-Gedächtnis pro Kunde+Produkt (analog zum
 *   Lieferanten-Gedächtnis des Rechnungseingangs): einmal im LineItemReview
 *   gepflegt, gilt der Preis automatisch für alle künftigen Positionen
 *   desselben Produkts (COALESCE beim Lesen — kein monatliches Nachpflegen).
 *   product_key = product_sku, sonst lower(description).
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_line_items' AND column_name='resell_price') THEN
        ALTER TABLE invoice_line_items ADD COLUMN resell_price NUMERIC(12,4);
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_product_prices (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_key TEXT NOT NULL,
      resell_price NUMERIC(12,4) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(organization_id, customer_id, product_key)
    )
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customer_product_prices_customer') THEN
        CREATE INDEX idx_customer_product_prices_customer ON customer_product_prices(customer_id);
      END IF;
    END $$;
  `);

  logger.info('✅ VK-Preise ready (invoice_line_items.resell_price + customer_product_prices)');
}
