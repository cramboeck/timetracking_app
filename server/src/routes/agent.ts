import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, requireOrgRole, OrganizationRequest } from '../middleware/organization';
import { validate } from '../middleware/validation';
import { sendPushToUser } from '../services/pushNotifications';
import { logger } from '../utils/logger';

/**
 * Agenten-Programm Phase B: Vorschlags-Inbox, Kundengedächtnis, Kunden-Briefing.
 *
 * Grundsatz: Der Agent SCHLÄGT VOR, der Mensch ENTSCHEIDET. Vorschläge
 * gehören immer dem User, dessen Zugang sie angelegt hat. Übernommen werden
 * Zeiteinträge/Ticket-Kommentare über die normalen Endpunkte mit
 * `proposalId` (siehe services/proposalService), Kunden-Absprachen hier.
 * API-Zugänge dürfen nur anlegen + den eigenen Status lesen (apiTokenPolicy).
 */
const router = Router();
router.use(authenticateToken, attachOrganization);

const orgId = (req: AuthRequest) => (req as unknown as OrganizationRequest).organization.id;
const orgRole = (req: AuthRequest) => (req as unknown as OrganizationRequest).organization.role;
const isOrgAdmin = (req: AuthRequest) => ['owner', 'admin'].includes(orgRole(req));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

const NOTE_CATEGORIES = ['billing', 'technical', 'contact', 'general'] as const;
const ENTRY_SCOPES = ['customer_project', 'internal', 'absence'] as const;
const MAX_ENTRY_HOURS = 16;

const sourceSchema = z.object({
  kind: z.enum(['email', 'calendar', 'chat', 'ticket', 'document', 'other']),
  label: z.string().trim().min(1).max(300),
  ref: z.string().trim().max(500).optional(),
  date: z.string().max(40).optional(),
});

const common = {
  title: z.string().trim().max(200).optional(),
  reason: z.string().trim().max(2000).optional(),
  sources: z.array(sourceSchema).max(20).optional(),
};

const itemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('time_entry'),
    ...common,
    payload: z.object({
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      projectId: z.string().uuid().nullable().optional(),
      ticketId: z.string().uuid().nullable().optional(),
      activityId: z.string().uuid().nullable().optional(),
      entryScope: z.enum(ENTRY_SCOPES).default('customer_project'),
      internalCategory: z.string().max(100).nullable().optional(),
      description: z.string().trim().min(1).max(1000),
      isBillable: z.boolean().default(true),
    }),
  }),
  z.object({
    type: z.literal('ticket_comment'),
    ...common,
    payload: z.object({
      ticketId: z.string().uuid(),
      content: z.string().trim().min(1).max(10_000),
      isInternal: z.boolean().default(true),
    }),
  }),
  z.object({
    type: z.literal('customer_note'),
    ...common,
    payload: z.object({
      customerId: z.string().min(1).max(100),
      category: z.enum(NOTE_CATEGORIES).default('general'),
      content: z.string().trim().min(1).max(2000),
    }),
  }),
]);
type ProposalItem = z.infer<typeof itemSchema>;

const createSchema = z.object({ items: z.array(itemSchema).min(1).max(50) });

