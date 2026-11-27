/**
 * sevDesk-Felder `headText`/`footText` sind HTML („Certain html tags can be
 * used here to format your text“). Reiner Text mit \n verlor im PDF alle
 * Zeilenumbrüche und Leerzeilen. Diese Funktion macht aus Klartext sicheres
 * HTML: Sonderzeichen escapen, jede Zeile per <br> — Leerzeilen bleiben als
 * eigene Zeile erhalten.
 *
 * Text, der schon HTML ist (z.B. ein aus sevDesk geladener Angebotstext),
 * bleibt unverändert, damit nichts doppelt umgewandelt wird.
 */
const HTML_TAG = /<\/?(p|br|b|strong|i|em|u|ul|ol|li|span|div)\b[^>]*>/i;

export function toSevdeskHtml(text: string | null | undefined): string {
  if (!text) return '';
  if (HTML_TAG.test(text)) return text;
  const escaped = text
    .replace(/\r\n?/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
  if (!escaped) return '';
  return `<p>${escaped.split('\n').join('<br>')}</p>`;
}
