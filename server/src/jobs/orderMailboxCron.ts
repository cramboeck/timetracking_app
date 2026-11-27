import cron from 'node-cron';
import { pool } from '../config/database';
import { processOrderMailbox } from '../services/purchaseOrderService';
import { logger } from '../utils/logger';

/** WE-1: Bestell-Postfach alle 15 Minuten abrufen (versetzt zum Rechnungseingang). */
export function startOrderMailboxJob() {
  cron.schedule('7,22,37,52 * * * *', async () => {
    try {
      const orgs = await pool.query(
        `SELECT organization_id FROM microsoft365_config WHERE is_configured = true AND order_mailbox IS NOT NULL AND order_mailbox <> ''`
      );
      for (const row of orgs.rows) {
        const result = await processOrderMailbox(String(row.organization_id));
        if (result.processed > 0) logger.info(`📦 Bestell-Postfach: ${result.processed} Mail(s) verarbeitet (Org ${row.organization_id})`);
        if (!result.success && result.error) logger.warn(`📦 Bestell-Postfach: ${result.error}`);
      }
    } catch (err) {
      logger.error('Bestell-Postfach-Cron fehlgeschlagen:', err);
    }
  });
  logger.info('✅ Bestell-Postfach-Job registriert (alle 15 Minuten)');
}
