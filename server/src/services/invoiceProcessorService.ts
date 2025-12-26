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
import * as fs from 'fs';
import * as path from 'path';

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
    this.uploadDir = process.env.INVOICE_UPLOAD_DIR || '/app/uploads/invoices';
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
    // First try exact match on customer email
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
    const domain = email.split('@')[1];
    if (domain) {
      result = await query(
        `SELECT id, name FROM customers
         WHERE organization_id = $1
         AND LOWER(email) LIKE $2
         LIMIT 1`,
        [organizationId, `%@${domain.toLowerCase()}`]
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
        [organizationId, `%${domain.toLowerCase()}%`]
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

      // Save attachments and create document records
      const documentIds: string[] = [];

      for (const attachment of relevantAttachments) {
        const saved = await this.saveAttachment(organizationId, attachment, email.id);

        if (saved) {
          // Create document record
          const docId = uuidv4();
          await query(
            `INSERT INTO invoice_documents (
              id, organization_id, processed_invoice_id, filename, original_filename,
              mime_type, size, storage_path, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
              docId,
              organizationId,
              email.id, // Will be updated with processed_invoice_id
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

      // Record processed email as draft (needs manual review)
      const processedId = await this.recordProcessedEmail(
        organizationId,
        email,
        documentIds,
        'draft',  // Save as draft so user can review before finalizing
        null,
        vendor?.id
      );

      // Update document records with correct processed_invoice_id
      if (documentIds.length > 0) {
        await query(
          `UPDATE invoice_documents SET processed_invoice_id = $1 WHERE id = ANY($2)`,
          [processedId, documentIds]
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
   */
  async processInvoiceMailbox(organizationId: string): Promise<ProcessingResult> {
    console.log(`Starting invoice mailbox processing for organization: ${organizationId}`);

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

    // Get unread emails
    const emailResult = await mailboxMonitorService.getUnreadEmails(organizationId, {
      maxResults: 50,
      mailboxType: 'invoice',
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
   * Approve a draft invoice (mark as processed)
   */
  async approveDraft(organizationId: string, processedInvoiceId: string): Promise<boolean> {
    const result = await query(
      `UPDATE processed_invoices
       SET status = 'processed', processed_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'draft'
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
