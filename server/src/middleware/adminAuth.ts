import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

// Middleware to check if user is authenticated and is an admin
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated (should be set by auth middleware)
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Fetch user from database to check role
    const result = await pool.query(
      'SELECT id, username, email, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check if user has admin role
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // User is admin, proceed
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
