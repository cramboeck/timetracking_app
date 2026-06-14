/**
 * Invoice Processor Service
 *
 * Monitors the invoice mailbox and automatically:
 * - Extracts PDF/image attachments from emails
 * - Saves them as documents in the system
 * - Tracks processed emails to avoid duplicates
 * - Optionally matches vendors based on sender email
 */

import { query } from '../config/database';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { mailboxMonitorService, EmailMessage, EmailAttachment } from './mailboxMonitorService';
import { getConfig } from './microsoft365ConfigService';
import { uploadVoucherFile, createVoucherFromFile, getVouchers, downloadVoucherFile, SevdeskVoucherDetail } from './sevdeskService';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParseModule = require('pdf-parse');
const pdfParse = pdfParseModule.default || pdfParseModule;
// PDF to image conversion for Vision API
import { pdf } from 'pdf-to-img';

// Interface for invoice line items (for MSP rebilling)
export interface InvoiceLineItem {
  position: number | null;        // Position number on invoice
  description: string;
  articleNumber: string | null;   // Article/SKU number
  customerName: string | null;    // End customer name (e.g. for MSP/reseller invoices)
  quantity: number | null;
  unit: string | null;            // Unit (Stück, Monat, GB, etc.)
  unitPrice: number | null;
  totalPrice: number | null;
  vatRate: number | null;         // VAT rate for this line item if different
  period: string | null;          // e.g. "01.12.2024 - 31.12.2024"
  productType: string | null;     // e.g. "Microsoft 365", "Azure", "Cloud Server"
}

// Interface for extracted invoice data
export interface ExtractedInvoiceData {
  // Supplier/vendor info
  supplierName: string | null;
  supplierAddress: string | null;
  taxId: string | null;           // USt-IdNr. of supplier

  // Recipient info
  recipientName: string | null;   // Invoice recipient (your customer)
  recipientAddress: string | null;
  customerNumber: string | null;  // Customer number at supplier

  // Invoice identifiers
  invoiceNumber: string | null;
  orderNumber: string | null;     // Order/reference number

  // Dates
  invoiceDate: string | null;
  dueDate: string | null;
  deliveryDate: string | null;    // Delivery/service date or period

  // Amounts
  netAmount: number | null;
  grossAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  currency: string;

  // Payment info
  paymentMethod: string | null;   // Bank transfer, direct debit, etc.
  iban: string | null;
  bic: string | null;

  // Metadata
  confidence: number;
  rawText?: string;
  lineItems?: InvoiceLineItem[];  // Line items for MSP rebilling
}

export interface ProcessedInvoice {
  id: string;
  organizationId: string;
  emailId: string | null;
  emailSubject: string | null;
  senderEmail: string | null;
  senderName: string | null;
  receivedAt: string;
  attachmentCount: number;
  documentIds: string[];
  vendorId: string | null;
  status: 'pending' | 'draft' | 'processed' | 'failed' | 'skipped' | 'imported';
  errorMessage: string | null;
  processedAt: string | null;
  // SSOT-Felder ab Phase 1
  source: 'email' | 'manual' | 'sevdesk_import';
  originalFilename: string | null;
  sevdeskVoucherId: string | null;
  sevdeskVoucherNumber: string | null;
  invoiceNumber: string | null;
  supplierName: string | null;
  invoiceDate: string | null;
  netAmount: number | null;
  grossAmount: number | null;
  vatAmount: number | null;
  currency: string | null;
}

export interface InvoiceDocument {
  id: string;
  organizationId: string;
  processedInvoiceId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: string;
}

// Validation result for OCR data before sevDesk submission
export interface InvoiceDataValidation {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  correctedData: {
    netAmount: number | null;
    grossAmount: number | null;
    vatAmount: number | null;
    vatRate: number | null;
  };
}

/**
 * Validate extracted invoice data before sending to sevDesk
 * Checks consistency between net, gross, and VAT amounts
 */
export function validateInvoiceData(data: ExtractedInvoiceData): InvoiceDataValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  const correctedData = {
    netAmount: data.netAmount,
    grossAmount: data.grossAmount,
    vatAmount: data.vatAmount,
    vatRate: data.vatRate,
  };

  const netAmount = data.netAmount;
  const grossAmount = data.grossAmount;
  const vatAmount = data.vatAmount;
  const vatRate = data.vatRate ?? 19;

  // Check if we have at least gross or net amount
  if (grossAmount === null && netAmount === null) {
    errors.push('Weder Brutto- noch Nettobetrag erkannt');
    return { isValid: false, warnings, errors, correctedData };
  }

  // If we have both net and gross, validate consistency
  if (netAmount !== null && grossAmount !== null) {
    // Calculate expected gross from net + vatRate
    const expectedGrossFromNet = netAmount * (1 + vatRate / 100);
    const grossDiff = Math.abs(grossAmount - expectedGrossFromNet);

    // Allow 1 cent tolerance for rounding
    if (grossDiff > 0.02) {
      // Check if vatAmount helps explain the difference
      if (vatAmount !== null) {
        const calculatedGross = netAmount + vatAmount;
        const grossDiffWithVat = Math.abs(grossAmount - calculatedGross);

        if (grossDiffWithVat <= 0.02) {
          // VAT amount is correct, but vatRate might be wrong
          const actualVatRate = (vatAmount / netAmount) * 100;
          if (Math.abs(actualVatRate - vatRate) > 0.5) {
            warnings.push(
              `MwSt-Satz inkonsistent: ${vatRate}% angegeben, aber ${actualVatRate.toFixed(1)}% berechnet (${vatAmount.toFixed(2)}€ von ${netAmount.toFixed(2)}€)`
            );
            correctedData.vatRate = Math.round(actualVatRate);
          }
        } else {
          // Amounts don't match
          warnings.push(
            `Beträge inkonsistent: Netto ${netAmount.toFixed(2)}€ + MwSt ${vatAmount?.toFixed(2) ?? '?'}€ ≠ Brutto ${grossAmount.toFixed(2)}€ (Differenz: ${(grossAmount - calculatedGross).toFixed(2)}€)`
          );
        }
      } else {
        // No vatAmount, calculate it
        const calculatedVat = grossAmount - netAmount;
        const impliedVatRate = (calculatedVat / netAmount) * 100;

        if (Math.abs(impliedVatRate - vatRate) > 0.5) {
          warnings.push(
            `MwSt-Satz prüfen: ${vatRate}% angegeben, aber ${impliedVatRate.toFixed(1)}% aus Beträgen berechnet`
          );
          correctedData.vatRate = Math.round(impliedVatRate);
        }
        correctedData.vatAmount = calculatedVat;
      }
    }
  } else if (grossAmount !== null && netAmount === null) {
    // Only gross - calculate net
    correctedData.netAmount = grossAmount / (1 + vatRate / 100);
    correctedData.vatAmount = grossAmount - correctedData.netAmount;
  } else if (netAmount !== null && grossAmount === null) {
    // Only net - calculate gross
    correctedData.grossAmount = netAmount * (1 + vatRate / 100);
    correctedData.vatAmount = correctedData.grossAmount - netAmount;
  }

  // Validate VAT rate is reasonable
  if (vatRate !== null && ![0, 7, 19].includes(vatRate)) {
    const nearestValid = [0, 7, 19].reduce((prev, curr) =>
      Math.abs(curr - vatRate) < Math.abs(prev - vatRate) ? curr : prev
    );
    warnings.push(
      `Ungewöhnlicher MwSt-Satz: ${vatRate}% (Standard: 0%, 7%, 19%). Nächster Standardsatz: ${nearestValid}%`
    );
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    correctedData,
  };
}

export interface ProcessingResult {
  success: boolean;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  results: Array<{
    emailId: string;
    subject: string;
    status: 'draft' | 'failed' | 'skipped';
    documentsCreated: number;
    error?: string;
  }>;
}

class InvoiceProcessorService {
  private uploadDir: string;

