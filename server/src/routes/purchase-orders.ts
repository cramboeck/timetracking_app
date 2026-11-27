import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, requireOrgRole, OrganizationRequest } from '../middleware/organization';
import { validate } from '../middleware/validation';
import { logger } from '../utils/logger';
import {
  ORDER_SELECT, mapOrder, prepareOrderForTicket, processOrderMailbox, PurchaseOrderStatus,
} from '../services/purchaseOrderService';

/**
 * WE-1 Bestellvorgänge (/api/purchase-orders).
 * Übersicht/Zuordnung/Status = Admin (Bereich Bestellungen ist admin-only);
 * Ticket-Karte + „Bestellung vorbereiten“ = Mitglieder (Techniker im Ticket).
 */
const router = Router();
router.use(authenticateToken, attachOrganization);
const orgId = (req: AuthRequest) => (req as unknown as OrganizationRequest).organization.id;

async function loadLines(orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, unknown[]>();
  const r = await query(
    `SELECT id, order_id, position, description, article_number, quantity, unit_price, total_price, item_type, received_quantity
       FROM purchase_order_lines WHERE order_id = ANY($1) ORDER BY position NULLS LAST, created_at`,
    [orderIds]
  );
  const map = new Map<string, unknown[]>();
  for (const l of r.rows) {
    const list = map.get(String(l.order_id)) ?? [];
    list.push({
      id: String(l.id), position: l.position, description: l.description, articleNumber: l.article_number,
      quantity: l.quantity !== null ? Number(l.quantity) : null,
      unitPrice: l.unit_price !== null ? Number(l.unit_price) : null,
      totalPrice: l.total_price !== null ? Number(l.total_price) : null,
      itemType: l.item_type, receivedQuantity: Number(l.received_quantity ?? 0),
    });
    map.set(String(l.order_id), list);
  }
  return map;
}

const listSchema = z.object({
  filter: z.enum(['open', 'unassigned', 'received', 'all']).default('open'),
  search: z.string().trim().max(100).optional(),
});

