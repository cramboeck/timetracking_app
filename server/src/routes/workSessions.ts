import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../config/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { validate } from '../middleware/validation';
import { auditLog } from '../services/auditLog';
import { logger } from '../utils/logger';

/**
 * Arbeitszeiterfassung (Kommen/Gehen/Pausen) — work_sessions.
 * Getrennt von der Projektzeiterfassung (time_entries): hier geht es um die
 * gesetzliche Aufzeichnung von Arbeitsbeginn, -ende und Pausen pro Tag.
 *
 * Alle Stempel-Aktionen werden im Audit-Log protokolliert.
 */

const router = Router();

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// <input type="date"> liefert YYYY-MM-DD (Regel 14!)
const clockOutSchema = z.object({
  note: z.string().max(500).optional(),
});

const WORK_SESSION_COLUMNS = `
  id, user_id, organization_id, work_date, started_at, ended_at,
  break_seconds, break_started_at, note, created_at, updated_at
`;

interface WorkSessionRow {
  id: string;
  user_id: string;
  work_date: string;
  started_at: Date;
  ended_at: Date | null;
  break_seconds: number;
  break_started_at: Date | null;
  note: string | null;
}

const toApi = (row: WorkSessionRow) => ({
  id: row.id,
  userId: row.user_id,
  workDate: typeof row.work_date === 'string' ? row.work_date : new Date(row.work_date).toISOString().slice(0, 10),
  startedAt: row.started_at?.toISOString?.() ?? row.started_at,
  endedAt: row.ended_at ? (row.ended_at.toISOString?.() ?? row.ended_at) : null,
  breakSeconds: row.break_seconds || 0,
  breakStartedAt: row.break_started_at ? (row.break_started_at.toISOString?.() ?? row.break_started_at) : null,
  note: row.note,
});

