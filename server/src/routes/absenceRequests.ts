import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../config/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { validate } from '../middleware/validation';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';

/**
 * Urlaubsanträge mit Genehmigungsworkflow (Mein Bereich → Abwesenheit).
 * Mitarbeiter stellt Antrag → Admins werden per Mail informiert →
 * Genehmigung erzeugt automatisch time_entries-Abwesenheits-Einträge für
 * jeden Werktag im Zeitraum; Ablehnung mit Begründung. Mutationen werden
 * durch die globale auditTrail-Middleware protokolliert.
 */

const router = Router();

const CATEGORY_LABELS: Record<string, string> = {
  vacation: 'Urlaub',
  sick: 'Krankheit',
  special_leave: 'Sonderurlaub',
};

// <input type="date"> liefert YYYY-MM-DD (Regel 14)
const createSchema = z.object({
  category: z.enum(['vacation', 'sick', 'special_leave']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(1000).optional(),
});

const decideSchema = z.object({
  decisionNote: z.string().max(1000).optional(),
});

const REQUEST_COLUMNS = `
  ar.id, ar.user_id, ar.organization_id, ar.category, ar.start_date, ar.end_date,
  ar.note, ar.status, ar.decided_by, ar.decided_at, ar.decision_note, ar.created_at
`;

const toApi = (r: any) => ({
  id: r.id,
  userId: r.user_id,
  category: r.category,
  startDate: typeof r.start_date === 'string' ? r.start_date : new Date(r.start_date).toISOString().slice(0, 10),
  endDate: typeof r.end_date === 'string' ? r.end_date : new Date(r.end_date).toISOString().slice(0, 10),
  note: r.note,
  status: r.status,
  decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
  decisionNote: r.decision_note,
  createdAt: new Date(r.created_at).toISOString(),
  userName: r.user_name || undefined,
  decidedByName: r.decided_by_name || undefined,
});

// Alle Werktage (Mo–Fr) im Zeitraum
function workdaysBetween(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const d = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (d <= end) {
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) {
      days.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

async function notifyAdmins(organizationId: string | null, subject: string, text: string): Promise<void> {
  if (!organizationId) return;
  try {
    const admins = await query(
      `SELECT u.email, COALESCE(u.display_name, u.username) AS name
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1 AND om.role IN ('owner', 'admin') AND u.email IS NOT NULL`,
      [organizationId]
    );
    for (const admin of admins.rows) {
      await emailService.sendEmail({
        to: admin.email,
        subject,
        html: `<p>${text.replace(/\n/g, '<br>')}</p><p><a href="${process.env.FRONTEND_URL || 'https://app.ramboeck.it'}/finanzen/reports">Zur Genehmigung in RamboFlow</a></p>`,
        text: `${text}\n\n${process.env.FRONTEND_URL || 'https://app.ramboeck.it'}/finanzen/reports`,
      });
    }
  } catch (err: any) {
    logger.error(`Admin-Benachrichtigung fehlgeschlagen: ${err.message}`);
  }
}

async function notifyUser(userId: string, subject: string, text: string): Promise<void> {
  try {
    const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const email = result.rows[0]?.email;
    if (!email) return;
    await emailService.sendEmail({
      to: email,
      subject,
      html: `<p>${text.replace(/\n/g, '<br>')}</p>`,
      text,
    });
  } catch (err: any) {
    logger.error(`User-Benachrichtigung fehlgeschlagen: ${err.message}`);
  }
}

// POST /api/absence-requests — Antrag stellen
router.post('/', authenticateToken, attachOrganization, validate(createSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization?.id || null;
    const { category, startDate, endDate, note } = req.body;

    if (endDate < startDate) {
      return res.status(400).json({ success: false, error: 'Enddatum liegt vor dem Startdatum' });
    }

    // Überschneidung mit eigenen offenen/genehmigten Anträgen verhindern
    const overlap = await query(
      `SELECT id FROM absence_requests
       WHERE user_id = $1 AND status IN ('pending', 'approved')
         AND start_date <= $3 AND end_date >= $2
       LIMIT 1`,
      [userId, startDate, endDate]
    );
    if (overlap.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Für diesen Zeitraum existiert bereits ein Antrag' });
    }

    const id = crypto.randomUUID();
    const result = await query(
      `INSERT INTO absence_requests (id, user_id, organization_id, category, start_date, end_date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, organization_id, category, start_date, end_date, note, status, decided_by, decided_at, decision_note, created_at`,
      [id, userId, organizationId, category, startDate, endDate, note ?? null]
    );

    const userName = req.user!.username || 'Ein Mitarbeiter';
    // Fire-and-forget — Antrag darf nicht an Mail-Problemen scheitern
    notifyAdmins(
      organizationId,
      `RamboFlow: Neuer Abwesenheitsantrag von ${userName}`,
      `${userName} beantragt ${CATEGORY_LABELS[category]} von ${startDate} bis ${endDate}.${note ? `\nNotiz: ${note}` : ''}`
    );

    res.status(201).json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Create absence request error:', error);
    res.status(500).json({ success: false, error: 'Antrag konnte nicht erstellt werden' });
  }
});

// GET /api/absence-requests — eigene Anträge
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT ${REQUEST_COLUMNS}, COALESCE(d.display_name, d.username) AS decided_by_name
       FROM absence_requests ar
       LEFT JOIN users d ON d.id = ar.decided_by
       WHERE ar.user_id = $1
       ORDER BY ar.created_at DESC
       LIMIT 100`,
      [req.user!.id]
    );
    res.json({ success: true, data: result.rows.map(toApi) });
  } catch (error: any) {
    logger.error('List absence requests error:', error);
    res.status(500).json({ success: false, error: 'Anträge konnten nicht geladen werden' });
  }
});

// POST /api/absence-requests/:id/cancel — eigenen offenen Antrag zurückziehen
router.post('/:id/cancel', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE absence_requests SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING id`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Antrag nicht gefunden oder nicht mehr offen' });
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Cancel absence request error:', error);
    res.status(500).json({ success: false, error: 'Zurückziehen fehlgeschlagen' });
  }
});

