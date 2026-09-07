import cron from 'node-cron';
import { geocodePendingCustomers } from '../services/geocodingService';
import { logger } from '../utils/logger';

/**
 * Geocoding-Nachzügler (GPS-Kunden-Zuordnung, A6 Phase 2):
 * - 2 Minuten nach dem Start einmalig (deckt Bestandskunden direkt nach
 *   dem Deploy ab — idempotent, verarbeitet nur Kunden ohne bisherigen
 *   Geocoding-Versuch)
 * - danach täglich 03:30 für Importe/Neuzugänge, deren Save-Geocoding
 *   fehlschlug
 */
export function startGeocodeCustomersJob() {
  setTimeout(() => {
    geocodePendingCustomers(50).catch((err) =>
      logger.error(`Geocoding-Boot-Lauf fehlgeschlagen: ${err.message}`)
    );
  }, 2 * 60 * 1000);

  cron.schedule('30 3 * * *', async () => {
    try {
      await geocodePendingCustomers(200);
    } catch (err: any) {
      logger.error(`Geocoding-Cron fehlgeschlagen: ${err.message}`);
    }
  });

  logger.info('✅ Kunden-Geocoding-Job registriert (Boot +2min, täglich 03:30)');
}
