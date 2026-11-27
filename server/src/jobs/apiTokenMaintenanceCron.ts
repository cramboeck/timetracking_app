import cron from 'node-cron';
import { pool } from '../config/database';
import { emailService } from '../services/emailService';
import { escapeHtml } from '../utils/escapeHtml';
import { logger } from '../utils/logger';

/**
 * API-Zugänge (MCP/KI-Agent) pflegen:
 * - 7 Tage vor Ablauf eine Erinnerung an den Besitzer (einmal pro Zugang)
 * - Agenten-Protokoll nach 90 Tagen löschen (Datensparsamkeit)
 */
export const TOKEN_EXPIRY_WARN_DAYS = 7;
export const TOKEN_LOG_RETENTION_DAYS = 90;

export async function runApiTokenExpiryReminders(): Promise<number> {
  const baseUrl = (process.env.FRONTEND_URL || 'https://app.ramboeck.it').replace(/\/$/, '');
  const due = await pool.query(
    `SELECT t.id, t.name, t.expires_at, u.email, COALESCE(u.display_name, u.username) AS user_name
       FROM api_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.revoked_at IS NULL
        AND t.expiry_notified_at IS NULL
        AND t.expires_at IS NOT NULL
        AND t.expires_at > NOW()
        AND t.expires_at <= NOW() + ($1 || ' days')::interval`,
    [String(TOKEN_EXPIRY_WARN_DAYS)]
  );
  for (const t of due.rows) {
    const until = new Date(t.expires_at).toLocaleDateString('de-DE');
    try {
      if (t.email) {
        await emailService.sendEmail({
          to: t.email,
          subject: `RamboFlow: API-Zugang „${t.name}“ läuft am ${until} ab`,
          html: `<p>Hallo ${escapeHtml(String(t.user_name))},</p>
            <p>dein API-Zugang <strong>${escapeHtml(String(t.name))}</strong> (z.B. für Claude/MCP) läuft am <strong>${until}</strong> ab.
            Danach kann der Agent nicht mehr auf RamboFlow zugreifen.</p>
            <p>Lege in den Einstellungen einen neuen Zugang an und trage ihn in deiner Claude-Konfiguration ein.</p>
            <p><a href="${baseUrl}/settings?tab=agent" style="display:inline-block;background-color:#F27024;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;">API-Zugänge öffnen</a></p>`,
          text: `Hallo ${t.user_name},\n\ndein API-Zugang „${t.name}“ läuft am ${until} ab.\n\n${baseUrl}/settings?tab=agent`,
        });
      }
      await pool.query('UPDATE api_tokens SET expiry_notified_at = NOW() WHERE id = $1', [t.id]);
    } catch (err) {
      logger.error(`Ablauf-Erinnerung für API-Zugang ${t.id} fehlgeschlagen:`, err);
    }
  }
  return due.rows.length;
}

export async function purgeOldApiTokenRequests(): Promise<number> {
  const r = await pool.query(
    `DELETE FROM api_token_requests WHERE created_at < NOW() - ($1 || ' days')::interval`,
    [String(TOKEN_LOG_RETENTION_DAYS)]
  );
  return r.rowCount ?? 0;
}

export function startApiTokenMaintenanceJob() {
  cron.schedule('5 8 * * *', async () => {
    try {
      const n = await runApiTokenExpiryReminders();
      if (n > 0) logger.info(`🔑 ${n} Ablauf-Erinnerung(en) für API-Zugänge verschickt`);
    } catch (err) {
      logger.error('API-Zugang-Erinnerung fehlgeschlagen:', err);
    }
  });
  cron.schedule('40 3 * * *', async () => {
    try {
      const n = await purgeOldApiTokenRequests();
      if (n > 0) logger.info(`🧹 ${n} alte Agenten-Protokolleinträge gelöscht`);
    } catch (err) {
      logger.error('Agenten-Protokoll-Bereinigung fehlgeschlagen:', err);
    }
  });
  logger.info('✅ API-Zugang-Job registriert (Erinnerung 08:05, Bereinigung 03:40)');
}