// GET /api/absence-requests/team — alle Anträge der Org (Admin)
router.get('/team', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const status = (req.query.status as string) || undefined;

    const result = await query(
      `SELECT ${REQUEST_COLUMNS},
              COALESCE(u.display_name, u.username) AS user_name,
              COALESCE(d.display_name, d.username) AS decided_by_name
       FROM absence_requests ar
       JOIN users u ON u.id = ar.user_id
       LEFT JOIN users d ON d.id = ar.decided_by
       WHERE ar.organization_id = $1 ${status ? 'AND ar.status = $2' : ''}
       ORDER BY ar.status = 'pending' DESC, ar.created_at DESC
       LIMIT 200`,
      status ? [orgReq.organization.id, status] : [orgReq.organization.id]
    );
    res.json({ success: true, data: result.rows.map(toApi) });
  } catch (error: any) {
    logger.error('List team absence requests error:', error);
    res.status(500).json({ success: false, error: 'Anträge konnten nicht geladen werden' });
  }
});

// POST /api/absence-requests/:id/approve — genehmigen (Admin) → erzeugt Abwesenheits-Einträge
router.post('/:id/approve', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(decideSchema), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const adminId = req.user!.id;
    const { decisionNote } = req.body;

    const requestResult = await query(
      `SELECT ${REQUEST_COLUMNS} FROM absence_requests ar
       WHERE ar.id = $1 AND ar.organization_id = $2 AND ar.status = 'pending'`,
      [req.params.id, orgReq.organization.id]
    );
    if (requestResult.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Antrag nicht gefunden oder nicht mehr offen' });
    }
    const request = toApi(requestResult.rows[0]);

    // Tages-Soll des Antragstellers für die Eintragsdauer
    const userResult = await query('SELECT weekly_hours FROM users WHERE id = $1', [request.userId]);
    const weeklyHours = Number(userResult.rows[0]?.weekly_hours) || 40;
    const dailySeconds = Math.round((weeklyHours / 5) * 3600);

    // Für jeden Werktag einen Abwesenheits-Eintrag anlegen (falls dort noch
    // keiner existiert — z.B. manuell bereits erfasst)
    const days = workdaysBetween(request.startDate, request.endDate);
    let created = 0;
    for (const day of days) {
      const existing = await query(
        `SELECT id FROM time_entries
         WHERE user_id = $1 AND entry_scope = 'absence' AND start_time::date = $2
         LIMIT 1`,
        [request.userId, day]
      );
      if (existing.rows.length > 0) continue;

      await query(
        `INSERT INTO time_entries (id, user_id, organization_id, project_id, activity_id, ticket_id, start_time, end_time, duration, description, is_running, is_billable, created_at, entry_scope, internal_category, customer_visibility)
         VALUES ($1, $2, $3, NULL, NULL, NULL, $4, $5, $6, $7, false, false, NOW(), 'absence', $8, 'hidden')`,
        [
          crypto.randomUUID(),
          request.userId,
          orgReq.organization.id,
          `${day}T09:00:00`,
          `${day}T17:00:00`,
          dailySeconds,
          `${CATEGORY_LABELS[request.category]} (genehmigter Antrag)`,
          request.category,
        ]
      );
      created++;
    }

    await query(
      `UPDATE absence_requests
       SET status = 'approved', decided_by = $1, decided_at = NOW(), decision_note = $2, updated_at = NOW()
       WHERE id = $3`,
      [adminId, decisionNote ?? null, req.params.id]
    );

    notifyUser(
      request.userId,
      `RamboFlow: Dein ${CATEGORY_LABELS[request.category]}-Antrag wurde genehmigt`,
      `Dein Antrag (${request.startDate} bis ${request.endDate}) wurde genehmigt.${decisionNote ? `\nKommentar: ${decisionNote}` : ''}`
    );

    res.json({ success: true, data: { createdEntries: created } });
  } catch (error: any) {
    logger.error('Approve absence request error:', error);
    res.status(500).json({ success: false, error: 'Genehmigung fehlgeschlagen' });
  }
});

// POST /api/absence-requests/:id/reject — ablehnen (Admin)
router.post('/:id/reject', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(decideSchema), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const { decisionNote } = req.body;

    const result = await query(
      `UPDATE absence_requests
       SET status = 'rejected', decided_by = $1, decided_at = NOW(), decision_note = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 AND status = 'pending'
       RETURNING user_id, category, start_date, end_date`,
      [req.user!.id, decisionNote ?? null, req.params.id, orgReq.organization.id]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Antrag nicht gefunden oder nicht mehr offen' });
    }

    const r = result.rows[0];
    notifyUser(
      r.user_id,
      `RamboFlow: Dein ${CATEGORY_LABELS[r.category] || 'Abwesenheits'}-Antrag wurde abgelehnt`,
      `Dein Antrag wurde leider abgelehnt.${decisionNote ? `\nBegründung: ${decisionNote}` : ''}`
    );

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Reject absence request error:', error);
    res.status(500).json({ success: false, error: 'Ablehnung fehlgeschlagen' });
  }
});

export default router;
