/**
 * API-Zugänge für den KI-Agenten (MCP) — Phase A Agenten-Sicherheit.
 */
import { authFetch } from './base';

export type ApiTokenScope = 'read' | 'time:write' | 'tickets:write';

export const API_TOKEN_SCOPE_INFO: Record<ApiTokenScope, { label: string; hint: string }> = {
  read: { label: 'Lesen', hint: 'Zeiten, Tickets, Kunden, Projekte, Abrechnung, Lizenzablauf' },
  'time:write': { label: 'Zeiten erfassen', hint: 'Neue Zeiteinträge anlegen – nie ändern oder löschen' },
  'tickets:write': { label: 'Tickets kommentieren', hint: 'Notizen/Kommentare an Tickets schreiben' },
};

export interface ApiTokenInfo {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiTokenScope[];
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
  expired: boolean;
  userId: string;
  userName: string | null;
  requestsLast30d: number;
}

export interface ApiTokenRequestLog {
  method: string;
  path: string;
  status: number;
  durationMs: number | null;
  ip: string | null;
  client: string | null;
  createdAt: string;
}

export const apiTokensApi = {
  list: async (scope: 'mine' | 'org' = 'mine'): Promise<{ success: boolean; data: ApiTokenInfo[] }> =>
    authFetch(`/auth/api-tokens${scope === 'org' ? '?scope=org' : ''}`),
  create: async (input: { name: string; scopes: ApiTokenScope[]; expiresInDays: number }): Promise<{ success: boolean; data: ApiTokenInfo & { token: string } }> =>
    authFetch('/auth/api-tokens', { method: 'POST', body: JSON.stringify(input) }),
  revoke: async (id: string): Promise<{ success: boolean }> =>
    authFetch(`/auth/api-tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  requests: async (id: string): Promise<{ success: boolean; data: ApiTokenRequestLog[] }> =>
    authFetch(`/auth/api-tokens/${encodeURIComponent(id)}/requests`),
};
