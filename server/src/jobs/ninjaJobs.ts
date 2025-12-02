import cron from 'node-cron';
import { pool } from '../config/database';
import { syncAll } from '../services/ninjarmmService';

/**
 * NinjaRMM Auto-Sync Background Job
 * Runs every 5 minutes and checks if any users need syncing
 */
export function startNinjaJobs() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runAutoSync();
    } catch (error) {
      console.error('❌ NinjaRMM auto-sync job error:', error);
    }
  });

  console.log('✅ NinjaRMM auto-sync job started (runs every 5 minutes)');
}

async function runAutoSync() {
  // Find all users with auto-sync enabled and valid connection
  const result = await pool.query(`
    SELECT
      nc.user_id,
      nc.sync_interval_minutes,
      nc.last_sync_at,
      u.username
    FROM ninjarmm_config nc
    JOIN users u ON nc.user_id = u.id
    WHERE nc.auto_sync_devices = true
      AND nc.access_token IS NOT NULL
      AND nc.refresh_token IS NOT NULL
  `);

  const configs = result.rows;

  if (configs.length === 0) {
    return; // No users with auto-sync enabled
  }

  const now = new Date();

  for (const config of configs) {
    const { user_id, sync_interval_minutes, last_sync_at, username } = config;
    const interval = sync_interval_minutes || 60; // Default 60 minutes

    // Check if sync is needed
    const lastSync = last_sync_at ? new Date(last_sync_at) : null;
    const nextSyncTime = lastSync
      ? new Date(lastSync.getTime() + interval * 60 * 1000)
      : new Date(0); // If never synced, sync now

    if (now >= nextSyncTime) {
      console.log(`🔄 NinjaRMM auto-sync starting for user "${username}" (interval: ${interval}min)`);

      try {
        const syncResult = await syncAll(user_id);

        console.log(`✅ NinjaRMM auto-sync completed for user "${username}":`, {
          organizations: syncResult.organizations.synced,
          devices: syncResult.devices.synced,
          alerts: syncResult.alerts.synced
        });

        // Log to audit (optional - could add to audit_logs table)
        await pool.query(`
          INSERT INTO audit_logs (id, user_id, action, details, timestamp)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          crypto.randomUUID(),
          user_id,
          'ninjarmm.auto_sync',
          JSON.stringify({
            organizations: syncResult.organizations,
            devices: syncResult.devices,
            alerts: syncResult.alerts
          }),
          now.toISOString()
        ]);

      } catch (syncError: any) {
        console.error(`❌ NinjaRMM auto-sync failed for user "${username}":`, syncError.message);

        // Log error to audit
        await pool.query(`
          INSERT INTO audit_logs (id, user_id, action, details, timestamp)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          crypto.randomUUID(),
          user_id,
          'ninjarmm.auto_sync_error',
          JSON.stringify({ error: syncError.message }),
          now.toISOString()
        ]);
      }
    }
  }
}

// Export for manual triggering if needed
export { runAutoSync };
