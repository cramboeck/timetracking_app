import { describe, it, expect } from 'vitest';
import { toSevdeskHtml } from '../src/utils/sevdeskText';

describe('toSevdeskHtml', () => {
  it('erhält Zeilenumbrüche und Leerzeilen', () => {
    const text = 'Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihr Vertrauen!\n\nHiermit stelle ich Ihnen in Rechnung:';
    expect(toSevdeskHtml(text)).toBe(
      '<p>Sehr geehrte Damen und Herren,<br><br>vielen Dank für Ihr Vertrauen!<br><br>Hiermit stelle ich Ihnen in Rechnung:</p>'
    );
  });

  it('escapet Sonderzeichen (kein HTML aus Freitext)', () => {
    expect(toSevdeskHtml('A & B <script>x</script>')).toBe('<p>A &amp; B &lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('lässt vorhandenes HTML unverändert', () => {
    expect(toSevdeskHtml('<p>Danke</p><p>Gruß</p>')).toBe('<p>Danke</p><p>Gruß</p>');
  });

  it('Windows-Zeilenenden und leere Eingaben', () => {
    expect(toSevdeskHtml('a\r\nb')).toBe('<p>a<br>b</p>');
    expect(toSevdeskHtml('')).toBe('');
    expect(toSevdeskHtml(null)).toBe('');
    expect(toSevdeskHtml('   \n  ')).toBe('');
  });
});
