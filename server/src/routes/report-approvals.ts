import { Router } from 'express';
import { pool } from '../config/database';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { auth } from '../middleware/auth';
import { emailService } from '../services/emailService';

const router = Router();

// Validation schemas
const sendApprovalSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  reportData: z.object({
    timeEntries: z.array(z.any()),
    customerName: z.string().optional(),
    projectName: z.string().optional(),
    startDate: z.string(),
    endDate: z.string(),
    totalHours: z.number(),
    totalAmount: z.number().optional(),
    hourlyRate: z.number().optional()
  }),
  expiresInDays: z.number().min(1).max(30).optional().default(7)
});

const reviewApprovalSchema = z.object({
  action: z.enum(['approve', 'reject']),
  comment: z.string().optional()
});

// POST /api/report-approvals/send - Send report for approval (protected)
router.post('/send', auth, validate(sendApprovalSchema), async (req, res) => {
  try {
    const { recipientEmail, recipientName, reportData, expiresInDays } = req.body;
    const userId = req.user!.id;

    // Generate unique token
    const token = crypto.randomUUID() + crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // Store approval request in database
    await pool.query(
      `INSERT INTO report_approvals
       (id, user_id, token, recipient_email, recipient_name, report_data, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        approvalId,
        userId,
        token,
        recipientEmail,
        recipientName || recipientEmail,
        JSON.stringify(reportData),
        expiresAt.toISOString()
      ]
    );

    // Send approval request email
    const approvalUrl = `${process.env.FRONTEND_URL}/approve/${token}`;

    const emailSent = await emailService.sendReportApprovalRequest({
      to: recipientEmail,
      recipientName: recipientName || recipientEmail,
      senderName: req.user!.username,
      reportData,
      approvalUrl,
      expiresAt
    });

    if (!emailSent) {
      // Email failed, but we still created the approval
      console.warn(`⚠️ Approval created but email failed for: ${recipientEmail}`);
    }

    console.log(`📧 Report approval request sent to: ${recipientEmail}`);

    res.json({
      success: true,
      message: 'Freigabe-Anfrage wurde versendet',
      approvalId,
      expiresAt
    });
  } catch (error) {
    console.error('Send approval request error:', error);
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
    console.error('Get approval details error:', error);
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
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await pool.query(
      `UPDATE report_approvals
       SET status = $1, reviewed_at = NOW(), comment = $2
       WHERE id = $3`,
      [newStatus, comment || null, approval.id]
    );

    // Send notification email to sender
    const emailSent = await emailService.sendReportApprovalNotification({
      to: approval.sender_email,
      senderName: approval.sender_name,
      recipientName: approval.recipient_name,
      status: newStatus,
      comment,
      reportData: approval.report_data
    });

    if (!emailSent) {
      console.warn(`⚠️ Approval updated but notification email failed for: ${approval.sender_email}`);
    }

    console.log(`✅ Report ${newStatus} by ${approval.recipient_email}`);

    res.json({
      success: true,
      message: action === 'approve'
        ? 'Report wurde freigegeben'
        : 'Report wurde abgelehnt',
      status: newStatus
    });
  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/report-approvals - Get all approval requests for current user (protected)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

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
    console.error('Get approvals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/report-approvals/:id - Cancel approval request (protected)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

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

    console.log(`🗑️ Approval request cancelled: ${id}`);

    res.json({
      success: true,
      message: 'Freigabe-Anfrage wurde gelöscht'
    });
  } catch (error) {
    console.error('Delete approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