async function customerInOrg(customerId: string, organizationId: string) {
  const r = await query('SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
  return r.rows[0] as { id: string; name: string } | undefined;
}

/** Prüft einen Vorschlag fachlich; liefert Fehlertext oder angereicherte Daten. */
async function checkItem(item: ProposalItem, userId: string, organizationId: string): Promise<
  { error: string } | { customerId: string | null; ticketId: string | null; title: string; warnings: string[]; payload: Record<string, unknown> }
> {
  if (item.type === 'time_entry') {
    const p = item.payload;
    const start = new Date(p.startTime).getTime();
    const end = new Date(p.endTime).getTime();
    if (!(end > start)) return { error: 'Ende liegt nicht nach dem Beginn' };
    if (end > Date.now() + 5 * 60_000) return { error: 'Zeiten in der Zukunft werden nicht vorgeschlagen' };
    if (end - start > MAX_ENTRY_HOURS * 3_600_000) return { error: `Mehr als ${MAX_ENTRY_HOURS} Stunden am Stück` };
    if (p.entryScope === 'customer_project' && !p.projectId) return { error: 'Projektzeit braucht ein Projekt' };
    let customerId: string | null = null;
    let label = p.entryScope === 'internal' ? `Intern${p.internalCategory ? ` (${p.internalCategory})` : ''}` : 'Abwesenheit';
    if (p.projectId) {
      const pr = await query(
        `SELECT p.id, p.name, p.customer_id, c.name AS customer_name
           FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
          WHERE p.id = $1 AND p.organization_id = $2 AND p.deleted_at IS NULL`,
        [p.projectId, organizationId]
      );
      if (!pr.rows[0]) return { error: 'Projekt nicht gefunden' };
      customerId = pr.rows[0].customer_id ? String(pr.rows[0].customer_id) : null;
      label = `${pr.rows[0].customer_name ?? ''} · ${pr.rows[0].name}`.replace(/^ · /, '');
    }
    if (p.ticketId) {
      const t = await query('SELECT id FROM tickets WHERE id = $1 AND organization_id = $2', [p.ticketId, organizationId]);
      if (!t.rows[0]) return { error: 'Ticket nicht gefunden' };
    }
    const warnings: string[] = [];
    const overlap = await query(
      `SELECT COUNT(*)::int AS n FROM time_entries
        WHERE user_id = $1 AND COALESCE(is_running, false) = false
          AND start_time < $3 AND COALESCE(end_time, start_time) > $2`,
      [userId, p.startTime, p.endTime]
    );
    if (Number(overlap.rows[0]?.n) > 0) warnings.push('overlap');
    const minutes = Math.round((end - start) / 60_000);
    const day = new Date(start).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
    return {
      customerId, ticketId: p.ticketId ?? null, warnings,
      title: item.title || `${day} · ${minutes} min · ${label}`,
      payload: { ...p, duration: Math.round((end - start) / 1000) },
    };
  }
  if (item.type === 'ticket_comment') {
    const t = await query('SELECT id, ticket_number, customer_id FROM tickets WHERE id = $1 AND organization_id = $2', [item.payload.ticketId, organizationId]);
    if (!t.rows[0]) return { error: 'Ticket nicht gefunden' };
    return {
      customerId: t.rows[0].customer_id ? String(t.rows[0].customer_id) : null,
      ticketId: item.payload.ticketId, warnings: [],
      title: item.title || `${item.payload.isInternal ? 'Interne Notiz' : 'Antwort an Kunden'} zu ${t.rows[0].ticket_number}`,
      payload: item.payload,
    };
  }
  const c = await customerInOrg(item.payload.customerId, organizationId);
  if (!c) return { error: 'Kunde nicht gefunden' };
  return {
    customerId: c.id, ticketId: null, warnings: [],
    title: item.title || `Absprache für ${c.name}`,
    payload: item.payload,
  };
}

// ---------------------------------------------------------------------------
// Vorschläge anlegen (Agent oder App)
// ---------------------------------------------------------------------------
router.post('/proposals', requireOrgRole('member'), validate(createSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const organizationId = orgId(req);
    const batchId = crypto.randomUUID();
    const results: { index: number; status: 'created' | 'duplicate' | 'error'; id?: string; title?: string; warnings?: string[]; error?: string }[] = [];
    const items = (req.body as z.infer<typeof createSchema>).items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const checked = await checkItem(item, userId, organizationId);
      if ('error' in checked) {
        results.push({ index: i, status: 'error', error: checked.error });
        continue;
      }
      // Doppelte offene Vorschläge (gleiches Ziel) nicht erneut anlegen —
      // der Agent darf denselben Monatsabschluss gefahrlos zweimal laufen lassen
      const dupKey = item.type === 'time_entry'
        ? ['startTime', 'endTime'] : item.type === 'ticket_comment' ? ['ticketId', 'content'] : ['customerId', 'content'];
      const dup = await query(
        `SELECT id FROM agent_proposals
          WHERE user_id = $1 AND type = $2 AND status = 'pending'
            AND (expires_at IS NULL OR expires_at > NOW())
            AND payload->>$3 = $4 AND payload->>$5 = $6
          LIMIT 1`,
        [userId, item.type, dupKey[0], String((checked.payload as Record<string, unknown>)[dupKey[0]]), dupKey[1], String((checked.payload as Record<string, unknown>)[dupKey[1]])]
      );
      if (dup.rows[0]) {
        results.push({ index: i, status: 'duplicate', id: String(dup.rows[0].id), title: checked.title });
        continue;
      }
      const ins = await query(
        `INSERT INTO agent_proposals
           (organization_id, user_id, api_token_id, type, title, reason, sources, payload, customer_id, ticket_id, batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          organizationId, userId, req.apiToken?.id ?? null, item.type, checked.title,
          item.reason ?? null, JSON.stringify(item.sources ?? []),
          JSON.stringify({ ...checked.payload, warnings: checked.warnings }),
          checked.customerId, checked.ticketId, batchId,
        ]
      );
      results.push({ index: i, status: 'created', id: String(ins.rows[0].id), title: checked.title, warnings: checked.warnings });
    }

    const created = results.filter(r => r.status === 'created').length;
    if (created > 0) {
      sendPushToUser(userId, {
        title: 'Neue KI-Vorschläge',
        body: `${created} Vorschlag${created === 1 ? '' : 'e'} warte${created === 1 ? 't' : 'n'} auf deine Entscheidung`,
        tag: 'agent-proposals',
        data: { url: '/personal/vorschlaege', type: 'agent_proposals' },
      }).catch(() => { /* best effort */ });
    }
    res.status(created > 0 ? 201 : 200).json({ success: true, data: { batchId, created, results } });
  } catch (error) {
    logger.error('Create proposals error:', error);
    res.status(500).json({ success: false, error: 'Vorschläge konnten nicht angelegt werden' });
  }
});

// ---------------------------------------------------------------------------
// Vorschläge lesen
// ---------------------------------------------------------------------------
const listQuerySchema = z.object({
  status: z.enum(['pending', 'history', 'all']).default('pending'),
  scope: z.enum(['mine', 'org']).default('mine'),
  batchId: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

router.get('/proposals', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Ungültige Filter' });
    const q = parsed.data;
    const params: unknown[] = [orgId(req)];
    let where = 'p.organization_id = $1';
    if (q.scope === 'org' && isOrgAdmin(req) && !req.apiToken) {
      // Org-Admins sehen alle Vorschläge der Organisation (nur in der App)
    } else {
      params.push(req.userId);
      where += ` AND p.user_id = $${params.length}`;
    }
    // Abgelaufene sind nie „offen“ (der Nacht-Job markiert sie, hier sofort ausgefiltert)
    if (q.status === 'pending') where += ` AND p.status = 'pending' AND (p.expires_at IS NULL OR p.expires_at > NOW())`;
    if (q.status === 'history') where += ` AND (p.status <> 'pending' OR p.expires_at <= NOW())`;
    if (q.batchId) { params.push(q.batchId); where += ` AND p.batch_id = $${params.length}`; }
    params.push(q.limit);

    const r = await query(
      `SELECT p.id, p.type, p.status, p.title, p.reason, p.sources, p.payload, p.customer_id, p.ticket_id,
              p.batch_id, p.result_ref, p.decided_at, p.decision_note, p.created_at, p.expires_at, p.user_id,
              c.name AS customer_name, c.color AS customer_color, c.logo_url AS customer_logo_url,
              t.ticket_number, t.title AS ticket_title,
              pr.name AS project_name,
              tok.name AS token_name,
              COALESCE(du.display_name, du.username) AS decided_by_name,
              COALESCE(ou.display_name, ou.username) AS owner_name
         FROM agent_proposals p
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN tickets t ON t.id = p.ticket_id
         LEFT JOIN projects pr ON pr.id::text = p.payload->>'projectId'
         LEFT JOIN api_tokens tok ON tok.id = p.api_token_id
         LEFT JOIN users du ON du.id = p.decided_by
         LEFT JOIN users ou ON ou.id = p.user_id
        WHERE ${where}
        ORDER BY ${q.status === 'pending' ? "(p.payload->>'startTime') ASC NULLS LAST, p.created_at ASC" : 'COALESCE(p.decided_at, p.created_at) DESC'}
        LIMIT $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: r.rows.map(x => {
        const expired = x.status === 'pending' && x.expires_at && new Date(x.expires_at).getTime() <= Date.now();
        return {
          id: String(x.id), type: x.type, status: expired ? 'expired' : x.status, title: x.title,
          reason: x.reason, sources: x.sources ?? [], payload: x.payload,
          customerId: x.customer_id, customerName: x.customer_name, customerColor: x.customer_color, customerLogoUrl: x.customer_logo_url,
          ticketId: x.ticket_id, ticketNumber: x.ticket_number, ticketTitle: x.ticket_title,
          projectName: x.project_name, tokenName: x.token_name,
          batchId: x.batch_id, resultRef: x.result_ref,
          decidedAt: iso(x.decided_at), decidedByName: x.decided_by_name, decisionNote: x.decision_note,
          createdAt: iso(x.created_at), expiresAt: iso(x.expires_at),
          ownerId: String(x.user_id), ownerName: x.owner_name,
        };
      }),
    });
  } catch (error) {
    logger.error('List proposals error:', error);
    res.status(500).json({ success: false, error: 'Vorschläge konnten nicht geladen werden' });
  }
});

