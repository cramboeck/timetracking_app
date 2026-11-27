import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/database';
import { TokenRateLimiter, checkApiTokenAccess, isWriteScope, normalizeApiPath } from '../utils/apiTokenPolicy';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    username?: string;
    email?: string;
    role?: string;
  };
  /** Gesetzt, wenn die Anfrage über einen API-Zugang (MCP/KI-Agent) kommt */
  apiToken?: { id: string; name: string; scopes: string[] };
}

// API-Tokens (MCP/KI-Agent): langlebig, Präfix "rbf_", nur als SHA-256-Hash
// gespeichert. Seit Phase A (27.11.2026) gilt für sie DENY BY DEFAULT:
// nur die Endpunkte aus utils/apiTokenPolicy, nur mit passender Stufe, nur
// bis zum Ablaufdatum, mit Anfragelimit und eigenem Protokoll. Die Rechte
// des Users (requireOrgRole, Paket S) greifen zusätzlich unverändert.
const API_TOKEN_PREFIX = 'rbf_';
const tokenRateLimiter = new TokenRateLimiter();

const clientIp = (req: Request): string | null => (req.ip ? String(req.ip).slice(0, 64) : null);

async function authenticateApiToken(token: string, req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await query(
      `SELECT id, user_id, name, scopes, expires_at
         FROM api_tokens
        WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    const row = result.rows[0] as
      | { id: string; user_id: string; name: string; scopes: string[] | null; expires_at: Date | null }
      | undefined;
    if (!row) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(403).json({ error: 'API-Zugang abgelaufen – in den Einstellungen einen neuen anlegen' });
    }
    const scopes = Array.isArray(row.scopes) ? row.scopes : [];
    const startedAt = Date.now();

    // Protokoll (auch abgelehnte Versuche): Pfad ohne Query-Werte, nie Bodies
    res.on('finish', () => {
      query(
        `INSERT INTO api_token_requests (token_id, user_id, method, path, status, duration_ms, ip, client)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id, row.user_id, req.method, normalizeApiPath(req.originalUrl || '').slice(0, 300),
          res.statusCode, Date.now() - startedAt, clientIp(req),
          String(req.headers['x-ramboflow-client'] || '').slice(0, 100) || null,
        ]
      ).catch(() => { /* Protokoll darf den Request nie aufhalten */ });
    });

    const decision = checkApiTokenAccess(req.method, req.originalUrl || '', scopes);
    if (!decision.allowed) {
      return res.status(403).json({
        error: decision.reason === 'missing_scope'
          ? `Dieser API-Zugang hat die Stufe „${decision.scope}“ nicht`
          : 'Dieser Endpunkt ist für API-Zugänge gesperrt',
        code: decision.reason === 'missing_scope' ? 'API_TOKEN_SCOPE' : 'API_TOKEN_FORBIDDEN',
      });
    }

    const retryAfter = tokenRateLimiter.hit(row.id, isWriteScope(decision.scope));
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Zu viele Anfragen über diesen API-Zugang – bitte ${retryAfter} s warten`, code: 'API_TOKEN_RATE_LIMIT' });
    }

    req.userId = row.user_id;
    req.user = { id: row.user_id };
    req.apiToken = { id: row.id, name: row.name, scopes };
    // last_used best effort — darf den Request nie aufhalten
    query(`UPDATE api_tokens SET last_used_at = NOW(), last_used_ip = $2 WHERE id = $1`, [row.id, clientIp(req)]).catch(() => {});
    next();
  } catch (error) {
    console.error('API-TOKEN AUTH ERROR:', error instanceof Error ? error.message : error);
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
    // Mehrfach eingehängtes authenticateToken (Router + Route) nicht doppelt zählen
    if (req.apiToken) return next();
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