async function getOpenSession(userId: string): Promise<WorkSessionRow | null> {
  const result = await query(
    `SELECT ${WORK_SESSION_COLUMNS} FROM work_sessions WHERE user_id = $1 AND ended_at IS NULL LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// GET /api/work-sessions/current — offene Session (oder null)
router.get('/current', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const open = await getOpenSession(req.user!.id);
    res.json({ success: true, data: open ? toApi(open) : null });
  } catch (error: any) {
    logger.error('Get current work session error:', error);
    res.status(500).json({ success: false, error: 'Failed to load current session' });
  }
});

// GET /api/work-sessions/coverage?from=&to= — Tages-Abdeckung:
// Anwesenheit (work_sessions netto) vs. erfasste Projekt-/interne Zeiten
// (time_entries). Grundlage für die Abdeckungs-Anzeige und den
// Ausstempel-Abgleich („nicht zugeordnete Zeit nachtragen?").
router.get('/coverage', authenticateToken, validate(rangeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = new Date().toISOString().slice(0, 10);
    const from = (req.query.from as string) || today;
    const to = (req.query.to as string) || from;

    const result = await query(
      `WITH att AS (
         SELECT work_date::text AS date,
                SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))::int
                    - break_seconds
                    - COALESCE(EXTRACT(EPOCH FROM (NOW() - break_started_at))::int, 0)))::int AS attendance_seconds,
                SUM(break_seconds + COALESCE(EXTRACT(EPOCH FROM (NOW() - break_started_at))::int, 0))::int AS break_seconds
         FROM work_sessions
         WHERE user_id = $1 AND work_date BETWEEN $2 AND $3
         GROUP BY work_date
       ),
       rec AS (
         SELECT start_time::date::text AS date,
                SUM(CASE WHEN is_running THEN GREATEST(EXTRACT(EPOCH FROM (NOW() - start_time))::int, 0)
                         ELSE COALESCE(duration, 0) END)::int AS recorded_seconds
         FROM time_entries
         WHERE user_id = $1
           AND entry_scope IN ('customer_project', 'internal')
           AND start_time >= $2::date AND start_time < ($3::date + INTERVAL '1 day')
         GROUP BY start_time::date
       )
       SELECT COALESCE(att.date, rec.date) AS date,
              COALESCE(att.attendance_seconds, 0) AS attendance_seconds,
              COALESCE(att.break_seconds, 0) AS break_seconds,
              COALESCE(rec.recorded_seconds, 0) AS recorded_seconds
       FROM att
       FULL OUTER JOIN rec ON att.date = rec.date
       ORDER BY 1`,
      [userId, from, to]
    );

    res.json({
      success: true,
      data: result.rows.map((r: any) => ({
        date: r.date,
        attendanceSeconds: r.attendance_seconds,
        breakSeconds: r.break_seconds,
        recordedSeconds: r.recorded_seconds,
        unassignedSeconds: Math.max(0, r.attendance_seconds - r.recorded_seconds),
      })),
    });
  } catch (error: any) {
    logger.error('Work session coverage error:', error);
    res.status(500).json({ success: false, error: 'Failed to load coverage' });
  }
});

// POST /api/work-sessions/clock-in — Einstempeln
router.post('/clock-in', authenticateToken, attachOrganization, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const orgReq = req as unknown as OrganizationRequest;

    const existing = await getOpenSession(userId);
    if (existing) {
      return res.status(409).json({ success: false, error: 'Es läuft bereits eine Arbeitszeit', data: toApi(existing) });
    }

    const id = crypto.randomUUID();
    const result = await query(
      `INSERT INTO work_sessions (id, user_id, organization_id, work_date, started_at)
       VALUES ($1, $2, $3, CURRENT_DATE, NOW())
       RETURNING ${WORK_SESSION_COLUMNS}`,
      [id, userId, orgReq.organization?.id || null]
    );

    await auditLog.log({
      userId,
      action: 'work_session.clock_in',
      details: JSON.stringify({ sessionId: id }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Clock-in error:', error);
    res.status(500).json({ success: false, error: 'Einstempeln fehlgeschlagen' });
  }
});

// POST /api/work-sessions/clock-out — Ausstempeln (laufende Pause wird eingerechnet)
router.post('/clock-out', authenticateToken, validate(clockOutSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { note } = req.body;

    const open = await getOpenSession(userId);
    if (!open) {
      return res.status(409).json({ success: false, error: 'Keine laufende Arbeitszeit' });
    }

    const result = await query(
      `UPDATE work_sessions
       SET ended_at = NOW(),
           break_seconds = break_seconds + COALESCE(EXTRACT(EPOCH FROM (NOW() - break_started_at))::int, 0),
           break_started_at = NULL,
           note = COALESCE($2, note),
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${WORK_SESSION_COLUMNS}`,
      [open.id, note ?? null]
    );

    await auditLog.log({
      userId,
      action: 'work_session.clock_out',
      details: JSON.stringify({ sessionId: open.id }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Clock-out error:', error);
    res.status(500).json({ success: false, error: 'Ausstempeln fehlgeschlagen' });
  }
});

// POST /api/work-sessions/break/start — Pause beginnen
router.post('/break/start', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const open = await getOpenSession(userId);
    if (!open) {
      return res.status(409).json({ success: false, error: 'Keine laufende Arbeitszeit' });
    }
    if (open.break_started_at) {
      return res.status(409).json({ success: false, error: 'Pause läuft bereits' });
    }

    const result = await query(
      `UPDATE work_sessions SET break_started_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING ${WORK_SESSION_COLUMNS}`,
      [open.id]
    );

    await auditLog.log({
      userId,
      action: 'work_session.break_start',
      details: JSON.stringify({ sessionId: open.id }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Break start error:', error);
    res.status(500).json({ success: false, error: 'Pause starten fehlgeschlagen' });
  }
});

// POST /api/work-sessions/break/end — Pause beenden
router.post('/break/end', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const open = await getOpenSession(userId);
    if (!open || !open.break_started_at) {
      return res.status(409).json({ success: false, error: 'Keine laufende Pause' });
    }

    const result = await query(
      `UPDATE work_sessions
       SET break_seconds = break_seconds + EXTRACT(EPOCH FROM (NOW() - break_started_at))::int,
           break_started_at = NULL,
           updated_at = NOW()
       WHERE id = $1 RETURNING ${WORK_SESSION_COLUMNS}`,
      [open.id]
    );

    await auditLog.log({
      userId,
      action: 'work_session.break_end',
      details: JSON.stringify({ sessionId: open.id }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Break end error:', error);
    res.status(500).json({ success: false, error: 'Pause beenden fehlgeschlagen' });
  }
});

// GET /api/work-sessions?from=&to= — eigene Sessions
router.get('/', authenticateToken, validate(rangeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const result = await query(
      `SELECT ${WORK_SESSION_COLUMNS} FROM work_sessions
       WHERE user_id = $1 AND work_date BETWEEN $2 AND $3
       ORDER BY started_at DESC`,
      [userId, from, to]
    );

    res.json({ success: true, data: result.rows.map(toApi) });
  } catch (error: any) {
    logger.error('List work sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load sessions' });
  }
});

// ============================================================================
// Admin-Korrekturen (nur Admin/Owner — Teammanager-Funktion)
// ----------------------------------------------------------------------------
// Mitarbeiter können ihre Stempelzeiten NICHT selbst ändern. Vergessenes
// Ein-/Ausstempeln oder Fehlbuchungen korrigiert der Teammanager unter
// Berichte → Arbeitszeit. Jede Korrektur wird mit Vorher/Nachher-Werten
// im Audit-Log festgehalten.
// ============================================================================

// Frontend baut Timestamps via toISOString() — daher .datetime() (Regel 14)
const adminCreateSchema = z.object({
  userId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  breakMinutes: z.number().int().min(0).max(1440).optional(),
  note: z.string().max(500).optional(),
});

const adminUpdateSchema = z.object({
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  breakMinutes: z.number().int().min(0).max(1440).optional(),
  note: z.string().max(500).nullable().optional(),
});

function validateSpan(startedAt: string, endedAt: string | null, breakSeconds: number): string | null {
  if (!endedAt) return null;
  const gross = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  if (gross <= 0) return 'Ende muss nach dem Beginn liegen';
  if (gross > 24 * 3600) return 'Arbeitszeit darf 24 Stunden nicht überschreiten';
  if (breakSeconds >= gross) return 'Pause muss kürzer als die Anwesenheit sein';
  return null;
}

// POST /api/work-sessions/admin — Session für ein Teammitglied nachtragen
router.post('/admin', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(adminCreateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { userId, workDate, startedAt, endedAt, breakMinutes, note } = req.body;
    const breakSeconds = (breakMinutes ?? 0) * 60;

    const spanError = validateSpan(startedAt, endedAt, breakSeconds);
    if (spanError) return res.status(400).json({ success: false, error: spanError });

    // Ziel-User muss zur Organisation gehören
    const member = await query(
      'SELECT user_id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [organizationId, userId]
    );
    if (member.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Mitarbeiter nicht in dieser Organisation' });
    }

    const id = crypto.randomUUID();
    const result = await query(
      `INSERT INTO work_sessions (id, user_id, organization_id, work_date, started_at, ended_at, break_seconds, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${WORK_SESSION_COLUMNS}`,
      [id, userId, organizationId, workDate, startedAt, endedAt, breakSeconds, note ?? null]
    );

    await auditLog.log({
      userId: req.user!.id,
      action: 'work_session.admin_create',
      details: JSON.stringify({ sessionId: id, targetUserId: userId, workDate, startedAt, endedAt, breakSeconds }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Admin work session create error:', error);
    res.status(500).json({ success: false, error: 'Nachtragen fehlgeschlagen' });
  }
});

// PUT /api/work-sessions/admin/:id — Session korrigieren (auch offene schließen)
router.put('/admin/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(adminUpdateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    const existing = await query(
      `SELECT ${WORK_SESSION_COLUMNS} FROM work_sessions WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Arbeitszeit nicht gefunden' });
    }
    const before = existing.rows[0];

    const newStarted = updates.startedAt ?? new Date(before.started_at).toISOString();
    const newEnded = updates.endedAt !== undefined
      ? updates.endedAt
      : (before.ended_at ? new Date(before.ended_at).toISOString() : null);
    const newBreak = updates.breakMinutes !== undefined ? updates.breakMinutes * 60 : before.break_seconds;

    const spanError = validateSpan(newStarted, newEnded, newBreak);
    if (spanError) return res.status(400).json({ success: false, error: spanError });

    const result = await query(
      `UPDATE work_sessions
       SET started_at = $1, ended_at = $2, break_seconds = $3,
           break_started_at = CASE WHEN $2::timestamp IS NOT NULL THEN NULL ELSE break_started_at END,
           note = COALESCE($4, note),
           updated_at = NOW()
       WHERE id = $5
       RETURNING ${WORK_SESSION_COLUMNS}`,
      [newStarted, newEnded, newBreak, updates.note ?? null, id]
    );

    await auditLog.log({
      userId: req.user!.id,
      action: 'work_session.admin_edit',
      details: JSON.stringify({
        sessionId: id,
        targetUserId: before.user_id,
        before: { startedAt: before.started_at, endedAt: before.ended_at, breakSeconds: before.break_seconds },
        after: { startedAt: newStarted, endedAt: newEnded, breakSeconds: newBreak },
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: toApi(result.rows[0]) });
  } catch (error: any) {
    logger.error('Admin work session update error:', error);
    res.status(500).json({ success: false, error: 'Korrektur fehlgeschlagen' });
  }
});

