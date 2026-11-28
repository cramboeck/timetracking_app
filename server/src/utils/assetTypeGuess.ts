/**
 * Geräte-Typ aus einer Artikelbezeichnung raten (Wareneingang, WE-2).
 * Nur Vorbelegung — im Dialog änderbar. Reihenfolge = Spezifisches zuerst.
 */
const RULES: Array<[RegExp, string]> = [
  [/\b(firewall|fortigate|fortiwifi|sophos\s*(xgs?|sg)|watchguard|sonicwall|zyxel\s*usg)\b/i, 'firewall'],
  [/\b(nas|synology|diskstation|qnap|rackstation)\b/i, 'storage'],
  [/\b(drucker|printer|laserjet|officejet|multifunktion|mfp|kyocera|ecosys|brother\s*(mfc|hl|dcp))\b/i, 'printer'],
  [/\b(monitor|bildschirm|display|p2[0-9]{3}h?|u2[0-9]{3})\b/i, 'monitor'],
  [/\b(switch|router|access\s*point|unifi|fritz!?box|aruba|meraki)\b/i, 'network'],
  [/\b(iphone|smartphone|galaxy\s*[sa]\d|pixel\s*\d|handy)\b/i, 'mobile'],
  [/\b(ipad|tablet)\b/i, 'mobile'],
  [/\b(telefon|tischtelefon|yealink|snom|gigaset|voip)\b/i, 'phone'],
  [/\b(server|poweredge|proliant|primergy)\b/i, 'server'],
  [/\b(notebook|laptop|thinkpad|elitebook|probook|latitude|vostro|macbook|surface\s*(pro|laptop)|zenbook|vivobook|ideapad|travelmate)\b/i, 'laptop'],
  [/\b(optiplex|thinkcentre|prodesk|elitedesk|imac|mac\s*mini|desktop|workstation|tower|mini[- ]?pc|nuc)\b/i, 'workstation'],
];

export function guessAssetType(description: string | null | undefined): string {
  const d = description ?? '';
  for (const [re, type] of RULES) if (re.test(d)) return type;
  return 'other';
}

/** Zeilen, bei denen der Wareneingang Seriennummern abfragt: Hardware-Klassifizierung
 *  oder erkennbarer Gerätetyp. Lizenzen/Dienstleistungen nie. */
export function lineNeedsSerials(itemType: string | null | undefined, description: string | null | undefined): boolean {
  if (itemType === 'license' || itemType === 'subscription' || itemType === 'service') return false;
  if (itemType === 'hardware') return true;
  return guessAssetType(description) !== 'other';
}
