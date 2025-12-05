import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, getUserOrganizationId, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { emailService } from '../services/emailService';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import jwt from 'jsonwebtoken';

const router = Router();

// Validation schemas
const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  reportTitle: z.string().max(200).optional(),
  hourlyRate: z.number().min(0).optional(),
  ninjarmmOrganizationId: z.string().max(100).optional()
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  reportTitle: z.string().max(200).optional(),
  hourlyRate: z.number().min(0).nullable().optional(),
  ninjarmmOrganizationId: z.string().max(100).nullable().optional()
});

// GET /api/customers - Get all customers for current organization
router.get('/', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query('SELECT * FROM customers WHERE organization_id = $1 ORDER BY name', [organizationId]);
    const customers = transformRows(result.rows);

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers - Create new customer (requires member role)
router.post('/', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, color, customerNumber, contactPerson, email, address, reportTitle, hourlyRate, ninjarmmOrganizationId } = req.body;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO customers (id, user_id, organization_id, name, color, customer_number, contact_person, email, address, report_title, hourly_rate, ninjarmm_organization_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, userId, organizationId, name, color, customerNumber || null, contactPerson || null, email || null, address || null, reportTitle || null, hourlyRate || null, ninjarmmOrganizationId || null, createdAt]
    );

    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    const newCustomer = transformRow(customerResult.rows[0]);

    auditLog.log({
      userId,
      action: 'customer.create',
      details: JSON.stringify({ name, organizationId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: newCustomer
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customers/:id - Update customer (requires member role)
router.put('/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push(`color = $${paramCount++}`);
      values.push(updates.color);
    }
    if (updates.customerNumber !== undefined) {
      fields.push(`customer_number = $${paramCount++}`);
      values.push(updates.customerNumber || null);
    }
    if (updates.contactPerson !== undefined) {
      fields.push(`contact_person = $${paramCount++}`);
      values.push(updates.contactPerson || null);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email || null);
    }
    if (updates.address !== undefined) {
      fields.push(`address = $${paramCount++}`);
      values.push(updates.address || null);
    }
    if (updates.reportTitle !== undefined) {
      fields.push(`report_title = $${paramCount++}`);
      values.push(updates.reportTitle || null);
    }
    if (updates.hourlyRate !== undefined) {
      fields.push(`hourly_rate = $${paramCount++}`);
      values.push(updates.hourlyRate);
    }
    if (updates.ninjarmmOrganizationId !== undefined) {
      fields.push(`ninjarmm_organization_id = $${paramCount++}`);
      values.push(updates.ninjarmmOrganizationId || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE customers SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    const updatedCustomer = transformRow(updatedResult.rows[0]);

    auditLog.log({
      userId,
      action: 'customer.update',
      details: JSON.stringify(updates),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      data: updatedCustomer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:id - Delete customer (requires admin role)
router.delete('/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has projects
    const countResult = await pool.query('SELECT COUNT(*) as count FROM projects WHERE customer_id = $1', [id]);
    const projectCount = countResult.rows[0];
    if (projectCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with existing projects. Please delete projects first.' });
    }

    await pool.query('DELETE FROM customers WHERE id = $1', [id]);

    auditLog.log({
      userId,
      action: 'customer.delete',
      details: JSON.stringify({ id }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// CUSTOMER CONTACTS MANAGEMENT
// ========================================================================

// Validation schemas for contacts
const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  isPrimary: z.boolean().optional().default(false),
  canCreateTickets: z.boolean().optional().default(true),
  canViewAllTickets: z.boolean().optional().default(false),
  canViewDevices: z.boolean().optional().default(false),
  canViewInvoices: z.boolean().optional().default(false),
  canViewQuotes: z.boolean().optional().default(false),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  isPrimary: z.boolean().optional(),
  canCreateTickets: z.boolean().optional(),
  canViewAllTickets: z.boolean().optional(),
  canViewDevices: z.boolean().optional(),
  canViewInvoices: z.boolean().optional(),
  canViewQuotes: z.boolean().optional(),
});

// GET /api/customers/:customerId/contacts - Get all contacts for a customer
router.get('/:customerId/contacts', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const result = await pool.query(
      `SELECT id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets,
              can_view_devices, can_view_invoices, can_view_quotes,
              last_login, created_at, password_hash IS NOT NULL as is_activated
       FROM customer_contacts
       WHERE customer_id = $1
       ORDER BY is_primary DESC, name`,
      [customerId]
    );

    const contacts = result.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      email: row.email,
      isPrimary: row.is_primary,
      canCreateTickets: row.can_create_tickets,
      canViewAllTickets: row.can_view_all_tickets,
      canViewDevices: row.can_view_devices ?? false,
      canViewInvoices: row.can_view_invoices ?? false,
      canViewQuotes: row.can_view_quotes ?? false,
      isActivated: row.is_activated,
      lastLogin: row.last_login,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: contacts
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/contacts - Create new contact (requires member role)
router.post('/:customerId/contacts', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createContactSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;
    const { name, email, isPrimary, canCreateTickets, canViewAllTickets, canViewDevices, canViewInvoices, canViewQuotes } = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if email already exists for this customer
    const existingContact = await pool.query(
      'SELECT id FROM customer_contacts WHERE customer_id = $1 AND LOWER(email) = LOWER($2)',
      [customerId, email]
    );
    if (existingContact.rows.length > 0) {
      return res.status(400).json({ error: 'A contact with this email already exists for this customer' });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      await pool.query('UPDATE customer_contacts SET is_primary = FALSE WHERE customer_id = $1', [customerId]);
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO customer_contacts (id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets, can_view_devices, can_view_invoices, can_view_quotes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [id, customerId, name, email, isPrimary, canCreateTickets, canViewAllTickets, canViewDevices ?? false, canViewInvoices ?? false, canViewQuotes ?? false]
    );

    auditLog.log({
      userId,
      action: 'customer_contact.create',
      details: JSON.stringify({ customerId, name, email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.status(201).json({
      success: true,
      data: {
        id,
        customerId,
        name,
        email,
        isPrimary,
        canCreateTickets,
        canViewAllTickets,
        canViewDevices: canViewDevices ?? false,
        canViewInvoices: canViewInvoices ?? false,
        canViewQuotes: canViewQuotes ?? false,
        isActivated: false,
        lastLogin: null,
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customers/:customerId/contacts/:contactId - Update contact (requires member role)
router.put('/:customerId/contacts/:contactId', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateContactSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;
    const updates = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify contact exists
    const contactResult = await pool.query('SELECT * FROM customer_contacts WHERE id = $1 AND customer_id = $2', [contactId, customerId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as primary, unset other primary contacts
    if (updates.isPrimary) {
      await pool.query('UPDATE customer_contacts SET is_primary = FALSE WHERE customer_id = $1 AND id != $2', [customerId, contactId]);
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      // Check if email already exists
      const existingContact = await pool.query(
        'SELECT id FROM customer_contacts WHERE customer_id = $1 AND LOWER(email) = LOWER($2) AND id != $3',
        [customerId, updates.email, contactId]
      );
      if (existingContact.rows.length > 0) {
        return res.status(400).json({ error: 'A contact with this email already exists' });
      }
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }
    if (updates.isPrimary !== undefined) {
      fields.push(`is_primary = $${paramCount++}`);
      values.push(updates.isPrimary);
    }
    if (updates.canCreateTickets !== undefined) {
      fields.push(`can_create_tickets = $${paramCount++}`);
      values.push(updates.canCreateTickets);
    }
    if (updates.canViewAllTickets !== undefined) {
      fields.push(`can_view_all_tickets = $${paramCount++}`);
      values.push(updates.canViewAllTickets);
    }
    if (updates.canViewDevices !== undefined) {
      fields.push(`can_view_devices = $${paramCount++}`);
      values.push(updates.canViewDevices);
    }
    if (updates.canViewInvoices !== undefined) {
      fields.push(`can_view_invoices = $${paramCount++}`);
      values.push(updates.canViewInvoices);
    }
    if (updates.canViewQuotes !== undefined) {
      fields.push(`can_view_quotes = $${paramCount++}`);
      values.push(updates.canViewQuotes);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(contactId);
    const query = `UPDATE customer_contacts SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query(
      `SELECT id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets,
              can_view_devices, can_view_invoices, can_view_quotes,
              last_login, created_at, password_hash IS NOT NULL as is_activated
       FROM customer_contacts WHERE id = $1`,
      [contactId]
    );
    const updated = updatedResult.rows[0];

    res.json({
      success: true,
      data: {
        id: updated.id,
        customerId: updated.customer_id,
        name: updated.name,
        email: updated.email,
        isPrimary: updated.is_primary,
        canCreateTickets: updated.can_create_tickets,
        canViewAllTickets: updated.can_view_all_tickets,
        canViewDevices: updated.can_view_devices ?? false,
        canViewInvoices: updated.can_view_invoices ?? false,
        canViewQuotes: updated.can_view_quotes ?? false,
        isActivated: updated.is_activated,
        lastLogin: updated.last_login,
        createdAt: updated.created_at,
      }
    });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:customerId/contacts/:contactId - Delete contact (requires admin role)
router.delete('/:customerId/contacts/:contactId', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify contact exists
    const contactResult = await pool.query('SELECT * FROM customer_contacts WHERE id = $1 AND customer_id = $2', [contactId, customerId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.query('DELETE FROM customer_contacts WHERE id = $1', [contactId]);

    auditLog.log({
      userId,
      action: 'customer_contact.delete',
      details: JSON.stringify({ customerId, contactId }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/contacts/:contactId/send-invite - Send activation invite (requires member role)
router.post('/:customerId/contacts/:contactId/send-invite', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND organization_id = $2', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get contact
    const contactResult = await pool.query(
      'SELECT * FROM customer_contacts WHERE id = $1 AND customer_id = $2',
      [contactId, customerId]
    );
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Generate activation token
    const activationToken = jwt.sign(
      { contactId: contact.id, type: 'customer_activation' },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    // Get user info for email
    const userResult = await pool.query('SELECT username, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Send activation email
    const portalUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const activationUrl = `${portalUrl}/portal/activate?token=${activationToken}`;

    await emailService.sendEmail({
      to: contact.email,
      subject: `Kundenportal-Einladung von ${user.username}`,
      html: `
        <h2>Willkommen im Kundenportal!</h2>
        <p>Hallo ${contact.name},</p>
        <p>${user.username} hat Sie zum Kundenportal eingeladen. Dort können Sie:</p>
        <ul>
          <li>Support-Tickets erstellen und verfolgen</li>
          <li>Den Status Ihrer Anfragen einsehen</li>
          <li>Mit dem Support-Team kommunizieren</li>
        </ul>
        <p>Um Ihr Konto zu aktivieren, klicken Sie bitte auf folgenden Link:</p>
        <p><a href="${activationUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Konto aktivieren</a></p>
        <p>Dieser Link ist 7 Tage gültig.</p>
        <p>Mit freundlichen Grüßen,<br>${user.username}</p>
      `,
      text: `Hallo ${contact.name}, ${user.username} hat Sie zum Kundenportal eingeladen. Aktivieren Sie Ihr Konto: ${activationUrl}`,
    });

    auditLog.log({
      userId,
      action: 'customer_contact.send_invite',
      details: JSON.stringify({ customerId, contactId, email: contact.email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Invitation sent successfully'
    });
  } catch (error) {
    console.error('Send invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
