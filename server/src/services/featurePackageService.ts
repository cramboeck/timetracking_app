import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import type { AuthRequest } from '../middleware/auth';

/**
 * Feature-Pakete pro Nutzer (Adminportal → Features).
 * EINE Definition für /api/features und /api/admin/features.
 */
export const PACKAGES = {
  support: {
    name: 'support',
    label: 'Support Paket',
    description: 'Tickets, Geräte/NinjaRMM, Alerts',
    features: ['tickets', 'devices', 'alerts', 'customer_portal_admin'],
  },
  business: {
    name: 'business',
    label: 'Business Paket',
    description: 'Dashboard, Finanzen, sevDesk, Berichte',
    features: ['dashboard_advanced', 'billing', 'sevdesk', 'reports'],
  },
  agent: {
    name: 'agent',
    label: 'KI-Agent',
    description: 'Claude/MCP-Zugänge und KI-Vorschläge',
    features: ['agent'],
  },
} as const;

export type PackageName = keyof typeof PACKAGES;

export const isPackageName = (name: string): name is PackageName =>
  Object.prototype.hasOwnProperty.call(PACKAGES, name);

/** Ist das Paket für den Nutzer aktiv (eingeschaltet + nicht abgelaufen)? */
export async function userHasPackage(userId: string, packageName: PackageName): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM feature_packages
      WHERE user_id = $1 AND package_name = $2 AND enabled = true
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [userId, packageName]
  );
  return r.rows.length > 0;
}

export const AGENT_PACKAGE_MISSING = 'Der KI-Agent ist für dein Konto nicht freigeschaltet (Adminportal → Features → KI-Agent)';

/** Middleware: Route nur mit aktivem KI-Agent-Paket (gilt für App-Login UND API-Zugang). */
export async function requireAgentPackage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id ?? req.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Nicht angemeldet' });
    if (!(await userHasPackage(userId, 'agent'))) {
      return res.status(403).json({ success: false, error: AGENT_PACKAGE_MISSING, code: 'AGENT_PACKAGE_MISSING' });
    }
    next();
  } catch {
    res.status(500).json({ success: false, error: 'Berechtigung konnte nicht geprüft werden' });
  }
}
