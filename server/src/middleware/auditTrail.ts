import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Globale Audit-Middleware: protokolliert JEDE schreibende API-Anfrage
 * (POST/PUT/PATCH/DELETE) automatisch in audit_logs — lückenlos per
 * Konstruktion, statt auf manuelle auditLog.log()-Aufrufe in jeder Route zu
 * hoffen (die decken nur einen Teil der Routen ab und bleiben als
 * Detail-Logs zusätzlich bestehen).
 *
 * Bewusste Entscheidungen:
 * - Es werden NIEMALS Request-Bodies gespeichert (Passwörter, API-Keys,
 *   personenbezogene Daten). Protokolliert werden Methode, Pfad,
 *   Statuscode und die URL-Parameter (Objekt-IDs).
 * - Geloggt werden erfolgreiche Mutationen (2xx/3xx) und abgelehnte
 *   Zugriffe (403) — Letztere sind sicherheitsrelevant ("jemand hat
 *   versucht, etwas zu tun, das er nicht darf").
 * - 401 wird übersprungen (Token-Abläufe erzeugen nur Rauschen), ebenso
 *   Validierungsfehler (400) und Not-Found (404).
 * - Ausgeschlossen: /auth/refresh (stündliches Rauschen pro User) und
 *   Endpunkte ohne Schreibwirkung.
 * - Fire-and-forget: ein Logging-Fehler darf nie den Request beeinflussen.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const EXCLUDED_PATHS: RegExp[] = [
  /^\/api\/auth\/refresh$/,        // Token-Rotation, kein fachlicher Schreibvorgang
  /^\/api\/sse\//,                 // Event-Stream
];

export function auditTrail(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  const path = req.originalUrl.split('?')[0];
  if (EXCLUDED_PATHS.some(re => re.test(path))) {
    return next();
  }

  res.on('finish', () => {
    try {
      const status = res.statusCode;
      const shouldLog = (status >= 200 && status < 400) || status === 403;
      if (!shouldLog) return;

      // authenticateToken hat (falls die Route auth hat) bis hierhin
      // req.user gesetzt; bei public Routes bleibt userId null.
      const userId: string | null = (req as any).user?.id ?? (req as any).userId ?? null;

      const details = JSON.stringify({
        method: req.method,
        path,
        status,
        ...(Object.keys(req.params || {}).length > 0 ? { params: req.params } : {}),
      });

      // Direkter Insert (kein AuditAction-Union-Typ): action ist der
      // normalisierte Pfad, damit sich im Log filtern lässt.
      pool.query(
        `INSERT INTO audit_logs (id, user_id, action, details, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          crypto.randomUUID(),
          userId,
          `http.${req.method.toLowerCase()}:${path}`,
          details,
          req.ip || null,
          (req.headers['user-agent'] as string | undefined)?.slice(0, 500) || null,
        ]
      ).catch((err: any) => {
        logger.warn(`Audit-Trail insert failed: ${err.message}`);
      });
    } catch (err: any) {
      logger.warn(`Audit-Trail error: ${err.message}`);
    }
  });

  next();
}
