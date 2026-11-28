/**
 * Nummern-Kontrolle für Rechnungen: sevDesk vergibt die Nummer aus seinem
 * Nummernkreis (RamboFlow vergibt bewusst KEINE eigene — sonst läuft der
 * sevDesk-Zähler auseinander bzw. zwei gleichzeitige Rechnungen kollidieren).
 * Hier wird nur geprüft, ob die vergebene Nummer zur bisherigen Folge passt.
 */
export interface ParsedNumber { prefix: string; num: number; width: number }

/** „RE-1042“ → { prefix: 'RE-', num: 1042, width: 4 }; Nummer = letzte Ziffernfolge */
export function parseInvoiceNumber(value: string | null | undefined): ParsedNumber | null {
  if (!value) return null;
  const m = /^(.*?)(\d+)$/.exec(value.trim());
  if (!m) return null;
  return { prefix: m[1], num: Number(m[2]), width: m[2].length };
}

export interface NumberCheck {
  status: 'ok' | 'gap' | 'duplicate' | 'out_of_order' | 'first' | 'unknown';
  number: string;
  previous: string | null;
  /** fehlende Nummern zwischen previous und number (höchstens 10 aufgelistet) */
  missing: string[];
  missingCount: number;
}

const format = (p: ParsedNumber, num: number) => `${p.prefix}${String(num).padStart(p.width, '0')}`;

export function checkInvoiceNumber(
  newNumber: string,
  newId: string,
  existing: Array<{ id: string; invoiceNumber: string | null }>
): NumberCheck {
  const parsed = parseInvoiceNumber(newNumber);
  const base: NumberCheck = { status: 'unknown', number: newNumber, previous: null, missing: [], missingCount: 0 };
  if (!parsed) return base;

  const others = existing.filter(e => e.id !== newId);
  if (others.some(e => (e.invoiceNumber ?? '').trim() === newNumber.trim())) {
    return { ...base, status: 'duplicate' };
  }

  const sameSeries = others
    .map(e => parseInvoiceNumber(e.invoiceNumber))
    .filter((p): p is ParsedNumber => !!p && p.prefix === parsed.prefix);
  if (sameSeries.length === 0) return { ...base, status: 'first' };

  const max = sameSeries.reduce((a, b) => (b.num > a.num ? b : a));
  const previous = format(max, max.num);
  if (parsed.num === max.num + 1) return { ...base, status: 'ok', previous };
  if (parsed.num <= max.num) return { ...base, status: 'out_of_order', previous };

  const missingCount = parsed.num - max.num - 1;
  const missing: string[] = [];
  for (let n = max.num + 1; n < parsed.num && missing.length < 10; n++) missing.push(format(parsed, n));
  return { ...base, status: 'gap', previous, missing, missingCount };
}
