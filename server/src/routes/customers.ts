import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, getUserOrganizationId, requireOrgRole } from '../middleware/organization';
import { auditLog } from '../services/auditLog';
import { emailService } from '../services/emailService';
import { mailboxMonitorService } from '../services/mailboxMonitorService';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

// Explicit column lists (no SELECT *)
const CUSTOMER_COLUMNS = `
  id, user_id, organization_id, name, color, customer_number, contact_person,
  email, address, report_title, hourly_rate, payment_terms_days, time_rounding_interval,
  ninjarmm_organization_id, display_name, import_aliases, sla_policy_id,
  sevdesk_customer_id, sevdesk_position_template, default_contract_id, default_project_id,
  is_vendor, vendor_domain, vendor_notes, vendor_api_config,
  created_at, deleted_at
`;

const PORTAL_USER_COLUMNS = `
  id, organization_id, customer_id, email, name, password_hash,
  can_create_tickets, can_view_all_tickets, can_view_devices, can_view_invoices, can_view_quotes,
  mfa_enabled, mfa_secret, invitation_token, invitation_expires_at, invitation_sent_at,
  created_at, updated_at
`;

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
  // sevdesk position template (per-customer text appended to every invoice
  // position; supports {placeholders}). default_contract_id is the source for
  // {contractNumber}/{contractTitle}.
  sevdeskPositionTemplate: z.string().max(2000).nullable().optional(),
  defaultContractId: z.string().nullable().optional(),
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

    const result = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name', [organizationId]);
    const customers = transformRows(result.rows);

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    logger.error('Get customers error:', error);
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

    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND deleted_at IS NULL', [id]);
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
    logger.error('Create customer error:', error);
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
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, organizationId]);
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
    if (updates.sevdeskPositionTemplate !== undefined) {
      fields.push(`sevdesk_position_template = $${paramCount++}`);
      values.push(updates.sevdeskPositionTemplate || null);
    }
    if (updates.defaultContractId !== undefined) {
      // Validate the contract belongs to this customer (organization-scoped already
      // by the customer FK chain). Empty string / null clears the link.
      if (updates.defaultContractId) {
        const contractCheck = await pool.query(
          'SELECT id FROM contracts WHERE id = $1 AND customer_id = $2',
          [updates.defaultContractId, id]
        );
        if (contractCheck.rows.length === 0) {
          return res.status(400).json({ error: 'defaultContractId belongs to a different customer or does not exist' });
        }
      }
      fields.push(`default_contract_id = $${paramCount++}`);
      values.push(updates.defaultContractId || null);
    }
    if (updates.defaultProjectId !== undefined) {
      fields.push(`default_project_id = $${paramCount++}`);
      values.push(updates.defaultProjectId || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE customers SET ${fields.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL`;
    await pool.query(query, values);

    const updatedResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND deleted_at IS NULL', [id]);
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
    logger.error('Update customer error:', error);
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
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [id, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has projects
    const countResult = await pool.query('SELECT COUNT(*) as count FROM projects WHERE customer_id = $1', [id]);
    const projectCount = countResult.rows[0];
    if (projectCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with existing projects. Please delete projects first.' });
    }

    await pool.query('UPDATE customers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);

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
    logger.error('Delete customer error:', error);
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
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Use customer_portal_users table for portal contacts
    const result = await pool.query(
      `SELECT id, customer_id, name, email, is_primary_contact as is_primary,
              can_create_tickets, can_view_all_tickets,
              can_view_devices, can_view_invoices, can_view_quotes,
              notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
              last_login, created_at, password_hash IS NOT NULL AND password_hash != '' as is_activated
       FROM customer_portal_users
       WHERE customer_id = $1 AND organization_id = $2
       ORDER BY is_primary_contact DESC, name`,
      [customerId, organizationId]
    );

    const contacts = result.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      email: row.email,
      isPrimary: row.is_primary,
      canCreateTickets: row.can_create_tickets ?? true,
      canViewAllTickets: row.can_view_all_tickets ?? false,
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
    logger.error('Get contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/contacts - Create new portal contact (requires member role)
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
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if email already exists for this customer in portal users
    const existingContact = await pool.query(
      'SELECT id FROM customer_portal_users WHERE customer_id = $1 AND LOWER(email) = LOWER($2)',
      [customerId, email]
    );
    if (existingContact.rows.length > 0) {
      return res.status(400).json({ error: 'A contact with this email already exists for this customer' });
    }

    // If setting as primary, unset other primary contacts
    if (isPrimary) {
      await pool.query('UPDATE customer_portal_users SET is_primary_contact = FALSE WHERE customer_id = $1', [customerId]);
    }

    const id = crypto.randomUUID();
    // Create portal user with empty password_hash (will be set when activated)
    await pool.query(
      `INSERT INTO customer_portal_users (
        id, owner_user_id, organization_id, customer_id, name, email, password_hash,
        is_primary_contact, is_active, can_create_tickets, can_view_all_tickets,
        can_view_devices, can_view_invoices, can_view_quotes,
        notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, '', $7, true, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
      [id, userId, organizationId, customerId, name, email, isPrimary ?? false,
       canCreateTickets ?? true, canViewAllTickets ?? false,
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
        isPrimary: isPrimary ?? false,
        canCreateTickets: canCreateTickets ?? true,
        canViewAllTickets: canViewAllTickets ?? false,
        canViewDevices: canViewDevices ?? false,
        canViewInvoices: canViewInvoices ?? false,
        canViewQuotes: canViewQuotes ?? false,
        notifyTicketCreated: notifyTicketCreated ?? true,
        notifyTicketStatusChanged: notifyTicketStatusChanged ?? true,
        notifyTicketReply: notifyTicketReply ?? true,
        isActivated: false,
        lastLogin: null,
        createdAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    logger.error('Create contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/customers/:customerId/contacts/:contactId - Update portal contact (requires member role)
router.put('/:customerId/contacts/:contactId', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updateContactSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;
    const updates = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify portal user exists
    const contactResult = await pool.query('SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3', [contactId, customerId, organizationId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // If setting as primary, unset other primary contacts
    if (updates.isPrimary) {
      await pool.query('UPDATE customer_portal_users SET is_primary_contact = FALSE WHERE customer_id = $1 AND id != $2', [customerId, contactId]);
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
        'SELECT id FROM customer_portal_users WHERE customer_id = $1 AND LOWER(email) = LOWER($2) AND id != $3',
        [customerId, updates.email, contactId]
      );
      if (existingContact.rows.length > 0) {
        return res.status(400).json({ error: 'A contact with this email already exists' });
      }
      fields.push(`email = $${paramCount++}`);
      values.push(updates.email);
    }
    if (updates.isPrimary !== undefined) {
      fields.push(`is_primary_contact = $${paramCount++}`);
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

    fields.push(`updated_at = NOW()`);
    values.push(contactId);
    const query = `UPDATE customer_portal_users SET ${fields.join(', ')} WHERE id = $${paramCount}`;
    await pool.query(query, values);

    const updatedResult = await pool.query(
      `SELECT id, customer_id, name, email, is_primary_contact as is_primary,
              can_create_tickets, can_view_all_tickets,
              can_view_devices, can_view_invoices, can_view_quotes,
              notify_ticket_created, notify_ticket_status_changed, notify_ticket_reply,
              last_login, created_at, password_hash IS NOT NULL AND password_hash != '' as is_activated
       FROM customer_portal_users WHERE id = $1`,
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
        canCreateTickets: updated.can_create_tickets ?? true,
        canViewAllTickets: updated.can_view_all_tickets ?? false,
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
    logger.error('Update contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:customerId/contacts/:contactId - Delete portal contact (requires admin role)
router.delete('/:customerId/contacts/:contactId', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, contactId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Verify portal user exists
    const contactResult = await pool.query('SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3', [contactId, customerId, organizationId]);
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.query('DELETE FROM customer_portal_users WHERE id = $1', [contactId]);

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
    logger.error('Delete contact error:', error);
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
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get portal user
    const contactResult = await pool.query(
      'SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3',
      [contactId, customerId, organizationId]
    );
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Generate activation token (UUID stored in DB, consistent with /invitation/activate flow)
    const activationToken = crypto.randomUUID();
    const tokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store token in database
    await pool.query(
      `UPDATE customer_portal_users
       SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [activationToken, tokenExpires, contact.id]
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
    logger.error('Send invite error:', error);
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
    const customerResult = await pool.query('SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [customerId, organizationId]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get portal user
    const contactResult = await pool.query(
      'SELECT ${PORTAL_USER_COLUMNS} FROM customer_portal_users WHERE id = $1 AND customer_id = $2 AND organization_id = $3',
      [contactId, customerId, organizationId]
    );
    if (contactResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = contactResult.rows[0];

    // Hash password and update
    const passwordHash = await bcrypt.hash(password, 10);
    logger.info(`🔑 Setting password for portal user "${contact.email}" (id: ${contactId}), hash length: ${passwordHash.length}`);

    const updateResult = await pool.query(
      'UPDATE customer_portal_users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, password_hash IS NOT NULL AND password_hash != \'\' as has_password',
      [passwordHash, contactId]
    );

    // Also update the linked customer_contacts entry (login checks this table)
    await pool.query(
      `UPDATE customer_contacts SET password_hash = $1, updated_at = NOW()
       WHERE portal_user_id = $2`,
      [passwordHash, contactId]
    );

    logger.info(`🔑 Password set result:`, updateResult.rows[0]);

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
    logger.error('Set password error:', error);
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
       WHERE c.organization_id = $1 AND c.deleted_at IS NULL AND c.is_vendor = true
       ORDER BY c.name`,
      [organizationId]
    );

    const vendors = transformRows(result.rows);

    res.json({
      success: true,
      data: vendors
    });
  } catch (error) {
    logger.error('Get vendors error:', error);
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
      'SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = transformRow(customerResult.rows[0]);

    // Get processed invoices for this vendor
    const invoicesResult = await pool.query(
      `SELECT id, email_id, email_subject, sender_email, sender_name, received_at,
              attachment_count, status, error_message, processed_at
       FROM processed_invoices
       WHERE organization_id = $1 AND vendor_id = $2
       ORDER BY received_at DESC
       LIMIT 50`,
      [organizationId, id]
    );

    // Also get invoices matched by email domain if vendor_domain is set
    let domainInvoices: any[] = [];
    if (customer.vendorDomain) {
      const domainResult = await pool.query(
        `SELECT id, email_id, email_subject, sender_email, sender_name, received_at,
                attachment_count, status, error_message, processed_at
         FROM processed_invoices
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
        `SELECT id, processed_invoice_id, filename, original_filename, mime_type, size, created_at
         FROM invoice_documents WHERE processed_invoice_id = ANY($1)`,
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
    logger.error('Get vendor hub error:', error);
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
      'SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
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
      logger.info('Support mailbox not configured or error:', err);
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
      logger.info('Invoice mailbox not configured or error:', err);
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
    logger.error('Get vendor emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Customer Email Domains Management
// ============================================

// Validation schema for email domain
const emailDomainSchema = z.object({
  domain: z.string().min(3).max(100).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Ungültiges Domain-Format'),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(500).optional()
});

// GET /api/customers/:customerId/email-domains - List all email domains for a customer
router.get('/:customerId/email-domains', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [customerId, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    const domainsResult = await pool.query(`
      SELECT ced.*, u.username as created_by_name
      FROM customer_email_domains ced
      LEFT JOIN users u ON ced.created_by = u.id
      WHERE ced.customer_id = $1 AND ced.organization_id = $2
      ORDER BY ced.is_primary DESC, ced.domain ASC
    `, [customerId, organizationId]);

    res.json({
      success: true,
      data: transformRows(domainsResult.rows)
    });
  } catch (error) {
    logger.error('Get email domains error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/:customerId/email-domains - Add email domain to customer
router.post('/:customerId/email-domains', authenticateToken, attachOrganization, validate(emailDomainSchema), async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId } = req.params;
    const { domain, isPrimary, notes } = req.body;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT id, name FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [customerId, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    // Check if domain already exists for any customer in this organization
    const existingDomain = await pool.query(
      'SELECT ced.*, c.name as customer_name FROM customer_email_domains ced JOIN customers c ON ced.customer_id = c.id WHERE ced.organization_id = $1 AND LOWER(ced.domain) = LOWER($2)',
      [organizationId, domain]
    );
    if (existingDomain.rows.length > 0) {
      const existing = existingDomain.rows[0];
      return res.status(409).json({
        error: `Domain "${domain}" ist bereits dem Kunden "${existing.customer_name}" zugeordnet`
      });
    }

    const domainId = crypto.randomUUID();

    // If this is set as primary, unset other primary domains for this customer
    if (isPrimary) {
      await pool.query(
        'UPDATE customer_email_domains SET is_primary = false WHERE customer_id = $1',
        [customerId]
      );
    }

    await pool.query(`
      INSERT INTO customer_email_domains (id, customer_id, organization_id, domain, is_primary, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [domainId, customerId, organizationId, domain.toLowerCase(), isPrimary || false, notes || null, authReq.user!.id]);

    auditLog.log({
      action: 'customer_domain.add',
      userId: authReq.user!.id,
      details: JSON.stringify({ domain, isPrimary, customerId, organizationId }),
    });

    res.status(201).json({
      success: true,
      data: {
        id: domainId,
        customerId,
        domain: domain.toLowerCase(),
        isPrimary: isPrimary || false,
        notes
      }
    });
  } catch (error) {
    logger.error('Add email domain error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/customers/:customerId/email-domains/:domainId - Remove email domain
router.delete('/:customerId/email-domains/:domainId', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { customerId, domainId } = req.params;

    // Verify customer belongs to organization
    const customerResult = await pool.query(
      'SELECT id FROM customers WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [customerId, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }

    // Get domain info before deleting
    const domainResult = await pool.query(
      'SELECT domain FROM customer_email_domains WHERE id = $1 AND customer_id = $2',
      [domainId, customerId]
    );
    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain nicht gefunden' });
    }

    const deletedDomain = domainResult.rows[0].domain;

    await pool.query(
      'DELETE FROM customer_email_domains WHERE id = $1 AND customer_id = $2',
      [domainId, customerId]
    );

    auditLog.log({
      action: 'customer_domain.remove',
      userId: authReq.user!.id,
      details: JSON.stringify({ domain: deletedDomain, customerId, organizationId }),
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Delete email domain error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/email-domains/lookup - Find customer by email domain
router.get('/email-domains/lookup', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const email = req.query.email as string;

    if (!email) {
      return res.status(400).json({ error: 'E-Mail-Adresse erforderlich' });
    }

    // Extract domain from email
    const domainMatch = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (!domainMatch) {
      return res.status(400).json({ error: 'Ungültiges E-Mail-Format' });
    }
    const domain = domainMatch[1].toLowerCase();

    // Look up in customer_email_domains
    const result = await pool.query(`
      SELECT c.id, c.name, c.customer_number, ced.domain, ced.is_primary
      FROM customers c
      JOIN customer_email_domains ced ON c.id = ced.customer_id
      WHERE ced.organization_id = $1 AND LOWER(ced.domain) = $2 AND c.deleted_at IS NULL
      LIMIT 1
    `, [organizationId, domain]);

    if (result.rows.length > 0) {
      return res.json({
        success: true,
        found: true,
        matchType: 'domain_mapping',
        data: transformRow(result.rows[0])
      });
    }

    // Fallback to vendor_domain
    const vendorResult = await pool.query(`
      SELECT id, name, customer_number, vendor_domain as domain
      FROM customers
      WHERE organization_id = $1 AND deleted_at IS NULL AND LOWER(vendor_domain) = $2
      LIMIT 1
    `, [organizationId, domain]);

    if (vendorResult.rows.length > 0) {
      return res.json({
        success: true,
        found: true,
        matchType: 'vendor_domain',
        data: transformRow(vendorResult.rows[0])
      });
    }

    res.json({
      success: true,
      found: false,
      searchedDomain: domain,
      message: 'Kein Kunde für diese Domain gefunden'
    });
  } catch (error) {
    logger.error('Domain lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/customers/email-domains/all - List all domain mappings (admin view)
router.get('/email-domains/all', authenticateToken, attachOrganization, async (req, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(`
      SELECT ced.*, c.name as customer_name, c.customer_number, u.username as created_by_name
      FROM customer_email_domains ced
      JOIN customers c ON ced.customer_id = c.id
      LEFT JOIN users u ON ced.created_by = u.id
      WHERE ced.organization_id = $1
      ORDER BY c.name ASC, ced.domain ASC
    `, [organizationId]);

    res.json({
      success: true,
      data: transformRows(result.rows)
    });
  } catch (error) {
    logger.error('Get all domains error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers/migrate-contacts - Auto-create contacts and domain mappings
router.post('/migrate-contacts', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const stats = {
      contactsFromEmail: 0,
      contactsFromTickets: 0,
      domainsFromWebsite: 0,
      domainsFromEmail: 0,
      skippedExisting: 0,
      errors: [] as string[]
    };

    // 1. Create contacts from customer email addresses
    const customersWithEmail = await pool.query(`
      SELECT c.id, c.name, c.email, c.contact_person
      FROM customers c
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND c.email IS NOT NULL
        AND c.email != ''
        AND NOT EXISTS (
          SELECT 1 FROM customer_contacts cc
          WHERE cc.customer_id = c.id AND LOWER(cc.email) = LOWER(c.email)
        )
    `, [organizationId]);

    for (const customer of customersWithEmail.rows) {
      try {
        const contactId = crypto.randomUUID();
        const contactName = customer.contact_person || customer.name;

        // Split contact name into first and last name
        const nameParts = contactName.trim().split(/\s+/);
        const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
        const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : contactName;

        await pool.query(`
          INSERT INTO customer_contacts (
            id, organization_id, customer_id, first_name, last_name, email, is_primary, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
        `, [contactId, organizationId, customer.id, firstName, lastName, customer.email]);

        stats.contactsFromEmail++;
      } catch (err: any) {
        if (err.code !== '23505') { // Not a duplicate key error
          stats.errors.push(`Contact for ${customer.name}: ${err.message}`);
        } else {
          stats.skippedExisting++;
        }
      }
    }

    // 2. Extract domains from customer websites
    const customersWithWebsite = await pool.query(`
      SELECT c.id, c.name, c.website
      FROM customers c
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND c.website IS NOT NULL
        AND c.website != ''
    `, [organizationId]);

    for (const customer of customersWithWebsite.rows) {
      try {
        // Extract domain from website URL
        let domain = customer.website
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .split('/')[0]
          .toLowerCase();

        if (domain && domain.includes('.')) {
          // Check if domain already exists
          const existing = await pool.query(`
            SELECT 1 FROM customer_email_domains
            WHERE organization_id = $1 AND LOWER(domain) = $2
          `, [organizationId, domain]);

          if (existing.rows.length === 0) {
            const domainId = crypto.randomUUID();
            await pool.query(`
              INSERT INTO customer_email_domains (
                id, customer_id, organization_id, domain, is_primary, created_at, created_by
              ) VALUES ($1, $2, $3, $4, true, NOW(), $5)
            `, [domainId, customer.id, organizationId, domain, userId]);

            stats.domainsFromWebsite++;
          } else {
            stats.skippedExisting++;
          }
        }
      } catch (err: any) {
        if (err.code !== '23505') {
          stats.errors.push(`Domain for ${customer.name}: ${err.message}`);
        } else {
          stats.skippedExisting++;
        }
      }
    }

    // 3. Extract domains from customer email addresses
    const customersWithEmailNoDomain = await pool.query(`
      SELECT c.id, c.name, c.email
      FROM customers c
      WHERE c.organization_id = $1 AND c.deleted_at IS NULL
        AND c.email IS NOT NULL
        AND c.email != ''
        AND c.email LIKE '%@%'
    `, [organizationId]);

    for (const customer of customersWithEmailNoDomain.rows) {
      try {
        const domainMatch = customer.email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
        if (domainMatch) {
          const domain = domainMatch[1].toLowerCase();

          // Skip common free email providers
          const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'gmx.de', 'gmx.at', 'web.de', 'aon.at', 't-online.de', 'icloud.com', 'me.com'];
          if (freeProviders.includes(domain)) {
            continue;
          }

          // Check if domain already exists
          const existing = await pool.query(`
            SELECT 1 FROM customer_email_domains
            WHERE organization_id = $1 AND LOWER(domain) = $2
          `, [organizationId, domain]);

          if (existing.rows.length === 0) {
            const domainId = crypto.randomUUID();
            await pool.query(`
              INSERT INTO customer_email_domains (
                id, customer_id, organization_id, domain, is_primary, notes, created_at, created_by
              ) VALUES ($1, $2, $3, $4, false, 'Auto-extracted from customer email', NOW(), $5)
            `, [domainId, customer.id, organizationId, domain, userId]);

            stats.domainsFromEmail++;
          } else {
            stats.skippedExisting++;
          }
        }
      } catch (err: any) {
        if (err.code !== '23505') {
          stats.errors.push(`Email domain for ${customer.name}: ${err.message}`);
        } else {
          stats.skippedExisting++;
        }
      }
    }

    // 4. Create contacts from ticket emails (if tickets exist)
    try {
      const ticketEmails = await pool.query(`
        SELECT DISTINCT te.from_email, te.from_name, t.customer_id, c.name as customer_name
        FROM ticket_emails te
        JOIN tickets t ON te.ticket_id = t.id
        JOIN customers c ON t.customer_id = c.id
        WHERE t.organization_id = $1
          AND te.from_email IS NOT NULL
          AND te.from_email != ''
          AND te.direction = 'inbound'
          AND NOT EXISTS (
            SELECT 1 FROM customer_contacts cc
            WHERE cc.customer_id = t.customer_id AND LOWER(cc.email) = LOWER(te.from_email)
          )
      `, [organizationId]);

      for (const email of ticketEmails.rows) {
        try {
          const contactId = crypto.randomUUID();
          const contactName = email.from_name || email.from_email.split('@')[0];

          // Split contact name into first and last name
          const nameParts = contactName.trim().split(/\s+/);
          const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : null;
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : contactName;

          await pool.query(`
            INSERT INTO customer_contacts (
              id, organization_id, customer_id, first_name, last_name, email, is_primary, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
          `, [contactId, organizationId, email.customer_id, firstName, lastName, email.from_email]);

          stats.contactsFromTickets++;
        } catch (err: any) {
          if (err.code !== '23505') {
            stats.errors.push(`Ticket contact ${email.from_email}: ${err.message}`);
          } else {
            stats.skippedExisting++;
          }
        }
      }
    } catch (err: any) {
      // Ticket tables might not exist - ignore
      logger.info('Note: Ticket contacts migration skipped (table may not exist)');
    }

    auditLog.log({
      userId,
      action: 'customers.migrate_contacts',
      details: JSON.stringify(stats),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Migration abgeschlossen',
      stats
    });
  } catch (error) {
    logger.error('Migrate contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
