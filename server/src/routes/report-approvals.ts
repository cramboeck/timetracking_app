import { Router, Request } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';

const router = Router();

// Validation schemas
const sendApprovalSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  reportData: z.object({
    customerId: z.string().optional(),
    timeEntries: z.array(z.any()),
    customerName: z.string().optional(),
    projectName: z.string().optional(),
    reportTitle: z.string().optional(),
    startDate: z.string(),
    endDate: z.string(),
    totalHours: z.number(),
    totalAmount: z.number().optional(),
    hourlyRate: z.number().optional(),
    entryCount: z.number().optional(),
    projectCount: z.number().optional(),
    pdfBase64: z.string().optional() // Optional PDF as base64 for attachment
  }),
  expiresInDays: z.number().min(1).max(30).optional().default(7),
  saveReport: z.boolean().optional().default(false), // Save report while sending
  revisionOfId: z.string().uuid().optional() // If this is a revision of a rejected report
});

const reviewApprovalSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_revision']),
  comment: z.string().optional(),
  revisionNotes: z.string().optional() // Specific notes for what needs to be changed
});

// Schema for saving report as proof (without sending)
const saveReportSchema = z.object({
  reportData: z.object({
    customerId: z.string(),
    customerName: z.string(),
    reportTitle: z.string().optional(),
    timeEntries: z.array(z.any()),
    startDate: z.string(),
    endDate: z.string(),
    totalHours: z.number(),
    entryCount: z.number(),
    projectCount: z.number(),
    pdfBase64: z.string().optional() // Optional PDF as base64
  }),
  notes: z.string().optional()
});

// Schema for bulk send
const bulkSendSchema = z.object({
  reports: z.array(z.object({
    recipientEmail: z.string().email(),
    recipientName: z.string().optional(),
    reportData: z.object({
      customerId: z.string().optional(),
      timeEntries: z.array(z.any()),
      customerName: z.string().optional(),
      reportTitle: z.string().optional(),
      startDate: z.string(),
      endDate: z.string(),
      totalHours: z.number(),
      entryCount: z.number().optional(),
      projectCount: z.number().optional(),
      pdfBase64: z.string().optional()
    })
  })),
  expiresInDays: z.number().min(1).max(30).optional().default(7),
  saveReports: z.boolean().optional().default(true)
});

