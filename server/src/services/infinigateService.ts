import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query } from '../config/database';
import { customerMatchingService } from './customerMatchingService';
import { classifyLineItemType } from './lineItemClassifier';
import { logger } from '../utils/logger';

/**
 * Infinigate Reseller API Integration.
 *
 * Quelle: offizielles Reseller-StarterKit (OpenAPI-Spec + Postman-Collection).
 * - Auth: POST /authorization/token (form-urlencoded, grant_type=client_credentials)
 *   mit zusätzlichem API-KEY Header (Azure APIM Subscription Key).
 * - Jeder Request braucht BEIDE: API-KEY Header + Authorization: Bearer <token>.
 * - Lizenz-Sicht: Es gibt keinen eigenen Lizenz-Endpoint. Die PurchaseInvoices
 *   liefern pro Zeile endCustomerDto (Endkunde!) und contractInformationDto
 *   (licenseId, serialNumber, StartDate/EndDate, term) — daraus speisen wir
 *   invoice_line_items (Epic-G-Modell: Matching, Rebilling, CRM-Lizenzen-Tab).
 */

const BASE_URLS: Record<string, string> = {
  production: 'https://api.infinigate.com',
  test: 'https://infapi-test.azure-api.net',
};

export interface InfinigateConfig {
  userId: string;
  clientId: string | null;
  clientSecret: string | null;
  apiKey: string | null;
  environment: 'production' | 'test';
  autoSync: boolean;
  lastSyncAt: Date | null;
}

export async function getConfig(userId: string): Promise<InfinigateConfig | null> {
  const result = await query(
    `SELECT user_id, client_id, client_secret, api_key, environment, auto_sync, last_sync_at
     FROM infinigate_config WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    userId: row.user_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    apiKey: row.api_key,
    environment: row.environment,
    autoSync: row.auto_sync,
    lastSyncAt: row.last_sync_at,
  };
}

export async function saveConfig(
  userId: string,
  data: { clientId?: string; clientSecret?: string; apiKey?: string; environment?: 'production' | 'test'; autoSync?: boolean }
): Promise<void> {
  await query(
    `INSERT INTO infinigate_config (user_id, client_id, client_secret, api_key, environment, auto_sync, updated_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'production'), COALESCE($6, false), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       client_id = COALESCE($2, infinigate_config.client_id),
       client_secret = COALESCE($3, infinigate_config.client_secret),
       api_key = COALESCE($4, infinigate_config.api_key),
       environment = COALESCE($5, infinigate_config.environment),
       auto_sync = COALESCE($6, infinigate_config.auto_sync),
       updated_at = NOW()`,
    [userId, data.clientId ?? null, data.clientSecret ?? null, data.apiKey ?? null, data.environment ?? null, data.autoSync ?? null]
  );
  // Credentials geändert → gecachtes Token verwerfen
  tokenCache.delete(userId);
}

function isConfigured(config: InfinigateConfig | null): config is InfinigateConfig {
  return !!(config && config.clientId && config.clientSecret && config.apiKey);
}

// ─── Token-Handling ─────────────────────────────────────────────────────────
// In-Memory-Cache pro User. TTL kommt aus expires_in der Token-Response
// (defensiv geparst — die Spec dokumentiert das Response-Format nicht),
// Fallback 55 Minuten. Bei 401 wird der Cache geleert und einmal neu geholt.

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(config: InfinigateConfig): Promise<string> {
  const cached = tokenCache.get(config.userId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const baseUrl = BASE_URLS[config.environment];
  const body = new URLSearchParams({
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
    grant_type: 'client_credentials',
  });

  const response = await fetch(`${baseUrl}/authorization/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'API-KEY': config.apiKey!,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Infinigate Token-Request fehlgeschlagen: ${response.status} ${text.slice(0, 200)}`);
  }

  const data: any = await response.json().catch(() => null);
  const token: string | undefined = data?.access_token || data?.accessToken || data?.token;
  if (!token) {
    throw new Error('Infinigate Token-Response enthielt kein access_token');
  }
  const expiresInSec = Number(data?.expires_in) > 0 ? Number(data.expires_in) : 55 * 60;
  tokenCache.set(config.userId, { token, expiresAt: Date.now() + expiresInSec * 1000 });
  return token;
}

async function infinigateFetch(
  config: InfinigateConfig,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
  retried = false
): Promise<any> {
  const baseUrl = BASE_URLS[config.environment];
  const token = await getToken(config);

  const response = await fetch(`${baseUrl}${path}`, {
    method: init?.method || 'GET',
    headers: {
      'API-KEY': config.apiKey!,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (response.status === 401 && !retried) {
    // Token abgelaufen/ungültig → einmal frisch holen und wiederholen
    tokenCache.delete(config.userId);
    return infinigateFetch(config, path, init, true);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Infinigate API ${path}: ${response.status} ${text.slice(0, 300)}`);
  }

  return response.json();
}

// ─── PDF-Download (Beleg-Datei für sevDesk-Erfassung) ───────────────────────
// Die Overview liefert pro Rechnung ein pdfDocumentGuid — der Download-
// Endpoint ist im StarterKit aber nicht dokumentiert. Deshalb (NinjaOne-
// Lehre): Kandidaten-Liste, die gegen die echte API probiert wird; der
// erste Treffer wird gemerkt. debug/pdf macht die Probe sichtbar.

