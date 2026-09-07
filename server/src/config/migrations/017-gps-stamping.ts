import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * GPS-Stempelung (Roadmap A6, 7.9.2026): Koordinaten am Ein-/Ausstempel-
 * Ereignis in work_sessions. Position wird NUR im Stempel-Moment erfasst
 * (kein Tracking), und nur wenn die Organisation das Feature aktiviert hat
 * (organizations.settings.gpsStamping = true, Default aus).
 */
export async function run(client: PoolClient): Promise<void> {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_in_lat') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_in_lat NUMERIC(9,6);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_in_lng') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_in_lng NUMERIC(9,6);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_in_accuracy') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_in_accuracy INTEGER;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_out_lat') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_out_lat NUMERIC(9,6);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_out_lng') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_out_lng NUMERIC(9,6);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_sessions' AND column_name='clock_out_accuracy') THEN
        ALTER TABLE work_sessions ADD COLUMN clock_out_accuracy INTEGER;
      END IF;
    END $$;
  `);
  logger.info('✅ work_sessions GPS-Stempel-Spalten ready');
}
