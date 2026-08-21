import cron from 'node-cron';
import { query } from '../config/database';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';

/**
 * Abdeckungs-Erinnerungen (Zeiterfassung Paket 4):
 *
 * 1. Täglich 08:30 — wer GESTERN eingestempelt war, aber mehr als
 *    UNASSIGNED_MIN_SECONDS nicht zugeordnete Zeit hat (Abdeckung unter
 *    COVERAGE_THRESHOLD), bekommt eine E-Mail mit Deep-Link auf die
 *    Tages-Timeline des Vortags.
 * 2. Montags 08:00 — Wochenzusammenfassung der Team-Abdeckung an alle
 *    Org-Admins/Owner.
 *
 * Bewusst E-Mail statt Blockade: erfassen bleibt jederzeit möglich,
 * die Erinnerung stupst nur an, solange die Erinnerung frisch ist.
 */

const COVERAGE_THRESHOLD = 0.85;
const UNASSIGNED_MIN_SECONDS = 15 * 60;

const fmtHours = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

interface UserCoverage {
  user_id: string;
  organization_id: string | null;
  email: string | null;
  user_name: string;
  attendance_seconds: number;
  recorded_seconds: number;
}

async function coverageForRange(from: string, to: string): Promise<UserCoverage[]> {
  const result = await query(
    `WITH att AS (
       SELECT ws.user_id, ws.organization_id,
              SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(ws.ended_at, NOW()) - ws.started_at))::int
                  - ws.break_seconds))::bigint AS attendance_seconds
       FROM work_sessions ws
       WHERE ws.work_date BETWEEN $1 AND $2 AND ws.ended_at IS NOT NULL
       GROUP BY ws.user_id, ws.organization_id
     ),
     rec AS (
       SELECT te.user_id,
              SUM(CASE WHEN te.entry_scope IN ('customer_project', 'internal') THEN COALESCE(te.duration, 0) ELSE 0 END)::bigint AS recorded_seconds
       FROM time_entries te
       WHERE te.is_running = false
         AND te.start_time >= $1::date AND te.start_time < ($2::date + INTERVAL '1 day')
       GROUP BY te.user_id
     )
     SELECT att.user_id, att.organization_id, u.email,
            COALESCE(u.display_name, u.username) AS user_name,
            att.attendance_seconds,
            COALESCE(rec.recorded_seconds, 0) AS recorded_seconds
     FROM att
     JOIN users u ON u.id = att.user_id
     LEFT JOIN rec ON rec.user_id = att.user_id`,
    [from, to]
  );
  return result.rows.map((r: any) => ({
    ...r,
    attendance_seconds: Number(r.attendance_seconds),
    recorded_seconds: Number(r.recorded_seconds),
  }));
}

export async function runDailyCoverageReminder(): Promise<{ notified: number }> {
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await coverageForRange(yesterday, yesterday);
  const baseUrl = process.env.FRONTEND_URL || 'https://app.ramboeck.it';
  let notified = 0;

  for (const row of rows) {
    if (!row.email || row.attendance_seconds <= 0) continue;
    const unassigned = Math.max(0, row.attendance_seconds - row.recorded_seconds);
    const coverage = row.recorded_seconds / row.attendance_seconds;
    if (unassigned <= UNASSIGNED_MIN_SECONDS || coverage >= COVERAGE_THRESHOLD) continue;

    const link = `${baseUrl}/arbeiten/zeiten?view=day&date=${yesterday}`;
    const dayLabel = new Date(yesterday + 'T00:00:00').toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: '2-digit',
    });
    await emailService.sendEmail({
      to: row.email,
      subject: `RamboFlow: ${fmtHours(unassigned)} h von ${dayLabel} noch nicht zugeordnet`,
      html: `<p>Hallo ${row.user_name},</p>
        <p>von deiner Arbeitszeit am <strong>${dayLabel}</strong>
        (${fmtHours(row.attendance_seconds)} h Anwesenheit) sind erst
        <strong>${fmtHours(row.recorded_seconds)} h</strong> einem Projekt oder einer
        internen Kategorie zugeordnet — <strong>${fmtHours(unassigned)} h fehlen noch</strong>.</p>
        <p><a href="${link}" style="display:inline-block;background-color:#F27024;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-weight:600;">Tages-Timeline öffnen &amp; Lücken füllen</a></p>
        <p style="font-size:12px;color:#6b7280;">In der Timeline sind die Lücken markiert — ein Klick trägt sie nach. Nicht erfasste Kundenzeit ist nicht abrechenbare Zeit.</p>`,
      text: `Hallo ${row.user_name},\n\nvon deiner Arbeitszeit am ${dayLabel} (${fmtHours(row.attendance_seconds)} h Anwesenheit) sind erst ${fmtHours(row.recorded_seconds)} h zugeordnet — ${fmtHours(unassigned)} h fehlen noch.\n\n${link}`,
    }).catch(err => logger.error(`Coverage-Reminder an ${row.email} fehlgeschlagen: ${err.message}`));
    notified++;
  }

  logger.info(`Coverage-Reminder (${yesterday}): ${notified} Erinnerung(en) versendet`);
  return { notified };
}

