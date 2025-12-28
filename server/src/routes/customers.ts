import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, getUserOrganizationId, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { emailService } from '../services/emailService';
import { mailboxMonitorService } from '../services/mailboxMonitorService';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
  paymentTermsDays: z.number().min(1).max(365).optional(),
  ninjarmmOrganizationId: z.string().max(100).optional(),
  displayName: z.string().max(100).optional(),
  importAliases: z.array(z.string().max(200)).optional(),
  customerType: z.enum(['company', 'individual']).optional()
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
  paymentTermsDays: z.number().min(1).max(365).nullable().optional(),
  ninjarmmOrganizationId: z.string().max(100).nullable().optional(),
  displayName: z.string().max(100).nullable().optional(),
  importAliases: z.array(z.string().max(200)).nullable().optional(),
  customerType: z.enum(['company', 'individual']).nullable().optional(),
  // Vendor/Supplier fields
  isVendor: z.boolean().optional(),
  vendorDomain: z.string().max(100).nullable().optional(),
  vendorNotes: z.string().max(5000).nullable().optional(),
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
    const { name, color, customerNumber, contactPerson, email, address, reportTitle, hourlyRate, timeRoundingInterval, paymentTermsDays, ninjarmmOrganizationId, displayName, importAliases, customerType } = req.body;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO customers (id, user_id, organization_id, name, color, customer_number, contact_person, email, address, report_title, hourly_rate, time_rounding_interval, payment_terms_days, ninjarmm_organization_id, display_name, import_aliases, customer_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [id, userId, organizationId, name, color, customerNumber || null, contactPerson || null, email || null, address || null, reportTitle || null, hourlyRate || null, timeRoundingInterval || 15, paymentTermsDays || 14, ninjarmmOrganizationId || null, displayName || null, importAliases || [], customerType || 'company', createdAt]
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
    if (updates.timeRoundingInterval !== undefined) {
      fields.push(`time_rounding_interval = $${paramCount++}`);
      values.push(updates.timeRoundingInterval || 15);
    }
    if (updates.paymentTermsDays !== undefined) {
      fields.push(`payment_terms_days = $${paramCount++}`);
      values.push(updates.paymentTermsDays || 14);
    }
    if (updates.ninjarmmOrganizationId !== undefined) {
      fields.push(`ninjarmm_organization_id = $${paramCount++}`);
      values.push(updates.ninjarmmOrganizationId || null);
    }
    if (updates.displayName !== undefined) {
      fields.push(`display_name = $${paramCount++}`);
      values.push(updates.displayName || null);
    }
    if (updates.importAliases !== undefined) {
      fields.push(`import_aliases = $${paramCount++}`);
      values.push(updates.importAliases || []);
    }
    if (updates.customerType !== undefined) {
      fields.push(`customer_type = $${paramCount++}`);
      values.push(updates.customerType || null);
    }
    // Vendor fields
    if (updates.isVendor !== undefined) {
      fields.push(`is_vendor = $${paramCount++}`);
      values.push(updates.isVendor);
    }
    if (updates.vendorDomain !== undefined) {
      fields.push(`vendor_domain = $${paramCount++}`);
      values.push(updates.vendorDomain || null);
    }
    if (updates.vendorNotes !== undefined) {
      fields.push(`vendor_notes = $${paramCount++}`);
      values.push(updates.vendorNotes || null);
    }
    if (updates.defaultProjectId !== undefined) {
      fields.push(`default_project_id = $${paramCount++}`);
      values.push(updates.defaultProjectId || null);
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
  notifyTicketCreated: z.boolean().optional().default(true),
  notifyTicketStatusChanged: z.boolean().optional().default(true),
  notifyTicketReply: z.boolean().optional().default(true),
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
  notifyTicketCreated: z.boolean().optional(),
  notifyTicketStatusChanged: z.boolean().optional(),
  notifyTicketReply: z.boolean().optional(),
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
              notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
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
      notifyTicketCreated: row.notify_ticket_created ?? true,
      notifyTicketStatusChanged: row.notify_ticket_status_changed ?? true,
      notifyTicketReply: row.notify_ticket_reply ?? true,
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
    const {
      name, email, isPrimary, canCreateTickets, canViewAllTickets,
      canViewDevices, canViewInvoices, canViewQuotes,
      notifyTicketCreated, notifyTicketStatusChanged, notifyTicketReply
    } = req.body;

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
      `INSERT INTO customer_contacts (id, customer_id, name, email, is_primary, can_create_tickets, can_view_all_tickets,
        can_view_devices, can_view_invoices, can_view_quotes,
        notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [id, customerId, name, email, isPrimary, canCreateTickets, canViewAllTickets,
       canViewDevices ?? false, canViewInvoices ?? false, canViewQuotes ?? false,
       notifyTicketCreated ?? true, notifyTicketStatusChanged ?? true, notifyTicketReply ?? true]
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
    if (updates.notifyTicketCreated !== undefined) {
      fields.push(`notify_ticket_created = $${paramCount++}`);
      values.push(updates.notifyTicketCreated);
    }
    if (updates.notifyTicketStatusChanged !== undefined) {
      fields.push(`notify_ticket_status_changed = $${paramCount++}`);
      values.push(updates.notifyTicketStatusChanged);
    }
    if (updates.notifyTicketReply !== undefined) {
      fields.push(`notify_ticket_reply = $${paramCount++}`);
      values.push(updates.notifyTicketReply);
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
              notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
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
        notifyTicketCreated: updated.notify_ticket_created ?? true,
        notifyTicketStatusChanged: updated.notify_ticket_status_changed ?? true,
        notifyTicketReply: updated.notify_ticket_reply ?? true,
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

// POST /api/customers/:customerId/contacts/:contactId/set-password - Set password directly (requires admin role)
router.post('/:customerId/contacts/:contactId/set-password', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

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

    // Hash password and update
    const passwordHash = await bcrypt.hash(password, 10);
    console.log(`🔑 Setting password for contact "${contact.email}" (id: ${contactId}), hash length: ${passwordHash.length}`);

    const updateResult = await pool.query(
      'UPDATE customer_contacts SET password_hash = $1 WHERE id = $2 RETURNING id, password_hash IS NOT NULL as has_password',
      [passwordHash, contactId]
    );

    console.log(`🔑 Password set result:`, updateResult.rows[0]);

    auditLog.log({
      userId,
      action: 'customer_contact.set_password',
      details: JSON.stringify({ customerId, contactId, email: contact.email }),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Password set successfully'
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========================================================================
// VENDOR/SUPPLIER HUB ENDPOINTS
// ========================================================================

// GET /api/customers/vendors - Get all vendors (customers with is_vendor = true)
router.get('/vendors/list', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM processed_invoices pi WHERE pi.vendor_id = c.id) as invoice_count
       FROM customers c
       WHERE c.organization_id = $1 AND c.is_vendor = true
       ORDER BY c.name`,
      [organizationId]
    );

    const vendors = transformRows(result.rows);

    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/:id/hub - Get vendor hub data (emails, invoices, summary)
router.get('/:id/hub', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = transformRow(customerResult.rows[0]);

    // Get processed invoices for this vendor
    const invoicesResult = await pool.query(
      `SELECT * FROM processed_invoices
       WHERE organization_id = $1 AND vendor_id = $2
       ORDER BY received_at DESC
       LIMIT 50`,
      [organizationId, id]
    );

    // Also get invoices matched by email domain if vendor_domain is set
    let domainInvoices: any[] = [];
    if (customer.vendorDomain) {
      const domainResult = await pool.query(
        `SELECT * FROM processed_invoices
         WHERE organization_id = $1
         AND vendor_id IS NULL
         AND LOWER(sender_email) LIKE $2
         ORDER BY received_at DESC
         LIMIT 50`,
        [organizationId, `%@${customer.vendorDomain.toLowerCase()}`]
      );
      domainInvoices = domainResult.rows;
    }

    // Combine and deduplicate
    const allInvoiceIds = new Set<string>();
    const invoices = [...invoicesResult.rows, ...domainInvoices].filter(inv => {
      if (allInvoiceIds.has(inv.id)) return false;
      allInvoiceIds.add(inv.id);
      return true;
    }).map(row => ({
      id: row.id,
      emailId: row.email_id,
      emailSubject: row.email_subject,
      senderEmail: row.sender_email,
      senderName: row.sender_name,
      receivedAt: row.received_at,
      attachmentCount: row.attachment_count,
      status: row.status,
      errorMessage: row.error_message,
      processedAt: row.processed_at,
    }));

    // Get invoice documents
    const invoiceIds = invoices.map(i => i.id);
    let documents: any[] = [];
    if (invoiceIds.length > 0) {
      const docsResult = await pool.query(
        `SELECT * FROM invoice_documents WHERE processed_invoice_id = ANY($1)`,
        [invoiceIds]
      );
      documents = docsResult.rows.map(row => ({
        id: row.id,
        processedInvoiceId: row.processed_invoice_id,
        filename: row.filename,
        originalFilename: row.original_filename,
        mimeType: row.mime_type,
        size: row.size,
        createdAt: row.created_at,
      }));
    }

    // Summary statistics
    const stats = {
      totalInvoices: invoices.length,
      draftInvoices: invoices.filter(i => i.status === 'draft').length,
      processedInvoices: invoices.filter(i => i.status === 'processed').length,
      failedInvoices: invoices.filter(i => i.status === 'failed').length,
      totalDocuments: documents.length,
    };

    res.json({
      success: true,
      data: {
        customer,
        invoices,
        documents,
        stats,
        // Emails will be fetched client-side via Microsoft 365 API
      }
    });
  } catch (error) {
    console.error('Get vendor hub error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/:id/emails - Get all emails from vendor (from support + invoice mailbox)
router.get('/:id/emails', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const maxResults = parseInt(req.query.maxResults as string) || 50;

    // Verify customer belongs to organization and get vendor domain
    const customerResult = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = transformRow(customerResult.rows[0]);
    const vendorDomain = customer.vendorDomain || customer.email?.split('@')[1];

    if (!vendorDomain) {
      return res.json({
        success: true,
        data: {
          emails: [],
          message: 'Keine Domain konfiguriert. Bitte Vendor-Domain oder E-Mail setzen.'
        }
      });
    }

    // Fetch emails from both mailboxes
    const allEmails: any[] = [];

    // Support mailbox
    try {
      const supportResult = await mailboxMonitorService.getUnreadEmails(organizationId, {
        maxResults,
        mailboxType: 'support',
      });
      if (supportResult.success && supportResult.emails) {
        // Filter by vendor domain
        const filtered = supportResult.emails.filter(email =>
          email.from.email.toLowerCase().endsWith(`@${vendorDomain.toLowerCase()}`)
        );
        allEmails.push(...filtered.map(e => ({ ...e, mailboxType: 'support' })));
      }
    } catch (err) {
      console.log('Support mailbox not configured or error:', err);
    }

    // Invoice mailbox
    try {
      const invoiceResult = await mailboxMonitorService.getUnreadEmails(organizationId, {
        maxResults,
        mailboxType: 'invoice',
      });
      if (invoiceResult.success && invoiceResult.emails) {
        // Filter by vendor domain
        const filtered = invoiceResult.emails.filter(email =>
          email.from.email.toLowerCase().endsWith(`@${vendorDomain.toLowerCase()}`)
        );
        allEmails.push(...filtered.map(e => ({ ...e, mailboxType: 'invoice' })));
      }
    } catch (err) {
      console.log('Invoice mailbox not configured or error:', err);
    }

    // Sort by date descending
    allEmails.sort((a, b) =>
      new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
    );

    res.json({
      success: true,
      data: {
        emails: allEmails.slice(0, maxResults),
        vendorDomain,
        totalFound: allEmails.length,
      }
    });
  } catch (error) {
    console.error('Get vendor emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
