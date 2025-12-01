import { Router } from 'express';
import { pool, query } from '../config/database';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { emailService } from '../services/emailService';

const router = Router();

// Validation schemas
const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  maintenanceType: z.enum(['patch', 'reboot', 'security_update', 'firmware', 'general']),
  affectedSystems: z.string().optional(),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().optional(),
  requireApproval: z.boolean().optional().default(true),
  approvalDeadline: z.string().datetime().optional(),
  autoProceedOnNoResponse: z.boolean().optional().default(false),
  notes: z.string().optional(),
  customerIds: z.array(z.string()).optional(),
  deviceIds: z.array(z.string()).optional(),
  templateId: z.string().optional()
});

const updateAnnouncementSchema = createAnnouncementSchema.partial();

const sendNotificationsSchema = z.object({
  customerIds: z.array(z.string()).min(1)
});

const approvalActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
  approverName: z.string().optional()
});

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  maintenanceType: z.enum(['patch', 'reboot', 'security_update', 'firmware', 'general']),
  affectedSystems: z.string().optional(),
  estimatedDurationMinutes: z.number().optional(),
  requireApproval: z.boolean().optional().default(true),
  autoProceedOnNoResponse: z.boolean().optional().default(false)
});

// Helper function to log activity
async function logActivity(
  announcementId: string,
  action: string,
  actorType: 'admin' | 'customer' | 'system',
  actorId?: string,
  actorName?: string,
  details?: any
) {
  try {
    await query(
      `INSERT INTO maintenance_activity_log
       (id, announcement_id, action, actor_type, actor_id, actor_name, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        announcementId,
        action,
        actorType,
        actorId || null,
        actorName || null,
        details ? JSON.stringify(details) : null
      ]
    );
  } catch (error) {
    console.error('Failed to log maintenance activity:', error);
  }
}

// ============================================
// ANNOUNCEMENT CRUD ENDPOINTS
// ============================================

// GET /api/maintenance/announcements - List all announcements
router.get('/announcements', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { status, limit = 50, offset = 0 } = req.query;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];

    if (status && typeof status === 'string') {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const result = await query(
      `SELECT
        a.*,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id) as customer_count,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id AND status = 'approved') as approved_count,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id AND status = 'rejected') as rejected_count,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id AND status = 'pending') as pending_count
       FROM maintenance_announcements a
       ${whereClause}
       ORDER BY scheduled_start DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/maintenance/announcements/:id - Get single announcement with details
