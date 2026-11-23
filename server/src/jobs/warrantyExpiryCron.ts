import cron from 'node-cron';
import { pool } from '../config/database';
import { emailService } from '../services/emailService';
import { sendPushToUser } from '../services/pushNotifications';
import { escapeHtml } from '../utils/escapeHtml';
import { logger } from '../utils/logger';

/**
 * Garantie-Digest (AS-3): Montags 07:50 bekommen Org-Admins eine Mail +
 * Push mit allen Geraeten (nicht ausgemustert), deren Garantie in ≤60 Tagen
 * endet oder seit ≤30 Tagen abgelaufen ist — gleiches Fenster wie die
 * Garantie-Leiste in Support → Geraete. Verlaengerte Garantie = Datum am
 * Geraet anpassen, dann faellt es raus.
 */

export const WARRANTY_WARN_DAYS = 60;

interface WarrantyRow {
  name: string;
  customer_name: string | null;
  serial_number: string | null;
  warranty_until: string;
}

async function expiringForOrg(organizationId: string): Promise<WarrantyRow[]> {
  const result = await pool.query(
    `SELECT a.name, c.name AS customer_name, a.serial_number,
            to_char(a.warranty_until, 'YYYY-MM-DD') AS warranty_until
       FROM assets a
       LEFT JOIN customers c ON c.id = a.customer_id
      WHERE a.organization_id = $1 AND a.deleted_at IS NULL AND a.status <> 'retired'
        AND a.warranty_until IS NOT NULL
        AND a.warranty_until >= CURRENT_DATE - INTERVAL '30 days'
        AND a.warranty_until <= CURRENT_DATE + make_interval(days => $2::int)
      ORDER BY a.warranty_until ASC, c.name ASC NULLS LAST`,
    [organizationId, WARRANTY_WARN_DAYS]
  );
  return result.rows;
}

export async function runWarrantyExpiryDigest(): Promise<void> {
  const orgs = await pool.query(
    `SELECT DISTINCT organization_id FROM assets WHERE warranty_until IS NOT NULL AND deleted_at IS NULL`
  );

  for (const orgRow of orgs.rows) {
    const organizationId: string = orgRow.organization_id;
    try {
      const expiring = await expiringForOrg(organizationId);
      if (expiring.length === 0) continue;

      const admins = await pool.query(
        `SELECT u.id, u.email, u.username
           FROM organization_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1 AND om.role IN ('owner', 'admin')
            AND u.email IS NOT NULL AND u.email <> ''`,
        [organizationId]
      );
      if (admins.rows.length === 0) continue;

      const today = new Date().toISOString().slice(0, 10);
      const fmt = (iso: string) => iso.split('-').reverse().join('.');
      const label = (r: WarrantyRow) =>
        `${r.customer_name ?? 'Eigenes Gerät'}: ${r.name}` +
        (r.serial_number ? ` (SN ${r.serial_number})` : '') +
        ` — Garantie ${r.warranty_until < today ? 'ABGELAUFEN am' : 'endet am'} ${fmt(r.warranty_until)}`;
      const listHtml = expiring.map(r => `<li>${escapeHtml(label(r))}</li>`).join('');
      const listText = expiring.map(r => `- ${label(r)}`).join('\n');
      const baseUrl = process.env.FRONTEND_URL || 'https://app.ramboeck.it';

      for (const admin of admins.rows) {
        await sendPushToUser(admin.id, {
          title: 'Garantie läuft aus',
          body: `${expiring.length} Gerät(e) mit auslaufender oder abgelaufener Garantie`,
          tag: 'warranty-expiry',
          data: { url: '/support/devices', type: 'warranty_expiry' },
        }).catch(() => { /* Push ist best effort */ });

        await emailService.sendEmail({
          to: admin.email,
          subject: `RamboFlow: ${expiring.length} Gerät(e) mit auslaufender Garantie`,
          html: `<p>Hallo ${escapeHtml(admin.username)},</p>
            <p>bei folgenden Geräten endet die Garantie in den nächsten ${WARRANTY_WARN_DAYS} Tagen oder ist kürzlich abgelaufen:</p>
            <ul>${listHtml}</ul>
            <p><a href="${baseUrl}/support/devices" style="display:inline-block;background-color:#F27024;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;">Geräte öffnen</a></p>`,
          text: `Hallo ${admin.username},\n\nbei folgenden Geräten endet die Garantie bald:\n\n${listText}\n\n${baseUrl}/support/devices`,
        }).catch(err => logger.error(`Garantie-Mail an ${admin.email} fehlgeschlagen: ${err.message}`));
      }

      logger.info(`Garantie-Digest Org ${organizationId}: ${expiring.length} Geräte an ${admins.rows.length} Admin(s)`);
    } catch (err) {
      logger.error(`Garantie-Digest Org ${organizationId} fehlgeschlagen:`, err);
    }
  }
}

export function startWarrantyExpiryJob() {
  cron.schedule('50 7 * * 1', async () => {
    try {
      await runWarrantyExpiryDigest();
    } catch (err) {
      logger.error('Garantie-Cron fehlgeschlagen:', err);
    }
  });
  logger.info('✅ Garantie-Job registriert (montags 07:50)');
}