// POST /api/report-approvals/send - Send report for approval (protected)
router.post('/send', authenticateToken, validate(sendApprovalSchema), async (req: AuthRequest, res) => {
  try {
    const { recipientEmail, recipientName, reportData, expiresInDays, saveReport, revisionOfId } = req.body;
    const userId = req.userId!;

    // Generate unique token
    const token = crypto.randomUUID() + crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // Get organization_id for user
    const orgResult = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const organizationId = orgResult.rows[0]?.organization_id || null;

    // Determine status - if saveReport is true, we save it as 'pending' (sent), otherwise just 'pending'
    const status = 'pending';

    // If this is a revision of a rejected report, mark the old one as superseded
    if (revisionOfId) {
      await pool.query(
        `UPDATE report_approvals SET status = 'superseded' WHERE id = $1 AND user_id = $2`,
        [revisionOfId, userId]
      );
    }

    // Store approval request in database
    await pool.query(
      `INSERT INTO report_approvals
       (id, user_id, organization_id, token, recipient_email, recipient_name, report_data, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        approvalId,
        userId,
        organizationId,
        token,
        recipientEmail,
        recipientName || recipientEmail,
        JSON.stringify(reportData),
        status,
        expiresAt.toISOString()
      ]
    );

    // Get sender username
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    const senderName = userResult.rows[0]?.username || 'Unknown';

    // Send approval request email
    const approvalUrl = `${process.env.FRONTEND_URL}/approve/${token}`;

    // Prepare PDF attachment if provided
    let pdfAttachment: { filename: string; content: Buffer } | undefined;
    if (reportData.pdfBase64) {
      const customerName = reportData.customerName?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Report';
      const dateStr = new Date(reportData.startDate).toLocaleDateString('de-DE').replace(/\./g, '-');
      pdfAttachment = {
        filename: `Zeiterfassung_${customerName}_${dateStr}.pdf`,
        content: Buffer.from(reportData.pdfBase64, 'base64')
      };
    }

    const emailSent = await emailService.sendReportApprovalRequest({
      to: recipientEmail,
      recipientName: recipientName || recipientEmail,
      senderName,
      reportData,
      approvalUrl,
      expiresAt,
      pdfAttachment
    });

    if (!emailSent) {
      // Email failed, but we still created the approval
      logger.warn(`⚠️ Approval created but email failed for: ${recipientEmail}`);
    }

    logger.info(`📧 Report approval request sent to: ${recipientEmail}${revisionOfId ? ' (revision)' : ''}`);

    res.json({
      success: true,
      message: 'Freigabe-Anfrage wurde versendet',
      approvalId,
      expiresAt
    });
  } catch (error) {
    logger.error('Send approval request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report-approvals/check-exists - Check if report already exists for customer/period
router.post('/check-exists', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { customerId, startDate, endDate } = req.body;
    const userId = req.userId!;

    // Check if a saved report exists for this customer and overlapping date range
    const result = await pool.query(
      `SELECT id, recipient_name as customer_name, sent_at as saved_at,
              report_data->>'startDate' as start_date,
              report_data->>'endDate' as end_date,
              report_data->>'totalHours' as total_hours
       FROM report_approvals
       WHERE user_id = $1
         AND report_data->>'customerId' = $2
         AND status = 'saved'
         AND (
           (report_data->>'startDate')::timestamp <= $4::timestamp
           AND (report_data->>'endDate')::timestamp >= $3::timestamp
         )
       ORDER BY sent_at DESC
       LIMIT 1`,
      [userId, customerId, startDate, endDate]
    );

    if (result.rows.length > 0) {
      const existing = result.rows[0];
      res.json({
        exists: true,
        existingReport: {
          id: existing.id,
          customerName: existing.customer_name,
          savedAt: existing.saved_at,
          startDate: existing.start_date,
          endDate: existing.end_date,
          totalHours: parseFloat(existing.total_hours)
        }
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    logger.error('Check report exists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/report-approvals/saved/:id - Delete a saved report (for overwrite)
router.delete('/saved/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const result = await pool.query(
      'DELETE FROM report_approvals WHERE id = $1 AND user_id = $2 AND status = $3 RETURNING id',
      [id, userId, 'saved']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report nicht gefunden' });
    }

    res.json({ success: true, message: 'Report wurde gelöscht' });
  } catch (error) {
    logger.error('Delete saved report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report-approvals/save - Save report as proof (without sending, protected)
router.post('/save', authenticateToken, validate(saveReportSchema), async (req: AuthRequest, res) => {
  try {
    const { reportData, notes } = req.body;
    const userId = req.userId!;

    const reportId = crypto.randomUUID();
    // Generate a token even for saved reports (for potential later sharing)
    const token = crypto.randomUUID() + crypto.randomUUID();

    // Get organization_id for user
    const orgResult = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 AND role = 'owner' LIMIT 1`,
      [userId]
    );
    const organizationId = orgResult.rows[0]?.organization_id || null;

    // Store report with 'saved' status
    await pool.query(
      `INSERT INTO report_approvals
       (id, user_id, organization_id, token, recipient_email, recipient_name, report_data, status, expires_at, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'saved', $8, $9)`,
      [
        reportId,
        userId,
        organizationId,
        token,
        '', // No recipient for saved reports
        reportData.customerName,
        JSON.stringify(reportData),
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
        notes || null
      ]
    );

    logger.info(`💾 Report saved: ${reportData.customerName} (${reportData.startDate} - ${reportData.endDate})`);

    res.json({
      success: true,
      message: 'Report wurde gespeichert',
      reportId,
      token
    });
  } catch (error) {
    logger.error('Save report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report-approvals/saved - Get all reports for current user (protected)
// Query params: ?status=all (default) | saved | pending | approved | rejected
router.get('/saved', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const statusFilter = req.query.status as string || 'all';

    let query = `SELECT id, token, recipient_email, recipient_name as customer_name, status, sent_at as created_at,
              reviewed_at, expires_at, comment as notes, report_data
       FROM report_approvals
       WHERE user_id = $1`;

    const params: any[] = [userId];

    if (statusFilter !== 'all') {
      query += ` AND status = $2`;
      params.push(statusFilter);
    }

    query += ` ORDER BY sent_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      reports: result.rows.map(row => {
        const reportData = row.report_data || {};
        return {
          id: row.id,
          token: row.token,
          customer_id: reportData.customerId || '',
          customer_name: reportData.customerName || row.customer_name || 'Unbekannt',
          recipient_email: row.recipient_email || '',
          report_title: reportData.reportTitle || 'Dienstleistungsnachweis',
          start_date: reportData.startDate || '',
          end_date: reportData.endDate || '',
          total_hours: reportData.totalHours || 0,
          entry_count: reportData.entryCount || 0,
          project_count: reportData.projectCount || 0,
          status: row.status,
          created_at: row.created_at,
          reviewed_at: row.reviewed_at,
          expires_at: row.expires_at,
          notes: row.notes,
          // Include full data for PDF generation
          time_entries: reportData.timeEntries || []
        };
      })
    });
  } catch (error) {
    logger.error('Get saved reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report-approvals/review/:token - Get approval details (public, token-based)
router.get('/review/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find approval by token
    const result = await pool.query(
      `SELECT ra.*, u.username as sender_name, u.email as sender_email
       FROM report_approvals ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Ungültiger Freigabe-Link'
      });
    }

    const approval = result.rows[0];

    // Check if expired
    if (new Date(approval.expires_at) < new Date()) {
      return res.status(410).json({
        error: 'Dieser Freigabe-Link ist abgelaufen',
        expired: true
      });
    }

    // Check if already reviewed
    if (approval.status !== 'pending') {
      return res.json({
        alreadyReviewed: true,
        status: approval.status,
        reviewedAt: approval.reviewed_at,
        comment: approval.comment,
        recipientName: approval.recipient_name,
        senderName: approval.sender_name
      });
    }

    // Return approval data
    res.json({
      id: approval.id,
      recipientName: approval.recipient_name,
      recipientEmail: approval.recipient_email,
      senderName: approval.sender_name,
      senderEmail: approval.sender_email,
      reportData: approval.report_data,
      status: approval.status,
      sentAt: approval.sent_at,
      expiresAt: approval.expires_at
    });
  } catch (error) {
    logger.error('Get approval details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report-approvals/review/:token - Submit review (public, token-based)
router.post('/review/:token', validate(reviewApprovalSchema), async (req, res) => {
  try {
    const { token } = req.params;
    const { action, comment } = req.body;

    // Find approval by token
    const result = await pool.query(
      `SELECT ra.*, u.username as sender_name, u.email as sender_email
       FROM report_approvals ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Ungültiger Freigabe-Link'
      });
    }

    const approval = result.rows[0];

    // Check if expired
    if (new Date(approval.expires_at) < new Date()) {
      return res.status(410).json({
        error: 'Dieser Freigabe-Link ist abgelaufen'
      });
    }

    // Check if already reviewed
    if (approval.status !== 'pending') {
      return res.status(400).json({
        error: 'Dieser Report wurde bereits geprüft'
      });
    }

    // Update approval status
    const newStatus = action === 'approve' ? 'approved' : (action === 'request_revision' ? 'revision_requested' : 'rejected');
    const { revisionNotes } = req.body;

    // Combine comment and revision notes
    const finalComment = revisionNotes
      ? (comment ? `${comment}\n\nÄnderungswünsche:\n${revisionNotes}` : `Änderungswünsche:\n${revisionNotes}`)
      : (comment || null);

    await pool.query(
      `UPDATE report_approvals
       SET status = $1, reviewed_at = NOW(), comment = $2
       WHERE id = $3`,
      [newStatus, finalComment, approval.id]
    );

    // Send notification email to sender
    const emailSent = await emailService.sendReportApprovalNotification({
      to: approval.sender_email,
      senderName: approval.sender_name,
      recipientName: approval.recipient_name,
      status: newStatus === 'revision_requested' ? 'rejected' : newStatus, // Use 'rejected' template for revision_requested
      comment: finalComment,
      reportData: approval.report_data
    });

    if (!emailSent) {
      logger.warn(`⚠️ Approval updated but notification email failed for: ${approval.sender_email}`);
    }

    logger.info(`✅ Report ${newStatus} by ${approval.recipient_email}`);

    const messages: Record<string, string> = {
      'approved': 'Report wurde freigegeben',
      'rejected': 'Report wurde abgelehnt',
      'revision_requested': 'Änderungen wurden angefordert'
    };

    res.json({
      success: true,
      message: messages[newStatus] || 'Status wurde aktualisiert',
      status: newStatus
    });
  } catch (error) {
    logger.error('Submit review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report-approvals - Get all approval requests for current user (protected)
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      `SELECT id, recipient_email, recipient_name, status, sent_at, reviewed_at,
              expires_at, comment, report_data
       FROM report_approvals
       WHERE user_id = $1
       ORDER BY sent_at DESC`,
      [userId]
    );

    res.json({
      approvals: result.rows
    });
  } catch (error) {
    logger.error('Get approvals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/report-approvals/:id - Cancel approval request (protected)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Check if approval belongs to user
    const result = await pool.query(
      'SELECT * FROM report_approvals WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Freigabe-Anfrage nicht gefunden' });
    }

    const approval = result.rows[0];

    // Only allow deletion of pending approvals
    if (approval.status !== 'pending') {
      return res.status(400).json({
        error: 'Nur ausstehende Freigaben können gelöscht werden'
      });
    }

    // Delete approval
    await pool.query('DELETE FROM report_approvals WHERE id = $1', [id]);

    logger.info(`🗑️ Approval request cancelled: ${id}`);

    res.json({
      success: true,
      message: 'Freigabe-Anfrage wurde gelöscht'
    });
  } catch (error) {
    logger.error('Delete approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report-approvals/bulk-send - Send multiple reports for approval (protected)
router.post('/bulk-send', authenticateToken, validate(bulkSendSchema), async (req: AuthRequest, res) => {
  try {
    const { reports, expiresInDays, saveReports } = req.body;
    const userId = req.userId!;

    // Get organization_id for user
    const orgResult = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const organizationId = orgResult.rows[0]?.organization_id || null;

    // Get sender username
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    const senderName = userResult.rows[0]?.username || 'Unknown';

    const results: Array<{ customerId?: string; customerName?: string; success: boolean; error?: string; approvalId?: string }> = [];

    for (const report of reports) {
      try {
        const { recipientEmail, recipientName, reportData } = report;

        // Generate unique token
        const token = crypto.randomUUID() + crypto.randomUUID();
        const approvalId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

        // Store approval request in database
        await pool.query(
          `INSERT INTO report_approvals
           (id, user_id, organization_id, token, recipient_email, recipient_name, report_data, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            approvalId,
            userId,
            organizationId,
            token,
            recipientEmail,
            recipientName || recipientEmail,
            JSON.stringify(reportData),
            'pending',
            expiresAt.toISOString()
          ]
        );

        // Send approval request email
        const approvalUrl = `${process.env.FRONTEND_URL}/approve/${token}`;

        // Prepare PDF attachment if provided
        let pdfAttachment: { filename: string; content: Buffer } | undefined;
        if (reportData.pdfBase64) {
          const customerName = reportData.customerName?.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_') || 'Report';
          const dateStr = new Date(reportData.startDate).toLocaleDateString('de-DE').replace(/\./g, '-');
          pdfAttachment = {
            filename: `Zeiterfassung_${customerName}_${dateStr}.pdf`,
            content: Buffer.from(reportData.pdfBase64, 'base64')
          };
        }

        const emailSent = await emailService.sendReportApprovalRequest({
          to: recipientEmail,
          recipientName: recipientName || recipientEmail,
          senderName,
          reportData,
          approvalUrl,
          expiresAt,
          pdfAttachment
        });

        results.push({
          customerId: reportData.customerId,
          customerName: reportData.customerName,
          success: true,
          approvalId
        });

        if (!emailSent) {
          logger.warn(`⚠️ Bulk: Approval created but email failed for: ${recipientEmail}`);
        }
      } catch (err: any) {
        results.push({
          customerId: report.reportData.customerId,
          customerName: report.reportData.customerName,
          success: false,
          error: err.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`📧 Bulk send: ${successCount} successful, ${failCount} failed`);

    res.json({
      success: failCount === 0,
      message: `${successCount} von ${reports.length} Reports erfolgreich gesendet`,
      results,
      successCount,
      failCount
    });
  } catch (error) {
    logger.error('Bulk send error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report-approvals/customer-contacts/:customerId - Get contacts for a customer (protected)
router.get('/customer-contacts/:customerId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { customerId } = req.params;
    const userId = req.userId!;

    // Get organization_id for user
    const orgResult = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const organizationId = orgResult.rows[0]?.organization_id;

    if (!organizationId) {
      return res.status(403).json({ error: 'Keine Organisation zugewiesen' });
    }

    // Get contacts for this customer
    const contactsResult = await pool.query(
      `SELECT id, first_name, last_name, email, phone, position, is_primary
       FROM contacts
       WHERE customer_id = $1 AND organization_id = $2
       ORDER BY is_primary DESC, first_name ASC`,
      [customerId, organizationId]
    );

    // Get customer info including main email
    const customerResult = await pool.query(
      `SELECT id, name, email
       FROM customers
       WHERE id = $1 AND organization_id = $2`,
      [customerId, organizationId]
    );

    const contacts = contactsResult.rows.map(c => ({
      id: c.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unbekannt',
      email: c.email,
      phone: c.phone,
      position: c.position,
      isPrimary: c.is_primary
    }));

    // Add customer main email if available and not already in contacts
    const customer = customerResult.rows[0];
    if (customer?.email && !contacts.find(c => c.email === customer.email)) {
      contacts.unshift({
        id: 'customer-main',
        name: customer.name,
        email: customer.email,
        phone: null,
        position: 'Haupt-E-Mail',
        isPrimary: true
      });
    }

    res.json({
      contacts,
      customerName: customer?.name
    });
  } catch (error) {
    logger.error('Get customer contacts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report-approvals/pending-reminders - Get reports needing reminders (internal, for cron job)
router.get('/pending-reminders', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Get pending approvals that expire in 2 days and haven't had a reminder sent
    const result = await pool.query(
      `SELECT ra.*, u.username as sender_name, u.email as sender_email
       FROM report_approvals ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.status = 'pending'
         AND ra.expires_at > NOW()
         AND ra.expires_at <= NOW() + INTERVAL '2 days'
         AND (ra.reminder_sent_at IS NULL OR ra.reminder_sent_at < NOW() - INTERVAL '1 day')
       ORDER BY ra.expires_at ASC`
    );

    res.json({
      pendingReminders: result.rows.map(row => ({
        id: row.id,
        token: row.token,
        recipientEmail: row.recipient_email,
        recipientName: row.recipient_name,
        senderName: row.sender_name,
        senderEmail: row.sender_email,
        reportData: row.report_data,
        expiresAt: row.expires_at,
        daysUntilExpiry: Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      }))
    });
  } catch (error) {
    logger.error('Get pending reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report-approvals/send-reminder/:id - Send reminder for a pending approval (protected)
router.post('/send-reminder/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Get the approval
    const result = await pool.query(
      `SELECT ra.*, u.username as sender_name
       FROM report_approvals ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.id = $1 AND ra.user_id = $2 AND ra.status = 'pending'`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Freigabe-Anfrage nicht gefunden oder bereits bearbeitet' });
    }

    const approval = result.rows[0];
    const expiresAt = new Date(approval.expires_at);
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry <= 0) {
      return res.status(400).json({ error: 'Freigabe-Link ist bereits abgelaufen' });
    }

    const approvalUrl = `${process.env.FRONTEND_URL}/approve/${approval.token}`;

    const emailSent = await emailService.sendReportApprovalReminder({
      to: approval.recipient_email,
      recipientName: approval.recipient_name,
      senderName: approval.sender_name,
      reportData: approval.report_data,
      approvalUrl,
      expiresAt,
      daysUntilExpiry
    });

    if (emailSent) {
      // Update reminder_sent_at
      await pool.query(
        `UPDATE report_approvals SET reminder_sent_at = NOW() WHERE id = $1`,
        [id]
      );

      logger.info(`📧 Reminder sent for approval ${id} to ${approval.recipient_email}`);

      res.json({
        success: true,
        message: `Erinnerung wurde an ${approval.recipient_email} gesendet`
      });
    } else {
      res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden' });
    }
  } catch (error) {
    logger.error('Send reminder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/report-approvals/create-revision/:id - Create a revision of a rejected report (protected)
router.post('/create-revision/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Get the rejected/revision_requested report
    const result = await pool.query(
      `SELECT * FROM report_approvals
       WHERE id = $1 AND user_id = $2 AND status IN ('rejected', 'revision_requested')`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report nicht gefunden oder nicht zur Überarbeitung verfügbar' });
    }

    const originalReport = result.rows[0];

    // Return the original report data for revision
    res.json({
      success: true,
      originalReport: {
        id: originalReport.id,
        recipientEmail: originalReport.recipient_email,
        recipientName: originalReport.recipient_name,
        reportData: originalReport.report_data,
        comment: originalReport.comment, // This contains the revision notes
        reviewedAt: originalReport.reviewed_at
      }
    });
  } catch (error) {
    logger.error('Create revision error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
