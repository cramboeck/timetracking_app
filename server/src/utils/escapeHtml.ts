/**
 * HTML-Escaping für Benachrichtigungs-Mails: User-/Fremd-Input (Ticket-Titel
 * aus externen E-Mails, Portal-Kommentare, Lizenz-Anfrage-Texte) darf nie
 * ungeescaped in Mail-HTML interpoliert werden — sonst landet
 * Angreifer-kontrolliertes Phishing-HTML in vertrauenswürdigen System-Mails.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