export async function runWeeklyCoverageSummary(): Promise<void> {
  const to = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10); // gestern (So)
  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await coverageForRange(from, to);
  if (rows.length === 0) return;

  // Nach Organisation gruppieren
  const byOrg = new Map<string, UserCoverage[]>();
  for (const row of rows) {
    if (!row.organization_id) continue;
    if (!byOrg.has(row.organization_id)) byOrg.set(row.organization_id, []);
    byOrg.get(row.organization_id)!.push(row);
  }

  for (const [organizationId, users] of byOrg) {
    const admins = await query(
      `SELECT u.email FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND om.role IN ('owner', 'admin') AND u.email IS NOT NULL`,
      [organizationId]
    );
    if (admins.rows.length === 0) continue;

    const lines = users
      .sort((a, b) => a.user_name.localeCompare(b.user_name, 'de'))
      .map(u => {
        const pct = u.attendance_seconds > 0 ? Math.round((u.recorded_seconds / u.attendance_seconds) * 100) : 0;
        const unassigned = Math.max(0, u.attendance_seconds - u.recorded_seconds);
        return `<tr><td style="padding:4px 12px 4px 0;">${u.user_name}</td>
          <td style="padding:4px 12px;text-align:right;">${fmtHours(u.attendance_seconds)} h</td>
          <td style="padding:4px 12px;text-align:right;">${fmtHours(u.recorded_seconds)} h</td>
          <td style="padding:4px 12px;text-align:right;font-weight:600;color:${pct >= 85 ? '#16a34a' : '#d97706'};">${pct} %</td>
          <td style="padding:4px 0 4px 12px;text-align:right;">${fmtHours(unassigned)} h</td></tr>`;
      })
      .join('');

    const html = `<p>Team-Abdeckung der letzten Woche (${from} – ${to}):</p>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr style="color:#6b7280;font-size:12px;"><th align="left">Mitarbeiter</th><th>Anwesenheit</th><th>Erfasst</th><th>Abdeckung</th><th>Offen</th></tr>
        ${lines}
      </table>
      <p style="font-size:12px;color:#6b7280;">Details unter Berichte → Arbeitszeit.</p>`;

    for (const admin of admins.rows) {
      await emailService.sendEmail({
        to: admin.email,
        subject: 'RamboFlow: Team-Abdeckung der letzten Woche',
        html,
        text: users.map(u => `${u.user_name}: ${fmtHours(u.recorded_seconds)}/${fmtHours(u.attendance_seconds)} h`).join('\n'),
      }).catch(err => logger.error(`Wochen-Abdeckungs-Mail fehlgeschlagen: ${err.message}`));
    }
  }
  logger.info(`Wochen-Abdeckungs-Zusammenfassung versendet (${byOrg.size} Org(s))`);
}

export function startCoverageReminderJob(): void {
  // Täglich 08:30 — Erinnerung für den Vortag
  cron.schedule('30 8 * * *', () => {
    runDailyCoverageReminder().catch(err => logger.error('Coverage-Reminder-Cron fehlgeschlagen:', err));
  });
  // Montags 08:00 — Wochenzusammenfassung an Admins
  cron.schedule('0 8 * * 1', () => {
    runWeeklyCoverageSummary().catch(err => logger.error('Wochen-Abdeckungs-Cron fehlgeschlagen:', err));
  });
  logger.info('📊 Coverage-Reminder-Job registriert (täglich 08:30, wöchentlich Mo 08:00)');
}
