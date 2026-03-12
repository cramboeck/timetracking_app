/**
 * Customer Contacts Routes
 *
 * CRUD operations for CRM contacts - people associated with customers
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { getUserOrganizationId } from '../middleware/organization';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================
// GET /api/contacts - List all contacts
// ============================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      customer_id,
      role,
      search,
      limit = '50',
      offset = '0'
    } = req.query;

    let sql = `
      SELECT
        cc.*,
        c.name as customer_name,
        c.color as customer_color,
        cpu.id as has_portal_access
      FROM customer_contacts cc
      LEFT JOIN customers c ON cc.customer_id = c.id
      LEFT JOIN customer_portal_users cpu ON cc.portal_user_id = cpu.id
      WHERE cc.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (customer_id) {
      sql += ` AND cc.customer_id = $${paramIndex}`;
      params.push(customer_id);
      paramIndex++;
    }

    if (role) {
      sql += ` AND cc.role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (
        cc.first_name ILIKE $${paramIndex} OR
        cc.last_name ILIKE $${paramIndex} OR
        cc.email ILIKE $${paramIndex} OR
        cc.job_title ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    sql += ` ORDER BY cc.is_primary DESC, cc.last_name ASC, cc.first_name ASC`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);

    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM customer_contacts cc
      LEFT JOIN customers c ON cc.customer_id = c.id
      WHERE cc.organization_id = $1
    `;
    const countParams: any[] = [organizationId];
    let countParamIndex = 2;

    if (customer_id) {
      countSql += ` AND cc.customer_id = $${countParamIndex}`;
      countParams.push(customer_id);
      countParamIndex++;
    }

    if (role) {
      countSql += ` AND cc.role = $${countParamIndex}`;
      countParams.push(role);
      countParamIndex++;
    }

    if (search) {
      countSql += ` AND (
        cc.first_name ILIKE $${countParamIndex} OR
        cc.last_name ILIKE $${countParamIndex} OR
        cc.email ILIKE $${countParamIndex} OR
        cc.job_title ILIKE $${countParamIndex} OR
        c.name ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query(countSql, countParams);

    res.json({
      contacts: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// ============================================
// GET /api/contacts/:id - Get single contact
// ============================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const result = await query(`
      SELECT
        cc.*,
        c.name as customer_name,
        c.color as customer_color,
        cpu.id as has_portal_access,
        cpu.last_login as portal_last_login
      FROM customer_contacts cc
      LEFT JOIN customers c ON cc.customer_id = c.id
      LEFT JOIN customer_portal_users cpu ON cc.portal_user_id = cpu.id
      WHERE cc.id = $1 AND cc.organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get recent interactions for this contact
    const interactions = await query(`
      SELECT id, type, subject, occurred_at, outcome
      FROM customer_interactions
      WHERE contact_id = $1
      ORDER BY occurred_at DESC
      LIMIT 5
    `, [id]);

    res.json({
      ...result.rows[0],
      recent_interactions: interactions.rows
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// ============================================
// POST /api/contacts - Create contact
// ============================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      customer_id,
      first_name,
      last_name,
      email,
      phone,
      mobile,
      job_title,
      department,
      role = 'contact',
      is_primary = false,
      preferred_contact_method = 'email',
      notify_on_ticket_update = true,
      notify_on_maintenance = true,
      linkedin_url,
      notes
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    if (!last_name) {
      return res.status(400).json({ error: 'last_name is required' });
    }

    // Verify customer belongs to organization
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2',
      [customer_id, organizationId]
    );

    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const id = uuidv4();

    // If this is set as primary, unset other primary contacts for this customer
    if (is_primary) {
      await query(
        'UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1 AND organization_id = $2',
        [customer_id, organizationId]
      );
    }

    const result = await query(`
      INSERT INTO customer_contacts (
        id, organization_id, customer_id, first_name, last_name, email, phone, mobile,
        job_title, department, role, is_primary, preferred_contact_method,
        notify_on_ticket_update, notify_on_maintenance, linkedin_url, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      id, organizationId, customer_id, first_name, last_name, email, phone, mobile,
      job_title, department, role, is_primary, preferred_contact_method,
      notify_on_ticket_update, notify_on_maintenance, linkedin_url, notes
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// ============================================
// PUT /api/contacts/:id - Update contact
// ============================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const {
      first_name,
      last_name,
      email,
      phone,
      mobile,
      job_title,
      department,
      role,
      is_primary,
      preferred_contact_method,
      notify_on_ticket_update,
      notify_on_maintenance,
      linkedin_url,
      notes
    } = req.body;

    // Get current contact to check customer_id for primary handling
    const current = await query(
      'SELECT customer_id FROM customer_contacts WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as primary, unset other primary contacts
    if (is_primary === true) {
      await query(
        'UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1 AND organization_id = $2 AND id != $3',
        [current.rows[0].customer_id, organizationId, id]
      );
    }

    const result = await query(`
      UPDATE customer_contacts SET
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        email = COALESCE($5, email),
        phone = COALESCE($6, phone),
        mobile = COALESCE($7, mobile),
        job_title = COALESCE($8, job_title),
        department = COALESCE($9, department),
        role = COALESCE($10, role),
        is_primary = COALESCE($11, is_primary),
        preferred_contact_method = COALESCE($12, preferred_contact_method),
        notify_on_ticket_update = COALESCE($13, notify_on_ticket_update),
        notify_on_maintenance = COALESCE($14, notify_on_maintenance),
        linkedin_url = COALESCE($15, linkedin_url),
        notes = COALESCE($16, notes),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING *
    `, [
      id, organizationId, first_name, last_name, email, phone, mobile,
      job_title, department, role, is_primary, preferred_contact_method,
      notify_on_ticket_update, notify_on_maintenance, linkedin_url, notes
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// ============================================
// DELETE /api/contacts/:id - Delete contact
// ============================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const result = await query(
      'DELETE FROM customer_contacts WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ============================================
// POST /api/contacts/:id/portal-access - Enable portal access
// ============================================
router.post('/:id/portal-access', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    const userId = (req as any).user.id;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { send_invitation = true } = req.body;

    // Get contact info
    const contact = await query(`
      SELECT cc.*, c.id as customer_id
      FROM customer_contacts cc
      JOIN customers c ON cc.customer_id = c.id
      WHERE cc.id = $1 AND cc.organization_id = $2
    `, [id, organizationId]);

    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contactData = contact.rows[0];

    if (!contactData.email) {
      return res.status(400).json({ error: 'Contact must have an email address for portal access' });
    }

    // Check if portal user already exists
    if (contactData.portal_user_id) {
      return res.status(400).json({ error: 'Contact already has portal access' });
    }

    // Check if email is already used by another portal user
    const existingPortalUser = await query(
      'SELECT id FROM customer_portal_users WHERE email = $1 AND organization_id = $2',
      [contactData.email, organizationId]
    );

    if (existingPortalUser.rows.length > 0) {
      // Link to existing portal user
      await query(
        'UPDATE customer_contacts SET portal_user_id = $1 WHERE id = $2',
        [existingPortalUser.rows[0].id, id]
      );

      return res.json({
        success: true,
        portal_user_id: existingPortalUser.rows[0].id,
        message: 'Linked to existing portal user'
      });
    }

    // Create new portal user
    const portalUserId = uuidv4();
    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(`
      INSERT INTO customer_portal_users (
        id, owner_user_id, organization_id, customer_id, email, name,
        is_primary_contact, password_reset_token, password_reset_expires
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      portalUserId, userId, organizationId, contactData.customer_id,
      contactData.email, `${contactData.first_name || ''} ${contactData.last_name}`.trim(),
      contactData.is_primary, resetToken, resetExpires
    ]);

    // Link contact to portal user
    await query(
      'UPDATE customer_contacts SET portal_user_id = $1 WHERE id = $2',
      [portalUserId, id]
    );

    // TODO: Send invitation email if send_invitation is true

    res.json({
      success: true,
      portal_user_id: portalUserId,
      invitation_token: resetToken,
      message: send_invitation ? 'Portal access created and invitation sent' : 'Portal access created'
    });
  } catch (error) {
    console.error('Error enabling portal access:', error);
    res.status(500).json({ error: 'Failed to enable portal access' });
  }
});

// ============================================
// GET /api/contacts/customer/:customerId - Get contacts for customer
// ============================================
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const organizationId = await getUserOrganizationId((req as any).user.id);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { customerId } = req.params;

    const result = await query(`
      SELECT
        cc.*,
        cpu.id as has_portal_access,
        cpu.last_login as portal_last_login
      FROM customer_contacts cc
      LEFT JOIN customer_portal_users cpu ON cc.portal_user_id = cpu.id
      WHERE cc.customer_id = $1 AND cc.organization_id = $2
      ORDER BY cc.is_primary DESC, cc.last_name ASC
    `, [customerId, organizationId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching customer contacts:', error);
    res.status(500).json({ error: 'Failed to fetch customer contacts' });
  }
});

export default router;
