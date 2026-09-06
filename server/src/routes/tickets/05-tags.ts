/**
 * Ticket-Tags (CRUD + Zuweisung)
 *
 * Mechanisch aus routes/tickets.ts extrahiert (6.9.2026) — Routen und
 * Reihenfolge unveraendert. ⚠️ Die Mount-Reihenfolge in index.ts entspricht
 * exakt der frueheren Registrierungsreihenfolge (Route-Shadowing!).
 */
import express from 'express';
import crypto from 'crypto';
import { query } from '../../config/database';
import { authenticateToken } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { attachOrganization, OrganizationRequest } from '../../middleware/organization';
import { auditLog } from '../../services/auditLog';
import { logger } from '../../utils/logger';
import {
  tagSchema,
  logTicketActivity,
} from './shared';

const router = express.Router();

router.get('/tags/list', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await query(`
      SELECT t.*, COUNT(tta.ticket_id) as ticket_count
      FROM ticket_tags t
      LEFT JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE t.organization_id = $1
      GROUP BY t.id
      ORDER BY t.name ASC
    `, [organizationId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tags' });
  }
});

// POST /api/tickets/tags - Create tag
router.post('/tags', authenticateToken, attachOrganization, validate(tagSchema), async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, color = '#6b7280' } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const id = crypto.randomUUID();

    const result = await query(`
      INSERT INTO ticket_tags (id, user_id, organization_id, name, color)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, userId, organizationId, name.trim(), color]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Tag with this name already exists' });
    }
    logger.error('Error creating tag:', error);
    res.status(500).json({ success: false, error: 'Failed to create tag' });
  }
});

// PUT /api/tickets/tags/:id - Update tag
router.put('/tags/:id', authenticateToken, attachOrganization, validate(tagSchema.partial()), async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { name, color } = req.body;

    const result = await query(`
      UPDATE ticket_tags
      SET name = COALESCE($1, name),
          color = COALESCE($2, color)
      WHERE id = $3 AND organization_id = $4
      RETURNING *
    `, [name?.trim(), color, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Tag with this name already exists' });
    }
    logger.error('Error updating tag:', error);
    res.status(500).json({ success: false, error: 'Failed to update tag' });
  }
});

// DELETE /api/tickets/tags/:id - Delete tag
router.delete('/tags/:id', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM ticket_tags WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    res.json({ success: true, message: 'Tag deleted' });
  } catch (error) {
    logger.error('Error deleting tag:', error);
    res.status(500).json({ success: false, error: 'Failed to delete tag' });
  }
});

// GET /api/tickets/:ticketId/tags - Get tags for a ticket
router.get('/:ticketId/tags', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const result = await query(`
      SELECT t.*
      FROM ticket_tags t
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE tta.ticket_id = $1
      ORDER BY t.name ASC
    `, [ticketId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching ticket tags:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket tags' });
  }
});

// POST /api/tickets/:ticketId/tags/:tagId - Add tag to ticket
router.post('/:ticketId/tags/:tagId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, tagId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Verify tag belongs to organization
    const tagCheck = await query(
      'SELECT id FROM ticket_tags WHERE id = $1 AND organization_id = $2',
      [tagId, organizationId]
    );

    if (tagCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tag not found' });
    }

    // Get tag name for activity log
    const tagNameResult = await query('SELECT name FROM ticket_tags WHERE id = $1', [tagId]);
    const tagName = tagNameResult.rows[0]?.name;

    await query(`
      INSERT INTO ticket_tag_assignments (ticket_id, tag_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [ticketId, tagId]);

    // Log activity
    if (tagName) {
      await logTicketActivity(ticketId, userId, null, 'tag_added', null, tagName, { tagId });

      // Audit log
      await auditLog.log({
        userId,
        action: 'ticket_tag.add',
        details: JSON.stringify({ ticketId, tagId, tagName }),
      });
    }

    // Return all tags for this ticket
    const result = await query(`
      SELECT t.*
      FROM ticket_tags t
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE tta.ticket_id = $1
      ORDER BY t.name ASC
    `, [ticketId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error adding tag to ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to add tag to ticket' });
  }
});

// DELETE /api/tickets/:ticketId/tags/:tagId - Remove tag from ticket
router.delete('/:ticketId/tags/:tagId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { ticketId, tagId } = req.params;

    // Verify ticket belongs to organization
    const ticketCheck = await query(
      'SELECT id FROM tickets WHERE id = $1 AND organization_id = $2',
      [ticketId, organizationId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Get tag name before deleting for activity log
    const tagResult = await query('SELECT name FROM ticket_tags WHERE id = $1', [tagId]);
    const tagName = tagResult.rows[0]?.name;

    await query(
      'DELETE FROM ticket_tag_assignments WHERE ticket_id = $1 AND tag_id = $2',
      [ticketId, tagId]
    );

    // Log activity
    if (tagName) {
      await logTicketActivity(ticketId, userId, null, 'tag_removed', tagName, null, { tagId });

      // Audit log
      await auditLog.log({
        userId,
        action: 'ticket_tag.remove',
        details: JSON.stringify({ ticketId, tagId, tagName }),
      });
    }

    // Return remaining tags for this ticket
    const result = await query(`
      SELECT t.*
      FROM ticket_tags t
      INNER JOIN ticket_tag_assignments tta ON t.id = tta.tag_id
      WHERE tta.ticket_id = $1
      ORDER BY t.name ASC
    `, [ticketId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error removing tag from ticket:', error);
    res.status(500).json({ success: false, error: 'Failed to remove tag from ticket' });
  }
});

export default router;
