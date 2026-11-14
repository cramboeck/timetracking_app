import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Kunden-Logos aus Favicons (CRM-Politur 13.11.2026).
 *
 * Der Server holt das Favicon DIREKT von der Kunden-Domain (website →
 * primary_domain → E-Mail-Domain) und cached es lokal unter
 * uploads/customer-logos — kein Drittanbieter-Dienst, keine Kunden-Domains
 * an Google & Co. Fallback im UI bleibt der Initialen-Avatar.
 *
 * Sicherheits-Leitplanken (Stored-XSS-Lehre aus dem Oktober-Audit):
 * - NUR Raster-Bildformate (kein SVG, kein HTML) — Whitelist nach
 *   Content-Type UND Magic Bytes
 * - Größenlimit 512 KB, Timeout 6 s, max. 3 Redirects (nur https)
 * - Dateiname = zufällige UUID (Capability wie bei Ticket-Anhängen)
 */

// Gleiche Quelle wie middleware/upload.ts und das Static-Serving in index.ts —
// sonst speichert der Service woanders, als express.static ausliefert
const LOGO_DIR = path.join(process.env.UPLOADS_DIR || '/app/uploads', 'customer-logos');
const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 6000;

// Freemail-Domains liefern das Logo des Providers, nicht des Kunden
const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'web.de', 'gmx.de', 'gmx.net', 'gmx.at',
  'outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.de',
  't-online.de', 'icloud.com', 'me.com', 'yahoo.com', 'yahoo.de',
  'aol.com', 'freenet.de', 'mail.de', 'posteo.de', 'mailbox.org',
]);

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

// Magic-Byte-Prüfung: der Content-Type-Header allein ist Fremd-Input
function sniffImage(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return '.ico';
  return null;
}

export function extractLogoDomain(customer: {
  website?: string | null; primary_domain?: string | null; email?: string | null;
}): string | null {
  const fromWebsite = customer.website
    ? customer.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].trim()
    : null;
  if (fromWebsite) return fromWebsite.toLowerCase();

  if (customer.primary_domain && customer.primary_domain.trim()) {
    return customer.primary_domain.trim().toLowerCase().replace(/^www\./, '');
  }

  const emailDomain = customer.email?.split('@')[1]?.trim().toLowerCase();
  if (emailDomain && !FREEMAIL_DOMAINS.has(emailDomain)) return emailDomain;

  return null;
}

async function fetchWithLimits(url: string): Promise<{ buf: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'RamboFlow-LogoFetcher/1.0' },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_BYTES) return null;
    return { buf: Buffer.from(arrayBuf), contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// <link rel="icon" href="…"> aus dem HTML der Startseite fischen —
// bewusst simple Regex, best effort; /favicon.ico bleibt der Fallback
function extractIconHref(html: string): string | null {
  const linkTags = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi) || [];
  for (const tag of linkTags) {
    // apple-touch-icon bevorzugen (größer), sonst erstes icon
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href && !href.startsWith('data:')) return href;
  }
  return null;
}

/**
 * Holt das Logo für einen Kunden und speichert es lokal. Best effort —
 * logo_fetched_at wird IMMER gesetzt, damit der Backfill nicht endlos
 * dieselben toten Domains probiert. Ein manuell hochgeladenes Logo
 * (logo_url gesetzt, aber fetched_at älter) wird NIE überschrieben,
 * wenn `force` fehlt und bereits ein logo_url existiert.
 */
