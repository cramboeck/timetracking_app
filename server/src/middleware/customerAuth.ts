import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface CustomerAuthRequest extends Request {
  contactId?: string;
  customerId?: string;
  contact?: {
    id: string;
    customerId: string;
    name: string;
    email: string;
    canCreateTickets: boolean;
    canViewAllTickets: boolean;
  };
}

export function authenticateCustomerToken(req: CustomerAuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      contactId: string;
      customerId: string;
      type: string;
    };

    // Verify this is a customer portal token
    if (decoded.type !== 'customer_portal') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    req.contactId = decoded.contactId;
    req.customerId = decoded.customerId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}
