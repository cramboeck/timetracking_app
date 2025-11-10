import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { auditLog } from '../services/auditLog';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';

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

    const result = await pool.query('SELECT * FROM customers WHERE user_id = $1 ORDER BY name', [userId]);
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

// POST /api/customers - Create new customer
router.post('/', authenticateToken, validate(createCustomerSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, color, customerNumber, contactPerson, email, address, reportTitle } = req.body;

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO customers (id, user_id, name, color, customer_number, contact_person, email, address, report_title, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, userId, name, color, customerNumber || null, contactPerson || null, email || null, address || null, reportTitle || null, createdAt]
    );

    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    const newCustomer = transformRow(customerResult.rows[0]);

    auditLog.log({
      userId,
      action: 'customer.create',
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
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [id, userId]);
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

// DELETE /api/customers/:id - Delete customer
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verify customer belongs to user
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1 AND user_id = $2', [id, userId]);
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

export default router;