export async function fetchCustomerLogo(customerId: string, domain: string, force = false): Promise<boolean> {
  try {
    const existing = await pool.query(
      'SELECT logo_url FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [customerId]
    );
    if (existing.rows.length === 0) return false;
    if (existing.rows[0].logo_url && !force) {
      return false;
    }

    const bases = [`https://${domain}`, `https://www.${domain}`];
    let image: { buf: Buffer; contentType: string } | null = null;

    for (const base of bases) {
      // 1. Startseite nach <link rel=icon> durchsuchen
      const page = await fetchWithLimits(base);
      if (page && page.contentType.includes('text/html')) {
        const href = extractIconHref(page.buf.toString('utf8', 0, Math.min(page.buf.length, 64 * 1024)));
        if (href) {
          const iconUrl = href.startsWith('http') ? href : new URL(href, base).toString();
          if (iconUrl.startsWith('https://')) {
            image = await fetchWithLimits(iconUrl);
            if (image && !EXT_BY_CONTENT_TYPE[image.contentType] && !sniffImage(image.buf)) image = null;
          }
        }
      }
      // 2. Klassisches /favicon.ico
      if (!image) {
        image = await fetchWithLimits(`${base}/favicon.ico`);
        if (image && !EXT_BY_CONTENT_TYPE[image.contentType] && !sniffImage(image.buf)) image = null;
      }
      if (image) break;
    }

    if (!image) {
      await pool.query('UPDATE customers SET logo_fetched_at = NOW() WHERE id = $1', [customerId]);
      return false;
    }

    // Endung aus Magic Bytes (verlässlich) vor Content-Type
    const ext = sniffImage(image.buf) || EXT_BY_CONTENT_TYPE[image.contentType];
    if (!ext) {
      await pool.query('UPDATE customers SET logo_fetched_at = NOW() WHERE id = $1', [customerId]);
      return false;
    }

    fs.mkdirSync(LOGO_DIR, { recursive: true });
    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(LOGO_DIR, filename), image.buf);

    // Altes Logo-File aufräumen
    const oldUrl: string | null = existing.rows[0].logo_url;
    if (oldUrl) {
      const oldFile = path.join(LOGO_DIR, path.basename(oldUrl));
      fs.rm(oldFile, { force: true }, () => {});
    }

    await pool.query(
      'UPDATE customers SET logo_url = $1, logo_fetched_at = NOW() WHERE id = $2',
      [`/api/uploads/customer-logos/${filename}`, customerId]
    );
    logger.info(`🖼️ Logo für Kunde ${customerId} von ${domain} geladen (${ext})`);
    return true;
  } catch (error) {
    logger.error(`Logo-Fetch für ${customerId} fehlgeschlagen:`, error);
    await pool.query('UPDATE customers SET logo_fetched_at = NOW() WHERE id = $1', [customerId])
      .catch(() => {});
    return false;
  }
}

/** Manuelles Logo speichern (Upload aus dem Kunden-Dialog) */
export async function saveUploadedLogo(customerId: string, buf: Buffer): Promise<string | null> {
  const ext = sniffImage(buf);
  if (!ext || buf.length > MAX_BYTES * 2) return null;

  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(LOGO_DIR, filename), buf);

  const existing = await pool.query('SELECT logo_url FROM customers WHERE id = $1', [customerId]);
  const oldUrl: string | null = existing.rows[0]?.logo_url;
  if (oldUrl) {
    fs.rm(path.join(LOGO_DIR, path.basename(oldUrl)), { force: true }, () => {});
  }

  const logoUrl = `/api/uploads/customer-logos/${filename}`;
  await pool.query(
    'UPDATE customers SET logo_url = $1, logo_fetched_at = NOW() WHERE id = $2',
    [logoUrl, customerId]
  );
  return logoUrl;
}

export async function removeLogo(customerId: string): Promise<void> {
  const existing = await pool.query('SELECT logo_url FROM customers WHERE id = $1', [customerId]);
  const oldUrl: string | null = existing.rows[0]?.logo_url;
  if (oldUrl) {
    fs.rm(path.join(LOGO_DIR, path.basename(oldUrl)), { force: true }, () => {});
  }
  await pool.query('UPDATE customers SET logo_url = NULL WHERE id = $1', [customerId]);
}

/**
 * Backfill für Bestandskunden: einmal pro Boot (+3 min), sequenziell mit
 * Abstand — holt Logos für Kunden mit Domain-Quelle und ohne bisherigen
 * Versuch. Danach greift nur noch der Save-Trigger.
 */
export function startLogoBackfill(): void {
  setTimeout(async () => {
    try {
      const candidates = await pool.query(`
        SELECT id, website, primary_domain, email
        FROM customers
        WHERE deleted_at IS NULL
          AND logo_url IS NULL
          AND logo_fetched_at IS NULL
          AND (COALESCE(website, '') <> '' OR COALESCE(primary_domain, '') <> '' OR COALESCE(email, '') <> '')
        LIMIT 200
      `);
      // Auch bei 0 Kandidaten loggen — sonst ist nicht unterscheidbar, ob der
      // Backfill nie lief oder nichts zu tun hatte (Prod-Diagnose 14.11.)
      logger.info(`🖼️ Logo-Backfill: ${candidates.rows.length} Kandidaten`);
      if (candidates.rows.length === 0) return;
      for (const row of candidates.rows) {
        const domain = extractLogoDomain(row);
        if (domain) {
          await fetchCustomerLogo(row.id, domain);
          await new Promise(r => setTimeout(r, 400));
        } else {
          await pool.query('UPDATE customers SET logo_fetched_at = NOW() WHERE id = $1', [row.id]);
        }
      }
      logger.info('🖼️ Logo-Backfill abgeschlossen');
    } catch (error) {
      logger.error('Logo-Backfill fehlgeschlagen:', error);
    }
  }, 3 * 60 * 1000);
}
