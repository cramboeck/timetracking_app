import { query } from '../config/database';
import { logger } from '../utils/logger';

export interface MatchResult {
  customerId: string;
  customerName: string;
  confidence: number;
  method: 'exact_name' | 'domain' | 'distributor_id' | 'alias' | 'fuzzy' | 'customer_number';
  matchedValue?: string;
}

export interface LineItemMatchInput {
  lineItemId: string;
  extractedCustomerName?: string | null;
  extractedCustomerDomain?: string | null;
  extractedCustomerNumber?: string | null;
  distributorIdentifiers?: Record<string, string>;
}

export interface BatchMatchResult {
  lineItemId: string;
  matches: MatchResult[];
  bestMatch: MatchResult | null;
}

class CustomerMatchingService {
  /**
   * Match a single line item against all customers in the organization
   */
  async matchLineItem(
    organizationId: string,
    input: LineItemMatchInput
  ): Promise<MatchResult[]> {
    const matches: MatchResult[] = [];

    // 1. Exact customer number match (95%)
    if (input.extractedCustomerNumber) {
      const customerNumberMatches = await this.matchByCustomerNumber(
        organizationId,
        input.extractedCustomerNumber
      );
      matches.push(...customerNumberMatches);
    }

    // 2. Domain match (95%)
    if (input.extractedCustomerDomain) {
      const domainMatches = await this.matchByDomain(
        organizationId,
        input.extractedCustomerDomain
      );
      matches.push(...domainMatches);
    }

    // 3. Distributor ID match (90%)
    if (input.distributorIdentifiers && Object.keys(input.distributorIdentifiers).length > 0) {
      const distributorMatches = await this.matchByDistributorId(
        organizationId,
        input.distributorIdentifiers
      );
      matches.push(...distributorMatches);
    }

    // 4. Exact name match (85%)
    if (input.extractedCustomerName) {
      const exactMatches = await this.matchByExactName(
        organizationId,
        input.extractedCustomerName
      );
      matches.push(...exactMatches);
    }

    // 5. Alias match (80%)
    if (input.extractedCustomerName) {
      const aliasMatches = await this.matchByAlias(
        organizationId,
        input.extractedCustomerName
      );
      matches.push(...aliasMatches);
    }

    // 6. Fuzzy name match (60-75%)
    if (input.extractedCustomerName) {
      const fuzzyMatches = await this.matchByFuzzy(
        organizationId,
        input.extractedCustomerName
      );
      // Only add fuzzy matches that aren't already matched by other methods
      const existingCustomerIds = new Set(matches.map(m => m.customerId));
      for (const fuzzyMatch of fuzzyMatches) {
        if (!existingCustomerIds.has(fuzzyMatch.customerId)) {
          matches.push(fuzzyMatch);
        }
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
  }

  /**
   * Batch match multiple line items
   */
  async batchMatchLineItems(
    organizationId: string,
    inputs: LineItemMatchInput[]
  ): Promise<BatchMatchResult[]> {
    const results: BatchMatchResult[] = [];

    for (const input of inputs) {
      const matches = await this.matchLineItem(organizationId, input);
      results.push({
        lineItemId: input.lineItemId,
        matches,
        bestMatch: matches.length > 0 ? matches[0] : null
      });
    }

    return results;
  }

  /**
   * Apply best matches to line items in the database
   */
  async applyBestMatches(
    organizationId: string,
    lineItemIds: string[],
    minConfidence: number = 0.8
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;

    for (const lineItemId of lineItemIds) {
      // Get line item details
      const lineItemResult = await query(
        `SELECT id, extracted_customer_name, extracted_customer_domain, extracted_customer_number
         FROM invoice_line_items
         WHERE id = $1 AND organization_id = $2 AND customer_id IS NULL`,
        [lineItemId, organizationId]
      );

      if (lineItemResult.rows.length === 0) {
        skipped++;
        continue;
      }

      const lineItem = lineItemResult.rows[0];
      const matches = await this.matchLineItem(organizationId, {
        lineItemId,
        extractedCustomerName: lineItem.extracted_customer_name,
        extractedCustomerDomain: lineItem.extracted_customer_domain,
        extractedCustomerNumber: lineItem.extracted_customer_number
      });

      if (matches.length > 0 && matches[0].confidence >= minConfidence) {
        await query(
          `UPDATE invoice_line_items
           SET customer_id = $1, match_confidence = $2, match_method = $3, updated_at = NOW()
           WHERE id = $4`,
          [matches[0].customerId, matches[0].confidence, matches[0].method, lineItemId]
        );
        applied++;
      } else {
        skipped++;
      }
    }

    return { applied, skipped };
  }

  /**
   * Match by customer number (highest confidence)
   */
  private async matchByCustomerNumber(
    organizationId: string,
    customerNumber: string
  ): Promise<MatchResult[]> {
    const result = await query(
      `SELECT id, name FROM customers
       WHERE organization_id = $1
         AND customer_number IS NOT NULL
         AND LOWER(TRIM(customer_number)) = LOWER(TRIM($2))
         AND deleted_at IS NULL`,
      [organizationId, customerNumber]
    );

    return result.rows.map((row: { id: string; name: string }) => ({
      customerId: row.id,
      customerName: row.name,
      confidence: 0.95,
      method: 'customer_number' as const,
      matchedValue: customerNumber
    }));
  }

  /**
   * Match by primary domain
   */
  private async matchByDomain(
    organizationId: string,
    domain: string
  ): Promise<MatchResult[]> {
    // Normalize domain (remove www., lowercase)
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

    const result = await query(
      `SELECT id, name, primary_domain FROM customers
       WHERE organization_id = $1
         AND primary_domain IS NOT NULL
         AND LOWER(REPLACE(primary_domain, 'www.', '')) = $2
         AND deleted_at IS NULL`,
      [organizationId, normalizedDomain]
    );

    return result.rows.map((row: { id: string; name: string }) => ({
      customerId: row.id,
      customerName: row.name,
      confidence: 0.95,
      method: 'domain' as const,
      matchedValue: domain
    }));
  }

  /**
   * Match by distributor-specific identifiers (Microsoft Tenant ID, Hornetsecurity ID, etc.)
   */
  private async matchByDistributorId(
    organizationId: string,
    identifiers: Record<string, string>
  ): Promise<MatchResult[]> {
    const matches: MatchResult[] = [];

    for (const [key, value] of Object.entries(identifiers)) {
      if (!value) continue;

      // Use JSONB containment operator
      const result = await query(
        `SELECT id, name, distributor_identifiers FROM customers
         WHERE organization_id = $1
           AND distributor_identifiers IS NOT NULL
           AND distributor_identifiers->>$2 = $3
           AND deleted_at IS NULL`,
        [organizationId, key, value]
      );

      for (const row of result.rows) {
        // Avoid duplicates
        if (!matches.some(m => m.customerId === row.id)) {
          matches.push({
            customerId: row.id,
            customerName: row.name,
            confidence: 0.90,
            method: 'distributor_id' as const,
            matchedValue: `${key}: ${value}`
          });
        }
      }
    }

    return matches;
  }

  /**
   * Exact name match (case-insensitive)
   */
  private async matchByExactName(
    organizationId: string,
    name: string
  ): Promise<MatchResult[]> {
    const normalizedName = name.trim().toLowerCase();

    const result = await query(
      `SELECT id, name FROM customers
       WHERE organization_id = $1
         AND LOWER(TRIM(name)) = $2
         AND deleted_at IS NULL`,
      [organizationId, normalizedName]
    );

    return result.rows.map((row: { id: string; name: string }) => ({
      customerId: row.id,
      customerName: row.name,
      confidence: 0.85,
      method: 'exact_name' as const,
      matchedValue: name
    }));
  }

  /**
   * Match by saved customer aliases
   */
  private async matchByAlias(
    organizationId: string,
    name: string
  ): Promise<MatchResult[]> {
    const normalizedName = name.trim().toLowerCase();

    const result = await query(
      `SELECT ca.customer_id, c.name, ca.alias FROM customer_aliases ca
       JOIN customers c ON c.id = ca.customer_id
       WHERE ca.organization_id = $1
         AND LOWER(TRIM(ca.alias)) = $2
         AND c.deleted_at IS NULL`,
      [organizationId, normalizedName]
    );

    return result.rows.map((row: { customer_id: string; name: string; alias: string }) => ({
      customerId: row.customer_id,
      customerName: row.name,
      confidence: 0.80,
      method: 'alias' as const,
      matchedValue: row.alias
    }));
  }

  /**
   * Fuzzy name match using pg_trgm
   */
  private async matchByFuzzy(
    organizationId: string,
    name: string,
    minSimilarity: number = 0.3
  ): Promise<MatchResult[]> {
    const result = await query(
      `SELECT id, name, similarity(LOWER(name), LOWER($2)) as sim
       FROM customers
       WHERE organization_id = $1
         AND deleted_at IS NULL
         AND similarity(LOWER(name), LOWER($2)) > $3
       ORDER BY sim DESC
       LIMIT 5`,
      [organizationId, name, minSimilarity]
    );

    return result.rows.map((row: { id: string; name: string; sim: number }) => ({
      customerId: row.id,
      customerName: row.name,
      // Scale fuzzy confidence: 0.3-1.0 similarity → 0.60-0.75 confidence
      confidence: Math.min(0.75, 0.60 + (row.sim - 0.3) * 0.21),
      method: 'fuzzy' as const,
      matchedValue: `${Math.round(row.sim * 100)}% similar to "${name}"`
    }));
  }

  /**
   * Save an alias for future matching
   */
  async saveAlias(
    organizationId: string,
    customerId: string,
    alias: string,
    source: 'manual' | 'invoice_assignment' = 'manual'
  ): Promise<void> {
    const normalizedAlias = alias.trim();
    if (!normalizedAlias) return;

    // Check if alias already exists
    const existing = await query(
      `SELECT id FROM customer_aliases
       WHERE organization_id = $1 AND LOWER(TRIM(alias)) = LOWER($2)`,
      [organizationId, normalizedAlias]
    );

    if (existing.rows.length > 0) {
      logger.info(`Alias "${normalizedAlias}" already exists, skipping`);
      return;
    }

    await query(
      `INSERT INTO customer_aliases (id, organization_id, customer_id, alias, source, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())`,
      [organizationId, customerId, normalizedAlias, source]
    );

    logger.info(`Saved alias "${normalizedAlias}" for customer ${customerId}`);
  }

  /**
   * Get all aliases for a customer
   */
  async getAliases(
    organizationId: string,
    customerId: string
  ): Promise<{ id: string; alias: string; source: string; createdAt: Date }[]> {
    const result = await query(
      `SELECT id, alias, source, created_at FROM customer_aliases
       WHERE organization_id = $1 AND customer_id = $2
       ORDER BY created_at DESC`,
      [organizationId, customerId]
    );

    return result.rows.map((row: { id: string; alias: string; source: string; created_at: Date }) => ({
      id: row.id,
      alias: row.alias,
      source: row.source,
      createdAt: row.created_at
    }));
  }

  /**
   * Delete an alias
   */
  async deleteAlias(organizationId: string, aliasId: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM customer_aliases WHERE id = $1 AND organization_id = $2`,
      [aliasId, organizationId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update customer's primary domain
   */
  async setCustomerDomain(
    organizationId: string,
    customerId: string,
    domain: string
  ): Promise<void> {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();

    await query(
      `UPDATE customers SET primary_domain = $1 WHERE id = $2 AND organization_id = $3`,
      [normalizedDomain, customerId, organizationId]
    );

    logger.info(`Set primary domain "${normalizedDomain}" for customer ${customerId}`);
  }

  /**
   * Update customer's distributor identifiers
   */
  async updateDistributorIdentifiers(
    organizationId: string,
    customerId: string,
    identifiers: Record<string, string>
  ): Promise<void> {
    // Merge with existing identifiers
    await query(
      `UPDATE customers
       SET distributor_identifiers = COALESCE(distributor_identifiers, '{}'::jsonb) || $1::jsonb
       WHERE id = $2 AND organization_id = $3`,
      [JSON.stringify(identifiers), customerId, organizationId]
    );

    logger.info(`Updated distributor identifiers for customer ${customerId}:`, identifiers);
  }

  /**
   * Get matching statistics for an invoice
   */
  async getInvoiceMatchingStats(
    organizationId: string,
    processedInvoiceId: string
  ): Promise<{
    total: number;
    matched: number;
    unmatched: number;
    byMethod: Record<string, number>;
    byConfidence: { high: number; medium: number; low: number };
  }> {
    const result = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(customer_id) as matched,
         COUNT(*) FILTER (WHERE customer_id IS NULL) as unmatched,
         COUNT(*) FILTER (WHERE match_method = 'exact_name') as exact_name,
         COUNT(*) FILTER (WHERE match_method = 'domain') as domain,
         COUNT(*) FILTER (WHERE match_method = 'distributor_id') as distributor_id,
         COUNT(*) FILTER (WHERE match_method = 'alias') as alias,
         COUNT(*) FILTER (WHERE match_method = 'fuzzy') as fuzzy,
         COUNT(*) FILTER (WHERE match_method = 'customer_number') as customer_number,
         COUNT(*) FILTER (WHERE match_confidence >= 0.85) as high_confidence,
         COUNT(*) FILTER (WHERE match_confidence >= 0.70 AND match_confidence < 0.85) as medium_confidence,
         COUNT(*) FILTER (WHERE match_confidence < 0.70 AND customer_id IS NOT NULL) as low_confidence
       FROM invoice_line_items
       WHERE organization_id = $1 AND processed_invoice_id = $2`,
      [organizationId, processedInvoiceId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      matched: parseInt(row.matched),
      unmatched: parseInt(row.unmatched),
      byMethod: {
        exact_name: parseInt(row.exact_name),
        domain: parseInt(row.domain),
        distributor_id: parseInt(row.distributor_id),
        alias: parseInt(row.alias),
        fuzzy: parseInt(row.fuzzy),
        customer_number: parseInt(row.customer_number)
      },
      byConfidence: {
        high: parseInt(row.high_confidence),
        medium: parseInt(row.medium_confidence),
        low: parseInt(row.low_confidence)
      }
    };
  }
}

export const customerMatchingService = new CustomerMatchingService();
export default customerMatchingService;
