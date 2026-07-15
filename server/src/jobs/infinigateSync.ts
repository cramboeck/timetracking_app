import cron from 'node-cron';
import { pool } from '../config/database';
import * as infinigateService from '../services/infinigateService';
import { logger } from '../utils/logger';

/**
 * Infinigate Rechnungs-/Lizenz-Sync Background Job.
 * Läuft täglich um 06:45 Uhr über alle User mit vollständiger Config und
 * aktiviertem auto_sync. Importiert neue PurchaseInvoices samt Positionen
 * (inkl. Lizenzdaten + Endkunden) und stößt das Kunden-Matching an.
 */
export function startInfinigateSyncJob() {
  cron.schedule('45 6 * * *', async () => {
    try {
      await runInfinigateSync();
    } catch (error: any) {
      logger.error(`Infinigate-Sync-Job error: ${error.message}`);
    }
  });

  logger.info('✅ Infinigate-Sync-Job gestartet (täglich 06:45 Uhr)');
}

export async function runInfinigateSync() {
  const result = await pool.query(`
    SELECT user_id FROM infinigate_config
    WHERE auto_sync = true
      AND client_id IS NOT NULL AND client_secret IS NOT NULL AND api_key IS NOT NULL
  `);

  if (result.rows.length === 0) return;

  logger.info(`Infinigate-Sync: ${result.rows.length} User mit aktivem Auto-Sync`);

  for (const row of result.rows) {
    try {
      await infinigateService.syncInvoices(row.user_id);
    } catch (err: any) {
      logger.error(`Infinigate-Sync für User ${row.user_id} fehlgeschlagen: ${err.message}`);
    }
  }
}
