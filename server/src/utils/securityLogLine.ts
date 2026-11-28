import net from 'net';

/**
 * Eine Zeile für security.log. Die Datei wird von CrowdSec (früher Fail2Ban)
 * ausgewertet — Benutzername und IP kommen aus der Anfrage und dürfen daher
 * KEINE Zeilenumbrüche/Steuerzeichen enthalten, sonst könnte ein Angreifer
 * über das Login-Formular gefälschte Zeilen („AUTH_FAILED ip=<fremde IP>“)
 * einschleusen und fremde IPs sperren lassen.
 */
export function formatSecurityLogLine(event: 'AUTH_FAILED' | 'AUTH_SUCCESS', ip: string, username: string, now = new Date()): string {
  const cleanIp = net.isIP(String(ip ?? '').replace(/^::ffff:/, '')) ? String(ip).replace(/^::ffff:/, '') : 'unknown';
  const cleanUser = String(username ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '?')
    .replace(/\s+/g, '_')
    .slice(0, 200) || '-';
  return `[${now.toISOString()}] ${event} ip=${cleanIp} user=${cleanUser}\n`;
}
