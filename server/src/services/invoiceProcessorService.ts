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
import { v4 as uuidv4 } from 'uuid';
import { mailboxMonitorService, EmailMessage, EmailAttachment } from './mailboxMonitorService';
import { getConfig } from './microsoft365ConfigService';
import { uploadVoucherFile, createVoucherFromFile } from './sevdeskService';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
// PDF to image conversion for Vision API
import { pdf } from 'pdf-to-img';

// Interface for invoice line items (for MSP rebilling)
export interface InvoiceLineItem {
  description: string;
  customerName: string | null;  // Customer name extracted from invoice (e.g. "Mustermann GmbH")
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  period: string | null;        // e.g. "01.12.2024 - 31.12.2024"
  productType: string | null;   // e.g. "Microsoft 365", "Azure", "License"
}

// Interface for extracted invoice data
export interface ExtractedInvoiceData {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  netAmount: number | null;
  grossAmount: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  currency: string;
  confidence: number;
  rawText?: string;
  lineItems?: InvoiceLineItem[];  // Line items for MSP rebilling
}

export interface ProcessedInvoice {
  id: string;
  organizationId: string;
  emailId: string;
  emailSubject: string;
  senderEmail: string;
  senderName: string;
  receivedAt: string;
  attachmentCount: number;
  documentIds: string[];
  vendorId: string | null;
  status: 'pending' | 'draft' | 'processed' | 'failed' | 'skipped';
  errorMessage: string | null;
  processedAt: string;
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
   * Find vendor by email address
   */
  async findVendorByEmail(organizationId: string, email: string): Promise<{ id: string; name: string } | null> {
    const domain = email.split('@')[1]?.toLowerCase();

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
   * Save attachment to filesystem
   */
  async saveAttachment(
    organizationId: string,
    attachment: EmailAttachment,
    emailId: string
  ): Promise<{ path: string; filename: string } | null> {
    if (!attachment.contentBytes) {
      console.log(`No content bytes for attachment: ${attachment.name}`);
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

      console.log(`Saved attachment: ${filePath} (${buffer.length} bytes)`);
      return { path: filePath, filename };
    } catch (error: any) {
      console.error(`Failed to save attachment ${attachment.name}:`, error.message);
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

    // Skip emails without attachments
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

      // Filter for relevant attachments (PDFs, images)
      const relevantAttachments = attachments.filter(att => {
        const ext = path.extname(att.name).toLowerCase();
        const mimeType = att.contentType?.toLowerCase() || '';
        return (
          ext === '.pdf' ||
          ext === '.png' ||
          ext === '.jpg' ||
          ext === '.jpeg' ||
          mimeType.includes('pdf') ||
          mimeType.includes('image')
        );
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

      console.log(`Created invoice draft: ${email.subject} (${documentIds.length} documents)`);
      return { status: 'draft', documentsCreated: documentIds.length };

    } catch (error: any) {
      console.error(`Failed to process email ${email.id}:`, error.message);
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

    await query(
      `INSERT INTO processed_invoices (
        id, organization_id, email_id, email_subject, sender_email, sender_name,
        received_at, attachment_count, document_ids, vendor_id, status, error_message, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (organization_id, email_id) DO UPDATE SET
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
    console.log(`Starting invoice mailbox processing for organization: ${organizationId} (includeRead: ${includeRead})`);

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
      console.error('Failed to get emails:', emailResult.error);
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

    console.log(`Invoice processing complete: ${processedCount} processed, ${skippedCount} skipped, ${failedCount} failed`);

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
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ invoices: ProcessedInvoice[]; total: number }> {
    const { status, limit = 50, offset = 0 } = options;

    let whereClause = 'WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
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
          console.log(`Created sevDesk voucher ${sevdeskVoucherId} for invoice ${processedInvoiceId}`);
        }
      } catch (err) {
        console.error(`Failed to create sevDesk voucher for invoice ${processedInvoiceId}:`, err);
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
        console.error(`Failed to delete file: ${doc.storage_path}`);
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
        console.error(`Failed to delete file: ${doc.storage_path}`);
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
   * Extract invoice data from PDF using text extraction and AI parsing
   */
  async extractInvoiceData(organizationId: string, processedInvoiceId: string): Promise<ExtractedInvoiceData | null> {
    // Get the invoice with email info for fallback extraction
    const invoiceResult = await query(
      `SELECT * FROM processed_invoices WHERE id = $1`,
      [processedInvoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      console.log('Invoice not found:', processedInvoiceId);
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
    console.log('Email metadata extraction:', result);

    if (docResult.rows.length === 0) {
      console.log('No documents found for invoice', processedInvoiceId);
      return result;
    }

    const doc = docResult.rows[0];

    // Only process PDFs
    if (!doc.mime_type?.includes('pdf') && !doc.original_filename?.toLowerCase().endsWith('.pdf')) {
      console.log('Document is not a PDF:', doc.mime_type);
      return result;
    }

    try {
      // Read the PDF file
      const fileBuffer = await fs.promises.readFile(doc.storage_path);

      // Extract text from PDF
      const pdfData = await pdfParse(fileBuffer);
      const rawText = pdfData.text;
      console.log('PDF text length:', rawText?.length || 0);
      console.log('PDF text preview:', rawText?.substring(0, 500));

      if (!rawText || rawText.trim().length < 50) {
        console.log('PDF has insufficient text content');
        result.rawText = 'PDF enthält keinen extrahierbaren Text';
        return result;
      }

      // Try to extract data using regex patterns first (faster, no API cost)
      const regexExtraction = this.extractWithRegex(rawText);
      console.log('Regex extraction:', regexExtraction);

      // Merge regex extraction with email fallback (prefer regex if found)
      result = {
        supplierName: regexExtraction.supplierName || result.supplierName,
        invoiceNumber: regexExtraction.invoiceNumber || result.invoiceNumber,
        invoiceDate: regexExtraction.invoiceDate || result.invoiceDate,
        dueDate: regexExtraction.dueDate || result.dueDate,
        netAmount: regexExtraction.netAmount ?? result.netAmount,
        grossAmount: regexExtraction.grossAmount ?? result.grossAmount,
        vatAmount: regexExtraction.vatAmount ?? result.vatAmount,
        vatRate: regexExtraction.vatRate ?? result.vatRate,
        currency: regexExtraction.currency || result.currency,
        confidence: Math.max(regexExtraction.confidence, result.confidence),
        rawText: rawText.substring(0, 2000),
      };

      // Get AI config for this organization to use AI parsing if available
      const aiConfigResult = await query(
        `SELECT ac.* FROM ai_config ac
         JOIN users u ON ac.user_id = u.id
         WHERE u.organization_id = $1 AND ac.enabled = true AND ac.api_key IS NOT NULL
         LIMIT 1`,
        [organizationId]
      );

      console.log('AI config found:', aiConfigResult.rows.length > 0 ? 'Yes' : 'No');

      // If OpenAI is configured, always use Vision for best results (includes line items)
      if (aiConfigResult.rows.length > 0) {
        const aiConfig = aiConfigResult.rows[0];
        console.log('AI provider:', aiConfig.provider);

        if (aiConfig.provider === 'openai') {
          // Use Vision directly for best extraction (handles scanned PDFs, extracts line items)
          console.log('Using OpenAI Vision for comprehensive extraction...');
          const visionExtraction = await this.extractWithVision(fileBuffer, aiConfig);
          console.log('Vision extraction result:', visionExtraction);

          if (visionExtraction.confidence > 0) {
            result = {
              supplierName: visionExtraction.supplierName || result.supplierName,
              invoiceNumber: visionExtraction.invoiceNumber || result.invoiceNumber,
              invoiceDate: visionExtraction.invoiceDate || result.invoiceDate,
              dueDate: visionExtraction.dueDate || result.dueDate,
              netAmount: visionExtraction.netAmount ?? result.netAmount,
              grossAmount: visionExtraction.grossAmount ?? result.grossAmount,
              vatAmount: visionExtraction.vatAmount ?? result.vatAmount,
              vatRate: visionExtraction.vatRate ?? result.vatRate,
              currency: visionExtraction.currency || result.currency,
              confidence: visionExtraction.confidence,
              rawText: result.rawText,
              lineItems: visionExtraction.lineItems,
            };
          }
        } else {
          // For Anthropic, use text-based extraction
          console.log('Using text-based AI extraction...');
          const aiExtraction = await this.extractWithAI(rawText, aiConfig);
          console.log('AI extraction:', aiExtraction);

          result = {
            supplierName: aiExtraction.supplierName || result.supplierName,
            invoiceNumber: aiExtraction.invoiceNumber || result.invoiceNumber,
            invoiceDate: aiExtraction.invoiceDate || result.invoiceDate,
            dueDate: aiExtraction.dueDate || result.dueDate,
            netAmount: aiExtraction.netAmount ?? result.netAmount,
            grossAmount: aiExtraction.grossAmount ?? result.grossAmount,
            vatAmount: aiExtraction.vatAmount ?? result.vatAmount,
            vatRate: aiExtraction.vatRate ?? result.vatRate,
            currency: aiExtraction.currency || result.currency,
            confidence: aiExtraction.confidence > 0 ? aiExtraction.confidence : result.confidence,
            rawText: rawText.substring(0, 2000),
          };
        }
      } else {
        console.log('No AI config found - using regex/email extraction only');
      }

      return result;

    } catch (error: any) {
      console.error('Error extracting invoice data:', error.message);
      result.rawText = `Fehler: ${error.message}`;
      return result;
    }
  }

  /**
   * Extract data from email metadata (subject, sender) as fallback
   */
  private extractFromEmailMetadata(invoice: any): ExtractedInvoiceData {
    const result: ExtractedInvoiceData = {
      supplierName: null,
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      netAmount: null,
      grossAmount: null,
      vatAmount: null,
      vatRate: 19,
      currency: 'EUR',
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
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      netAmount: null,
      grossAmount: null,
      vatAmount: null,
      vatRate: null,
      currency: 'EUR',
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
      invoiceNumber: null,
      invoiceDate: null,
      dueDate: null,
      netAmount: null,
      grossAmount: null,
      vatAmount: null,
      vatRate: null,
      currency: 'EUR',
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
        /(?:Gesamt(?:betrag)?|Brutto|Total|Endbetrag|Rechnungsbetrag|Zu\s*zahlen)\s*[:#]?\s*(?:EUR|€)?\s*([\d\.,]+)\s*(?:EUR|€)?/i,
        /(?:EUR|€)\s*([\d\.,]+)\s*(?:Gesamt|Brutto|Total)/i,
      ],
      net: [
        /(?:Netto(?:betrag)?|Zwischensumme|Subtotal)\s*[:#]?\s*(?:EUR|€)?\s*([\d\.,]+)\s*(?:EUR|€)?/i,
      ],
      vat: [
        /(?:MwSt\.?|USt\.?|VAT|Mehrwertsteuer)\s*(?:\d+%?)?\s*[:#]?\s*(?:EUR|€)?\s*([\d\.,]+)\s*(?:EUR|€)?/i,
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
          invoiceNumber: parsed.invoiceNumber || null,
          invoiceDate: parsed.invoiceDate || null,
          dueDate: parsed.dueDate || null,
          netAmount: typeof parsed.netAmount === 'number' ? parsed.netAmount : null,
          grossAmount: typeof parsed.grossAmount === 'number' ? parsed.grossAmount : null,
          vatAmount: typeof parsed.vatAmount === 'number' ? parsed.vatAmount : null,
          vatRate: typeof parsed.vatRate === 'number' ? parsed.vatRate : null,
          currency: parsed.currency || 'EUR',
          confidence: 0.85, // Higher confidence for AI extraction
        };
      }
    } catch (error: any) {
      console.error('AI extraction failed:', error.message);
    }

    return this.createEmptyExtraction('KI-Extraktion fehlgeschlagen');
  }

  /**
   * Extract invoice data using OpenAI Vision API (for scanned/image PDFs)
   */
  private async extractWithVision(pdfBuffer: Buffer, aiConfig: any): Promise<ExtractedInvoiceData> {
    console.log('Starting Vision extraction...');

    // Only works with OpenAI
    if (aiConfig.provider !== 'openai') {
      console.log('Vision extraction only available with OpenAI');
      return this.createEmptyExtraction('Vision nur mit OpenAI verfügbar');
    }

    const apiKey = aiConfig.api_key;
    if (!apiKey) {
      return this.createEmptyExtraction('Kein API-Key konfiguriert');
    }

    try {
      // Convert first page of PDF to image
      const document = await pdf(pdfBuffer, { scale: 2.0 });
      let firstPageImage: Buffer | null = null;

      for await (const image of document) {
        firstPageImage = image;
        break; // Only take first page
      }

      if (!firstPageImage) {
        console.log('Failed to convert PDF to image');
        return this.createEmptyExtraction('PDF konnte nicht in Bild konvertiert werden');
      }

      // Convert to base64
      const base64Image = firstPageImage.toString('base64');
      console.log('PDF converted to image, size:', Math.round(base64Image.length / 1024), 'KB');

      // Call OpenAI Vision API
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
                  text: `Analysiere diese Rechnung und extrahiere die folgenden Informationen.

Antworte NUR im folgenden JSON-Format (keine anderen Texte):
{
  "supplierName": "Name des Lieferanten/Absenders (Firma die die Rechnung stellt)",
  "invoiceNumber": "Rechnungsnummer",
  "invoiceDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD oder null",
  "netAmount": Nettobetrag als Zahl oder null,
  "grossAmount": Bruttobetrag als Zahl oder null,
  "vatAmount": MwSt-Betrag als Zahl oder null,
  "vatRate": MwSt-Satz als Zahl (z.B. 19) oder null,
  "currency": "EUR" oder andere Währung,
  "lineItems": [
    {
      "description": "Beschreibung der Position",
      "customerName": "Name des Endkunden falls angegeben oder null",
      "quantity": Anzahl als Zahl oder null,
      "unitPrice": Einzelpreis als Zahl oder null,
      "totalPrice": Gesamtpreis der Position als Zahl oder null,
      "period": "Abrechnungszeitraum z.B. 01.12.2024 - 31.12.2024 oder null",
      "productType": "Produkttyp z.B. Microsoft 365, Azure, License, Hosting oder null"
    }
  ]
}

Wichtig:
- Beträge als Zahlen ohne Währungssymbol (z.B. 119.00 nicht "119,00 €")
- Daten im ISO-Format (YYYY-MM-DD)
- Bei nicht gefundenen Werten: null
- supplierName ist der ABSENDER/Lieferant, nicht der Empfänger der Rechnung
- lineItems: Extrahiere ALLE Positionen/Zeilen der Rechnung
- customerName in lineItems: Falls die Position einem bestimmten Kunden/Mandanten zugeordnet ist (z.B. bei Microsoft CSP Rechnungen), extrahiere den Kundennamen
- Bei Sammelrechnungen für mehrere Kunden: Jede Position mit dem zugehörigen Kundennamen extrahieren`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 4000,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Vision API error:', response.status, errorText);
        return this.createEmptyExtraction(`Vision API Fehler: ${response.status}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data.choices?.[0]?.message?.content || '';
      console.log('Vision API response:', content);

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Parse line items if present
        let lineItems: InvoiceLineItem[] | undefined = undefined;
        if (Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
          const parsedItems: InvoiceLineItem[] = parsed.lineItems.map((item: any) => ({
            description: item.description || '',
            customerName: item.customerName || null,
            quantity: this.parseNumberFromAny(item.quantity),
            unitPrice: this.parseNumberFromAny(item.unitPrice),
            totalPrice: this.parseNumberFromAny(item.totalPrice),
            period: item.period || null,
            productType: item.productType || null,
          }));
          lineItems = parsedItems;
          console.log(`Extracted ${parsedItems.length} line items`);
        }

        return {
          supplierName: parsed.supplierName || null,
          invoiceNumber: parsed.invoiceNumber || null,
          invoiceDate: parsed.invoiceDate || null,
          dueDate: parsed.dueDate || null,
          netAmount: typeof parsed.netAmount === 'number' ? parsed.netAmount : this.parseNumberFromAny(parsed.netAmount),
          grossAmount: typeof parsed.grossAmount === 'number' ? parsed.grossAmount : this.parseNumberFromAny(parsed.grossAmount),
          vatAmount: typeof parsed.vatAmount === 'number' ? parsed.vatAmount : this.parseNumberFromAny(parsed.vatAmount),
          vatRate: typeof parsed.vatRate === 'number' ? parsed.vatRate : null,
          currency: parsed.currency || 'EUR',
          confidence: 0.9, // High confidence for Vision extraction
          lineItems,
        };
      }

      return this.createEmptyExtraction('Keine JSON-Antwort von Vision API');

    } catch (error: any) {
      console.error('Vision extraction error:', error.message);
      return this.createEmptyExtraction(`Vision Fehler: ${error.message}`);
    }
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

          // Use extracted data for voucher creation
          const voucherDate = extractedData.invoiceDate || invoice.received_at || new Date().toISOString();
          const supplierName = extractedData.supplierName || invoice.vendor_name || invoice.sender_name || undefined;

          // Create voucher with extracted amount
          const voucherResult = await createVoucherFromFile(
            apiToken,
            uploadResult.id,
            {
              voucherDate,
              description: invoice.email_subject || 'Eingangsrechnung',
              supplierName,
              creditDebit: 'D', // Debit = Ausgabe (Eingangsrechnung)
              taxRate: extractedData.vatRate || 19,
              sumGross: extractedData.grossAmount ?? undefined,
              sumNet: extractedData.netAmount ?? undefined,
            }
          );

          sevdeskVoucherId = voucherResult.voucherId;
          console.log(`Created sevDesk voucher ${sevdeskVoucherId} for invoice ${processedInvoiceId}`);
        }
      } catch (err) {
        console.error(`Failed to create sevDesk voucher for invoice ${processedInvoiceId}:`, err);
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
}

export const invoiceProcessorService = new InvoiceProcessorService();
export default invoiceProcessorService;
