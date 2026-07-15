import crypto from 'crypto';
import { query } from '../config/database';
import { customerMatchingService } from './customerMatchingService';
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

async function infinigateFetch(config: InfinigateConfig, path: string, retried = false): Promise<any> {
  const baseUrl = BASE_URLS[config.environment];
  const token = await getToken(config);

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'API-KEY': config.apiKey!,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (response.status === 401 && !retried) {
    // Token abgelaufen/ungültig → einmal frisch holen und wiederholen
    tokenCache.delete(config.userId);
    return infinigateFetch(config, path, true);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Infinigate API ${path}: ${response.status} ${text.slice(0, 300)}`);
  }

  return response.json();
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

      for (const line of lines) {
        const contract = line?.contractInformationDto || {};
        const endCustomer = line?.endCustomerDto?.company || line?.endCustomer?.company || {};
        const qty = Number(line?.quantity) || null;
        const netUnit = Number(line?.netUnitPrice) || null;

        const lineItemId = crypto.randomUUID();
        await query(
          `INSERT INTO invoice_line_items (
            id, organization_id, processed_invoice_id, position_number,
            description, article_number, quantity, unit_price, total_price, vat_rate,
            period_start, period_end, product_sku,
            extracted_customer_name, extracted_customer_number,
            license_id, serial_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            lineItemId,
            organizationId,
            invoiceId,
            Number(line?.lineNumber) || null,
            [line?.itemDescription, line?.itemDescription2].filter(Boolean).join(' ') || line?.itemNumber || 'Position',
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
          ]
        );
        result.lineItemsCreated++;
        newLineItemIds.push(lineItemId);
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
