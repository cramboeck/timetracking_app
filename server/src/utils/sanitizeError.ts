/**
 * Fehlertexte für API-Responses bereinigen: Upstream-Diagnosen (z.B.
 * „NinjaRMM: 401 Unauthorized", „Infinigate-API nicht erreichbar") sind in
 * Toasts gewollt und bleiben erhalten — aber SQL-/Postgres-Interna
 * („column x does not exist", „violates foreign key constraint") verraten
 * Schema-Details an den Client und werden durch einen generischen Text
 * ersetzt. Vollständig geloggt wird der Original-Fehler weiterhin
 * serverseitig (die logger-Aufrufe bleiben unangetastet).
 */

// Muster, an denen man Postgres-/Treiber-Fehler zuverlässig erkennt
const DB_MESSAGE_PATTERNS: RegExp[] = [
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /syntax error at or near/i,
  /violates .*constraint/i,
  /duplicate key value/i,
  /invalid input syntax/i,
  /null value in column/i,
  /operator does not exist/i,
  /permission denied for/i,
  /too long for type/i,
  /deadlock detected/i,
  /connect ECONNREFUSED 127\.0\.0\.1/i,
  /password authentication failed/i,
];

export function sanitizeErrorMessage(error: unknown, fallback = 'Interner Serverfehler'): string {
  const message =
    error instanceof Error ? error.message
    : typeof error === 'string' ? error
    : '';

  if (!message) return fallback;

  // pg-Fehlerobjekte tragen severity + 5-stelligen SQLSTATE-Code
  const code = (error as { code?: unknown } | null)?.code;
  const pgLike = typeof error === 'object' && error !== null
    && 'severity' in error
    && typeof code === 'string'
    && /^[0-9A-Z]{5}$/.test(code);

  if (pgLike || DB_MESSAGE_PATTERNS.some((p) => p.test(message))) {
    return fallback;
  }

  return message;
}
