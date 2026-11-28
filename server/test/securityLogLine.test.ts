import { describe, it, expect } from 'vitest';
import { formatSecurityLogLine } from '../src/utils/securityLogLine';

const now = new Date('2026-11-28T12:00:00.000Z');

describe('formatSecurityLogLine', () => {
  it('normale Zeile', () => {
    expect(formatSecurityLogLine('AUTH_FAILED', '93.255.126.120', 'portal:max@firma.de', now))
      .toBe('[2026-11-28T12:00:00.000Z] AUTH_FAILED ip=93.255.126.120 user=portal:max@firma.de\n');
  });
  it('Zeilenumbruch im Benutzernamen kann keine zweite Zeile erzeugen', () => {
    const line = formatSecurityLogLine('AUTH_FAILED', '1.2.3.4', 'x\n[2026-11-28T12:00:00.000Z] AUTH_FAILED ip=9.9.9.9 user=y', now);
    expect(line.split('\n').filter(Boolean)).toHaveLength(1);
    expect(line.startsWith('[2026-11-28T12:00:00.000Z] AUTH_FAILED ip=1.2.3.4 user=x?')).toBe(true);
  });
  it('Unicode-Zeilentrenner und Leerzeichen werden entschärft', () => {
    const line = formatSecurityLogLine('AUTH_FAILED', '1.2.3.4', 'a b c\rd', now);
    expect(line).toContain('user=a?b_c?d\n');
  });
  it('ungültige IP → unknown, IPv4-mapped wird entpackt, IPv6 bleibt', () => {
    expect(formatSecurityLogLine('AUTH_FAILED', '1.2.3.4 user=evil', 'u', now)).toContain('ip=unknown ');
    expect(formatSecurityLogLine('AUTH_FAILED', '::ffff:1.2.3.4', 'u', now)).toContain('ip=1.2.3.4 ');
    expect(formatSecurityLogLine('AUTH_SUCCESS', '2a01:4f8::1', 'u', now)).toContain('ip=2a01:4f8::1 ');
  });
  it('lange/leere Namen', () => {
    expect(formatSecurityLogLine('AUTH_FAILED', '1.2.3.4', 'a'.repeat(500), now).length).toBeLessThan(260);
    expect(formatSecurityLogLine('AUTH_FAILED', '1.2.3.4', '', now)).toContain('user=-\n');
  });
});