async function infinigateFetchBinary(
  config: InfinigateConfig,
  apiPath: string,
  retried = false
): Promise<{ status: number; contentType: string; buffer: Buffer }> {
  const baseUrl = BASE_URLS[config.environment];
  const token = await getToken(config);
  const response = await fetch(`${baseUrl}${apiPath}`, {
    headers: {
      'API-KEY': config.apiKey!,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/pdf, application/octet-stream, */*',
    },
  });
  if (response.status === 401 && !retried) {
    tokenCache.delete(config.userId);
    return infinigateFetchBinary(config, apiPath, true);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    buffer: Buffer.from(arrayBuffer),
  };
}

// Kandidaten als Funktionen (documentGuid, pdfDocumentGuid) → Pfad.
// Runde 1 (6 Pfade mit /pdf, /document(s), document-management) war komplett
// 404 „Resource not found" (APIM-Gateway: Route existiert nicht im Produkt).
// Runde 2: pdfDocumentGuid ist vermutlich ein ZWEITES Dokument im selben
// Store — daher der normale purchaseinvoice-Endpoint mit der PDF-GUID
// (das mimeType-Feld der Overview ist per Dokument!), plus Format-Varianten.
const PDF_ENDPOINT_CANDIDATES: Array<{ label: string; build: (dg: string, pg: string) => string }> = [
  { label: 'purchaseinvoice/{pdfDocumentGuid}', build: (_dg, pg) => `/invoice-management/v2/purchaseinvoice/${pg}` },
  { label: 'purchaseinvoice/{documentGuid} (Accept pdf)', build: (dg) => `/invoice-management/v2/purchaseinvoice/${dg}` },
  { label: 'purchaseinvoice/{documentGuid}?format=pdf', build: (dg) => `/invoice-management/v2/purchaseinvoice/${dg}?format=pdf` },
  { label: 'purchaseinvoice/{documentGuid}/document', build: (dg) => `/invoice-management/v2/purchaseinvoice/${dg}/document` },
  { label: 'purchaseinvoicepdf/{pdfDocumentGuid}', build: (_dg, pg) => `/invoice-management/v2/purchaseinvoicepdf/${pg}` },
  { label: 'invoice-management/v2/pdf/{pdfDocumentGuid}', build: (_dg, pg) => `/invoice-management/v2/pdf/${pg}` },
  { label: 'invoice-management/v1/purchaseinvoice/{documentGuid}/pdf', build: (dg) => `/invoice-management/v1/purchaseinvoice/${dg}/pdf` },
];

const isPdfBuffer = (buffer: Buffer): boolean => buffer.subarray(0, 5).toString('latin1').startsWith('%PDF');

// Manche Dokument-APIs liefern das PDF als JSON mit Base64-Feld — alle
// String-Properties (bis Tiefe 2) auf dekodierbares %PDF prüfen.
function extractPdfFromJson(buffer: Buffer): Buffer | null {
  let parsed: any;
  try { parsed = JSON.parse(buffer.toString('utf8')); } catch { return null; }
  const scan = (obj: any, depth: number): Buffer | null => {
    if (obj == null || depth > 2) return null;
    if (typeof obj === 'string' && obj.length > 500) {
      try {
        const decoded = Buffer.from(obj, 'base64');
        if (isPdfBuffer(decoded)) return decoded;
      } catch { /* kein Base64 */ }
      return null;
    }
    if (typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        const hit = scan(value, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  return scan(parsed, 0);
}

// Index des zuletzt funktionierenden Kandidaten (pro Prozess gecacht)
let workingPdfCandidate: number | null = null;

async function tryDownloadPdf(
  config: InfinigateConfig,
  documentGuid: string,
  pdfDocumentGuid: string | null
): Promise<Buffer | null> {
  const order = workingPdfCandidate !== null
    ? [workingPdfCandidate, ...PDF_ENDPOINT_CANDIDATES.map((_, i) => i).filter((i) => i !== workingPdfCandidate)]
    : PDF_ENDPOINT_CANDIDATES.map((_, i) => i);
  for (const idx of order) {
    const candidate = PDF_ENDPOINT_CANDIDATES[idx];
    const pg = pdfDocumentGuid || documentGuid;
    try {
      const result = await infinigateFetchBinary(config, candidate.build(documentGuid, pg));
      if (result.status === 200 && isPdfBuffer(result.buffer)) {
        workingPdfCandidate = idx;
        return result.buffer;
      }
      if (result.status === 200) {
        const embedded = extractPdfFromJson(result.buffer);
        if (embedded) {
          workingPdfCandidate = idx;
          return embedded;
        }
      }
    } catch {
      // Kandidat nicht erreichbar → nächsten probieren
    }
  }
  return null;
}

// Probe für debug/pdf: alle Kandidaten gegen die erste Rechnung, Ergebnis je Kandidat
export async function probePdfEndpoints(userId: string): Promise<any> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) {
    throw new Error('Infinigate ist nicht vollständig konfiguriert');
  }
  const overview = await infinigateFetch(config, '/invoice-management/v2/purchaseinvoice?Take=1&Skip=0');
  const first = overview?.result?.[0];
  if (!first?.documentGuid) return { error: 'Keine Rechnung in der Overview' };
  const pg = first.pdfDocumentGuid || first.documentGuid;
  const results = [];
  for (const candidate of PDF_ENDPOINT_CANDIDATES) {
    try {
      const r = await infinigateFetchBinary(config, candidate.build(first.documentGuid, pg));
      const embedded = r.status === 200 && !isPdfBuffer(r.buffer) ? extractPdfFromJson(r.buffer) : null;
      results.push({
        candidate: candidate.label,
        status: r.status,
        contentType: r.contentType,
        bytes: r.buffer.length,
        isPdf: isPdfBuffer(r.buffer),
        hasEmbeddedBase64Pdf: !!embedded,
        bodyPreview: isPdfBuffer(r.buffer) ? '%PDF…' : r.buffer.subarray(0, 160).toString('utf8'),
      });
    } catch (err: any) {
      results.push({ candidate: candidate.label, error: String(err.message).slice(0, 200) });
    }
  }
  // envelope des Details nie angeschaut — könnte den Dokument-Verweis tragen
  let envelope: any = null;
  try {
    const detail = await infinigateFetch(config, `/invoice-management/v2/purchaseinvoice/${first.documentGuid}`);
    envelope = describeStructure(detail?.envelope);
  } catch { /* nur Diagnose */ }
  return { invoice: first.documentNumber, hasPdfDocumentGuid: !!first.pdfDocumentGuid, results, envelope };
}

// Gleiche Ablage wie der E-Mail-/Upload-Weg (invoiceProcessorService):
// /app/uploads/invoices/<orgId>/<uuid>.pdf + invoice_documents-Zeile +
// document_ids/attachment_count am Beleg — damit funktionieren Vorschau
// und sevDesk-Upload beim Bestätigen unverändert.
const invoiceUploadDir = (): string =>
  process.env.NODE_ENV === 'production' ? '/app/uploads/invoices' : path.join(__dirname, '../../uploads/invoices');

export async function attachPdfToInvoice(
  organizationId: string,
  processedInvoiceId: string,
  documentNumber: string | null,
  buffer: Buffer
): Promise<void> {
  const orgDir = path.join(invoiceUploadDir(), organizationId);
  await fs.promises.mkdir(orgDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.pdf`;
  const storagePath = path.join(orgDir, filename);
  await fs.promises.writeFile(storagePath, buffer);

  const docId = crypto.randomUUID();
  await query(
    `INSERT INTO invoice_documents (
      id, organization_id, processed_invoice_id, filename, original_filename,
      mime_type, size, storage_path, created_at
    ) VALUES ($1, $2, $3, $4, $5, 'application/pdf', $6, $7, NOW())`,
    [docId, organizationId, processedInvoiceId, filename, `Infinigate_${documentNumber || processedInvoiceId}.pdf`, buffer.length, storagePath]
  );
  await query(
    `UPDATE processed_invoices
     SET document_ids = $1::jsonb, attachment_count = 1
     WHERE id = $2`,
    [JSON.stringify([docId]), processedInvoiceId]
  );
}

// Backfill: PDFs für bereits importierte Infinigate-Belege ohne Dokument
// nachladen. Overview (12 Monate) liefert die GUID-Zuordnung.
export async function fetchMissingInvoicePdfs(userId: string): Promise<{ checked: number; downloaded: number; failed: number; errors: string[] }> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) {
    throw new Error('Infinigate ist nicht vollständig konfiguriert');
  }
  const orgResult = await query(
    'SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const organizationId: string | undefined = orgResult.rows[0]?.organization_id;
  if (!organizationId) throw new Error('Keine Organisation für User gefunden');

  // GUID → pdfDocumentGuid/documentNumber aus der Overview der letzten 12 Monate
  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const overviewByGuid = new Map<string, { pdfDocumentGuid: string | null; documentNumber: string | null }>();
  for (let skip = 0; ; skip += 50) {
    const page = await infinigateFetch(
      config,
      `/invoice-management/v2/purchaseinvoice?PeriodStart=${encodeURIComponent(since)}&Take=50&Skip=${skip}`
    );
    const rows: any[] = page?.result || [];
    for (const row of rows) {
      if (row?.documentGuid) {
        overviewByGuid.set(row.documentGuid, {
          pdfDocumentGuid: row.pdfDocumentGuid || null,
          documentNumber: row.documentNumber || null,
        });
      }
    }
    if (rows.length < 50) break;
    if (skip > 5000) break;
  }

  const missing = await query(
    `SELECT id, infinigate_document_guid FROM processed_invoices
     WHERE organization_id = $1 AND source = 'infinigate_api' AND attachment_count = 0`,
    [organizationId]
  );

  const result = { checked: missing.rows.length, downloaded: 0, failed: 0, errors: [] as string[] };
  for (const row of missing.rows) {
    const meta = overviewByGuid.get(row.infinigate_document_guid);
    if (!meta) { result.failed++; continue; }
    try {
      const buffer = await tryDownloadPdf(config, row.infinigate_document_guid, meta.pdfDocumentGuid);
      if (!buffer) { result.failed++; continue; }
      await attachPdfToInvoice(organizationId, row.id, meta.documentNumber, buffer);
      result.downloaded++;
    } catch (err: any) {
      result.failed++;
      if (result.errors.length < 5) result.errors.push(`${meta.documentNumber || row.id}: ${err.message}`);
    }
  }
  logger.info(`Infinigate-PDF-Backfill: ${result.downloaded}/${result.checked} geladen, ${result.failed} fehlgeschlagen`);
  return result;
}

// ─── Bestellungen: Preisliste + Angebote (Phase 2b) ─────────────────────────
// Pfade + Parameter verifiziert gegen die Community-Implementierung
// n8n-nodes-infinigate (github.com/affeldt28/n8n-nodes-infinigate):
//   GET  /product-management/v1/pricelist/search/{searchword}?Take=&Skip=
//   GET  /product-management/v1/pricelist/search/count/{searchword}
//   GET  /order-management/v2/purchasequote?Take=&Skip=
//   POST /order-management/v2/purchasequote/acceptance
//        { documentNumber, documentRevision, acceptedByUserMail }
//   POST /order-management/v2/purchasequote/reject
//        { documentNumber, documentRevision, rejectedByUserMail, userComments }
// Die RESPONSE-Formen sind nicht dokumentiert → tolerante Normalisierung
// (Feld-Kandidaten) + debug/orders-Struktur-Dump zum Nachschärfen.

const pick = (obj: any, ...keys: string[]): any => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
};

const pickNumber = (obj: any, ...keys: string[]): number | null => {
  const value = pick(obj, ...keys);
  const num = Number(value);
  return value !== null && !isNaN(num) ? num : null;
};

export interface PricelistItem {
  sku: string | null;
  vendorSku: string | null;
  description: string | null;
  manufacturer: string | null;
  productType: string | null;
  licenseType: string | null;
  endUserType: string | null;
  price: number | null; // EK = listPrice.discountedPrice (inkl. Reseller-Rabatt)
  listPrice: number | null; // Listenpreis vor Rabatt (listPrice.price)
  discountPercent: number | null;
  priceOnRequest: boolean;
  currency: string;
  stock: number | null;
}

// Felder verifiziert gegen Prod-Dump (debug/orders, 2.10.2026):
// sku, vendorSku, productType, descriptionFullText, vendorName,
// priceOnRequest, listPrice{discountPercent, discountedPrice, price,
// CurrencyCode}, stockLevel, licenseType, endUserType, licenseBand{min,max}
function normalizePricelistItem(item: any): PricelistItem {
  const priceBlock = item?.listPrice && typeof item.listPrice === 'object' ? item.listPrice : {};
  return {
    sku: pick(item, 'sku', 'no', 'itemNumber'),
    vendorSku: pick(item, 'vendorSku', 'vendorItemNumber'),
    description: pick(item, 'descriptionFullText', 'description', 'itemDescription', 'name'),
    manufacturer: pick(item, 'vendorName', 'manufacturerName', 'vendorCode'),
    productType: pick(item, 'productType', 'itemType'),
    licenseType: pick(item, 'licenseType'),
    endUserType: pick(item, 'endUserType'),
    price: pickNumber(priceBlock, 'discountedPrice', 'price') ?? pickNumber(item, 'netPrice', 'price'),
    listPrice: pickNumber(priceBlock, 'price'),
    discountPercent: pickNumber(priceBlock, 'discountPercent'),
    priceOnRequest: item?.priceOnRequest === true,
    currency: pick(priceBlock, 'CurrencyCode', 'currencyCode') || pick(item, 'currencyCode') || 'EUR',
    stock: pickNumber(item, 'stockLevel', 'stock', 'availableQuantity'),
  };
}

export async function searchPricelist(
  userId: string,
  search: string,
  take = 25,
  skip = 0
): Promise<{ count: number | null; items: PricelistItem[] }> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) throw new Error('Infinigate ist nicht vollständig konfiguriert');
  const encoded = encodeURIComponent(search);
  const data = await infinigateFetch(
    config,
    `/product-management/v1/pricelist/search/${encoded}?Take=${take}&Skip=${skip}`
  );
  const rows: any[] = Array.isArray(data) ? data : data?.result || data?.items || [];
  return {
    count: typeof data?.count === 'number' ? data.count : Array.isArray(data) ? data.length : null,
    items: rows.map(normalizePricelistItem),
  };
}

export interface QuoteSummary {
  documentGuid: string | null;
  documentNumber: string | null;
  documentRevision: number | null;
  buyerReference: string | null;
  externalDocumentNumber: string | null;
  createdAt: string | null;
  validUntil: string | null;
  status: string | null;
  businessType: string | null;
  manufacturer: string | null;
  totalNetPrice: number | null;
  currency: string;
  canBeAccepted: boolean;
  canBeRejected: boolean;
  salesContactName: string | null;
}

// Felder verifiziert gegen Prod-Dump (debug/orders, 2.10.2026):
// documentGuid/Number, documentVersion (= Revision!), buyerReference,
// externalDocumentNumber, documentCreated/ValidUntil/Status, businessType,
// vendorCode, manufacturerName, total, currencyCode, canBeAccepted/
// canBeRejected (API sagt selbst, welche Aktionen erlaubt sind), salesContact
function normalizeQuote(row: any): QuoteSummary {
  return {
    documentGuid: pick(row, 'documentGuid', 'guid'),
    documentNumber: pick(row, 'documentNumber', 'quoteNumber'),
    documentRevision: pickNumber(row, 'documentVersion', 'documentRevision', 'revision'),
    buyerReference: pick(row, 'buyerReference'),
    externalDocumentNumber: pick(row, 'externalDocumentNumber'),
    createdAt: pick(row, 'documentCreated', 'createdAt'),
    validUntil: pick(row, 'documentValidUntil', 'validUntil'),
    status: pick(row, 'documentStatus', 'status'),
    businessType: pick(row, 'businessType'),
    manufacturer: pick(row, 'manufacturerName', 'vendorCode'),
    totalNetPrice: pickNumber(row, 'total', 'totalNetPrice', 'netTotal'),
    currency: pick(row, 'currencyCode', 'currency') || 'EUR',
    canBeAccepted: row?.canBeAccepted === true,
    canBeRejected: row?.canBeRejected === true,
    salesContactName: pick(row?.salesContact, 'name'),
  };
}

export async function getQuotes(userId: string, take = 50): Promise<QuoteSummary[]> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) throw new Error('Infinigate ist nicht vollständig konfiguriert');
  const data = await infinigateFetch(config, `/order-management/v2/purchasequote?Take=${take}&Skip=0`);
  const rows: any[] = Array.isArray(data) ? data : data?.result || [];
  return rows.map(normalizeQuote);
}

async function getUserEmail(userId: string): Promise<string> {
  const result = await query('SELECT email FROM users WHERE id = $1', [userId]);
  const email = result.rows[0]?.email;
  if (!email) throw new Error('Keine E-Mail-Adresse für den User gefunden');
  return email;
}

// ⚠️ Annehmen eines Angebots löst eine VERBINDLICHE Bestellung beim
// Distributor aus — das UI bestätigt mit danger-Dialog, hier nur Durchreichen.
export async function acceptQuote(
  userId: string,
  input: { documentNumber: string; documentRevision: number }
): Promise<any> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) throw new Error('Infinigate ist nicht vollständig konfiguriert');
  const acceptedByUserMail = await getUserEmail(userId);
  const response = await infinigateFetch(config, '/order-management/v2/purchasequote/acceptance', {
    method: 'POST',
    body: { documentNumber: input.documentNumber, documentRevision: input.documentRevision, acceptedByUserMail },
  });
  logger.info(`Infinigate-Angebot ${input.documentNumber} (Rev. ${input.documentRevision}) ANGENOMMEN von ${acceptedByUserMail}`);
  return response;
}

export async function rejectQuote(
  userId: string,
  input: { documentNumber: string; documentRevision: number; comment?: string }
): Promise<any> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) throw new Error('Infinigate ist nicht vollständig konfiguriert');
  const rejectedByUserMail = await getUserEmail(userId);
  const response = await infinigateFetch(config, '/order-management/v2/purchasequote/reject', {
    method: 'POST',
    body: {
      documentNumber: input.documentNumber,
      documentRevision: input.documentRevision,
      rejectedByUserMail,
      ...(input.comment ? { userComments: input.comment } : {}),
    },
  });
  logger.info(`Infinigate-Angebot ${input.documentNumber} abgelehnt von ${rejectedByUserMail}`);
  return response;
}

// Struktur-Dump für Preisliste + Angebote (gleiches Muster wie debug/structure):
// zeigt die ECHTEN Feldnamen, damit die Normalisierung nachgeschärft werden kann.
export async function inspectOrdersStructure(userId: string, search: string): Promise<any> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) throw new Error('Infinigate ist nicht vollständig konfiguriert');
  const result: Record<string, any> = {};
  try {
    const pricelist = await infinigateFetch(
      config,
      `/product-management/v1/pricelist/search/${encodeURIComponent(search)}?Take=2&Skip=0`
    );
    result.pricelistSearch = describeStructure(pricelist);
  } catch (err: any) {
    result.pricelistSearch = { error: String(err.message).slice(0, 300) };
  }
  try {
    const quotes = await infinigateFetch(config, '/order-management/v2/purchasequote?Take=2&Skip=0');
    result.quotes = describeStructure(quotes);
  } catch (err: any) {
    result.quotes = { error: String(err.message).slice(0, 300) };
  }
  return result;
}

// ─── Verbindungstest ────────────────────────────────────────────────────────

export async function testConnection(userId: string): Promise<{ ok: boolean; message: string; invoiceCount?: number }> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) {
    return { ok: false, message: 'Client-ID, Client-Secret und API-Key müssen konfiguriert sein' };
  }
  try {
    const data = await infinigateFetch(config, '/invoice-management/v2/purchaseinvoice?Take=1&Skip=0');
    const count = typeof data?.count === 'number' ? data.count : undefined;
    return {
      ok: true,
      message: `Verbindung OK (${config.environment === 'test' ? 'Test' : 'Produktion'})${count !== undefined ? `, ${count} Rechnungen abrufbar` : ''}`,
      invoiceCount: count,
    };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Verbindung fehlgeschlagen' };
  }
}

// ─── Diagnose: echte Response-Struktur sichtbar machen ──────────────────────
// Die StarterKit-Doku und die echte API weichen ab (Prod-Befund 1.10.2026:
// 190 Positionen, aber 0× Endkunde/Laufzeit/Lizenz-ID geparst). Dieser
// Helfer beschreibt die Struktur einer echten Rechnung: Pfade + Typen +
// GEKÜRZTE Beispielwerte (24 Zeichen), damit der Output ohne Kundendaten-
// Leak teilbar ist und das Mapping gegen die Realität korrigiert werden kann.

function describeStructure(value: unknown, depth = 0, maxDepth = 7): any {
  if (depth > maxDepth) return '…(zu tief)';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return value.length === 0
      ? 'array(leer)'
      : { [`array(${value.length}), erstes Element:`]: describeStructure(value[0], depth + 1, maxDepth) };
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = describeStructure(v, depth + 1, maxDepth);
    }
    return out;
  }
  if (typeof value === 'string') {
    const shortened = value.length > 24 ? `${value.slice(0, 24)}…` : value;
    return `string "${shortened}"`;
  }
  return `${typeof value} ${String(value)}`;
}

export async function inspectFirstInvoiceStructure(userId: string): Promise<any> {
  const config = await getConfig(userId);
  if (!isConfigured(config)) {
    throw new Error('Infinigate ist nicht vollständig konfiguriert');
  }
  const overview = await infinigateFetch(config, '/invoice-management/v2/purchaseinvoice?Take=10&Skip=0');
  const entries: any[] = overview?.result || [];
  if (!entries[0]?.documentGuid) {
    return { overview: describeStructure(overview) };
  }

  // Erste Rechnung komplett beschreiben; danach bis zu 10 Rechnungen nach den
  // Stellen absuchen, an denen Endkunde/Vertrag WIRKLICH gefüllt sind
  // (Prod-Befund: endCustomerDto/contractInformationDto sind auf den Zeilen
  // null — Kandidat ist der bisher ignorierte Top-Level-Block
  // mspDetailInformation).
  let firstDetail: any = null;
  let mspDetailSample: any = null;
  let mspDetailInvoice: string | undefined;
  let lineWithEndCustomer: any = null;
  let lineWithEndCustomerInvoice: string | undefined;
  let lineWithContract: any = null;
  let lineWithContractInvoice: string | undefined;
  let mspElementWithEndCustomer: any = null;
  let mspElementWithReseller: any = null;
  let mspElementWithContract: any = null;
  const lineTypeCounts: Record<string, number> = {};
  // additionalInfos sind Schlüssel-Wert-Paare ({description, value}) —
  // hier zählen wir pro Schlüssel, wie oft er befüllt ist, mit je einem
  // gekürzten Beispielwert. Das verrät, wo Endkunde/Laufzeit wirklich stehen.
  const mspAdditionalInfoKeys: Record<string, { filled: number; total: number; sample?: string }> = {};
  const lineAdditionalInfoKeys: Record<string, { filled: number; total: number; sample?: string }> = {};
  let mspElementCount = 0;
  // Geräte (ObjectName) pro Endkunde (ClientName/clientName) — ungekürzt,
  // eigene Bestandsdaten des Users
  const deviceNamesByClient: Record<string, Set<string>> = {};

  const tallyInfos = (
    infos: any[] | undefined,
    target: Record<string, { filled: number; total: number; sample?: string }>
  ) => {
    for (const info of infos || []) {
      const key = String(info?.description ?? '?');
      const rec = (target[key] ||= { filled: 0, total: 0 });
      rec.total++;
      if (info?.value != null && String(info.value).trim() !== '') {
        rec.filled++;
        if (rec.sample === undefined) {
          const raw = String(info.value);
          rec.sample = raw.length > 24 ? `${raw.slice(0, 24)}…` : raw;
        }
      }
    }
  };

  for (const entry of entries) {
    if (!entry?.documentGuid) continue;
    const detail = await infinigateFetch(config, `/invoice-management/v2/purchaseinvoice/${entry.documentGuid}`);
    if (!firstDetail) firstDetail = detail;
    const msp = detail?.mspDetailInformation;
    const mspItems: any[] = Array.isArray(msp) ? msp : msp != null ? [msp] : [];
    if (!mspDetailSample && mspItems.length > 0) {
      mspDetailSample = describeStructure(msp);
      mspDetailInvoice = detail?.header?.documentNumber || entry.documentNumber;
    }
    for (const item of mspItems) {
      mspElementCount++;
      tallyInfos(item?.additionalInfos, mspAdditionalInfoKeys);
      if (!mspElementWithEndCustomer && item?.endCustomer != null) mspElementWithEndCustomer = describeStructure(item);
      if (!mspElementWithReseller && item?.reseller != null) mspElementWithReseller = describeStructure(item);
      if (!mspElementWithContract && item?.contractInformation != null) mspElementWithContract = describeStructure(item);
      const objectName = getMspInfo(item, 'ObjectName');
      if (objectName) {
        const client = getMspInfo(item, 'ClientName', 'clientName') || '(ohne Endkunde)';
        (deviceNamesByClient[client] ||= new Set()).add(objectName);
      }
    }
    for (const line of detail?.lines || []) {
      const type = String(line?.lineType ?? 'unbekannt');
      lineTypeCounts[type] = (lineTypeCounts[type] || 0) + 1;
      tallyInfos(line?.additionalInfos, lineAdditionalInfoKeys);
      if (!lineWithEndCustomer && line?.endCustomerDto != null) {
        lineWithEndCustomer = describeStructure(line);
        lineWithEndCustomerInvoice = detail?.header?.documentNumber || entry.documentNumber;
      }
      if (!lineWithContract && line?.contractInformationDto != null) {
        lineWithContract = describeStructure(line);
        lineWithContractInvoice = detail?.header?.documentNumber || entry.documentNumber;
      }
    }
  }

  const lines: any[] = firstDetail?.lines || [];
  return {
    scannedInvoices: entries.length,
    detailTopLevelKeys: Object.keys(firstDetail || {}),
    lineTypeCounts,
    mspElementCount,
    // Die Kernfrage: welche additionalInfos-Schlüssel existieren und wie oft
    // sind sie befüllt? (filled/total über alle gescannten Rechnungen)
    mspAdditionalInfoKeys,
    lineAdditionalInfoKeys,
    deviceNamesByClient: Object.fromEntries(
      Object.entries(deviceNamesByClient).map(([client, names]) => [client, [...names].sort()])
    ),
    mspDetailInformation: mspDetailSample ?? 'in allen gescannten Rechnungen leer/null',
    mspDetailInvoice,
    mspElementWithEndCustomer: mspElementWithEndCustomer ?? 'endCustomer in allen MSP-Elementen null',
    mspElementWithReseller: mspElementWithReseller ?? 'reseller in allen MSP-Elementen null',
    mspElementWithContract: mspElementWithContract ?? 'contractInformation in allen MSP-Elementen null',
    lineWithEndCustomer: lineWithEndCustomer ?? 'endCustomerDto in allen gescannten Zeilen null',
    lineWithEndCustomerInvoice,
    lineWithContract: lineWithContract ?? 'contractInformationDto in allen gescannten Zeilen null',
    lineWithContractInvoice,
  };
}

// ─── Resync: unbearbeitete Infinigate-Belege neu importieren ────────────────
// Nötig nach einem Mapping-Fix: die Dedupe-Logik (documentGuid) überspringt
// bereits importierte Rechnungen für immer. Löscht NUR Belege, deren
// Positionen komplett unbearbeitet sind (keine Kundenzuordnung, Status
// pending) — Positionen via FK ON DELETE CASCADE — und setzt last_sync_at
// zurück, damit der nächste Sync wieder 12 Monate zurückschaut.
export async function resyncInvoices(userId: string): Promise<InfinigateSyncResult & { deletedInvoices: number }> {
  const orgResult = await query(
    'SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const organizationId: string | undefined = orgResult.rows[0]?.organization_id;
  if (!organizationId) {
    throw new Error('Keine Organisation für User gefunden');
  }

  const deleted = await query(
    `DELETE FROM processed_invoices pi
     WHERE pi.organization_id = $1
       AND pi.source = 'infinigate_api'
       AND NOT EXISTS (
         SELECT 1 FROM invoice_line_items li
         WHERE li.processed_invoice_id = pi.id
           AND (li.customer_id IS NOT NULL OR li.rebilling_status <> 'pending')
       )
     RETURNING pi.id`,
    [organizationId]
  );
  await query('UPDATE infinigate_config SET last_sync_at = NULL WHERE user_id = $1', [userId]);
  logger.info(`Infinigate-Resync: ${deleted.rows.length} unbearbeitete Belege entfernt, Sync startet neu`);

  const result = await syncInvoices(userId);
  return { ...result, deletedInvoices: deleted.rows.length };
}

// ─── Rechnungs-/Lizenz-Sync ─────────────────────────────────────────────────


export interface InfinigateSyncResult {
  invoicesFetched: number;
  invoicesImported: number;
  lineItemsCreated: number;
  matchesApplied: number;
  errors: string[];
}

const PAGE_SIZE = 50;
// Erstlauf: 12 Monate zurück (Lizenz-Laufzeiten!), Folgeläufe: last_sync - 14 Tage Überlappung.
const INITIAL_LOOKBACK_DAYS = 365;
const RESYNC_OVERLAP_DAYS = 14;

// ─── MSP-Detail-Parsing (Prod-verifiziert 1.10.2026 via debug/structure) ────
// Bei MSP-Rechnungen (Hornetsecurity & Co.) sind endCustomerDto/
// contractInformationDto auf den Zeilen IMMER null. Die echten Nutzdaten
// liegen im Top-Level-Array `mspDetailInformation` (ein Element pro
// Endkunde+Produkt, feiner als die Rechnungszeilen) — und dort in den
// additionalInfos-Paaren ({description, value}):
//   clientName  = Endkunden-DOMAIN (z.B. areg-mbh.de) → Domain-Matching
//   ClientName  = Endkunden-Kürzel (z.B. IHE) bei Backup-Produkten
//   ObjectName  = geschütztes Gerät (z.B. IHE-NB1100)
//   vendorContractNumber = Lizenz-/Vertragsnummer (MSP-…)
//   periodStart/periodEnd = Laufzeit im US-Format (6/1/2026 12:00:00 AM)
//   SiteName    = Zeitraum als deutscher String (01.08.2026 - 31.08.2026)
//   recommendedEndUserUnitPrice = VK-Empfehlung (bewusst nicht automatisch
//     als resell_price übernommen — VK pflegt der User im LineItemReview)

function getMspInfo(item: any, ...keys: string[]): string | null {
  const infos: any[] = Array.isArray(item?.additionalInfos) ? item.additionalInfos : [];
  for (const key of keys) {
    const hit = infos.find((i) => String(i?.description ?? '').toLowerCase() === key.toLowerCase());
    const value = hit?.value;
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return null;
}

function parseMspDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseGermanPeriod(value: string | null): { start: Date; end: Date } | null {
  const m = value?.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return {
    start: new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))),
    end: new Date(Date.UTC(Number(m[6]), Number(m[5]) - 1, Number(m[4]))),
  };
}

const looksLikeDomain = (s: string): boolean => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s);

export async function syncInvoices(userId: string): Promise<InfinigateSyncResult> {
  const result: InfinigateSyncResult = {
    invoicesFetched: 0, invoicesImported: 0, lineItemsCreated: 0, matchesApplied: 0, errors: [],
  };

  const config = await getConfig(userId);
  if (!isConfigured(config)) {
    result.errors.push('Infinigate ist nicht vollständig konfiguriert');
    return result;
  }

  const orgResult = await query(
    'SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const organizationId: string | undefined = orgResult.rows[0]?.organization_id;
  if (!organizationId) {
    result.errors.push('Keine Organisation für User gefunden');
    return result;
  }

  const since = config.lastSyncAt
    ? new Date(config.lastSyncAt.getTime() - RESYNC_OVERLAP_DAYS * 24 * 3600 * 1000)
    : new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const periodStart = encodeURIComponent(since.toISOString());

  // Overview-Liste paginiert durchlaufen (PagedResults: { count, result: [...] })
  const overviews: any[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await infinigateFetch(
      config,
      `/invoice-management/v2/purchaseinvoice?PeriodStart=${periodStart}&Take=${PAGE_SIZE}&Skip=${skip}`
    );
    const rows: any[] = page?.result || [];
    overviews.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    if (skip > 5000) { // Sicherheitsgrenze gegen Endlosschleifen
      result.errors.push('Paginierungs-Sicherheitsgrenze erreicht (5000)');
      break;
    }
  }
  result.invoicesFetched = overviews.length;

  const newLineItemIds: string[] = [];

  for (const overview of overviews) {
    const documentGuid: string | undefined = overview?.documentGuid;
    if (!documentGuid) continue;

    try {
      // Schon importiert? (Unique-Index auf organization_id + guid)
      const existing = await query(
        'SELECT id FROM processed_invoices WHERE organization_id = $1 AND infinigate_document_guid = $2',
        [organizationId, documentGuid]
      );
      if (existing.rows.length > 0) continue;

      const detail = await infinigateFetch(config, `/invoice-management/v2/purchaseinvoice/${documentGuid}`);
      const header = detail?.header || {};
      const lines: any[] = detail?.lines || [];

      // Beträge aus den Zeilen aggregieren (Header-Totals sind in der Spec
      // nicht eindeutig dokumentiert)
      let netTotal = 0;
      let grossTotal = 0;
      for (const line of lines) {
        const qty = Number(line?.quantity) || 0;
        const netUnit = Number(line?.netUnitPrice) || 0;
        netTotal += netUnit * qty;
        grossTotal += Number(line?.grossExtendedPrice) || 0;
      }

      const invoiceId = crypto.randomUUID();
      await query(
        `INSERT INTO processed_invoices (
          id, organization_id, email_id, email_subject, sender_name,
          received_at, attachment_count, document_ids, status, source,
          infinigate_document_guid, invoice_number, supplier_name,
          invoice_date, net_amount, gross_amount, currency, processed_at
        ) VALUES ($1, $2, NULL, $3, 'Infinigate', $4, 0, '[]', 'imported', 'infinigate_api',
                  $5, $6, 'Infinigate', $7, $8, $9, $10, NOW())`,
        [
          invoiceId,
          organizationId,
          `Infinigate Rechnung ${header.documentNumber || documentGuid}`,
          header.postingDate ? new Date(header.postingDate) : new Date(),
          documentGuid,
          header.documentNumber || null,
          header.postingDate ? new Date(header.postingDate) : null,
          netTotal || null,
          grossTotal || null,
          header.currencyCode || 'EUR',
        ]
      );
      result.invoicesImported++;

      // Beleg-PDF mitladen (best effort — Sync scheitert nie am PDF).
      // Mit Dokument funktionieren Vorschau + sevDesk-Upload beim Bestätigen.
      try {
        const pdfBuffer = await tryDownloadPdf(config, documentGuid, overview?.pdfDocumentGuid || null);
        if (pdfBuffer) {
          await attachPdfToInvoice(organizationId, invoiceId, header.documentNumber || null, pdfBuffer);
        }
      } catch (pdfErr: any) {
        logger.warn(`Infinigate-PDF für ${header.documentNumber || documentGuid} nicht geladen: ${pdfErr.message}`);
      }

      const mspItemsRaw = detail?.mspDetailInformation;
      const mspItems: any[] = Array.isArray(mspItemsRaw) ? mspItemsRaw : [];

      if (mspItems.length > 0) {
        // MSP-Rechnung: Positionen aus mspDetailInformation (ein Element pro
        // Endkunde+Produkt — feiner und mit echten Endkunden-Daten)
        let position = 0;
        for (const item of mspItems) {
          position++;
          const qty = Number(item?.quantity) || null;
          const unitPrice = item?.price != null && !isNaN(Number(item.price)) ? Number(item.price) : null;

          const endCustomerRaw = getMspInfo(item, 'clientName', 'ClientName');
          const endCustomerDomain = endCustomerRaw && looksLikeDomain(endCustomerRaw)
            ? endCustomerRaw.toLowerCase().replace(/^www\./, '')
            : null;
          const licenseId = getMspInfo(item, 'vendorContractNumber');
          const objectName = getMspInfo(item, 'ObjectName');
          const periodText = getMspInfo(item, 'SiteName');
          let periodStartDate = parseMspDate(getMspInfo(item, 'periodStart'));
          let periodEndDate = parseMspDate(getMspInfo(item, 'periodEnd'));
          if (!periodStartDate || !periodEndDate) {
            const germanPeriod = parseGermanPeriod(periodText);
            if (germanPeriod) {
              periodStartDate = periodStartDate || germanPeriod.start;
              periodEndDate = periodEndDate || germanPeriod.end;
            }
          }

          const description = [
            item?.itemDescription || item?.itemSku || 'Position',
            objectName ? `(${objectName})` : null,
          ].filter(Boolean).join(' ');
          const itemType = classifyLineItemType({
            description,
            sku: item?.itemSku,
            licenseId,
            serialNumber: null,
            hasPeriod: !!(periodStartDate && periodEndDate),
          });

          const lineItemId = crypto.randomUUID();
          await query(
            `INSERT INTO invoice_line_items (
              id, organization_id, processed_invoice_id, position_number,
              description, quantity, unit_price, total_price,
              period_start, period_end, period_text, product_sku,
              extracted_customer_name, extracted_customer_domain,
              license_id, item_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              lineItemId,
              organizationId,
              invoiceId,
              position,
              description,
              qty,
              unitPrice,
              qty !== null && unitPrice !== null ? Math.round(qty * unitPrice * 100) / 100 : null,
              periodStartDate,
              periodEndDate,
              periodText,
              item?.itemSku || null,
              endCustomerRaw,
              endCustomerDomain,
              licenseId,
              itemType,
            ]
          );
          result.lineItemsCreated++;
          newLineItemIds.push(lineItemId);
        }
      } else {
        // Kein MSP-Block: klassischer Zeilen-Import (Resale-Rechnungen).
        // Text-Zeilen sind Überschriften ohne Artikel/Preis — keine Positionen.
        for (const line of lines) {
          if (String(line?.lineType) === 'Text') continue;
          const contract = line?.contractInformationDto || {};
          const endCustomer = line?.endCustomerDto?.company || line?.endCustomer?.company || {};
          const qty = Number(line?.quantity) || null;
          const netUnit = Number(line?.netUnitPrice) || null;

          const lineItemId = crypto.randomUUID();
          const itemDescription = [line?.itemDescription, line?.itemDescription2].filter(Boolean).join(' ')
            || line?.fullDescription || line?.itemNumber || 'Position';
          const itemType = classifyLineItemType({
            description: itemDescription,
            sku: line?.itemNumber,
            licenseId: contract.licenseId,
            serialNumber: contract.serialNumber,
            hasPeriod: !!(contract.StartDate && contract.EndDate),
          });
          await query(
            `INSERT INTO invoice_line_items (
              id, organization_id, processed_invoice_id, position_number,
              description, article_number, quantity, unit_price, total_price, vat_rate,
              period_start, period_end, product_sku,
              extracted_customer_name, extracted_customer_number,
              license_id, serial_number, item_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              lineItemId,
              organizationId,
              invoiceId,
              Number(line?.lineNumber) || null,
              itemDescription,
              line?.vendorItemNumber || null,
              qty,
              netUnit,
              qty !== null && netUnit !== null ? qty * netUnit : null,
              Number(line?.vatRate) || null,
              contract.StartDate ? new Date(contract.StartDate) : null,
              contract.EndDate ? new Date(contract.EndDate) : null,
              line?.itemNumber || null,
              endCustomer.name || null,
              endCustomer.customerNumber || null,
              contract.licenseId || null,
              contract.serialNumber || null,
              itemType,
            ]
          );
          result.lineItemsCreated++;
          newLineItemIds.push(lineItemId);
        }
      }
    } catch (err: any) {
      result.errors.push(`Rechnung ${documentGuid}: ${err.message}`);
      logger.error(`Infinigate-Sync Rechnung ${documentGuid} fehlgeschlagen: ${err.message}`);
    }
  }

  // Automatisches Kunden-Matching über die Epic-G-Engine (>=80% Konfidenz)
  if (newLineItemIds.length > 0) {
    try {
      const applied = await customerMatchingService.applyBestMatches(organizationId, newLineItemIds, 0.8);
      result.matchesApplied = applied.applied;
    } catch (err: any) {
      result.errors.push(`Kunden-Matching: ${err.message}`);
    }
  }

  await query('UPDATE infinigate_config SET last_sync_at = NOW() WHERE user_id = $1', [userId]);

  logger.info(
    `Infinigate-Sync User ${userId}: ${result.invoicesImported}/${result.invoicesFetched} Rechnungen importiert, ` +
    `${result.lineItemsCreated} Positionen, ${result.matchesApplied} Kunden zugeordnet, ${result.errors.length} Fehler`
  );

  return result;
}
