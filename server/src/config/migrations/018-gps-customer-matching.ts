import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * GPS-Stempelung Phase 2 (A6): Zuordnung „gestempelt bei Kunde X".
 * - customers bekommen geocodierte Koordinaten (aus der Adresse, via
 *   Nominatim/OSM — beim Speichern und per täglichem Nachzügler-Job)
 * - work_sessions merken sich den beim Stempeln gematchten Kunden
 *   (Distanz-Schwelle; Match passiert im Stempel-Moment und bleibt
 *   stabil, auch wenn sich Adressen später ändern)
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='latitude') THEN
        ALTER TABLE customers ADD COLUMN latitude NUMERIC(9,6);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='longitude') THEN
        ALTER TABLE customers ADD COLUMN longitude NUMERIC(9,6);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='geocoded_at') THEN
        ALTER TABLE customers ADD COLUMN geocoded_at TIMESTAMP;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_in_customer_id') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_in_customer_id TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_out_customer_id') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_out_customer_id TEXT;
      END IF;
    END $$;
  `);
  logger.info('✅ GPS-Kunden-Matching-Spalten ready (customers.lat/lng, work_sessions.clock_*_customer_id)');
}
