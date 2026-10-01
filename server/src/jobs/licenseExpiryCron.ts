import cron from 'node-cron';
import { pool } from '../config/database';
import { emailService } from '../services/emailService';
import { sendPushToUser } from '../services/pushNotifications';
import { logger } from '../utils/logger';

/**
 * Lizenz-Ablauf-Digest (Infinigate Phase 2, läuft auf gesyncten Daten):
 * Montags 07:45 bekommen Org-Admins eine Mail + Push mit allen Lizenzen/
 * Abos, deren JÜNGSTE Laufzeit in ≤30 Tagen endet (oder seit ≤14 Tagen
 * abgelaufen ist). Eine Verlängerung erzeugt beim Sync eine neue Position
 * mit späterem period_end — dann fällt das Produkt automatisch aus dem
 * Digest. Gleiche Kern-Query wie GET /sevdesk/license-expiry.
 */

const WARN_DAYS = 30;

interface ExpiryRow {
  customer_name: string;
  description: string;
  product_sku: string | null;
  serial_number: string | null;
  period_end: Date;
}

async function expiringForOrg(organizationId: string): Promise<ExpiryRow[]> {
  const result = await pool.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (li.customer_id, COALESCE(NULLIF(li.product_sku, ''), LOWER(li.description)))
        c.name AS customer_name, li.description, li.product_sku, li.serial_number, li.period_end
      FROM invoice_line_items li
      JOIN customers c ON c.id = li.customer_id AND c.deleted_at IS NULL
      WHERE li.organization_id = $1
        AND li.customer_id IS NOT NULL
        AND li.period_end IS NOT NULL
        AND li.item_type IN ('license', 'subscription')
        AND li.rebilling_status <> 'skipped'
      ORDER BY li.customer_id, COALESCE(NULLIF(li.product_sku, ''), LOWER(li.description)), li.period_end DESC
    ) latest
    WHERE latest.period_end >= CURRENT_DATE - INTERVAL '14 days'
      AND latest.period_end <= CURRENT_DATE + INTERVAL '${WARN_DAYS} days'
    ORDER BY latest.period_end ASC
  `, [organizationId]);
  return result.rows;
}

export async function runLicenseExpiryDigest(): Promise<void> {
  const orgs = await pool.query(
    `SELECT DISTINCT organization_id FROM invoice_line_items WHERE period_end IS NOT NULL`
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

      const fmtDate = (d: Date) => new Date(d).toLocaleDateString('de-DE');
      const label = (row: ExpiryRow) => {
        const expired = new Date(row.period_end).getTime() < Date.now();
        return `${row.customer_name}: ${row.description}` +
          (row.serial_number ? ` (SN ${row.serial_number})` : '') +
          ` — ${expired ? 'ABGELAUFEN am' : 'läuft ab am'} ${fmtDate(row.period_end)}`;
      };
      const listHtml = expiring.map(r => `<li>${label(r)}</li>`).join('');
      const listText = expiring.map(r => `- ${label(r)}`).join('\n');
      const baseUrl = process.env.FRONTEND_URL || 'https://app.ramboeck.it';

      for (const admin of admins.rows) {
        await sendPushToUser(admin.id, {
          title: 'Lizenz-Ablauf',
          body: `${expiring.length} Lizenz(en)/Abo(s) laufen in den nächsten ${WARN_DAYS} Tagen ab`,
          tag: 'license-expiry',
          data: { url: '/finanzen/billing', type: 'license_expiry' },
        }).catch(() => { /* Push ist best effort */ });

        await emailService.sendEmail({
          to: admin.email,
          subject: `RamboFlow: ${expiring.length} ablaufende Lizenz(en) in den nächsten ${WARN_DAYS} Tagen`,
          html: `<p>Hallo ${admin.username},</p>
            <p>folgende Lizenzen/Abos enden bald (jüngste bekannte Laufzeit — Verlängerungen aus neuen Belegen entfernen den Eintrag automatisch):</p>
            <ul>${listHtml}</ul>
            <p><a href="${baseUrl}/finanzen/billing" style="display:inline-block;background-color:#F27024;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;">Abrechnung öffnen</a></p>`,
          text: `Hallo ${admin.username},\n\nfolgende Lizenzen/Abos enden bald:\n\n${listText}\n\n${baseUrl}/finanzen/billing`,
        }).catch(err => logger.error(`Lizenz-Ablauf-Mail an ${admin.email} fehlgeschlagen: ${err.message}`));
      }

      logger.info(`Lizenz-Ablauf-Digest Org ${organizationId}: ${expiring.length} Einträge an ${admins.rows.length} Admin(s)`);
    } catch (err: any) {
      logger.error(`Lizenz-Ablauf-Digest Org ${organizationId} fehlgeschlagen: ${err.message}`);
    }
  }
}

export function startLicenseExpiryJob() {
  cron.schedule('45 7 * * 1', async () => {
    try {
      await runLicenseExpiryDigest();
    } catch (err: any) {
      logger.error(`Lizenz-Ablauf-Cron fehlgeschlagen: ${err.message}`);
    }
  });
  logger.info('✅ Lizenz-Ablauf-Job registriert (montags 07:45)');
}