router.get('/announcements/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Get announcement
    const announcementResult = await query(
      'SELECT * FROM maintenance_announcements WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ankündigung nicht gefunden' });
    }

    const announcement = announcementResult.rows[0];

    // Get customer assignments with approval status
    const customersResult = await query(
      `SELECT mac.*, c.name as customer_name, c.email as customer_email
       FROM maintenance_announcement_customers mac
       JOIN customers c ON mac.customer_id = c.id
       WHERE mac.announcement_id = $1
       ORDER BY c.name`,
      [id]
    );

    // Get device assignments
    const devicesResult = await query(
      `SELECT mad.*, d.system_name, d.display_name, d.node_class
       FROM maintenance_announcement_devices mad
       JOIN ninjarmm_devices d ON mad.device_id = d.id
       WHERE mad.announcement_id = $1
       ORDER BY d.system_name`,
      [id]
    );

    // Get activity log
    const activityResult = await query(
      `SELECT * FROM maintenance_activity_log
       WHERE announcement_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({
      announcement,
      customers: customersResult.rows,
      devices: devicesResult.rows,
      activityLog: activityResult.rows
    });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/maintenance/announcements - Create new announcement
router.post('/announcements', authenticateToken, validate(createAnnouncementSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      title, description, maintenanceType, affectedSystems,
      scheduledStart, scheduledEnd, requireApproval,
      approvalDeadline, autoProceedOnNoResponse, notes,
      customerIds, deviceIds
    } = req.body;

    const announcementId = crypto.randomUUID();

    // Create announcement
    await query(
      `INSERT INTO maintenance_announcements
       (id, user_id, title, description, maintenance_type, affected_systems,
        scheduled_start, scheduled_end, require_approval, approval_deadline,
        auto_proceed_on_no_response, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')`,
      [
        announcementId, userId, title, description || null, maintenanceType,
        affectedSystems || null, scheduledStart, scheduledEnd || null,
        requireApproval, approvalDeadline || null, autoProceedOnNoResponse,
        notes || null
      ]
    );

    // Add customers if provided
    if (customerIds && customerIds.length > 0) {
      for (const customerId of customerIds) {
        const token = crypto.randomUUID() + crypto.randomUUID();
        await query(
          `INSERT INTO maintenance_announcement_customers
           (id, announcement_id, customer_id, approval_token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (announcement_id, customer_id) DO NOTHING`,
          [crypto.randomUUID(), announcementId, customerId, token]
        );
      }
    }

    // Add devices if provided
    if (deviceIds && deviceIds.length > 0) {
      for (const deviceId of deviceIds) {
        await query(
          `INSERT INTO maintenance_announcement_devices
           (id, announcement_id, device_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (announcement_id, device_id) DO NOTHING`,
          [crypto.randomUUID(), announcementId, deviceId]
        );
      }
    }

    // Log activity
    await logActivity(announcementId, 'created', 'admin', userId, undefined, { title });

    res.json({
      success: true,
      announcementId,
      message: 'Wartungsankündigung erstellt'
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/maintenance/announcements/:id - Update announcement
router.put('/announcements/:id', authenticateToken, validate(updateAnnouncementSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Check ownership and status
    const existing = await query(
      'SELECT * FROM maintenance_announcements WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Ankündigung nicht gefunden' });
    }

    if (['in_progress', 'completed'].includes(existing.rows[0].status)) {
      return res.status(400).json({ error: 'Diese Ankündigung kann nicht mehr bearbeitet werden' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      maintenanceType: 'maintenance_type',
      affectedSystems: 'affected_systems',
      scheduledStart: 'scheduled_start',
      scheduledEnd: 'scheduled_end',
      requireApproval: 'require_approval',
      approvalDeadline: 'approval_deadline',
      autoProceedOnNoResponse: 'auto_proceed_on_no_response',
      notes: 'notes'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (req.body[key] !== undefined) {
        updates.push(`${dbField} = $${paramIndex}`);
        values.push(req.body[key]);
        paramIndex++;
      }
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(id, userId);

      await query(
        `UPDATE maintenance_announcements SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}`,
        values
      );
    }

    // Handle customer updates
    if (req.body.customerIds) {
      // Remove customers not in new list
      await query(
        `DELETE FROM maintenance_announcement_customers
         WHERE announcement_id = $1 AND customer_id != ALL($2::text[])`,
        [id, req.body.customerIds]
      );

      // Add new customers
      for (const customerId of req.body.customerIds) {
        const token = crypto.randomUUID() + crypto.randomUUID();
        await query(
          `INSERT INTO maintenance_announcement_customers
           (id, announcement_id, customer_id, approval_token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (announcement_id, customer_id) DO NOTHING`,
          [crypto.randomUUID(), id, customerId, token]
        );
      }
    }

    // Handle device updates
    if (req.body.deviceIds) {
      await query(
        `DELETE FROM maintenance_announcement_devices
         WHERE announcement_id = $1 AND device_id != ALL($2::text[])`,
        [id, req.body.deviceIds]
      );

      for (const deviceId of req.body.deviceIds) {
        await query(
          `INSERT INTO maintenance_announcement_devices
           (id, announcement_id, device_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (announcement_id, device_id) DO NOTHING`,
          [crypto.randomUUID(), id, deviceId]
        );
      }
    }

    await logActivity(id, 'updated', 'admin', userId);

    res.json({ success: true, message: 'Ankündigung aktualisiert' });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/maintenance/announcements/:id - Delete announcement
router.delete('/announcements/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const result = await query(
      'DELETE FROM maintenance_announcements WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ankündigung nicht gefunden' });
    }

    res.json({ success: true, message: 'Ankündigung gelöscht' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================

// POST /api/maintenance/announcements/:id/send - Send notifications to customers
router.post('/announcements/:id/send', authenticateToken, validate(sendNotificationsSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { customerIds } = req.body;

    // Get announcement
    const announcementResult = await query(
      'SELECT * FROM maintenance_announcements WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ankündigung nicht gefunden' });
    }

    const announcement = announcementResult.rows[0];

    // Get user info for sender name
    const userResult = await query('SELECT username, email FROM users WHERE id = $1', [userId]);
    const senderName = userResult.rows[0]?.username || 'Administrator';

    // Get customers to notify
    const customersResult = await query(
      `SELECT mac.*, c.name as customer_name, c.email as customer_email
       FROM maintenance_announcement_customers mac
       JOIN customers c ON mac.customer_id = c.id
       WHERE mac.announcement_id = $1 AND mac.customer_id = ANY($2::text[])`,
      [id, customerIds]
    );

    let sentCount = 0;
    let failedCount = 0;

    for (const customer of customersResult.rows) {
      if (!customer.customer_email) {
        failedCount++;
        continue;
      }

      try {
        const approvalUrl = `${process.env.FRONTEND_URL}/maintenance/approve/${customer.approval_token}`;

        const emailSent = await emailService.sendMaintenanceNotification({
          to: customer.customer_email,
          customerName: customer.customer_name,
          senderName,
          announcement: {
            title: announcement.title,
            description: announcement.description,
            maintenanceType: announcement.maintenance_type,
            affectedSystems: announcement.affected_systems,
            scheduledStart: new Date(announcement.scheduled_start),
            scheduledEnd: announcement.scheduled_end ? new Date(announcement.scheduled_end) : undefined,
            approvalDeadline: announcement.approval_deadline ? new Date(announcement.approval_deadline) : undefined
          },
          approvalUrl,
          requireApproval: announcement.require_approval
        });

        if (emailSent) {
          await query(
            `UPDATE maintenance_announcement_customers
             SET notification_sent_at = NOW()
             WHERE id = $1`,
            [customer.id]
          );
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`Failed to send to ${customer.customer_email}:`, error);
        failedCount++;
      }
    }

    // Update announcement status
    if (sentCount > 0) {
      await query(
        `UPDATE maintenance_announcements SET status = 'sent', updated_at = NOW()
         WHERE id = $1`,
        [id]
      );
    }

    await logActivity(id, 'notifications_sent', 'admin', userId, undefined, { sentCount, failedCount });

    res.json({
      success: true,
      sentCount,
      failedCount,
      message: `${sentCount} Benachrichtigungen gesendet${failedCount > 0 ? `, ${failedCount} fehlgeschlagen` : ''}`
    });
  } catch (error) {
    console.error('Send notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/maintenance/announcements/:id/remind - Send reminder to pending customers
router.post('/announcements/:id/remind', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const announcementResult = await query(
      'SELECT * FROM maintenance_announcements WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ankündigung nicht gefunden' });
    }

    const announcement = announcementResult.rows[0];

    // Get pending customers
    const pendingResult = await query(
      `SELECT mac.*, c.name as customer_name, c.email as customer_email
       FROM maintenance_announcement_customers mac
       JOIN customers c ON mac.customer_id = c.id
       WHERE mac.announcement_id = $1 AND mac.status = 'pending' AND mac.notification_sent_at IS NOT NULL`,
      [id]
    );

    let sentCount = 0;

    for (const customer of pendingResult.rows) {
      if (!customer.customer_email) continue;

      const approvalUrl = `${process.env.FRONTEND_URL}/maintenance/approve/${customer.approval_token}`;

      const emailSent = await emailService.sendMaintenanceReminder({
        to: customer.customer_email,
        customerName: customer.customer_name,
        announcement: {
          title: announcement.title,
          scheduledStart: new Date(announcement.scheduled_start),
          approvalDeadline: announcement.approval_deadline ? new Date(announcement.approval_deadline) : undefined
        },
        approvalUrl
      });

      if (emailSent) {
        await query(
          `UPDATE maintenance_announcement_customers SET reminder_sent_at = NOW() WHERE id = $1`,
          [customer.id]
        );
        sentCount++;
      }
    }

    await logActivity(id, 'reminders_sent', 'admin', userId, undefined, { count: sentCount });

    res.json({ success: true, sentCount, message: `${sentCount} Erinnerungen gesendet` });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// PUBLIC APPROVAL ENDPOINTS (token-based)
// ============================================

// GET /api/maintenance/approve/:token - Get announcement details for approval
router.get('/approve/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await query(
      `SELECT mac.status as customer_status, mac.approved_at, mac.rejection_reason,
              mac.approved_by, a.*, c.name as customer_name,
              u.username as admin_name, ci.name as company_name
       FROM maintenance_announcement_customers mac
       JOIN maintenance_announcements a ON mac.announcement_id = a.id
       JOIN customers c ON mac.customer_id = c.id
       JOIN users u ON a.user_id = u.id
       LEFT JOIN company_info ci ON ci.user_id = u.id
       WHERE mac.approval_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ungültiger Link' });
    }

    const data = result.rows[0];

    // Check if already responded (using customer_status, not announcement status)
    if (data.customer_status !== 'pending') {
      return res.json({
        alreadyResponded: true,
        status: data.customer_status,
        respondedAt: data.approved_at,
        rejectionReason: data.rejection_reason,
        customerName: data.customer_name,
        title: data.title
      });
    }

    // Check if deadline passed
    if (data.approval_deadline && new Date(data.approval_deadline) < new Date()) {
      return res.status(410).json({
        error: 'Die Frist für diese Freigabe ist abgelaufen',
        expired: true
      });
    }

    res.json({
      customerName: data.customer_name,
      companyName: data.company_name || data.admin_name,
      title: data.title,
      description: data.description,
      maintenanceType: data.maintenance_type,
      affectedSystems: data.affected_systems,
      scheduledStart: data.scheduled_start,
      scheduledEnd: data.scheduled_end,
      approvalDeadline: data.approval_deadline,
      requireApproval: data.require_approval,
      status: data.customer_status
    });
  } catch (error) {
    console.error('Get approval details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/maintenance/approve/:token - Submit approval/rejection
router.post('/approve/:token', validate(approvalActionSchema), async (req, res) => {
  try {
    const { token } = req.params;
    const { action, reason, approverName } = req.body;

    const result = await query(
      `SELECT mac.id, mac.customer_id, mac.status as customer_status,
              a.id as announcement_id, a.title, a.user_id,
              c.name as customer_name, u.email as admin_email
       FROM maintenance_announcement_customers mac
       JOIN maintenance_announcements a ON mac.announcement_id = a.id
       JOIN customers c ON mac.customer_id = c.id
       JOIN users u ON a.user_id = u.id
       WHERE mac.approval_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ungültiger Link' });
    }

    const data = result.rows[0];

    if (data.customer_status !== 'pending') {
      return res.status(400).json({ error: 'Diese Anfrage wurde bereits beantwortet' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await query(
      `UPDATE maintenance_announcement_customers
       SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3
       WHERE id = $4`,
      [newStatus, approverName || null, action === 'reject' ? (reason || null) : null, data.id]
    );

    // Log activity
    await logActivity(
      data.announcement_id,
      action === 'approve' ? 'customer_approved' : 'customer_rejected',
      'customer',
      data.customer_id,
      approverName || data.customer_name,
      { reason }
    );

    // Send notification to admin
    await emailService.sendMaintenanceApprovalNotification({
      to: data.admin_email,
      customerName: data.customer_name,
      announcementTitle: data.title,
      action: newStatus,
      reason,
      approverName
    });

    res.json({
      success: true,
      message: action === 'approve'
        ? 'Vielen Dank! Die Wartung wurde genehmigt.'
        : 'Die Wartung wurde abgelehnt. Wir werden uns mit Ihnen in Verbindung setzen.',
      status: newStatus
    });
  } catch (error) {
    console.error('Submit approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// STATUS MANAGEMENT
// ============================================

// POST /api/maintenance/announcements/:id/status - Update announcement status
router.post('/announcements/:id/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { status } = req.body;

    if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Ungültiger Status' });
    }

    const result = await query(
      `UPDATE maintenance_announcements
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [status, id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ankündigung nicht gefunden' });
    }

    await logActivity(id, `status_changed_to_${status}`, 'admin', userId);

    res.json({ success: true, message: 'Status aktualisiert' });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// TEMPLATE ENDPOINTS
// ============================================

// GET /api/maintenance/templates - List templates
router.get('/templates', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT * FROM maintenance_templates
       WHERE user_id = $1 AND is_active = true
       ORDER BY name`,
      [userId]
    );

    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/maintenance/templates - Create template
router.post('/templates', authenticateToken, validate(templateSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      name, title, description, maintenanceType,
      affectedSystems, estimatedDurationMinutes,
      requireApproval, autoProceedOnNoResponse
    } = req.body;

    const templateId = crypto.randomUUID();

    await query(
      `INSERT INTO maintenance_templates
       (id, user_id, name, title, description, maintenance_type, affected_systems,
        estimated_duration_minutes, require_approval, auto_proceed_on_no_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        templateId, userId, name, title, description || null, maintenanceType,
        affectedSystems || null, estimatedDurationMinutes || null,
        requireApproval, autoProceedOnNoResponse
      ]
    );

    res.json({ success: true, templateId, message: 'Vorlage erstellt' });
  } catch (error: any) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Eine Vorlage mit diesem Namen existiert bereits' });
    }
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/maintenance/templates/:id - Delete template
router.delete('/templates/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    await query(
      'UPDATE maintenance_templates SET is_active = false WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ success: true, message: 'Vorlage gelöscht' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// DASHBOARD / STATISTICS
// ============================================

// GET /api/maintenance/dashboard - Get dashboard statistics
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Upcoming announcements
    const upcomingResult = await query(
      `SELECT * FROM maintenance_announcements
       WHERE user_id = $1 AND status IN ('scheduled', 'sent')
         AND scheduled_start > NOW()
       ORDER BY scheduled_start ASC
       LIMIT 5`,
      [userId]
    );

    // Pending approvals count
    const pendingResult = await query(
      `SELECT COUNT(*) as count
       FROM maintenance_announcement_customers mac
       JOIN maintenance_announcements a ON mac.announcement_id = a.id
       WHERE a.user_id = $1 AND mac.status = 'pending' AND a.status IN ('scheduled', 'sent')`,
      [userId]
    );

    // Recent activity
    const activityResult = await query(
      `SELECT mal.*, a.title as announcement_title
       FROM maintenance_activity_log mal
       JOIN maintenance_announcements a ON mal.announcement_id = a.id
       WHERE a.user_id = $1
       ORDER BY mal.created_at DESC
       LIMIT 10`,
      [userId]
    );

    // Statistics
    const statsResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
         COUNT(*) FILTER (WHERE status = 'scheduled' OR status = 'sent') as scheduled_count,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count
       FROM maintenance_announcements
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      upcoming: upcomingResult.rows,
      pendingApprovals: parseInt(pendingResult.rows[0].count),
      recentActivity: activityResult.rows,
      statistics: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