router.get('/proposals/count', async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `SELECT COUNT(*)::int AS n FROM agent_proposals
        WHERE user_id = $1 AND organization_id = $2 AND status = 'pending'
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [req.userId, orgId(req)]
    );
    res.json({ success: true, data: { pending: Number(r.rows[0]?.n ?? 0) } });
  } catch (error) {
    logger.error('Count proposals error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Entscheiden (nur der Mensch, nur in der App)
// ---------------------------------------------------------------------------
const decideSchema = z.object({ note: z.string().trim().max(500).optional() });

async function loadOwnPending(req: AuthRequest, id: string) {
  const r = await query(
    `SELECT id, type, payload, customer_id FROM agent_proposals
      WHERE id = $1 AND user_id = $2 AND organization_id = $3 AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [id, req.userId, orgId(req)]
  );
  return r.rows[0] as { id: string; type: string; payload: Record<string, unknown>; customer_id: string | null } | undefined;
}

router.post('/proposals/:id/reject', validate(decideSchema), async (req: AuthRequest, res: Response) => {
  try {
    if (req.apiToken) return res.status(403).json({ success: false, error: 'Nur in der App möglich' });
    const p = await loadOwnPending(req, req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'Vorschlag nicht (mehr) offen' });
    await query(
      `UPDATE agent_proposals SET status = 'rejected', decided_by = $2, decided_at = NOW(), decision_note = $3
        WHERE id = $1 AND status = 'pending'`,
      [p.id, req.userId, (req.body as { note?: string }).note ?? null]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Reject proposal error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

// Kunden-Absprache übernehmen (Zeiten/Kommentare laufen über ihre eigenen Endpunkte)
const approveNoteSchema = z.object({
  category: z.enum(NOTE_CATEGORIES).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
});
router.post('/proposals/:id/approve-note', requireOrgRole('member'), validate(approveNoteSchema), async (req: AuthRequest, res: Response) => {
  try {
    if (req.apiToken) return res.status(403).json({ success: false, error: 'Nur in der App möglich' });
    const p = await loadOwnPending(req, req.params.id);
    if (!p || p.type !== 'customer_note' || !p.customer_id) return res.status(404).json({ success: false, error: 'Vorschlag nicht (mehr) offen' });
    const body = req.body as z.infer<typeof approveNoteSchema>;
    const ins = await query(
      `INSERT INTO customer_notes (organization_id, customer_id, category, content, created_by, updated_by, via_proposal_id)
       VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id`,
      [orgId(req), p.customer_id, body.category ?? p.payload.category ?? 'general', body.content ?? p.payload.content, req.userId, p.id]
    );
    await query(
      `UPDATE agent_proposals SET status = 'approved', result_ref = $2, decided_by = $3, decided_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [p.id, ins.rows[0].id, req.userId]
    );
    res.json({ success: true, data: { noteId: String(ins.rows[0].id) } });
  } catch (error) {
    logger.error('Approve note proposal error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Kundengedächtnis (Absprachen) — App
// ---------------------------------------------------------------------------
const noteSchema = z.object({
  category: z.enum(NOTE_CATEGORIES).default('general'),
  content: z.string().trim().min(1).max(2000),
});

async function listNotes(customerId: string, organizationId: string) {
  const r = await query(
    `SELECT n.id, n.category, n.content, n.created_at, n.updated_at, n.via_proposal_id,
            COALESCE(u.display_name, u.username) AS author_name
       FROM customer_notes n
       LEFT JOIN users u ON u.id = COALESCE(n.updated_by, n.created_by)
      WHERE n.customer_id = $1 AND n.organization_id = $2 AND n.deleted_at IS NULL
      ORDER BY CASE n.category WHEN 'billing' THEN 0 WHEN 'technical' THEN 1 WHEN 'contact' THEN 2 ELSE 3 END, n.updated_at DESC`,
    [customerId, organizationId]
  );
  return r.rows.map(n => ({
    id: String(n.id), category: n.category, content: n.content,
    createdAt: iso(n.created_at), updatedAt: iso(n.updated_at),
    authorName: n.author_name ?? null, viaAgent: !!n.via_proposal_id,
  }));
}

router.get('/customers/:customerId/notes', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await customerInOrg(req.params.customerId, orgId(req)))) return res.status(404).json({ success: false, error: 'Kunde nicht gefunden' });
    res.json({ success: true, data: await listNotes(req.params.customerId, orgId(req)) });
  } catch (error) {
    logger.error('List customer notes error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

router.post('/customers/:customerId/notes', requireOrgRole('member'), validate(noteSchema), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await customerInOrg(req.params.customerId, orgId(req)))) return res.status(404).json({ success: false, error: 'Kunde nicht gefunden' });
    const b = req.body as z.infer<typeof noteSchema>;
    const r = await query(
      `INSERT INTO customer_notes (organization_id, customer_id, category, content, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
      [orgId(req), req.params.customerId, b.category, b.content, req.userId]
    );
    res.status(201).json({ success: true, data: { id: String(r.rows[0].id) } });
  } catch (error) {
    logger.error('Create customer note error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

router.put('/notes/:id', requireOrgRole('member'), validate(noteSchema), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body as z.infer<typeof noteSchema>;
    const r = await query(
      `UPDATE customer_notes SET category = $3, content = $4, updated_by = $5, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, orgId(req), b.category, b.content, req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Notiz nicht gefunden' });
    res.json({ success: true });
  } catch (error) {
    logger.error('Update customer note error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

router.delete('/notes/:id', requireOrgRole('member'), async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `UPDATE customer_notes SET deleted_at = NOW(), updated_by = $3
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, orgId(req), req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Notiz nicht gefunden' });
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete customer note error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

// ---------------------------------------------------------------------------
// Kunden-Briefing (Agent: kunde_details; bewusst OHNE Preise/Stundensätze)
// ---------------------------------------------------------------------------
router.get('/customers/:customerId/briefing', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = orgId(req);
    const cust = await query(
      `SELECT id, name, customer_number, email, phone, website, address_street, address_zip, address_city
         FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [req.params.customerId, organizationId]
    );
    const c = cust.rows[0];
    if (!c) return res.status(404).json({ success: false, error: 'Kunde nicht gefunden' });

    const [contacts, contracts, hours, tickets, assets, projects, lastActivity] = await Promise.all([
      query(
        `SELECT first_name, last_name, email, phone, is_primary FROM customer_contacts
          WHERE customer_id = $1 ORDER BY is_primary DESC NULLS LAST, last_name LIMIT 5`,
        [c.id]
      ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
      query(
        `SELECT name, status, included_hours_monthly, sla_response_hours, end_date
           FROM contracts WHERE customer_id = $1 AND deleted_at IS NULL AND status IN ('active', 'expiring')
          ORDER BY name`,
        [c.id]
      ),
      query(
        `SELECT COALESCE(SUM(te.duration), 0)::bigint AS seconds
           FROM time_entries te JOIN projects p ON p.id = te.project_id
          WHERE p.customer_id = $1 AND te.organization_id = $2
            AND te.start_time >= date_trunc('month', NOW())`,
        [c.id, organizationId]
      ),
      query(
        `SELECT ticket_number, title, status, priority, updated_at FROM tickets
          WHERE customer_id = $1 AND organization_id = $2 AND status NOT IN ('resolved', 'closed', 'archived')
          ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC
          LIMIT 10`,
        [c.id, organizationId]
      ),
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE warranty_until IS NOT NULL AND warranty_until <= CURRENT_DATE + 60)::int AS warranty_soon
           FROM assets WHERE customer_id = $1 AND organization_id = $2 AND deleted_at IS NULL AND status <> 'retired'`,
        [c.id, organizationId]
      ),
      query(
        `SELECT name FROM projects WHERE customer_id = $1 AND organization_id = $2 AND deleted_at IS NULL AND is_active = true ORDER BY name`,
        [c.id, organizationId]
      ),
      query(
        `SELECT MAX(start_time) AS last_time FROM time_entries te JOIN projects p ON p.id = te.project_id WHERE p.customer_id = $1`,
        [c.id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        customer: {
          id: String(c.id), name: c.name, customerNumber: c.customer_number, email: c.email, phone: c.phone, website: c.website,
          address: [c.address_street, [c.address_zip, c.address_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
        },
        notes: await listNotes(c.id, organizationId),
        contacts: contacts.rows.map(k => ({
          name: [k.first_name, k.last_name].filter(Boolean).join(' '), email: k.email ?? null, phone: k.phone ?? null, isPrimary: !!k.is_primary,
        })),
        contracts: contracts.rows.map(k => ({
          name: k.name, status: k.status,
          includedHoursMonthly: k.included_hours_monthly !== null ? Number(k.included_hours_monthly) : null,
          slaResponseHours: k.sla_response_hours !== null ? Number(k.sla_response_hours) : null,
          endDate: iso(k.end_date),
        })),
        hoursThisMonth: Math.round(Number(hours.rows[0]?.seconds ?? 0) / 36) / 100,
        openTickets: tickets.rows.map(t => ({ ticketNumber: t.ticket_number, title: t.title, status: t.status, priority: t.priority })),
        assets: { total: Number(assets.rows[0]?.total ?? 0), warrantySoon: Number(assets.rows[0]?.warranty_soon ?? 0) },
        projects: projects.rows.map(p => String(p.name)),
        lastTimeEntryAt: iso(lastActivity.rows[0]?.last_time),
      },
    });
  } catch (error) {
    logger.error('Customer briefing error:', error);
    res.status(500).json({ success: false, error: 'Interner Serverfehler' });
  }
});

export default router;
