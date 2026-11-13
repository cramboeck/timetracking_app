import crypto from 'crypto';

/**
 * Einweg-Hash für Reset-/Einladungs-Tokens: In der DB liegt nur der
 * SHA-256-Hash, der Klartext-Token existiert ausschließlich im Mail-Link
 * (bzw. der Create-Response für den Clipboard-Fallback). Ein DB-Leak
 * (Backup, SQL-Injection, Log) gibt damit keine verwendbaren Links mehr her.
 *
 * SHA-256 statt bcrypt ist hier richtig: die Tokens sind lange Zufallswerte
 * (UUID/randomBytes), kein Brute-Force-Ziel — und der Lookup läuft per
 * WHERE token = $1, braucht also einen deterministischen Hash.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
