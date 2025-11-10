import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { transformRow } from '../utils/dbTransform';

const router = Router();

// Validation schema
const companyInfoSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().optional(),
  taxId: z.string().optional(),
  logo: z.string().optional()
});

// GET company info for current user
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      'SELECT * FROM company_info WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const companyInfo = transformRow(result.rows[0]);
    res.json(companyInfo);
  } catch (error) {
    console.error('Error fetching company info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST/PUT company info (upsert)
router.post('/', authenticateToken, validate(companyInfoSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name, address, city, zipCode, country, email, phone, website, taxId, logo } = req.body;

    // Check if company info already exists
    const existing = await pool.query(
      'SELECT id FROM company_info WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE company_info
         SET name = $1, address = $2, city = $3, zip_code = $4, country = $5,
             email = $6, phone = $7, website = $8, tax_id = $9, logo = $10
         WHERE user_id = $11
         RETURNING *`,
        [name, address, city, zipCode, country, email, phone, website, taxId, logo, userId]
      );
    } else {
      // Insert new
      const id = crypto.randomUUID();
      result = await pool.query(
        `INSERT INTO company_info
         (id, user_id, name, address, city, zip_code, country, email, phone, website, tax_id, logo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [id, userId, name, address, city, zipCode, country, email, phone, website, taxId, logo]
      );
    }

    const companyInfo = transformRow(result.rows[0]);
    res.json(companyInfo);
  } catch (error) {
    console.error('Error saving company info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE company info
router.delete('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    await pool.query('DELETE FROM company_info WHERE user_id = $1', [userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting company info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
