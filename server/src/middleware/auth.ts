import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/database';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    username?: string;
    email?: string;
    role?: string;
  };
}

// API-Tokens (MCP/Integrationen): langlebig, Präfix "rbf_", nur als
// SHA-256-Hash gespeichert. Sie durchlaufen dieselben Routen wie JWTs —
// Berechtigungen (requireAdmin/requireOrgRole) und auditTrail greifen
// unverändert, weil req.user dieselbe Form bekommt.
const API_TOKEN_PREFIX = 'rbf_';

async function authenticateApiToken(token: string, req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await query(
      `SELECT user_id FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    const userId = result.rows[0].user_id;
    req.userId = userId;
    req.user = { id: userId };
    // last_used_at best effort — darf den Request nie aufhalten
    query(`UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = $1`, [tokenHash]).catch(() => {});
    next();
  } catch (error: any) {
    console.error('API-TOKEN AUTH ERROR:', error.message);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// ?token= landet in nginx-Access-Logs und Browser-History — nur die Routen
// erlauben, die technisch keine Header setzen können (EventSource, window.open
// für Beleg-Downloads). Alle anderen Routen: ausschließlich Authorization-Header.
const QUERY_TOKEN_ALLOWED: RegExp[] = [
  /^\/api\/sse\/events(\?|$)/,
  /^\/api\/microsoft365\/documents\/[^/]+\/download(\?|$)/,
];

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const queryTokenAllowed = QUERY_TOKEN_ALLOWED.some(re => re.test(req.originalUrl || ''));
  const token = (authHeader && authHeader.split(' ')[1])
    || (queryTokenAllowed ? (req.query.token as string) : undefined);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (token.startsWith(API_TOKEN_PREFIX)) {
    void authenticateApiToken(token, req, res, next);
    return;
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error('AUTH ERROR: JWT_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
      userId?: string;
      type?: string;
      mfaPending?: boolean;
    };
    // Nur reine App-Session-Tokens ({userId}) sind hier gültig:
    // - Portal-Tokens (type: 'customer_portal') tragen die App-User-ID des
    //   Dienstleisters — ohne diesen Check könnte ein Portal-Kunde als
    //   dessen App-User (inkl. Admin) gegen /api/* agieren.
    // - mfaPending-Zwischentokens sind ausschließlich für die MFA-Verifikation
    //   bestimmt, nicht als Session (sonst wäre MFA per Passwort umgehbar).
    if (decoded.type || decoded.mfaPending || !decoded.userId) {
      console.error('AUTH ERROR: non-app token rejected', { type: decoded.type, mfaPending: decoded.mfaPending });
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = decoded.userId;
    req.user = { id: decoded.userId };
    next();
  } catch (error: any) {
    console.error('AUTH ERROR:', error.name, error.message, 'Token prefix:', token?.substring(0, 20));
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Alias for admin routes
export const authenticate = authenticateToken;
