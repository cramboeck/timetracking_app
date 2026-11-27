/**
 * Berechtigungs-Policy für API-Tokens (MCP/KI-Agent) — DENY BY DEFAULT.
 *
 * Ein Token darf NUR die hier gelisteten Endpunkte aufrufen, und jeder
 * Endpunkt verlangt eine Stufe (Scope). Effektive Rechte eines Agenten =
 * Rechte des Users ∩ Scopes des Tokens ∩ diese Liste. Alles andere
 * (Admin, MFA, Token-Verwaltung, Postfächer, Löschen …) ist für Tokens
 * gesperrt, auch wenn der User selbst es dürfte.
 *
 * Neue MCP-Werkzeuge brauchen hier einen Eintrag — bewusst, damit jede
 * Erweiterung der Agenten-Rechte eine sichtbare Code-Änderung ist.
 */

export const API_TOKEN_SCOPES = ['read', 'propose', 'time:write', 'tickets:write'] as const;
export type ApiTokenScope = typeof API_TOKEN_SCOPES[number];

export const API_TOKEN_SCOPE_LABELS: Record<ApiTokenScope, string> = {
  read: 'Lesen (Zeiten, Tickets, Kunden, Abrechnung)',
  propose: 'Vorschläge machen (landen in der Vorschlags-Inbox, du entscheidest)',
  'time:write': 'Zeiten erfassen',
  'tickets:write': 'Tickets kommentieren',
};

interface Rule {
  method: 'GET' | 'POST';
  /** Pfad OHNE /api-Präfix und ohne Query */
  pattern: RegExp;
  scope: ApiTokenScope;
}

const ID = '[A-Za-z0-9_-]{1,64}';

export const API_TOKEN_RULES: readonly Rule[] = [
  // Lesen
  { method: 'GET', pattern: /^\/entries$/, scope: 'read' },
  { method: 'GET', pattern: /^\/projects$/, scope: 'read' },
  { method: 'GET', pattern: /^\/customers$/, scope: 'read' },
  { method: 'GET', pattern: /^\/tickets$/, scope: 'read' },
  { method: 'GET', pattern: new RegExp(`^/tickets/${ID}$`), scope: 'read' },
  { method: 'GET', pattern: /^\/sevdesk\/billing-summary$/, scope: 'read' },
  { method: 'GET', pattern: /^\/sevdesk\/license-expiry$/, scope: 'read' },
  { method: 'GET', pattern: new RegExp(`^/agent/customers/${ID}/briefing$`), scope: 'read' },
  // Vorschläge (Phase B): der Agent schlägt vor, der Mensch übernimmt in der App
  { method: 'POST', pattern: /^\/agent\/proposals$/, scope: 'propose' },
  { method: 'GET', pattern: /^\/agent\/proposals$/, scope: 'propose' },
  // Schreiben (nur Anlegen — nie Ändern/Löschen)
  { method: 'POST', pattern: /^\/entries$/, scope: 'time:write' },
  { method: 'POST', pattern: new RegExp(`^/tickets/${ID}/comments$`), scope: 'tickets:write' },
];

export type PolicyDecision =
  | { allowed: true; scope: ApiTokenScope }
  | { allowed: false; reason: 'not_allowed' | 'missing_scope'; scope?: ApiTokenScope };

/** originalUrl → Pfad ohne /api und Query, ohne abschließenden Slash. */
export function normalizeApiPath(originalUrl: string): string {
  const path = (originalUrl.split('?')[0] || '').replace(/\/+$/, '');
  return path.startsWith('/api/') ? path.slice(4) : path === '/api' ? '/' : path;
}

export function checkApiTokenAccess(method: string, originalUrl: string, scopes: readonly string[]): PolicyDecision {
  const m = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const path = normalizeApiPath(originalUrl);
  // Pfad-Tricks (.., kodierte Slashes) gar nicht erst matchen
  if (path.includes('..') || /%2f|%5c/i.test(path)) return { allowed: false, reason: 'not_allowed' };
  const rule = API_TOKEN_RULES.find(r => r.method === m && r.pattern.test(path));
  if (!rule) return { allowed: false, reason: 'not_allowed' };
  if (!scopes.includes(rule.scope)) return { allowed: false, reason: 'missing_scope', scope: rule.scope };
  return { allowed: true, scope: rule.scope };
}

export const isWriteScope = (s: ApiTokenScope) => s !== 'read';

/**
 * Anfragelimit pro Token (gleitendes Fenster, im Speicher — genügt für eine
 * Instanz). Schützt vor durchdrehenden Agenten-Schleifen.
 */
export const RATE_LIMITS = { totalPerMinute: 120, writesPerMinute: 20 } as const;

export class TokenRateLimiter {
  private hits = new Map<string, { all: number[]; writes: number[] }>();

  /** Liefert Sekunden bis zum nächsten erlaubten Request, oder 0 wenn erlaubt (und zählt dann mit). */
  hit(tokenId: string, isWrite: boolean, now = Date.now()): number {
    const windowStart = now - 60_000;
    const entry = this.hits.get(tokenId) ?? { all: [], writes: [] };
    entry.all = entry.all.filter(t => t > windowStart);
    entry.writes = entry.writes.filter(t => t > windowStart);
    if (entry.all.length >= RATE_LIMITS.totalPerMinute) {
      this.hits.set(tokenId, entry);
      return Math.max(1, Math.ceil((entry.all[0] + 60_000 - now) / 1000));
    }
    if (isWrite && entry.writes.length >= RATE_LIMITS.writesPerMinute) {
      this.hits.set(tokenId, entry);
      return Math.max(1, Math.ceil((entry.writes[0] + 60_000 - now) / 1000));
    }
    entry.all.push(now);
    if (isWrite) entry.writes.push(now);
    this.hits.set(tokenId, entry);
    return 0;
  }
}
