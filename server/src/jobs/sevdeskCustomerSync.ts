import cron from 'node-cron';
import { pool, query } from '../config/database';
import * as sevdeskService from '../services/sevdeskService';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';

/**
 * sevDesk-Kunden-Auto-Sync Background Job.
 *
 * Läuft täglich um 06:15 Uhr über alle User, die in ihrer sevDesk-Config
 * `auto_sync_customers = true` gesetzt haben (Toggle „Kunden automatisch
 * synchronisieren" in den sevDesk-Einstellungen). Für jeden solchen User
 * werden neue sevDesk-Kontakte (matchStatus 'new', keine Ansprechpartner)
 * automatisch als lokale Kunden angelegt und der User per E-Mail informiert.
 *
 * Bewusst konservativ: es werden NUR eindeutig neue Kunden importiert.
 * `name_match`-Kandidaten (gleicher Name wie ein bestehender Kunde) werden
 * NICHT automatisch verknüpft — die zählt der Job nur und weist in der Mail
 * darauf hin, damit der User sie im Import-Dialog manuell prüfen kann.
 */

// Farbpalette analog zum Import-Dialog, deterministisch pro Index rotiert
// (kein Math.random im Job — reproduzierbar).
const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

export function startSevdeskCustomerSyncJob() {
  cron.schedule('15 6 * * *', async () => {
    try {
      await runCustomerSync();
    } catch (error: any) {
      logger.error(`sevDesk-Kunden-Sync-Job error: ${error.message}`);
    }
  });

  logger.info('✅ sevDesk-Kunden-Auto-Sync-Job gestartet (täglich 06:15 Uhr)');
}

interface SyncUserRow {
  id: string;
  email: string | null;
  name: string | null;
}

export async function runCustomerSync() {
  // Nur User mit gültigem Token UND aktiviertem Auto-Sync-Toggle.
  const result = await pool.query<SyncUserRow>(`
    SELECT u.id, u.email, COALESCE(u.display_name, u.username) AS name
    FROM sevdesk_config sc
    JOIN users u ON sc.user_id = u.id
    WHERE sc.api_token IS NOT NULL AND sc.api_token <> ''
      AND sc.auto_sync_customers = true
  `);

  if (result.rows.length === 0) {
    return;
  }

  logger.info(`sevDesk-Kunden-Sync: ${result.rows.length} User mit aktivem Auto-Sync`);

  for (const user of result.rows) {
    try {
      await syncCustomersForUser(user);
    } catch (err: any) {
      logger.error(`sevDesk-Kunden-Sync für User ${user.id} fehlgeschlagen: ${err.message}`);
    }
  }
}

export interface CustomerSyncSummary {
  newCount: number;
  imported: number;
  errors: number;
  nameMatchCount: number;
}

/**
 * Manueller Trigger für einen einzelnen User (z.B. Button „Jetzt synchronisieren").
 * Ignoriert den auto_sync-Toggle bewusst — der User hat es explizit angestoßen.
 */
export async function runCustomerSyncForUser(userId: string): Promise<CustomerSyncSummary> {
  const result = await pool.query<SyncUserRow>(
    `SELECT id, email, COALESCE(display_name, username) AS name FROM users WHERE id = $1`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) {
    return { newCount: 0, imported: 0, errors: 0, nameMatchCount: 0 };
  }
  return syncCustomersForUser(user);
}