// DELETE /api/work-sessions/admin/:id — Fehlbuchung entfernen
router.delete('/admin/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const existing = await query(
      `SELECT ${WORK_SESSION_COLUMNS} FROM work_sessions WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Arbeitszeit nicht gefunden' });
    }
    const before = existing.rows[0];

    await query('DELETE FROM work_sessions WHERE id = $1', [id]);

    await auditLog.log({
      userId: req.user!.id,
      action: 'work_session.admin_delete',
      details: JSON.stringify({
        sessionId: id,
        targetUserId: before.user_id,
        before: { workDate: before.work_date, startedAt: before.started_at, endedAt: before.ended_at, breakSeconds: before.break_seconds },
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Admin work session delete error:', error);
    res.status(500).json({ success: false, error: 'Löschen fehlgeschlagen' });
  }
});

// GET /api/work-sessions/team?from=&to= — org-weite Auswertung (nur Admin/Owner)
router.get('/team', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(rangeSchema), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const from = (req.query.from as string) || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const result = await query(
      `SELECT ws.id, ws.user_id, ws.work_date, ws.started_at, ws.ended_at,
              ws.break_seconds, ws.break_started_at, ws.note, ws.created_at, ws.updated_at,
              COALESCE(u.display_name, u.username) AS user_name
       FROM work_sessions ws
       JOIN users u ON u.id = ws.user_id
       WHERE ws.organization_id = $1 AND ws.work_date BETWEEN $2 AND $3
       ORDER BY ws.work_date DESC, user_name ASC, ws.started_at ASC`,
      [organizationId, from, to]
    );

    res.json({
      success: true,
      data: result.rows.map((r: any) => ({ ...toApi(r), userName: r.user_name })),
    });
  } catch (error: any) {
    logger.error('Team work sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to load team sessions' });
  }
});

export default router;