router.get('/', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: 'Ungültige Filter' });
    const { filter, search } = parsed.data;
    const params: unknown[] = [orgId(req)];
    let where = 'o.organization_id = $1';
    if (filter === 'open') where += ` AND o.status IN ('expected', 'ordered', 'shipped')`;
    if (filter === 'received') where += ` AND o.status = 'received'`;
    if (filter === 'unassigned') where += ` AND o.status <> 'cancelled' AND o.customer_id IS NULL AND o.ticket_id IS NULL AND o.is_internal = false`;
    if (filter === 'all') where += ` AND o.status <> 'cancelled'`;
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      where += ` AND (o.order_number ILIKE ${p} OR o.supplier_name ILIKE ${p} OR o.reference_text ILIKE ${p} OR c.name ILIKE ${p} OR t.ticket_number ILIKE ${p})`;
    }
    const r = await query(`${ORDER_SELECT} WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`, params);
    const orders = r.rows.map(mapOrder);
    const lines = await loadLines(orders.map(o => o.id));
    const counts = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('expected','ordered','shipped'))::int AS open,
         COUNT(*) FILTER (WHERE status <> 'cancelled' AND customer_id IS NULL AND ticket_id IS NULL AND is_internal = false)::int AS unassigned
       FROM purchase_orders WHERE organization_id = $1`,
      [orgId(req)]
    );
    res.json({
      success: true,
      data: orders.map(o => ({ ...o, lines: lines.get(o.id) ?? [] })),
      counts: { open: Number(counts.rows[0]?.open ?? 0), unassigned: Number(counts.rows[0]?.unassigned ?? 0) },
    });
  } catch (error) {
    logger.error('List purchase orders error:', error);
    res.status(500).json({ success: false, error: 'Bestellungen konnten nicht geladen werden' });
  }
});

router.get('/by-ticket/:ticketId', requireOrgRole('viewer'), async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `${ORDER_SELECT} WHERE o.organization_id = $1 AND o.ticket_id = $2 AND o.status <> 'cancelled' ORDER BY o.created_at DESC`,
      [orgId(req), req.params.ticketId]
    );
    const orders = r.rows.map(mapOrder);
    const lines = await loadLines(orders.map(o => o.id));
    // Mitglieder sehen keine Preise (wie bei Verträgen/Stundensätzen)
    const role = (req as unknown as OrganizationRequest).organization.role;
    const isAdmin = role === 'owner' || role === 'admin';
    res.json({
      success: true,
      data: orders.map(o => ({
        ...o,
        ...(isAdmin ? {} : { netAmount: null, grossAmount: null }),
        lines: (lines.get(o.id) ?? []).map(l => (isAdmin ? l : { ...(l as Record<string, unknown>), unitPrice: null, totalPrice: null })),
      })),
    });
  } catch (error) {
    logger.error('Ticket purchase orders error:', error);
    res.status(500).json({ success: false, error: 'Bestellungen konnten nicht geladen werden' });
  }
});

const prepareSchema = z.object({ ticketId: z.string().min(1).max(100) });
router.post('/prepare', requireOrgRole('member'), validate(prepareSchema), async (req: AuthRequest, res: Response) => {
  try {
    const result = await prepareOrderForTicket(orgId(req), req.userId!, (req.body as { ticketId: string }).ticketId);
    if (!result) return res.status(404).json({ success: false, error: 'Ticket nicht gefunden' });
    res.status(result.created ? 201 : 200).json({ success: true, data: result });
  } catch (error) {
    logger.error('Prepare purchase order error:', error);
    res.status(500).json({ success: false, error: 'Bestellung konnte nicht vorbereitet werden' });
  }
});

router.post('/process', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await processOrderMailbox(orgId(req));
    if (!result.success) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Process order mailbox error:', error);
    res.status(500).json({ success: false, error: 'Bestell-Postfach konnte nicht abgerufen werden' });
  }
});

const assignSchema = z.object({
  ticketId: z.string().min(1).max(100).optional(),
  customerId: z.string().min(1).max(100).optional(),
  internal: z.boolean().optional(),
}).refine(b => [b.ticketId, b.customerId, b.internal ? 'x' : undefined].filter(Boolean).length === 1, {
  message: 'Genau eines: ticketId, customerId oder internal',
});
router.post('/:id/assign', requireOrgRole('admin'), validate(assignSchema), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body as z.infer<typeof assignSchema>;
    const organizationId = orgId(req);
    let ticketId: string | null = null;
    let customerId: string | null = null;
    let internal = false;
    if (b.ticketId) {
      const t = await query('SELECT id, customer_id FROM tickets WHERE id = $1 AND organization_id = $2', [b.ticketId, organizationId]);
      if (!t.rows[0]) return res.status(404).json({ success: false, error: 'Ticket nicht gefunden' });
      ticketId = String(t.rows[0].id);
      customerId = t.rows[0].customer_id ? String(t.rows[0].customer_id) : null;
      internal = !customerId;
    } else if (b.customerId) {
      const c = await query('SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [b.customerId, organizationId]);
      if (!c.rows[0]) return res.status(404).json({ success: false, error: 'Kunde nicht gefunden' });
      customerId = String(c.rows[0].id);
    } else {
      internal = true;
    }
    const r = await query(
      `UPDATE purchase_orders SET ticket_id = $3, customer_id = $4, is_internal = $5, assignment_source = 'manual', updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 RETURNING id, order_number, supplier_name`,
      [req.params.id, organizationId, ticketId, customerId, internal]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });
    if (ticketId) {
      await query(
        `INSERT INTO ticket_activities (id, ticket_id, user_id, action_type, new_value, metadata, created_at)
         VALUES (gen_random_uuid()::text, $1, $2, 'order_update', $3, $4, NOW())`,
        [ticketId, req.userId, `Bestellung ${r.rows[0].order_number ?? ''} ${r.rows[0].supplier_name ? `bei ${r.rows[0].supplier_name}` : ''} zugeordnet`.replace(/\s+/g, ' ').trim(),
          JSON.stringify({ orderId: req.params.id })]
      );
    }
    const full = await query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    res.json({ success: true, data: mapOrder(full.rows[0]) });
  } catch (error) {
    logger.error('Assign purchase order error:', error);
    res.status(500).json({ success: false, error: 'Zuordnung fehlgeschlagen' });
  }
});

const patchSchema = z.object({
  status: z.enum(['expected', 'ordered', 'shipped', 'received', 'cancelled']).optional(),
  notes: z.string().max(2000).nullable().optional(),
});
router.patch('/:id', requireOrgRole('admin'), validate(patchSchema), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body as { status?: PurchaseOrderStatus; notes?: string | null };
    const r = await query(
      `UPDATE purchase_orders SET
          status = COALESCE($3, status),
          notes = CASE WHEN $4::boolean THEN $5 ELSE notes END,
          received_at = CASE WHEN $3 = 'received' AND received_at IS NULL THEN NOW() ELSE received_at END,
          updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.id, orgId(req), b.status ?? null, b.notes !== undefined, b.notes ?? null]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Bestellung nicht gefunden' });
    const full = await query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    res.json({ success: true, data: mapOrder(full.rows[0]) });
  } catch (error) {
    logger.error('Update purchase order error:', error);
    res.status(500).json({ success: false, error: 'Bestellung konnte nicht geändert werden' });
  }
});

export default router;