async function syncCustomersForUser(user: SyncUserRow): Promise<CustomerSyncSummary> {
  const config = await sevdeskService.getConfig(user.id);
  if (!config?.apiToken) return { newCount: 0, imported: 0, errors: 0, nameMatchCount: 0 };

  // Standard-Preview: nur Top-Level-Kunden (Kategorie 3), keine Ansprechpartner.
  const preview = await sevdeskService.getCustomerImportPreview(user.id, config.apiToken);

  const newCustomers = preview.filter(p => p.matchStatus === 'new' && !p.isSubContact);
  const nameMatchCount = preview.filter(p => p.matchStatus === 'name_match' && !p.isSubContact).length;

  if (newCustomers.length === 0) {
    // Nichts Neues — kein Import, keine Mail (Rauschen vermeiden).
    logger.info(`sevDesk-Kunden-Sync User ${user.id}: keine neuen Kunden`);
    return { newCount: 0, imported: 0, errors: 0, nameMatchCount };
  }

  const imports = newCustomers.map((c, i) => ({
    sevdeskId: c.sevdeskId,
    action: 'import' as const,
    color: COLORS[i % COLORS.length],
  }));

  const importResult = await sevdeskService.batchImportSevdeskCustomers(
    user.id,
    config.apiToken,
    imports
  );

  // last_sync_at aktualisieren
  await query(
    'UPDATE sevdesk_config SET last_sync_at = NOW() WHERE user_id = $1',
    [user.id]
  );

  logger.info(
    `sevDesk-Kunden-Sync User ${user.id}: ${importResult.imported} importiert, ` +
    `${importResult.errors.length} Fehler, ${nameMatchCount} Namenstreffer offen`
  );

  if (importResult.imported > 0) {
    await notifyUser(user, newCustomers.map(c => c.name), importResult, nameMatchCount);
  }

  return {
    newCount: newCustomers.length,
    imported: importResult.imported,
    errors: importResult.errors.length,
    nameMatchCount,
  };
}

async function notifyUser(
  user: SyncUserRow,
  importedNames: string[],
  result: { imported: number; errors: string[] },
  nameMatchCount: number
): Promise<void> {
  if (!user.email) {
    logger.warn(`sevDesk-Kunden-Sync: User ${user.id} hat keine E-Mail — keine Benachrichtigung`);
    return;
  }

  const appUrl = process.env.FRONTEND_URL || 'https://app.ramboeck.it';
  const nameList = importedNames.slice(0, result.imported);

  const rows = nameList
    .map(n => `<li style="padding:4px 0;">${escapeHtml(n)}</li>`)
    .join('');

  const nameMatchHint = nameMatchCount > 0
    ? `<p style="color:#92400e;background:#fef3c7;padding:10px 12px;border-radius:6px;">
         ${nameMatchCount} weitere${nameMatchCount === 1 ? 'r Kontakt hat' : ' Kontakte haben'} denselben Namen wie
         ein bestehender Kunde und wurde${nameMatchCount === 1 ? '' : 'n'} <strong>nicht</strong> automatisch übernommen.
         Bitte im Import-Dialog manuell prüfen.
       </p>`
    : '';

  const errorHint = result.errors.length > 0
    ? `<p style="color:#991b1b;background:#fee2e2;padding:10px 12px;border-radius:6px;">
         ${result.errors.length} Kontakt(e) konnten nicht importiert werden. Details im Server-Log.
       </p>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
      <h2 style="color:#FF6A00;">Neue Kunden aus sevDesk importiert</h2>
      <p>Der automatische sevDesk-Abgleich hat <strong>${result.imported}</strong>
         neue${result.imported === 1 ? 'n Kunden' : ' Kunden'} in RamboFlow angelegt:</p>
      <ul style="padding-left:20px;">${rows}</ul>
      ${nameMatchHint}
      ${errorHint}
      <p style="margin-top:24px;">
        <a href="${appUrl}" style="background:#FF6A00;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
          In RamboFlow öffnen
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">
        Diese Benachrichtigung kommt vom automatischen Kunden-Sync. Du kannst ihn in den
        sevDesk-Einstellungen unter „Kunden automatisch synchronisieren" deaktivieren.
      </p>
    </div>
  `;

  const textLines = [
    `Neue Kunden aus sevDesk importiert (${result.imported}):`,
    ...nameList.map(n => `- ${n}`),
  ];
  if (nameMatchCount > 0) {
    textLines.push('', `${nameMatchCount} Kontakt(e) mit gleichem Namen wurden NICHT automatisch übernommen — bitte manuell prüfen.`);
  }
  if (result.errors.length > 0) {
    textLines.push('', `${result.errors.length} Kontakt(e) konnten nicht importiert werden (siehe Server-Log).`);
  }
  textLines.push('', appUrl);

  await emailService.sendEmail({
    to: user.email,
    subject: `RamboFlow: ${result.imported} neue${result.imported === 1 ? 'r Kunde' : ' Kunden'} aus sevDesk importiert`,
    html,
    text: textLines.join('\n'),
  });

  logger.info(`sevDesk-Kunden-Sync: Benachrichtigung an ${user.email} gesendet`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