  constructor() {
    // Set upload directory - can be configured via environment variable
    // Default to a path relative to the server directory for development
    const defaultPath = process.env.NODE_ENV === 'production'
      ? '/app/uploads/invoices'
      : path.join(__dirname, '../../uploads/invoices');
    this.uploadDir = process.env.INVOICE_UPLOAD_DIR || defaultPath;
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDir(organizationId: string): Promise<string> {
    const orgDir = path.join(this.uploadDir, organizationId);

    try {
      await fs.promises.mkdir(orgDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    return orgDir;
  }

  /**
   * Check if an email has already been processed
   */
  async isEmailProcessed(organizationId: string, emailId: string): Promise<boolean> {
    const result = await query(
      'SELECT id FROM processed_invoices WHERE organization_id = $1 AND email_id = $2',
      [organizationId, emailId]
    );
    return result.rows.length > 0;
  }

  /**
   * Known vendor patterns for automatic matching
   * Maps email domain patterns to canonical vendor names
   */
  private static readonly KNOWN_VENDORS: Array<{
    patterns: string[];           // Email domain patterns (lowercase)
    canonicalName: string;        // Standard vendor name
    aliases: string[];            // Alternative names to search for
  }> = [
    {
      patterns: ['microsoft.com', 'microsoftonline.com', 'azure.com', 'office365.com'],
      canonicalName: 'Microsoft',
      aliases: ['Microsoft Ireland Operations', 'Microsoft Corporation', 'Microsoft Deutschland', 'MS'],
    },
    {
      patterns: ['hetzner.com', 'hetzner.de', 'hetzner-cloud.de'],
      canonicalName: 'Hetzner',
      aliases: ['Hetzner Online', 'Hetzner Online GmbH'],
    },
    {
      patterns: ['amazon.com', 'amazon.de', 'aws.amazon.com', 'amazonses.com'],
      canonicalName: 'Amazon Web Services',
      aliases: ['AWS', 'Amazon', 'Amazon.com'],
    },
    {
      patterns: ['google.com', 'googlemail.com', 'cloud.google.com'],
      canonicalName: 'Google',
      aliases: ['Google Cloud', 'Google LLC', 'Google Ireland'],
    },
    {
      patterns: ['ovh.com', 'ovh.de', 'ovhcloud.com'],
      canonicalName: 'OVH',
      aliases: ['OVHcloud', 'OVH GmbH'],
    },
    {
      patterns: ['ionos.de', 'ionos.com', '1und1.de', '1and1.com'],
      canonicalName: 'IONOS',
      aliases: ['1&1 IONOS', '1und1', 'United Internet'],
    },
    {
      patterns: ['strato.de', 'strato.com'],
      canonicalName: 'STRATO',
      aliases: ['STRATO AG'],
    },
    {
      patterns: ['hosteurope.de', 'hosteurope.com'],
      canonicalName: 'Host Europe',
      aliases: ['Host Europe GmbH'],
    },
    {
      patterns: ['cloudflare.com'],
      canonicalName: 'Cloudflare',
      aliases: ['Cloudflare Inc.', 'Cloudflare, Inc.'],
    },
    {
      patterns: ['digitalocean.com'],
      canonicalName: 'DigitalOcean',
      aliases: ['DigitalOcean LLC'],
    },
  ];

  /**
   * Find vendor by email address with enhanced matching
   */
  async findVendorByEmail(organizationId: string, email: string): Promise<{ id: string; name: string } | null> {
    const domain = email.split('@')[1]?.toLowerCase();

    // First check if this matches a known vendor pattern
    const knownVendor = this.findKnownVendor(domain);
    if (knownVendor) {
      logger.info(`Matched known vendor pattern: ${domain} -> ${knownVendor.canonicalName}`);

      // Try to find this vendor in the database by any of its names
      const allNames = [knownVendor.canonicalName, ...knownVendor.aliases];
      for (const name of allNames) {
        const result = await query(
          `SELECT id, name FROM customers
           WHERE organization_id = $1
           AND (LOWER(name) LIKE $2 OR LOWER(display_name) LIKE $2)
           LIMIT 1`,
          [organizationId, `%${name.toLowerCase()}%`]
        );

        if (result.rows.length > 0) {
          return { id: result.rows[0].id, name: result.rows[0].name };
        }
      }

      // Also try vendor_domain for known vendors
      for (const pattern of knownVendor.patterns) {
        const result = await query(
          `SELECT id, name FROM customers
           WHERE organization_id = $1
           AND LOWER(vendor_domain) = $2
           LIMIT 1`,
          [organizationId, pattern]
        );

        if (result.rows.length > 0) {
          return { id: result.rows[0].id, name: result.rows[0].name };
        }
      }
    }

    // First try exact match on vendor_domain (most reliable)
    if (domain) {
      let result = await query(
        `SELECT id, name FROM customers
         WHERE organization_id = $1
         AND LOWER(vendor_domain) = $2
         LIMIT 1`,
        [organizationId, domain]
      );

      if (result.rows.length > 0) {
        return { id: result.rows[0].id, name: result.rows[0].name };
      }
    }

    // Try exact match on customer email
    let result = await query(
      `SELECT id, name FROM customers
       WHERE organization_id = $1
       AND LOWER(email) = LOWER($2)
       LIMIT 1`,
      [organizationId, email]
    );

    if (result.rows.length > 0) {
      return { id: result.rows[0].id, name: result.rows[0].name };
    }

    // Try matching by email domain
    if (domain) {
      result = await query(
        `SELECT id, name FROM customers
         WHERE organization_id = $1
         AND LOWER(email) LIKE $2
         LIMIT 1`,
        [organizationId, `%@${domain}`]
      );

      if (result.rows.length > 0) {
        return { id: result.rows[0].id, name: result.rows[0].name };
      }

      // Also check import_aliases for domain matches
      result = await query(
        `SELECT id, name FROM customers
         WHERE organization_id = $1
         AND EXISTS (
           SELECT 1 FROM unnest(import_aliases) alias
           WHERE LOWER(alias) LIKE $2
         )
         LIMIT 1`,
        [organizationId, `%${domain}%`]
      );

      if (result.rows.length > 0) {
        return { id: result.rows[0].id, name: result.rows[0].name };
      }
    }

    return null;
  }

  /**
   * Find known vendor by email domain pattern
   */
  private findKnownVendor(domain: string | undefined): typeof InvoiceProcessorService.KNOWN_VENDORS[0] | null {
    if (!domain) return null;

    for (const vendor of InvoiceProcessorService.KNOWN_VENDORS) {
      for (const pattern of vendor.patterns) {
        // Exact match or subdomain match (e.g., mail.hetzner.com matches hetzner.com)
        if (domain === pattern || domain.endsWith(`.${pattern}`)) {
          return vendor;
        }
      }
    }
    return null;
  }

  /**
   * Get canonical vendor name from email domain
   * Useful for suggesting vendor names during invoice review
   */
  getCanonicalVendorName(email: string): string | null {
    const domain = email.split('@')[1]?.toLowerCase();
    const knownVendor = this.findKnownVendor(domain);
    return knownVendor?.canonicalName || null;
  }

  /**
   * Save attachment to filesystem
   */
  async saveAttachment(
    organizationId: string,
    attachment: EmailAttachment,
    emailId: string
  ): Promise<{ path: string; filename: string } | null> {
    if (!attachment.contentBytes) {
      logger.info(`No content bytes for attachment: ${attachment.name}`);
      return null;
    }

    const uploadDir = await this.ensureUploadDir(organizationId);

    // Generate unique filename
    const ext = path.extname(attachment.name) || '.pdf';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${uuidv4().substring(0, 8)}${ext}`;
    const filePath = path.join(uploadDir, filename);

    try {
      // Decode base64 content and save
      const buffer = Buffer.from(attachment.contentBytes, 'base64');
      await fs.promises.writeFile(filePath, buffer);

      logger.info(`Saved attachment: ${filePath} (${buffer.length} bytes)`);
      return { path: filePath, filename };
    } catch (error: any) {
      logger.error(`Failed to save attachment ${attachment.name}:`, error.message);
      return null;
    }
  }

  /**
   * Process a single email
   */
  async processEmail(
    organizationId: string,
    email: EmailMessage
  ): Promise<{ status: 'draft' | 'failed' | 'skipped'; documentsCreated: number; error?: string }> {
    // Check if already processed
    if (await this.isEmailProcessed(organizationId, email.id)) {
      return { status: 'skipped', documentsCreated: 0 };
    }

    // Skip emails without attachments.
    // Note: hasAttachments is treated as a hint only – some mail clients (e.g. certain ERP systems)
    // send PDFs as inline attachments which Microsoft Graph may not always reflect in hasAttachments.
    // We therefore skip only when hasAttachments is explicitly false AND we trust the flag.
    // The actual attachment fetch below is the authoritative check.
    if (!email.hasAttachments) {
      // Still record it to avoid reprocessing
      await this.recordProcessedEmail(organizationId, email, [], 'skipped', 'Keine Anhänge');
      return { status: 'skipped', documentsCreated: 0 };
    }

    try {
      // Get attachments
      const attachments = await mailboxMonitorService.getAttachments(
        organizationId,
        email.id,
        'invoice'
      );

      if (attachments.length === 0) {
        await this.recordProcessedEmail(organizationId, email, [], 'skipped', 'Keine Anhänge gefunden');
        return { status: 'skipped', documentsCreated: 0 };
      }

      // Filter for relevant attachments (PDFs, images).
      // isInline PDFs are explicitly included: some invoicing systems (e.g. DATEV, Lexware)
      // send the invoice PDF as an inline attachment (isInline=true) rather than a regular one.
      const relevantAttachments = attachments.filter(att => {
        const ext = path.extname(att.name).toLowerCase();
        const mimeType = att.contentType?.toLowerCase() || '';
        const isPdfOrImage = (
          ext === '.pdf' ||
          ext === '.png' ||
          ext === '.jpg' ||
          ext === '.jpeg' ||
          mimeType.includes('pdf') ||
          mimeType.includes('image')
        );
        if (!isPdfOrImage) return false;
        // Exclude inline attachments that are clearly email signatures or logos
        // (small images < 50 KB that are marked as inline). Full PDF invoices are always kept.
        if (att.isInline && !mimeType.includes('pdf') && ext !== '.pdf' && att.size < 51200) {
          logger.info(`Skipping small inline image (likely signature/logo): ${att.name} (${att.size} bytes)`);
          return false;
        }
        return true;
      });

      if (relevantAttachments.length === 0) {
        await this.recordProcessedEmail(organizationId, email, [], 'skipped', 'Keine PDF/Bild-Anhänge');
        return { status: 'skipped', documentsCreated: 0 };
      }

      // Find vendor
      const vendor = await this.findVendorByEmail(organizationId, email.from.email);

      // First create the processed_invoice record to get its ID
      const processedId = await this.recordProcessedEmail(
        organizationId,
        email,
        [], // Will update document_ids later
        'draft',
        null,
        vendor?.id
      );

      // Save attachments and create document records
      const documentIds: string[] = [];

      for (const attachment of relevantAttachments) {
        const saved = await this.saveAttachment(organizationId, attachment, email.id);

        if (saved) {
          // Create document record with correct processed_invoice_id
          const docId = uuidv4();
          await query(
            `INSERT INTO invoice_documents (
              id, organization_id, processed_invoice_id, filename, original_filename,
              mime_type, size, storage_path, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              docId,
              organizationId,
              processedId, // Use the actual processed_invoice ID
              saved.filename,
              attachment.name,
              attachment.contentType || 'application/pdf',
              attachment.size,
              saved.path,
            ]
          );
          documentIds.push(docId);
        }
      }

      // Update document_ids and attachment_count in processed_invoices
      if (documentIds.length > 0) {
        await query(
          `UPDATE processed_invoices
           SET document_ids = $1, attachment_count = $2
           WHERE id = $3`,
          [JSON.stringify(documentIds), documentIds.length, processedId]
        );
      }

      // Mark email as read
      await mailboxMonitorService.markAsRead(organizationId, email.id, 'invoice');

      logger.info(`Created invoice draft: ${email.subject} (${documentIds.length} documents)`);
      return { status: 'draft', documentsCreated: documentIds.length };

    } catch (error: any) {
      logger.error(`Failed to process email ${email.id}:`, error.message);
      await this.recordProcessedEmail(organizationId, email, [], 'failed', error.message);
      return { status: 'failed', documentsCreated: 0, error: error.message };
    }
  }

  /**
   * Record a processed email in the database
   */
  async recordProcessedEmail(
    organizationId: string,
    email: EmailMessage,
    documentIds: string[],
    status: 'pending' | 'draft' | 'processed' | 'failed' | 'skipped',
    errorMessage: string | null,
    vendorId: string | null = null
  ): Promise<string> {
    const id = uuidv4();

    // ON CONFLICT muss die WHERE-Klausel des partiellen Index spiegeln, der
    // den alten UNIQUE-Constraint nach der SSOT-Migration ersetzt hat -
    // sonst kann PostgreSQL den Conflict-Target nicht inferieren.
    await query(
      `INSERT INTO processed_invoices (
        id, organization_id, email_id, email_subject, sender_email, sender_name,
        received_at, attachment_count, document_ids, vendor_id, status, error_message, processed_at, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 'email')
      ON CONFLICT (organization_id, email_id) WHERE email_id IS NOT NULL DO UPDATE SET
        status = $11,
        error_message = $12,
        document_ids = $9,
        vendor_id = $10,
        processed_at = NOW()`,
      [
        id,
        organizationId,
        email.id,
        email.subject,
        email.from.email,
        email.from.name,
        email.receivedDateTime,
        documentIds.length,
        JSON.stringify(documentIds),
        vendorId,
        status,
        errorMessage,
      ]
    );

    return id;
  }

  /**
   * Process all unread emails in the invoice mailbox
   * @param includeRead - If true, also fetch already read emails (for re-processing)
   */
  async processInvoiceMailbox(
    organizationId: string,
    options: { includeRead?: boolean } = {}
  ): Promise<ProcessingResult> {
    const { includeRead = false } = options;
    logger.info(`Starting invoice mailbox processing for organization: ${organizationId} (includeRead: ${includeRead})`);

    // Check if invoice mailbox is configured
    const config = await getConfig(organizationId);
    if (!config?.invoiceMailbox) {
      return {
        success: false,
        processedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    // Get emails (optionally including already read ones)
    const emailResult = await mailboxMonitorService.getUnreadEmails(organizationId, {
      maxResults: 50,
      mailboxType: 'invoice',
      includeRead,
    });

    if (!emailResult.success) {
      logger.error('Failed to get emails:', emailResult.error);
      return {
        success: false,
        processedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const results: ProcessingResult['results'] = [];
    let processedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Process each email
    for (const email of emailResult.emails) {
      const result = await this.processEmail(organizationId, email);

      results.push({
        emailId: email.id,
        subject: email.subject,
        status: result.status,
        documentsCreated: result.documentsCreated,
        error: result.error,
      });

      switch (result.status) {
        case 'draft':
          processedCount++;  // Count drafts as "processed" for UI
          break;
        case 'skipped':
          skippedCount++;
          break;
        case 'failed':
          failedCount++;
          break;
      }
    }

    logger.info(`Invoice processing complete: ${processedCount} processed, ${skippedCount} skipped, ${failedCount} failed`);

    return {
      success: true,
      processedCount,
      skippedCount,
      failedCount,
      results,
    };
  }

  /**
   * Get processed invoices for an organization
   */
  async getProcessedInvoices(
    organizationId: string,
    options: {
      status?: string;
      source?: string;  // 'email,manual,sevdesk_import' comma-separiert moeglich
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ invoices: ProcessedInvoice[]; total: number }> {
    const { status, source, limit = 50, offset = 0 } = options;

    let whereClause = 'WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      params.push(statuses);
      whereClause += ` AND status = ANY($${params.length})`;
    }
    if (source) {
      const sources = source.split(',').map(s => s.trim()).filter(Boolean);
      params.push(sources);
      whereClause += ` AND source = ANY($${params.length})`;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM processed_invoices ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get invoices
    params.push(limit, offset);
    const result = await query(
      `SELECT * FROM processed_invoices ${whereClause}
       ORDER BY received_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const invoices: ProcessedInvoice[] = result.rows.map(row => ({
      id: row.id,
      organizationId: row.organization_id,
      emailId: row.email_id,
      emailSubject: row.email_subject,
      senderEmail: row.sender_email,
      senderName: row.sender_name,
      receivedAt: row.received_at,
      attachmentCount: row.attachment_count,
      documentIds: row.document_ids || [],
      vendorId: row.vendor_id,
      status: row.status,
      errorMessage: row.error_message,
      processedAt: row.processed_at,
      source: row.source || 'email',
      originalFilename: row.original_filename,
      sevdeskVoucherId: row.sevdesk_voucher_id,
      sevdeskVoucherNumber: row.sevdesk_voucher_number,
      invoiceNumber: row.invoice_number,
      supplierName: row.supplier_name,
      invoiceDate: row.invoice_date,
      netAmount: row.net_amount !== null ? Number(row.net_amount) : null,
      grossAmount: row.gross_amount !== null ? Number(row.gross_amount) : null,
      vatAmount: row.vat_amount !== null ? Number(row.vat_amount) : null,
      currency: row.currency,
    }));

    return { invoices, total };
  }

  /**
   * Get documents for a processed invoice
   */
  async getInvoiceDocuments(processedInvoiceId: string): Promise<InvoiceDocument[]> {
    const result = await query(
      `SELECT * FROM invoice_documents WHERE processed_invoice_id = $1 ORDER BY created_at`,
      [processedInvoiceId]
    );

    return result.rows.map(row => ({
      id: row.id,
      organizationId: row.organization_id,
      processedInvoiceId: row.processed_invoice_id,
      filename: row.filename,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      size: row.size,
      storagePath: row.storage_path,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get a single document by ID (for download)
   */
  async getDocument(documentId: string, organizationId: string): Promise<InvoiceDocument | null> {
    const result = await query(
      `SELECT * FROM invoice_documents WHERE id = $1 AND organization_id = $2`,
      [documentId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      organizationId: row.organization_id,
      processedInvoiceId: row.processed_invoice_id,
      filename: row.filename,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      size: row.size,
      storagePath: row.storage_path,
      createdAt: row.created_at,
    };
  }

  /**
   * Approve a draft invoice (mark as processed and create sevDesk voucher)
   */
  async approveDraft(organizationId: string, processedInvoiceId: string): Promise<boolean> {
    // Get the invoice details
    const invoiceResult = await query(
      `SELECT pi.*, c.name as vendor_name
       FROM processed_invoices pi
       LEFT JOIN customers c ON pi.vendor_id = c.id
       WHERE pi.id = $1 AND pi.organization_id = $2 AND pi.status = 'draft'`,
      [processedInvoiceId, organizationId]
    );

    if (invoiceResult.rows.length === 0) {
      return false;
    }

    const invoice = invoiceResult.rows[0];

    // Get the first document for this invoice
    const docResult = await query(
      `SELECT * FROM invoice_documents
       WHERE processed_invoice_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [processedInvoiceId]
    );

    let sevdeskVoucherId: string | null = null;

    // Try to create sevDesk voucher if we have a document
    if (docResult.rows.length > 0) {
      try {
        // Get sevDesk API token for this organization
        const configResult = await query(
          `SELECT api_token FROM sevdesk_config WHERE organization_id = $1`,
          [organizationId]
        );

        if (configResult.rows.length > 0 && configResult.rows[0].api_token) {
          const apiToken = configResult.rows[0].api_token;
          const doc = docResult.rows[0];

          // Read the file
          const fileBuffer = await fs.promises.readFile(doc.storage_path);

          // Upload to sevDesk
          const uploadResult = await uploadVoucherFile(
            apiToken,
            fileBuffer,
            doc.original_filename,
            doc.mime_type
          );

          // Create voucher
          const voucherResult = await createVoucherFromFile(
            apiToken,
            uploadResult.id,
            {
              voucherDate: invoice.received_at || new Date().toISOString(),
              description: invoice.email_subject || 'Eingangsrechnung',
              supplierName: invoice.vendor_name || invoice.sender_name || undefined,
              creditDebit: 'D', // Debit = Ausgabe (Eingangsrechnung)
            }
          );

          sevdeskVoucherId = voucherResult.voucherId;
          logger.info(`Created sevDesk voucher ${sevdeskVoucherId} for invoice ${processedInvoiceId}`);
        }
      } catch (err) {
        logger.error(`Failed to create sevDesk voucher for invoice ${processedInvoiceId}:`, err);
        // Continue anyway - we still mark as processed even if sevDesk fails
      }
    }

    // Update the invoice status
    const updateResult = await query(
      `UPDATE processed_invoices
       SET status = 'processed', processed_at = NOW(), sevdesk_voucher_id = $3
       WHERE id = $1 AND organization_id = $2 AND status = 'draft'
       RETURNING id`,
      [processedInvoiceId, organizationId, sevdeskVoucherId]
    );

    return updateResult.rows.length > 0;
  }

  /**
   * Revert a processed invoice back to draft
   */
  async revertToDraft(organizationId: string, processedInvoiceId: string): Promise<boolean> {
    const result = await query(
      `UPDATE processed_invoices
       SET status = 'draft', processed_at = NULL
       WHERE id = $1 AND organization_id = $2 AND status = 'processed'
       RETURNING id`,
      [processedInvoiceId, organizationId]
    );
    return result.rows.length > 0;
  }

  /**
   * Delete a draft invoice and its documents
   */
  async deleteDraft(organizationId: string, processedInvoiceId: string): Promise<boolean> {
    // Get document paths to delete files
    const docs = await query(
      `SELECT storage_path FROM invoice_documents
       WHERE processed_invoice_id = $1`,
      [processedInvoiceId]
    );

    // Delete files from filesystem
    for (const doc of docs.rows) {
      try {
        await fs.promises.unlink(doc.storage_path);
      } catch (err) {
        logger.error(`Failed to delete file: ${doc.storage_path}`);
      }
    }

    // Delete documents
    await query(
      `DELETE FROM invoice_documents WHERE processed_invoice_id = $1`,
      [processedInvoiceId]
    );

    // Delete invoice record
    const result = await query(
      `DELETE FROM processed_invoices
       WHERE id = $1 AND organization_id = $2 AND status = 'draft'
       RETURNING id`,
      [processedInvoiceId, organizationId]
    );

    return result.rows.length > 0;
  }

  /**
   * Clear all failed entries to allow reprocessing
   */
  async clearFailedEntries(organizationId: string): Promise<number> {
    const result = await query(
      `DELETE FROM processed_invoices
       WHERE organization_id = $1 AND status = 'failed'
       RETURNING id`,
      [organizationId]
    );
    return result.rows.length;
  }

  /**
   * Clear ALL entries (for testing/reset purposes)
   */
  async clearAllEntries(organizationId: string): Promise<number> {
    // First get all document paths to delete files
    const docs = await query(
      `SELECT d.storage_path FROM invoice_documents d
       JOIN processed_invoices p ON d.processed_invoice_id = p.id
       WHERE p.organization_id = $1`,
      [organizationId]
    );

    // Delete files from filesystem
    for (const doc of docs.rows) {
      try {
        if (doc.storage_path && fs.existsSync(doc.storage_path)) {
          await fs.promises.unlink(doc.storage_path);
        }
      } catch (err) {
        logger.error(`Failed to delete file: ${doc.storage_path}`);
      }
    }

    // Delete all documents for this org's invoices
    await query(
      `DELETE FROM invoice_documents
       WHERE processed_invoice_id IN (
         SELECT id FROM processed_invoices WHERE organization_id = $1
       )`,
      [organizationId]
    );

    // Delete all invoice records
    const result = await query(
      `DELETE FROM processed_invoices
       WHERE organization_id = $1
       RETURNING id`,
      [organizationId]
    );
    return result.rows.length;
  }

  /**
   * Re-fetch attachments for an existing processed invoice that has no documents
   */
  async refetchAttachments(organizationId: string, processedInvoiceId: string): Promise<boolean> {
    // Get the invoice record
    const invoiceResult = await query(
      `SELECT email_id FROM processed_invoices WHERE id = $1 AND organization_id = $2`,
      [processedInvoiceId, organizationId]
    );

    if (invoiceResult.rows.length === 0 || !invoiceResult.rows[0].email_id) {
      logger.info(`No email_id for invoice ${processedInvoiceId}`);
      return false;
    }

    const emailId = invoiceResult.rows[0].email_id;

    // Fetch attachments from Graph API
    const attachments = await mailboxMonitorService.getAttachments(organizationId, emailId, 'invoice');

    if (attachments.length === 0) {
      logger.info(`No attachments found for email ${emailId}`);
      return false;
    }

    // Filter for PDFs and images
    const relevantAttachments = attachments.filter(att =>
      att.contentType?.includes('pdf') ||
      att.contentType?.includes('image') ||
      att.name?.toLowerCase().endsWith('.pdf') ||
      att.name?.toLowerCase().endsWith('.png') ||
      att.name?.toLowerCase().endsWith('.jpg') ||
      att.name?.toLowerCase().endsWith('.jpeg')
    );

    if (relevantAttachments.length === 0) {
      logger.info(`No PDF/image attachments for email ${emailId}`);
      return false;
    }

    // Save attachments
    const documentIds: string[] = [];
    for (const attachment of relevantAttachments) {
      const saved = await this.saveAttachment(organizationId, attachment, emailId);

      if (saved) {
        const docId = uuidv4();
        await query(
          `INSERT INTO invoice_documents (
            id, organization_id, processed_invoice_id, filename, original_filename,
            mime_type, size, storage_path, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            docId,
            organizationId,
            processedInvoiceId,
            saved.filename,
            attachment.name,
            attachment.contentType || 'application/pdf',
            attachment.size || 0,
            saved.path
          ]
        );
        documentIds.push(docId);
      }
    }

    if (documentIds.length > 0) {
      // Update the invoice record with document IDs
      await query(
        `UPDATE processed_invoices SET document_ids = $1, attachment_count = $2 WHERE id = $3`,
        [JSON.stringify(documentIds), documentIds.length, processedInvoiceId]
      );
      logger.info(`Saved ${documentIds.length} attachments for invoice ${processedInvoiceId}`);
      return true;
    }

    return false;
  }

  /**
   * Extract invoice data from PDF using text extraction and AI parsing
   */
  async extractInvoiceData(
    organizationId: string,
    processedInvoiceId: string,
    options: { force?: boolean } = {},
  ): Promise<ExtractedInvoiceData | null> {
    // Cache-Pfad: wenn bereits extrahiert und nicht explizit erzwungen, gib
    // die persistierten strukturierten Felder zurueck ohne PDF re-parsing
    // oder Vision-Call (das spart Geld bei OpenAI-Konfigurationen).
    if (!options.force) {
      const cached = await this.getStoredExtraction(processedInvoiceId);
      if (cached) {
        logger.info(`Returning cached extraction for invoice ${processedInvoiceId}`);
        return cached;
      }
    }

    // Get the invoice with email info for fallback extraction
    const invoiceResult = await query(
      `SELECT * FROM processed_invoices WHERE id = $1`,
      [processedInvoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      logger.info('Invoice not found:', processedInvoiceId);
      return null;
    }

    const invoice = invoiceResult.rows[0];

    // Get the first document for this invoice
    const docResult = await query(
      `SELECT * FROM invoice_documents
       WHERE processed_invoice_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [processedInvoiceId]
    );

    // Start with fallback extraction from email metadata
    let result = this.extractFromEmailMetadata(invoice);
    logger.info('Email metadata extraction:', result);

    if (docResult.rows.length === 0) {
      logger.info('No documents found for invoice', processedInvoiceId);
      return result;
    }

    const doc = docResult.rows[0];

    // Only process PDFs
    if (!doc.mime_type?.includes('pdf') && !doc.original_filename?.toLowerCase().endsWith('.pdf')) {
      logger.info('Document is not a PDF:', doc.mime_type);
      return result;
    }

    try {
      // Read the PDF file
      const fileBuffer = await fs.promises.readFile(doc.storage_path);

      // Extract text from PDF
      const pdfData = await pdfParse(fileBuffer);
      const rawText = pdfData.text;
      logger.info('PDF text length:', rawText?.length || 0);
      logger.info('PDF text preview:', rawText?.substring(0, 500));

      if (!rawText || rawText.trim().length < 50) {
        logger.info('PDF has insufficient text content');
        result.rawText = 'PDF enthält keinen extrahierbaren Text';
        return result;
      }

      // Try to extract data using regex patterns first (faster, no API cost)
      const regexExtraction = this.extractWithRegex(rawText);
      logger.info('Regex extraction:', regexExtraction);

      // Merge regex extraction with email fallback (prefer regex if found)
      result = {
        ...result,
        supplierName: regexExtraction.supplierName || result.supplierName,
        invoiceNumber: regexExtraction.invoiceNumber || result.invoiceNumber,
        invoiceDate: regexExtraction.invoiceDate || result.invoiceDate,
        dueDate: regexExtraction.dueDate || result.dueDate,
        netAmount: regexExtraction.netAmount ?? result.netAmount,
        grossAmount: regexExtraction.grossAmount ?? result.grossAmount,
        vatAmount: regexExtraction.vatAmount ?? result.vatAmount,
        vatRate: regexExtraction.vatRate ?? result.vatRate,
        currency: regexExtraction.currency || result.currency,
        iban: regexExtraction.iban || result.iban,
        bic: regexExtraction.bic || result.bic,
        taxId: regexExtraction.taxId || result.taxId,
        customerNumber: regexExtraction.customerNumber || result.customerNumber,
        confidence: Math.max(regexExtraction.confidence, result.confidence),
        rawText: rawText.substring(0, 2000),
      };

      // Get AI config for this organization to use AI parsing if available
      const aiConfigResult = await query(
        `SELECT ac.* FROM ai_config ac
         JOIN users u ON ac.user_id = u.id
         JOIN organization_members om ON u.id = om.user_id
         WHERE om.organization_id = $1 AND ac.enabled = true AND ac.api_key IS NOT NULL
         LIMIT 1`,
        [organizationId]
      );

      logger.info('AI config found:', aiConfigResult.rows.length > 0 ? 'Yes' : 'No');

      // If OpenAI is configured, always use Vision for best results (includes line items)
      if (aiConfigResult.rows.length > 0) {
        const aiConfig = aiConfigResult.rows[0];
        logger.info('AI provider:', aiConfig.provider);

        if (aiConfig.provider === 'openai') {
          // Use Vision directly for best extraction (handles scanned PDFs, extracts line items)
          logger.info('Using OpenAI Vision for comprehensive extraction...');
          const visionExtraction = await this.extractWithVision(fileBuffer, aiConfig);
          logger.info('Vision extraction result:', visionExtraction);

          if (visionExtraction.confidence > 0) {
            // Merge Vision extraction with existing data (Vision takes precedence)
            result = {
              ...result,
              ...visionExtraction,
              // Keep rawText from PDF parsing
              rawText: result.rawText,
              // Use higher confidence from Vision
              confidence: visionExtraction.confidence,
            };
          }
        } else {
          // For Anthropic, use text-based extraction
          logger.info('Using text-based AI extraction...');
          const aiExtraction = await this.extractWithAI(rawText, aiConfig);
          logger.info('AI extraction:', aiExtraction);

          result = {
            ...result,
            ...aiExtraction,
            rawText: rawText.substring(0, 2000),
            confidence: aiExtraction.confidence > 0 ? aiExtraction.confidence : result.confidence,
          };
        }
      } else {
        logger.info('No AI config found - using regex/email extraction only');
      }

      // Persist the extracted text + structured fields into processed_invoices.full_text
      // so the search-vector trigger can index the receipt's content. Done after
      // the full pipeline (regex + AI) so the most enriched data lands in search.
      await this.persistExtractedData(processedInvoiceId, rawText, result);

      return result;

    } catch (error: any) {
      logger.error('Error extracting invoice data:', error.message);
      result.rawText = `Fehler: ${error.message}`;
      return result;
    }
  }

  /**
   * Persist the full extraction result into processed_invoices: full_text
   * (rawText + structured-concat for FTS) PLUS every structured field as its
   * own typed column. extracted_at acts as the "fresh cache" signal — next
   * extractInvoiceData call can return the stored data without re-running OCR
   * unless force=true. Non-fatal on error.
   */
  private async persistExtractedData(
    processedInvoiceId: string,
    rawText: string,
    extracted: ExtractedInvoiceData,
  ): Promise<void> {
    const cappedRaw = (rawText || '').substring(0, 10000);
    const structuredParts = [
      extracted.supplierName,
      extracted.supplierAddress,
      extracted.taxId,
      extracted.invoiceNumber,
      extracted.orderNumber,
      extracted.customerNumber,
      extracted.iban,
      extracted.bic,
      extracted.paymentMethod,
    ].filter(Boolean).join(' ');
    const fullText = [structuredParts, cappedRaw].filter(Boolean).join('\n');
    try {
      await query(
        `UPDATE processed_invoices SET
           full_text = $1,
           supplier_name = $2,
           supplier_address = $3,
           supplier_tax_id = $4,
           invoice_number = $5,
           customer_number = $6,
           invoice_date = $7,
           due_date = $8,
           net_amount = $9,
           gross_amount = $10,
           vat_amount = $11,
           vat_rate = $12,
           currency = COALESCE($13, currency),
           iban = $14,
           bic = $15,
           payment_method = $16,
           extracted_at = NOW(),
           extraction_confidence = $17
         WHERE id = $18`,
        [
          fullText,
          extracted.supplierName,
          extracted.supplierAddress,
          extracted.taxId,
          extracted.invoiceNumber,
          extracted.customerNumber,
          extracted.invoiceDate,
          extracted.dueDate,
          extracted.netAmount,
          extracted.grossAmount,
          extracted.vatAmount,
          extracted.vatRate,
          extracted.currency,
          extracted.iban,
          extracted.bic,
          extracted.paymentMethod,
          extracted.confidence,
          processedInvoiceId,
        ]
      );
    } catch (err: any) {
      logger.error(`Failed to persist extracted data for invoice ${processedInvoiceId}: ${err.message}`);
      // Non-fatal — search just won't find this invoice until next extraction.
    }
  }

  /**
   * Read the previously persisted extraction back from processed_invoices
   * columns into the ExtractedInvoiceData shape. Returns null if no extraction
   * has been run yet (extracted_at IS NULL).
   */
  private async getStoredExtraction(processedInvoiceId: string): Promise<ExtractedInvoiceData | null> {
    const result = await query(
      `SELECT supplier_name, supplier_address, supplier_tax_id, customer_number,
              invoice_number, invoice_date, due_date,
              net_amount, gross_amount, vat_amount, vat_rate, currency,
              iban, bic, payment_method,
              extraction_confidence, extracted_at
       FROM processed_invoices WHERE id = $1`,
      [processedInvoiceId]
    );
    if (result.rows.length === 0 || !result.rows[0].extracted_at) return null;
    const r = result.rows[0];
    return {
      supplierName: r.supplier_name,
      supplierAddress: r.supplier_address,
      taxId: r.supplier_tax_id,
      recipientName: null,
      recipientAddress: null,
      customerNumber: r.customer_number,
      invoiceNumber: r.invoice_number,
      orderNumber: null,
      invoiceDate: r.invoice_date ? new Date(r.invoice_date).toISOString().slice(0, 10) : null,
      dueDate: r.due_date ? new Date(r.due_date).toISOString().slice(0, 10) : null,
      deliveryDate: null,
      netAmount: r.net_amount !== null ? Number(r.net_amount) : null,
      grossAmount: r.gross_amount !== null ? Number(r.gross_amount) : null,
      vatAmount: r.vat_amount !== null ? Number(r.vat_amount) : null,
      vatRate: r.vat_rate !== null ? Number(r.vat_rate) : null,
      currency: r.currency || 'EUR',
      paymentMethod: r.payment_method,
      iban: r.iban,
      bic: r.bic,
      confidence: r.extraction_confidence !== null ? Number(r.extraction_confidence) : 0,
    };
  }

  /**
   * Extract data from email metadata (subject, sender) as fallback
   */
  private extractFromEmailMetadata(invoice: any): ExtractedInvoiceData {
    const result: ExtractedInvoiceData = {
      supplierName: null,
      supplierAddress: null,
      taxId: null,
      recipientName: null,
      recipientAddress: null,
      customerNumber: null,
      invoiceNumber: null,
      orderNumber: null,
      invoiceDate: null,
      dueDate: null,
      deliveryDate: null,
      netAmount: null,
      grossAmount: null,
      vatAmount: null,
      vatRate: 19,
      currency: 'EUR',
      paymentMethod: null,
      iban: null,
      bic: null,
      confidence: 0.2,
    };

    const subject = invoice.email_subject || '';
    const senderName = invoice.sender_name || '';
    const senderEmail = invoice.sender_email || '';

    // Extract invoice number from subject
    // Patterns: "Rechnung 1258543", "RE-12345", "Invoice #123", etc.
    const invoiceNumberPatterns = [
      /Rechnung\s*[:#]?\s*(\d+)/i,
      /RE[-\s]?(\d+)/i,
      /Invoice\s*[:#]?\s*(\d+)/i,
      /Nr\.?\s*[:#]?\s*(\d+)/i,
      /(\d{6,})/,  // Any 6+ digit number as last resort
    ];

    for (const pattern of invoiceNumberPatterns) {
      const match = subject.match(pattern);
      if (match && match[1]) {
        result.invoiceNumber = match[1];
        break;
      }
    }

    // Extract supplier name from sender
    // Pattern: "Nina Moscato | ELOVADE" -> "ELOVADE"
    // Pattern: "Max Mustermann (Firma GmbH)" -> "Firma GmbH"
    // Pattern: sender email domain -> "elovade" from "info@elovade.com"
    if (senderName) {
      // Try to extract company name after | or from ()
      const pipeMatch = senderName.match(/\|\s*(.+)$/);
      const parenMatch = senderName.match(/\(([^)]+)\)/);
      const companyMatch = senderName.match(/([A-Za-zäöüÄÖÜß\s&\.\-]+(?:GmbH|AG|KG|OHG|e\.?V\.?|UG|mbH|Inc\.?|Ltd\.?|LLC))/i);

      if (pipeMatch && pipeMatch[1]) {
        result.supplierName = pipeMatch[1].trim();
      } else if (parenMatch && parenMatch[1]) {
        result.supplierName = parenMatch[1].trim();
      } else if (companyMatch && companyMatch[1]) {
        result.supplierName = companyMatch[1].trim();
      } else if (senderName.length > 2 && senderName.length < 100) {
        // Use full sender name if it's reasonable length
        result.supplierName = senderName.trim();
      }
    }

    // If no supplier name found, try to extract from email domain
    if (!result.supplierName && senderEmail) {
      const domainMatch = senderEmail.match(/@([^.]+)\./);
      if (domainMatch && domainMatch[1] && domainMatch[1].length > 2) {
        // Capitalize first letter
        const domain = domainMatch[1];
        result.supplierName = domain.charAt(0).toUpperCase() + domain.slice(1);
      }
    }

    // Try to extract date from subject
    const dateMatch = subject.match(/(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/);
    if (dateMatch) {
      result.invoiceDate = this.parseGermanDate(dateMatch[1]);
    }

    // Use received date as fallback for invoice date
    if (!result.invoiceDate && invoice.received_at) {
      const received = new Date(invoice.received_at);
      if (!isNaN(received.getTime())) {
        result.invoiceDate = received.toISOString().split('T')[0];
      }
    }

    return result;
  }

  private createEmptyExtraction(reason: string): ExtractedInvoiceData {
    return {
      supplierName: null,
      supplierAddress: null,
      taxId: null,
      recipientName: null,
      recipientAddress: null,
      customerNumber: null,
      invoiceNumber: null,
      orderNumber: null,
      invoiceDate: null,
      dueDate: null,
      deliveryDate: null,
      netAmount: null,
      grossAmount: null,
      vatAmount: null,
      vatRate: null,
      currency: 'EUR',
      paymentMethod: null,
      iban: null,
      bic: null,
      confidence: 0,
      rawText: reason,
    };
  }

  private needsAIExtraction(extraction: ExtractedInvoiceData): boolean {
    // Use AI if we're missing critical fields
    return !extraction.supplierName ||
           (!extraction.grossAmount && !extraction.netAmount) ||
           !extraction.invoiceNumber;
  }

  private extractWithRegex(text: string): ExtractedInvoiceData {
    const result: ExtractedInvoiceData = {
      supplierName: null,
      supplierAddress: null,
      taxId: null,
      recipientName: null,
      recipientAddress: null,
      customerNumber: null,
      invoiceNumber: null,
      orderNumber: null,
      invoiceDate: null,
      dueDate: null,
      deliveryDate: null,
      netAmount: null,
      grossAmount: null,
      vatAmount: null,
      vatRate: null,
      currency: 'EUR',
      paymentMethod: null,
      iban: null,
      bic: null,
      confidence: 0.3, // Low confidence for regex-only extraction
    };

    // Clean up text
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // Extract invoice number patterns
    const invoicePatterns = [
      /(?:Rechnung(?:s)?(?:nummer|nr\.?)?|Invoice(?:\s+No\.?)?|Beleg(?:nummer|nr\.?)?|RE-?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
      /(?:Nr\.|Nummer|No\.)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
    ];
    for (const pattern of invoicePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        result.invoiceNumber = match[1].trim();
        break;
      }
    }

    // Extract date patterns (German and ISO formats)
    const datePatterns = [
      /(?:Rechnungsdatum|Datum|Date|Belegdatum)\s*[:#]?\s*(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})/i,
      /(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4})/,
    ];
    for (const pattern of datePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        result.invoiceDate = this.parseGermanDate(match[1]);
        break;
      }
    }

    // Extract due date
    const dueDatePatterns = [
      /(?:Fällig(?:keit)?(?:sdatum)?|Zahlbar\s*bis|Due\s*(?:Date)?)\s*[:#]?\s*(\d{1,2}[\.\/\-]\d{1,2}[\.\/\-]\d{2,4})/i,
    ];
    for (const pattern of dueDatePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        result.dueDate = this.parseGermanDate(match[1]);
        break;
      }
    }

    // Extract amounts (German format with comma as decimal separator)
    const amountPatterns = {
      gross: [
        /(?:Gesamt(?:betrag|summe)?|Brutto(?:betrag)?|Total|Endbetrag|Rechnungsbetrag|Zu\s*zahlen(?:der\s*Betrag)?|Zahlbar|Fälliger\s*Betrag|Summe\s*brutto|Gesamtpreis)\s*[:#]?\s*(?:EUR|€)?\s*([\d\.,]+)\s*(?:EUR|€)?/i,
        /(?:EUR|€)\s*([\d\.,]+)\s*(?:Gesamt|Brutto|Total|Summe)/i,
        // Amount before label (common in tables)
        /([\d\.,]+)\s*(?:EUR|€)\s*(?:Gesamt|Brutto|Total|inkl\.?\s*MwSt)/i,
        // Simple "Summe:" or "Betrag:" patterns
        /(?:Summe|Betrag)\s*[:#]\s*(?:EUR|€)?\s*([\d\.,]+)/i,
      ],
      net: [
        /(?:Netto(?:betrag|summe)?|Zwischensumme|Subtotal|Summe\s*netto|Warenwert)\s*[:#]?\s*(?:EUR|€)?\s*([\d\.,]+)\s*(?:EUR|€)?/i,
        // Amount before label
        /([\d\.,]+)\s*(?:EUR|€)\s*(?:Netto|netto|exkl\.?\s*MwSt)/i,
      ],
      vat: [
        /(?:MwSt\.?|USt\.?|VAT|Mehrwertsteuer|Umsatzsteuer)\s*(?:\d+\s*%?)?\s*[:#]?\s*(?:EUR|€)?\s*([\d\.,]+)\s*(?:EUR|€)?/i,
        // Amount before label
        /([\d\.,]+)\s*(?:EUR|€)\s*(?:MwSt|USt|Steuer)/i,
      ],
    };

    // Extract gross amount
    for (const pattern of amountPatterns.gross) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        result.grossAmount = this.parseGermanNumber(match[1]);
        break;
      }
    }

    // Extract net amount
    for (const pattern of amountPatterns.net) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        result.netAmount = this.parseGermanNumber(match[1]);
        break;
      }
    }

    // Extract VAT amount
    for (const pattern of amountPatterns.vat) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        result.vatAmount = this.parseGermanNumber(match[1]);
        break;
      }
    }

    // Extract VAT rate
    const vatRateMatch = cleanText.match(/(?:MwSt\.?|USt\.?|VAT)\s*(\d{1,2})\s*%/i);
    if (vatRateMatch) {
      result.vatRate = parseInt(vatRateMatch[1], 10);
    }

    // Fallback: If no amounts found, try to find EUR amounts in the text
    if (!result.grossAmount && !result.netAmount) {
      // Find all EUR amounts in the text (format: X,XX € or € X,XX or X.XXX,XX EUR)
      const allAmounts: number[] = [];
      const eurPattern = /(?:EUR|€)\s*([\d\.,]+)|([\d\.,]+)\s*(?:EUR|€)/gi;
      let eurMatch;
      while ((eurMatch = eurPattern.exec(cleanText)) !== null) {
        const amountStr = eurMatch[1] || eurMatch[2];
        if (amountStr) {
          const amount = this.parseGermanNumber(amountStr);
          if (amount && amount > 0 && amount < 1000000) {
            allAmounts.push(amount);
          }
        }
      }

      // If we found amounts, use the largest as gross (likely total)
      if (allAmounts.length > 0) {
        allAmounts.sort((a, b) => b - a);
        result.grossAmount = allAmounts[0];

        // If we have multiple amounts and a VAT rate, try to calculate net
        if (allAmounts.length > 1 && result.vatRate) {
          const expectedNet = result.grossAmount / (1 + result.vatRate / 100);
          // Find the closest amount to expected net
          const closestNet = allAmounts.find(a =>
            Math.abs(a - expectedNet) < expectedNet * 0.02 // Within 2%
          );
          if (closestNet && closestNet !== result.grossAmount) {
            result.netAmount = closestNet;
          }
        }
      }
    }

    // Try to extract supplier name (usually at the top of the invoice)
    const firstLines = text.split('\n').slice(0, 10).join(' ').trim();
    // Look for company patterns
    const companyPatterns = [
      /^([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\s&\.\-]+(?:GmbH|AG|KG|OHG|e\.?V\.?|UG|mbH|Inc\.?|Ltd\.?|LLC))/m,
      /^([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\s&\.\-]{2,50})\n/m,
    ];
    for (const pattern of companyPatterns) {
      const match = firstLines.match(pattern);
      if (match && match[1] && match[1].length > 3) {
        result.supplierName = match[1].trim();
        break;
      }
    }

    // Extract IBAN (German format: DE followed by 20 characters)
    const ibanMatch = cleanText.match(/IBAN[:\s]*([A-Z]{2}\d{2}[\s]?(?:\d{4}[\s]?){4}\d{2}|\b[A-Z]{2}\d{20,22}\b)/i);
    if (ibanMatch) {
      result.iban = ibanMatch[1].replace(/\s/g, '').toUpperCase();
    }

    // Extract BIC/SWIFT
    const bicMatch = cleanText.match(/(?:BIC|SWIFT)[:\s]*([A-Z]{6}[A-Z0-9]{2,5})/i);
    if (bicMatch) {
      result.bic = bicMatch[1].toUpperCase();
    }

    // Extract Tax ID (USt-IdNr.)
    const taxIdMatch = cleanText.match(/(?:USt[.-]?(?:Id)?Nr\.?|VAT[- ]?ID|Steuernummer)[:\s]*([A-Z]{2}\d{9,12}|\d{2,3}\/?\d{3}\/?\d{5})/i);
    if (taxIdMatch) {
      result.taxId = taxIdMatch[1];
    }

    // Extract customer number
    const customerNoMatch = cleanText.match(/(?:Kunden(?:nummer|nr\.?)|Customer\s*(?:No\.?|Number))[:\s]*([A-Z0-9\-]+)/i);
    if (customerNoMatch) {
      result.customerNumber = customerNoMatch[1];
    }

    // Calculate confidence based on what we found
    let fieldsFound = 0;
    if (result.supplierName) fieldsFound++;
    if (result.invoiceNumber) fieldsFound++;
    if (result.invoiceDate) fieldsFound++;
    if (result.grossAmount || result.netAmount) fieldsFound++;
    result.confidence = Math.min(0.3 + (fieldsFound * 0.15), 0.75);

    return result;
  }

  private parseGermanDate(dateStr: string): string | null {
    try {
      // Handle DD.MM.YYYY or DD/MM/YYYY format
      const parts = dateStr.split(/[\.\/\-]/);
      if (parts.length === 3) {
        let day = parseInt(parts[0], 10);
        let month = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);

        // Handle 2-digit years
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }

        // Create ISO date string
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    } catch {
      return null;
    }
    return null;
  }

  private parseGermanNumber(numStr: string): number | null {
    try {
      // German format: 1.234,56 -> 1234.56
      // Remove thousand separators (dots or spaces)
      let cleaned = numStr.replace(/[\s\.]/g, '');
      // Replace comma with dot for decimal
      cleaned = cleaned.replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : Math.round(num * 100) / 100;
    } catch {
      return null;
    }
  }

  private async extractWithAI(text: string, aiConfig: any): Promise<ExtractedInvoiceData> {
    const prompt = `Analysiere den folgenden Rechnungstext und extrahiere die wichtigsten Informationen.

TEXT:
${text.substring(0, 4000)}

Antworte NUR im folgenden JSON-Format (keine anderen Texte):
{
  "supplierName": "Name des Lieferanten/Absenders",
  "invoiceNumber": "Rechnungsnummer",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD oder null",
  "netAmount": Nettobetrag als Zahl oder null,
  "grossAmount": Bruttobetrag als Zahl oder null,
  "vatAmount": MwSt-Betrag als Zahl oder null,
  "vatRate": MwSt-Satz als Zahl (z.B. 19) oder null,
  "currency": "EUR" oder andere Währung
}

Wichtig:
- Beträge als Zahlen ohne Währungssymbol
- Daten im ISO-Format (YYYY-MM-DD)
- Bei nicht gefundenen Werten: null
- supplierName ist der Absender/Lieferant, nicht der Empfänger`;

    try {
      const response = await this.callAI(aiConfig, prompt);

      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          supplierName: parsed.supplierName || null,
          supplierAddress: parsed.supplierAddress || null,
          taxId: parsed.taxId || null,
          recipientName: parsed.recipientName || null,
          recipientAddress: parsed.recipientAddress || null,
          customerNumber: parsed.customerNumber || null,
          invoiceNumber: parsed.invoiceNumber || null,
          orderNumber: parsed.orderNumber || null,
          invoiceDate: parsed.invoiceDate || null,
          dueDate: parsed.dueDate || null,
          deliveryDate: parsed.deliveryDate || null,
          netAmount: typeof parsed.netAmount === 'number' ? parsed.netAmount : null,
          grossAmount: typeof parsed.grossAmount === 'number' ? parsed.grossAmount : null,
          vatAmount: typeof parsed.vatAmount === 'number' ? parsed.vatAmount : null,
          vatRate: typeof parsed.vatRate === 'number' ? parsed.vatRate : null,
          currency: parsed.currency || 'EUR',
          paymentMethod: parsed.paymentMethod || null,
          iban: parsed.iban || null,
          bic: parsed.bic || null,
          confidence: 0.85, // Higher confidence for AI extraction
        };
      }
    } catch (error: any) {
      logger.error('AI extraction failed:', error.message);
    }

    return this.createEmptyExtraction('KI-Extraktion fehlgeschlagen');
  }

  /**
   * Extract invoice data using OpenAI Vision API (for scanned/image PDFs)
   */
  private async extractWithVision(pdfBuffer: Buffer, aiConfig: any): Promise<ExtractedInvoiceData> {
    logger.info('=== Starting Vision extraction ===');
    logger.info('AI Config:', { provider: aiConfig.provider, hasApiKey: !!aiConfig.api_key });

    // Only works with OpenAI
    if (aiConfig.provider !== 'openai') {
      logger.info('Vision extraction only available with OpenAI, got:', aiConfig.provider);
      return this.createEmptyExtraction('Vision nur mit OpenAI verfügbar');
    }

    const apiKey = aiConfig.api_key;
    if (!apiKey) {
      logger.info('No API key found in config');
      return this.createEmptyExtraction('Kein API-Key konfiguriert');
    }

    logger.info('API key found, length:', apiKey.length);

    try {
      // Convert ALL pages of PDF to images (max 5 pages to avoid token limits)
      logger.info('Converting PDF to images, buffer size:', pdfBuffer.length);
      let document;
      try {
        document = await pdf(pdfBuffer, { scale: 2.0 });
      } catch (pdfError: any) {
        logger.error('PDF to image conversion failed:', pdfError.message);
        logger.error('Full error:', pdfError);
        return this.createEmptyExtraction(`PDF-Konvertierung fehlgeschlagen: ${pdfError.message}`);
      }

      const pageImages: Buffer[] = [];
      const MAX_PAGES = 5; // Limit to avoid token overflow

      for await (const image of document) {
        pageImages.push(image);
        logger.info(`Got page ${pageImages.length} image, size: ${image.length} bytes`);
        if (pageImages.length >= MAX_PAGES) {
          logger.info(`Reached max pages limit (${MAX_PAGES})`);
          break;
        }
      }

      if (pageImages.length === 0) {
        logger.info('Failed to convert PDF to image - no pages extracted');
        return this.createEmptyExtraction('PDF konnte nicht in Bild konvertiert werden');
      }

      logger.info(`Extracted ${pageImages.length} page(s) from PDF`);

      // Build image content array for all pages
      const imageContents: Array<{ type: 'image_url'; image_url: { url: string; detail: string } }> = [];
      for (let i = 0; i < pageImages.length; i++) {
        const base64Image = pageImages[i].toString('base64');
        logger.info(`Page ${i + 1} converted to base64, size: ${Math.round(base64Image.length / 1024)} KB`);
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Image}`,
            detail: 'high',
          },
        });
      }

      // Build the prompt with improved field recognition
      const extractionPrompt = this.buildExtractionPrompt(pageImages.length);

      // Call OpenAI Vision API with all pages
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: extractionPrompt,
                },
                ...imageContents,
              ],
            },
          ],
          max_tokens: 6000,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Vision API error:', { status: response.status, body: errorText });
        return this.createEmptyExtraction(`Vision API Fehler: ${response.status}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content || '';
      logger.info('Vision API response:', content);

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Parse line items if present
        let lineItems: InvoiceLineItem[] | undefined = undefined;
        if (Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
          const parsedItems: InvoiceLineItem[] = parsed.lineItems.map((item: any) => ({
            position: this.parseNumberFromAny(item.position),
            description: item.description || '',
            articleNumber: item.articleNumber || null,
            customerName: item.customerName || null,
            quantity: this.parseNumberFromAny(item.quantity),
            unit: item.unit || null,
            unitPrice: this.parseNumberFromAny(item.unitPrice),
            totalPrice: this.parseNumberFromAny(item.totalPrice),
            vatRate: this.parseNumberFromAny(item.vatRate),
            period: item.period || null,
            productType: item.productType || null,
          }));
          lineItems = parsedItems;
          logger.info(`Extracted ${parsedItems.length} line items from ${pageImages.length} page(s)`);
        }

        return {
          // Supplier info
          supplierName: parsed.supplierName || null,
          supplierAddress: parsed.supplierAddress || null,
          taxId: parsed.taxId || null,

          // Recipient info
          recipientName: parsed.recipientName || null,
          recipientAddress: parsed.recipientAddress || null,
          customerNumber: parsed.customerNumber || null,

          // Invoice identifiers
          invoiceNumber: parsed.invoiceNumber || null,
          orderNumber: parsed.orderNumber || null,

          // Dates
          invoiceDate: parsed.invoiceDate || null,
          dueDate: parsed.dueDate || null,
          deliveryDate: parsed.deliveryDate || null,

          // Amounts
          netAmount: typeof parsed.netAmount === 'number' ? parsed.netAmount : this.parseNumberFromAny(parsed.netAmount),
          grossAmount: typeof parsed.grossAmount === 'number' ? parsed.grossAmount : this.parseNumberFromAny(parsed.grossAmount),
          vatAmount: typeof parsed.vatAmount === 'number' ? parsed.vatAmount : this.parseNumberFromAny(parsed.vatAmount),
          vatRate: typeof parsed.vatRate === 'number' ? parsed.vatRate : this.parseNumberFromAny(parsed.vatRate),
          currency: parsed.currency || 'EUR',

          // Payment info
          paymentMethod: parsed.paymentMethod || null,
          iban: parsed.iban || null,
          bic: parsed.bic || null,

          // Metadata
          confidence: 0.95, // High confidence for multi-page Vision extraction
          lineItems,
        };
      }

      return this.createEmptyExtraction('Keine JSON-Antwort von Vision API');

    } catch (error: any) {
      logger.error('=== Vision extraction error ===');
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
      return this.createEmptyExtraction(`Vision Fehler: ${error.message}`);
    }
  }

  /**
   * Build extraction prompt optimized for various invoice types
   */
  private buildExtractionPrompt(pageCount: number): string {
    const multiPageNote = pageCount > 1
      ? `\n\nDies ist eine mehrseitige Rechnung mit ${pageCount} Seiten. Analysiere ALLE Seiten um die vollständigen Informationen zu extrahieren. Positionen/Line Items können auf Folgeseiten sein!`
      : '';

    return `Analysiere diese Rechnung und extrahiere die folgenden Informationen.${multiPageNote}

Antworte NUR im folgenden JSON-Format (keine anderen Texte):
{
  "supplierName": "Name des Lieferanten/Rechnungsstellers",
  "supplierAddress": "Vollständige Adresse des Lieferanten oder null",
  "recipientName": "Name des Rechnungsempfängers (Kunde)",
  "recipientAddress": "Adresse des Empfängers oder null",
  "invoiceNumber": "Rechnungsnummer (auch: Belegnummer, RE-Nr., Invoice No.)",
  "orderNumber": "Bestellnummer/Auftragsnummer falls vorhanden oder null",
  "invoiceDate": "Rechnungsdatum im Format YYYY-MM-DD",
  "dueDate": "Fälligkeitsdatum YYYY-MM-DD oder null",
  "deliveryDate": "Lieferdatum/Leistungszeitraum oder null",
  "netAmount": Nettobetrag als Zahl,
  "grossAmount": Bruttobetrag/Gesamtbetrag als Zahl,
  "vatAmount": MwSt-Betrag als Zahl oder null,
  "vatRate": MwSt-Satz als Zahl (0, 7, oder 19) oder null,
  "currency": "EUR",
  "paymentMethod": "Zahlungsart (Überweisung, Lastschrift, etc.) oder null",
  "iban": "IBAN falls angegeben oder null",
  "bic": "BIC falls angegeben oder null",
  "taxId": "USt-IdNr. des Lieferanten oder null",
  "customerNumber": "Kundennummer beim Lieferanten oder null",
  "lineItems": [
    {
      "position": Positionsnummer als Zahl oder null,
      "description": "Beschreibung der Position/des Artikels",
      "articleNumber": "Artikelnummer falls vorhanden oder null",
      "customerName": "Endkunde falls MSP/Reseller-Rechnung oder null",
      "quantity": Menge als Zahl,
      "unit": "Einheit (Stück, Monat, GB, etc.) oder null",
      "unitPrice": Einzelpreis als Zahl,
      "totalPrice": Gesamtpreis dieser Position als Zahl,
      "vatRate": MwSt-Satz dieser Position falls abweichend oder null,
      "period": "Leistungszeitraum z.B. 01.03.2026 - 31.03.2026 oder null",
      "productType": "Produktkategorie (Cloud Server, Microsoft 365, Hosting, Lizenz, etc.) oder null"
    }
  ]
}

WICHTIGE REGELN:
1. Beträge als Dezimalzahlen OHNE Währungssymbol (z.B. 21.60 statt "21,60 €")
2. Deutsche Zahlenformate umwandeln: "1.234,56" → 1234.56
3. Daten im ISO-Format: YYYY-MM-DD
4. Bei nicht gefundenen Werten: null (nicht "" oder 0)

LIEFERANTEN-ERKENNUNG:
- supplierName ist die RECHNUNGSSTELLENDE Firma (z.B. "Microsoft Ireland Operations Ltd", "Hetzner Online GmbH")
- NICHT der Empfänger der Rechnung
- Bei Microsoft Rechnungen: Microsoft ist der Lieferant, der "Rechnungsempfänger" ist dein Kunde

RECHNUNGSNUMMER-MUSTER erkennen:
- Hetzner: "Rechnung 086000699276" → "086000699276"
- Microsoft: "Rechnungsnummer: E0300ZADA1" → "E0300ZADA1"
- Allgemein: RE-12345, INV-2024-001, Belegnr. 123456

LINE ITEMS - VOLLSTÄNDIG EXTRAHIEREN:
- ALLE Positionen von ALLEN Seiten erfassen
- Bei Cloud-Rechnungen (Hetzner, AWS, Azure): Server, IPs, Traffic, Storage einzeln
- Bei Microsoft CSP: Jede Lizenz/Subscription als eigene Position
- "Rechnungsempfänger" in der Kopfzeile kann der Endkunde sein → in customerName

SPEZIELLE RECHNUNGSTYPEN:
- Microsoft 365/CSP: "Dienstnutzungsadresse" enthält oft den Endkunden
- Hetzner: Projektname kann Kundenreferenz sein (z.B. "Projekt Test")
- Hosting-Rechnungen: Domain/Server als Beschreibung extrahieren`;
  }

  /**
   * Helper to parse numbers that might come as strings from AI
   */
  private parseNumberFromAny(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Handle German format
      const cleaned = value.replace(/[^\d,.\-]/g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  private async callAI(config: any, prompt: string): Promise<string> {
    const provider = config.provider || 'openai';
    const apiKey = config.api_key;
    const model = config.model || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-haiku-20240307');

    if (!apiKey) {
      throw new Error('No API key configured');
    }

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
          system: 'Du bist ein Experte für das Extrahieren von Daten aus Rechnungen. Antworte immer im angeforderten JSON-Format.',
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json() as { content?: Array<{ text?: string }> };
      return data.content?.[0]?.text || '';
    } else {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'Du bist ein Experte für das Extrahieren von Daten aus Rechnungen. Antworte immer im angeforderten JSON-Format.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1000,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content || '';
    }
  }

  /**
   * Approve a draft invoice with extracted data
   */
  async approveDraftWithData(
    organizationId: string,
    processedInvoiceId: string,
    extractedData: ExtractedInvoiceData
  ): Promise<boolean> {
    // Get the invoice details
    const invoiceResult = await query(
      `SELECT pi.*, c.name as vendor_name
       FROM processed_invoices pi
       LEFT JOIN customers c ON pi.vendor_id = c.id
       WHERE pi.id = $1 AND pi.organization_id = $2 AND pi.status = 'draft'`,
      [processedInvoiceId, organizationId]
    );

    if (invoiceResult.rows.length === 0) {
      return false;
    }

    const invoice = invoiceResult.rows[0];

    // Get the first document for this invoice
    const docResult = await query(
      `SELECT * FROM invoice_documents
       WHERE processed_invoice_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [processedInvoiceId]
    );

    let sevdeskVoucherId: string | null = null;

    // Try to create sevDesk voucher if we have a document
    if (docResult.rows.length > 0) {
      try {
        // Get sevDesk API token for this organization
        const configResult = await query(
          `SELECT api_token FROM sevdesk_config WHERE organization_id = $1`,
          [organizationId]
        );

        if (configResult.rows.length > 0 && configResult.rows[0].api_token) {
          const apiToken = configResult.rows[0].api_token;
          const doc = docResult.rows[0];

          // Read the file
          const fileBuffer = await fs.promises.readFile(doc.storage_path);

          // Upload to sevDesk
          const uploadResult = await uploadVoucherFile(
            apiToken,
            fileBuffer,
            doc.original_filename,
            doc.mime_type
          );

          // Validate extracted data before sending to sevDesk
          const validation = validateInvoiceData(extractedData);
          if (validation.warnings.length > 0) {
            logger.info(`Invoice ${processedInvoiceId} validation warnings:`, validation.warnings);
          }

          // Use extracted data for voucher creation
          const voucherDate = extractedData.invoiceDate || invoice.received_at || new Date().toISOString();
          const supplierName = extractedData.supplierName || invoice.vendor_name || invoice.sender_name || undefined;

          // Create voucher with extracted amount - now including vatAmount and invoiceNumber
          const voucherResult = await createVoucherFromFile(
            apiToken,
            uploadResult.id,
            {
              voucherDate,
              description: invoice.email_subject || 'Eingangsrechnung',
              invoiceNumber: extractedData.invoiceNumber || undefined,
              supplierName,
              creditDebit: 'D', // Debit = Ausgabe (Eingangsrechnung)
              taxRate: validation.correctedData.vatRate ?? extractedData.vatRate ?? 19,
              sumGross: validation.correctedData.grossAmount ?? extractedData.grossAmount ?? undefined,
              sumNet: validation.correctedData.netAmount ?? extractedData.netAmount ?? undefined,
              sumTax: validation.correctedData.vatAmount ?? extractedData.vatAmount ?? undefined,
            }
          );

          sevdeskVoucherId = voucherResult.voucherId;
          logger.info(`Created sevDesk voucher ${sevdeskVoucherId} for invoice ${processedInvoiceId}`);
        }
      } catch (err) {
        logger.error(`Failed to create sevDesk voucher for invoice ${processedInvoiceId}:`, err);
        // Continue anyway - we still mark as processed even if sevDesk fails
      }
    }

    // Update the invoice status
    const updateResult = await query(
      `UPDATE processed_invoices
       SET status = 'processed', processed_at = NOW(), sevdesk_voucher_id = $3
       WHERE id = $1 AND organization_id = $2 AND status = 'draft'
       RETURNING id`,
      [processedInvoiceId, organizationId, sevdeskVoucherId]
    );

    return updateResult.rows.length > 0;
  }

  /**
   * Retry processing a failed invoice
   */
  async retryProcessing(organizationId: string, processedInvoiceId: string): Promise<boolean> {
    // Get the original email ID
    const result = await query(
      'SELECT email_id FROM processed_invoices WHERE id = $1 AND organization_id = $2',
      [processedInvoiceId, organizationId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Delete the old record to allow reprocessing
    await query(
      'DELETE FROM processed_invoices WHERE id = $1',
      [processedInvoiceId]
    );

    // Get the email and reprocess
    const email = await mailboxMonitorService.getEmail(
      organizationId,
      result.rows[0].email_id,
      'invoice'
    );

    if (!email) {
      return false;
    }

    const processResult = await this.processEmail(organizationId, email);
    return processResult.status === 'draft';
  }

  /**
   * sevDesk-Vouchers in processed_invoices spiegeln. Holt alle Debit-
   * Vouchers (Eingangsrechnungen) der Org via sevDesk-API, ueberspringt
   * solche die schon ueber sevdesk_voucher_id verlinkt sind, und legt fuer
   * die unbekannten neue Rows mit source='sevdesk_import' an. Das PDF wird
   * sofort runtergeladen und in den org-Storage geschrieben, damit die UI
   * dieselbe Card-Logik (View/Download) nutzen kann wie fuer Inbox-Belege.
   *
   * Idempotent: existierende Rows werden bei Bedarf mit den neuesten
   * Status-/Beleg-Daten aktualisiert (Status kann sich in sevDesk aendern
   * z. B. von open zu paid).
   */
  async syncSevdeskVouchers(organizationId: string): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
    const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

    // sevdesk_config ist per-user (legacy), nicht per-org. Hole ein Token
    // eines beliebigen Users der Org; in der Praxis hat pro Org meist nur
    // ein Admin sevDesk konfiguriert.
    const tokenResult = await query(
      `SELECT sc.api_token FROM sevdesk_config sc
       JOIN users u ON sc.user_id = u.id
       JOIN organization_members om ON u.id = om.user_id
       WHERE om.organization_id = $1 AND sc.api_token IS NOT NULL AND sc.api_token <> ''
       LIMIT 1`,
      [organizationId]
    );
    if (tokenResult.rows.length === 0) {
      logger.info(`Org ${organizationId}: kein sevDesk-Token, sync skipped`);
      return stats;
    }
    const apiToken = tokenResult.rows[0].api_token;

    let vouchers: SevdeskVoucherDetail[];
    try {
      vouchers = await getVouchers(apiToken, { creditDebit: 'D', limit: 500 });
    } catch (err: any) {
      logger.error(`Org ${organizationId}: getVouchers failed: ${err.message}`);
      stats.errors++;
      return stats;
    }

    for (const v of vouchers) {
      if (!v.id) { stats.skipped++; continue; }
      try {
        // Schon verlinkt? Dann nur Metadaten-Update.
        const existing = await query(
          `SELECT id FROM processed_invoices WHERE organization_id = $1 AND sevdesk_voucher_id = $2 LIMIT 1`,
          [organizationId, v.id]
        );
        if (existing.rows.length > 0) {
          await query(
            `UPDATE processed_invoices SET
               sevdesk_voucher_number = $1,
               supplier_name = COALESCE($2, supplier_name),
               invoice_number = COALESCE($3, invoice_number),
               invoice_date = COALESCE($4, invoice_date),
               net_amount = COALESCE($5, net_amount),
               gross_amount = COALESCE($6, gross_amount),
               vat_amount = COALESCE($7, vat_amount),
               currency = COALESCE($8, currency),
               status = CASE WHEN status NOT IN ('processed', 'imported') THEN 'processed' ELSE status END
             WHERE id = $9`,
            [
              v.voucherNumber,
              v.supplier?.name ?? null,
              v.voucherNumber,
              v.voucherDate,
              v.sumNet,
              v.sumGross,
              v.sumTax,
              v.currency,
              existing.rows[0].id,
            ]
          );
          stats.updated++;
          continue;
        }

        // Neuer Voucher - PDF runterladen falls vorhanden.
        let storedDoc: { path: string; filename: string; mimeType: string; size: number } | null = null;
        if (v.document?.id) {
          try {
            const dl = await downloadVoucherFile(apiToken, v.document.id);
            if (dl) {
              const uploadDir = await this.ensureUploadDir(organizationId);
              const ext = path.extname(v.document.filename || '') || (dl.mimeType.includes('pdf') ? '.pdf' : '');
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const filename = `${timestamp}_sevdesk-${v.id}${ext}`;
              const filePath = path.join(uploadDir, filename);
              await fs.promises.writeFile(filePath, dl.buffer);
              storedDoc = {
                path: filePath,
                filename,
                mimeType: dl.mimeType,
                size: dl.buffer.length,
              };
            }
          } catch (err: any) {
            logger.error(`Voucher ${v.id}: PDF-Download fehlgeschlagen: ${err.message}`);
            // Weiter ohne PDF - der Datensatz wird trotzdem angelegt.
          }
        }

        const processedInvoiceId = uuidv4();
        const documentId = storedDoc ? uuidv4() : null;
        const documentIds = documentId ? [documentId] : [];

        await query(
          `INSERT INTO processed_invoices (
            id, organization_id, email_id, email_subject, sender_email, sender_name,
            received_at, attachment_count, document_ids, status, source,
            sevdesk_voucher_id, sevdesk_voucher_number, original_filename,
            supplier_name, invoice_number, invoice_date,
            net_amount, gross_amount, vat_amount, currency,
            processed_at
          ) VALUES ($1, $2, NULL, $3, NULL, $4, $5, $6, $7, 'imported', 'sevdesk_import',
                    $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
          ON CONFLICT (organization_id, sevdesk_voucher_id) WHERE sevdesk_voucher_id IS NOT NULL DO NOTHING`,
          [
            processedInvoiceId,
            organizationId,
            v.description || v.voucherNumber || 'sevDesk-Beleg',
            v.supplier?.name || null,
            v.voucherDate || new Date().toISOString(),
            documentIds.length,
            JSON.stringify(documentIds),
            v.id,
            v.voucherNumber,
            v.document?.filename || null,
            v.supplier?.name || null,
            v.voucherNumber || null,
            v.voucherDate || null,
            v.sumNet,
            v.sumGross,
            v.sumTax,
            v.currency || 'EUR',
          ]
        );

        if (storedDoc && documentId) {
          await query(
            `INSERT INTO invoice_documents (
              id, organization_id, processed_invoice_id, filename, original_filename,
              mime_type, size, storage_path, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              documentId,
              organizationId,
              processedInvoiceId,
              storedDoc.filename,
              v.document?.filename || storedDoc.filename,
              storedDoc.mimeType,
              storedDoc.size,
              storedDoc.path,
            ]
          );
        }

        stats.created++;
      } catch (err: any) {
        logger.error(`Voucher ${v.id} sync fehlgeschlagen: ${err.message}`);
        stats.errors++;
      }
    }

    logger.info(`sevDesk-Voucher-Sync fuer Org ${organizationId}: created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`);
    return stats;
  }

  /**
   * Manual-Upload: PDF/Image-Buffer landet als processed_invoice mit
   * source='manual', invoice_documents-Row und sofortigem Extractor-Lauf.
   * Schliesst die Pipeline-Luecke fuer Belege, die nicht per Mail kommen.
   * Returns the new processedInvoiceId + extracted data so the frontend can
   * jump straight into the confirmation modal.
   */
  async createManualReceipt(
    organizationId: string,
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<{ processedInvoiceId: string; extracted: ExtractedInvoiceData | null }> {
    const uploadDir = await this.ensureUploadDir(organizationId);
    const ext = path.extname(originalFilename) || '.pdf';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${uuidv4().substring(0, 8)}${ext}`;
    const filePath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filePath, fileBuffer);

    const processedInvoiceId = uuidv4();
    const documentId = uuidv4();

    await query(
      `INSERT INTO processed_invoices (
        id, organization_id, email_id, email_subject, sender_email, sender_name,
        received_at, attachment_count, document_ids, status, source, original_filename, processed_at
      ) VALUES ($1, $2, NULL, $3, NULL, NULL, NOW(), 1, $4, 'draft', 'manual', $5, NOW())`,
      [
        processedInvoiceId,
        organizationId,
        originalFilename,
        JSON.stringify([documentId]),
        originalFilename,
      ]
    );

    await query(
      `INSERT INTO invoice_documents (
        id, organization_id, processed_invoice_id, filename, original_filename,
        mime_type, size, storage_path, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        documentId,
        organizationId,
        processedInvoiceId,
        filename,
        originalFilename,
        mimeType,
        fileBuffer.length,
        filePath,
      ]
    );

    // Sofort extrahieren - der User bekommt direkt das Modal mit vor-
    // ausgefuellten Feldern. force=true, weil es eh frisch ist.
    const extracted = await this.extractInvoiceData(organizationId, processedInvoiceId, { force: true });
    return { processedInvoiceId, extracted };
  }

  /**
   * Full-text search over received invoices (processed_invoices). Searches the
   * email metadata (subject, sender) AND the PDF-extracted text persisted in
   * full_text. Mirrors the sevdesk_documents search pattern: German tsvector,
   * prefix-match per term (`:*`), AND-combined.
   */
  async searchProcessedInvoices(
    organizationId: string,
    searchQuery: string,
    options: { status?: string; vendorId?: string; limit?: number; offset?: number } = {}
  ): Promise<any[]> {
    const { status, vendorId, limit = 50, offset = 0 } = options;

    const terms = searchQuery
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 0)
      .map(t => `${t.replace(/[&|!():*]/g, '')}:*`)
      .join(' & ');

    if (!terms) return [];

    const params: any[] = [organizationId, terms];
    let sql = `
      SELECT
        pi.id, pi.email_subject, pi.sender_email, pi.sender_name,
        pi.received_at, pi.status, pi.vendor_id, pi.attachment_count,
        pi.document_ids, pi.processed_at, pi.source, pi.supplier_name,
        pi.invoice_number, pi.sevdesk_voucher_number,
        c.name AS vendor_name,
        ts_rank(pi.search_vector, to_tsquery('german', $2)) AS rank
      FROM processed_invoices pi
      LEFT JOIN customers c ON c.id = pi.vendor_id
      WHERE pi.organization_id = $1
        AND pi.search_vector @@ to_tsquery('german', $2)
    `;

    if (status) {
      sql += ` AND pi.status = $${params.length + 1}`;
      params.push(status);
    }
    if (vendorId) {
      sql += ` AND pi.vendor_id = $${params.length + 1}`;
      params.push(vendorId);
    }

    sql += ` ORDER BY rank DESC, pi.received_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * One-off helper to backfill full_text + search_vector for invoices that
   * existed before this migration. Iterates and re-runs the extractor.
   */
  async backfillSearchIndex(organizationId: string, limit = 200): Promise<{ processed: number; errors: number }> {
    const result = await query(
      `SELECT id FROM processed_invoices
       WHERE organization_id = $1 AND (full_text IS NULL OR full_text = '')
       ORDER BY received_at DESC
       LIMIT $2`,
      [organizationId, limit]
    );
    let processed = 0;
    let errors = 0;
    for (const row of result.rows) {
      try {
        await this.extractInvoiceData(organizationId, row.id);
        processed++;
      } catch (err: any) {
        errors++;
        logger.error(`Backfill failed for ${row.id}: ${err.message}`);
      }
    }
    return { processed, errors };
  }
}

export const invoiceProcessorService = new InvoiceProcessorService();
export default invoiceProcessorService;
