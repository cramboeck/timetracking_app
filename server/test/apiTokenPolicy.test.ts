import { describe, expect, it } from 'vitest';
import { checkApiTokenAccess, normalizeApiPath, TokenRateLimiter, RATE_LIMITS } from '../src/utils/apiTokenPolicy';

const ALL = ['read', 'propose', 'time:write', 'tickets:write'];

describe('apiTokenPolicy: Pfad-Normalisierung', () => {
  it('entfernt /api, Query und Slash am Ende', () => {
    expect(normalizeApiPath('/api/entries?page=1&limit=5')).toBe('/entries');
    expect(normalizeApiPath('/api/tickets/abc/')).toBe('/tickets/abc');
  });
});

describe('apiTokenPolicy: erlaubte Endpunkte (MCP-Werkzeuge)', () => {
  it.each([
    ['GET', '/api/entries?startDate=x'],
    ['GET', '/api/projects'],
    ['GET', '/api/customers'],
    ['GET', '/api/tickets?page=1'],
    ['GET', '/api/tickets/2f1c9a3e-1111-4c4c-9999-123456789abc'],
    ['GET', '/api/sevdesk/billing-summary?startDate=2026-10-01'],
    ['GET', '/api/sevdesk/license-expiry?days=60'],
    ['HEAD', '/api/projects'],
    ['GET', '/api/agent/customers/abc-123/briefing'],
  ])('%s %s mit read', (m, p) => {
    expect(checkApiTokenAccess(m, p, ['read']).allowed).toBe(true);
  });

  it('POST /entries braucht time:write', () => {
    expect(checkApiTokenAccess('POST', '/api/entries', ['read'])).toEqual({ allowed: false, reason: 'missing_scope', scope: 'time:write' });
    expect(checkApiTokenAccess('POST', '/api/entries', ['read', 'time:write']).allowed).toBe(true);
  });

  it('Kommentar braucht tickets:write', () => {
    expect(checkApiTokenAccess('POST', '/api/tickets/abc/comments', ['read', 'time:write']).allowed).toBe(false);
    expect(checkApiTokenAccess('POST', '/api/tickets/abc/comments', ALL).allowed).toBe(true);
  });

  it('Vorschläge brauchen propose', () => {
    expect(checkApiTokenAccess('POST', '/api/agent/proposals', ['read']).allowed).toBe(false);
    expect(checkApiTokenAccess('POST', '/api/agent/proposals', ['read', 'propose']).allowed).toBe(true);
    expect(checkApiTokenAccess('GET', '/api/agent/proposals?status=pending', ['read', 'propose']).allowed).toBe(true);
  });

  it('Lesen ohne read-Stufe ist gesperrt', () => {
    expect(checkApiTokenAccess('GET', '/api/entries', ['time:write']).allowed).toBe(false);
  });
});

describe('apiTokenPolicy: alles andere ist gesperrt (deny by default)', () => {
  it.each([
    ['POST', '/api/auth/api-tokens'],          // keine Selbst-Ausstellung neuer Zugänge
    ['POST', '/api/agent/proposals/abc/approve-invoice'], // Rechnung nur in der App übernehmen
    ['POST', '/api/sevdesk/create-invoice'],   // nie selbst Rechnungen anlegen
    ['GET', '/api/auth/api-tokens'],
    ['DELETE', '/api/auth/api-tokens/x'],
    ['DELETE', '/api/entries/abc'],            // nie löschen
    ['PUT', '/api/entries/abc'],               // nie ändern
    ['PUT', '/api/tickets/abc'],
    ['DELETE', '/api/tickets/abc'],
    ['POST', '/api/tickets'],                  // (noch) keine Tickets anlegen
    ['GET', '/api/admin/users'],
    ['GET', '/api/mfa/status'],
    ['GET', '/api/microsoft365/support-inbox'],
    ['GET', '/api/user/export'],
    ['POST', '/api/sevdesk/invoices'],
    ['GET', '/api/tickets/abc/attachments'],
    ['GET', '/api/entries/team'],
    ['POST', '/api/agent/proposals/abc/reject'],   // Agent entscheidet nie selbst
    ['POST', '/api/agent/proposals/abc/approve'],
    ['GET', '/api/agent/proposals/count'],
    ['GET', '/api/agent/customers/abc/notes'],     // Absprachen nur über das Briefing
    ['POST', '/api/agent/customers/abc/notes'],
    ['GET', '/api/tickets/../admin/users'],
    ['GET', '/api/tickets/a%2Fb'],
  ])('%s %s', (m, p) => {
    expect(checkApiTokenAccess(m, p, ALL).allowed).toBe(false);
  });
});

describe('TokenRateLimiter', () => {
  it('begrenzt Schreibzugriffe pro Minute', () => {
    const l = new TokenRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.writesPerMinute; i++) expect(l.hit('a', true, t0 + i)).toBe(0);
    expect(l.hit('a', true, t0 + 100)).toBeGreaterThan(0);
    // Lesen geht weiter, anderer Token unbeeinflusst
    expect(l.hit('a', false, t0 + 100)).toBe(0);
    expect(l.hit('b', true, t0 + 100)).toBe(0);
    // nach einer Minute wieder frei
    expect(l.hit('a', true, t0 + 61_000)).toBe(0);
  });

  it('begrenzt Gesamtanfragen pro Minute', () => {
    const l = new TokenRateLimiter();
    for (let i = 0; i < RATE_LIMITS.totalPerMinute; i++) expect(l.hit('x', false, 5_000 + i)).toBe(0);
    expect(l.hit('x', false, 5_500)).toBeGreaterThan(0);
  });
});
