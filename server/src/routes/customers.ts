import { Router } from 'express';
import { db } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  reportTitle: z.string().max(200).optional()
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  reportTitle: z.string().max(200).optional()
});

// GET /api/customers - Get all customers for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const customers = db.prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY name').all(userId);

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/customers - Create new customer
router.post('/', authenticateToken, validate(createCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, color, customerNumber, contactPerson, email, address, reportTitle } = req.body;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO customers (id, user_id, name, color, customer_number, contact_person, email, address, report_title, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name, color, customerNumber || null, contactPerson || null, email || null, address || null, reportTitle || null, createdAt);

    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);

    auditLog.log({
      userId,
      action: 'customer.create',
      resource: `customer:${id}`,
      details: JSON.stringify({ name }),
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

// PUT /api/customers/:id - Update customer
router.put('/:id', authenticateToken, validate(updateCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const updates = req.body;

    // Verify customer belongs to user
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(id, userId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.customerNumber !== undefined) {
      fields.push('customer_number = ?');
      values.push(updates.customerNumber || null);
    }
    if (updates.contactPerson !== undefined) {
      fields.push('contact_person = ?');
      values.push(updates.contactPerson || null);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email || null);
    }
    if (updates.address !== undefined) {
      fields.push('address = ?');
      values.push(updates.address || null);
    }
    if (updates.reportTitle !== undefined) {
      fields.push('report_title = ?');
      values.push(updates.reportTitle || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...values);

    const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);

    auditLog.log({
      userId,
      action: 'customer.update',
      resource: `customer:${id}`,
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

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify customer belongs to user
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(id, userId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if customer has projects
    const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects WHERE customer_id = ?').get(id) as any;
    if (projectCount.count > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with existing projects. Please delete projects first.' });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(id);

    auditLog.log({
      userId,
      action: 'customer.delete',
      resource: `customer:${id}`,
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

export default router;
