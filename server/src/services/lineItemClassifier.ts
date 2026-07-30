/**
 * Klassifiziert Rechnungspositionen nach Typ:
 * license | subscription | hardware | service | other (null = unklassifiziert).
 *
 * Signal-Priorität:
 * 1. Explizite Distributor-Signale (Infinigate contractInformationDto):
 *    licenseId → license, Laufzeit → subscription, Seriennummer → hardware
 * 2. Keyword-Heuristik auf Beschreibung/SKU
 *
 * Die Klassifizierung ist eine Vorbelegung — im Review-Dialog korrigierbar.
 */

export type LineItemType = 'license' | 'subscription' | 'hardware' | 'service' | 'other';

const HARDWARE_RE = /firewall|switch(?!.*lizenz)|router|access\s*point|\bap\b|notebook|laptop|\bpc\b|desktop|server(?!\s*(lizenz|cal|abo))|monitor|display|drucker|printer|scanner|\bnas\b|\bssd\b|\bhdd\b|festplatte|appliance|kabel|patchkabel|rack|\busv\b|\bups\b|netzteil|tastatur|maus|dockingstation|docking|thin\s*client|webcam|headset|telefon(?!ie)|smartphone|tablet|toner|speicher|\bram\b|arbeitsspeicher|mainboard|grafikkarte/i;

const SUBSCRIPTION_RE = /\babo\b|subscription|monatlich|j[äa]hrlich|\bmtl\b|renewal|verl[äa]ngerung|laufzeit|\d+\s*(monate|months|jahre|years)|microsoft\s*365|m365|office\s*365|hosting|cloud\s*backup|\bsaas\b|wartungsvertrag|maintenance\s*(plan|agreement)|support\s*(vertrag|plan)/i;

const LICENSE_RE = /lizenz|licen[cs]e|\blic\b|\bnfr\b|perpetual|kauflizenz|volumenlizenz|\bcal\b|client\s*access/i;

const SERVICE_RE = /dienstleistung|installation|einrichtung|konfiguration|consulting|beratung|schulung|migration|stunden(satz)?|arbeitszeit|vor[- ]ort|remote[- ]support|managed\s*service|projektpauschale/i;

export function classifyLineItemType(input: {
  description?: string | null;
  sku?: string | null;
  licenseId?: string | null;
  serialNumber?: string | null;
  hasPeriod?: boolean;
}): LineItemType | null {
  // 1. Explizite Signale
  if (input.licenseId) return 'license';
  if (input.hasPeriod) return 'subscription';
  if (input.serialNumber) return 'hardware';

  // 2. Keywords
  const text = `${input.description || ''} ${input.sku || ''}`;
  if (!text.trim()) return null;

  if (SUBSCRIPTION_RE.test(text)) return 'subscription';
  if (LICENSE_RE.test(text)) return 'license';
  if (HARDWARE_RE.test(text)) return 'hardware';
  if (SERVICE_RE.test(text)) return 'service';

  return null;
}
