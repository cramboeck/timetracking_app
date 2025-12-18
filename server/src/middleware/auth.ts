import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    username?: string;
    email?: string;
    role?: string;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error('AUTH ERROR: JWT_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    req.user = { id: decoded.userId };
    next();
  } catch (error: any) {
    console.error('AUTH ERROR:', error.name, error.message, 'Token prefix:', token?.substring(0, 20));
    return res.status(403).json({ error: 'Invalid token', details: error.message });
  }
}

// Alias for admin routes
export const authenticate = authenticateToken;
