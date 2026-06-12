import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { validate } from '../middleware/validation';
import { auditLog } from '../services/auditLog';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Zod validation schemas
// ============================================================================

const roleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  status: z.string().max(50).optional(),
  olderThan: z.string().max(50).optional(),
});

const featureToggleSchema = z.object({
  enabled: z.boolean(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const bulkFeatureSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  packageName: z.string().min(1).max(100),
  enabled: z.boolean(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const backupSchema = z.object({
  compress: z.boolean().optional(),
});

const restoreConfirmSchema = z.object({
  confirm: z.literal('RESTORE'),
});

const cleanupSchema = z.object({
  olderThanDays: z.number().int().min(1).max(365).optional(),
});

const vacuumTableSchema = z.object({
  table: z.string().regex(/^[a-z_]+$/, 'Invalid table name').max(100).optional(),
});

const maintenanceSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  type: z.enum(['info', 'warning', 'critical']).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const moveUserSchema = z.object({
  to: z.string().uuid(),
});

const testEmailSchema = z.object({
  to: z.string().email().max(200).optional(),
});

const execAsync = promisify(exec);
const BACKUP_DIR = process.env.BACKUP_DIR || '/app/backups';

const router = Router();

// Explicit column lists (no SELECT *)
const SYSTEM_NOTIFICATION_COLUMNS = `
  id, title, message, type, created_by, is_active, expires_at, created_at
`;

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    // Get total users
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Get total time entries
    const entriesResult = await pool.query('SELECT COUNT(*) as count FROM time_entries');
    const totalEntries = parseInt(entriesResult.rows[0].count);

    // Get total hours tracked
    const hoursResult = await pool.query('SELECT SUM(duration) as total FROM time_entries');
    const totalSeconds = parseInt(hoursResult.rows[0].total || 0);
    const totalHours = (totalSeconds / 3600).toFixed(2);

    // Get users registered in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsersResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= $1',
      [thirtyDaysAgo.toISOString()]
    );
    const newUsers = parseInt(newUsersResult.rows[0].count);

    // Get active users (users with time entries in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const activeUsersResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM time_entries
       WHERE created_at >= $1`,
      [sevenDaysAgo.toISOString()]
    );
    const activeUsers = parseInt(activeUsersResult.rows[0].count);

    // Get entries created today
    const today = new Date().toISOString().split('T')[0];
    const todayEntriesResult = await pool.query(
      `SELECT COUNT(*) as count FROM time_entries
       WHERE DATE(created_at) = $1`,
      [today]
    );
    const todayEntries = parseInt(todayEntriesResult.rows[0].count);

    res.json({
      totalUsers,
      totalEntries,
      totalHours: parseFloat(totalHours),
      newUsers,
      activeUsers,
      todayEntries
    });
  } catch (error) {
    logger.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/admin/users - List all users with pagination
router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const search = req.query.search as string || '';
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        u.id, u.username, u.email, u.account_type, u.organization_name,
        u.role, u.created_at, u.last_login,
        COUNT(DISTINCT te.id) as entry_count,
        SUM(te.duration) as total_seconds
      FROM users u
      LEFT JOIN time_entries te ON u.id = te.user_id
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` WHERE (u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM users';
    const countParams: any[] = [];
    if (search) {
      countQuery += ' WHERE (username ILIKE $1 OR email ILIKE $1)';
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const users = result.rows.map((user: any) => ({
      ...user,
      entry_count: parseInt(user.entry_count),
      total_hours: user.total_seconds ? (parseInt(user.total_seconds) / 3600).toFixed(2) : '0.00'
    }));

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id - Get user details
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get user data
    const userResult = await pool.query(
      `SELECT u.*,
        COUNT(DISTINCT te.id) as entry_count,
        COUNT(DISTINCT p.id) as project_count,
        COUNT(DISTINCT c.id) as customer_count,
        SUM(te.duration) as total_seconds
       FROM users u
       LEFT JOIN time_entries te ON u.id = te.user_id
       LEFT JOIN projects p ON u.id = p.user_id
       LEFT JOIN customers c ON u.id = c.user_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Don't send password hash to client
    delete user.password_hash;

    // Get recent time entries
    const entriesResult = await pool.query(
      `SELECT te.*, p.name as project_name, c.name as customer_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE te.user_id = $1
       ORDER BY te.created_at DESC
       LIMIT 10`,
      [id]
    );

    res.json({
      ...user,
      entry_count: parseInt(user.entry_count),
      project_count: parseInt(user.project_count),
      customer_count: parseInt(user.customer_count),
      total_hours: user.total_seconds ? (parseInt(user.total_seconds) / 3600).toFixed(2) : '0.00',
      recent_entries: entriesResult.rows
    });
  } catch (error) {
    logger.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role', validate(roleSchema), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    // Validation handled by Zod

    // Check if user exists
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update role
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'user.update',
      details: JSON.stringify({ targetUserId: id, newRole: role }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'User role updated' });
  } catch (error) {
    logger.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT username, email FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Delete user (cascade will delete related data)
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'user.delete',
      details: JSON.stringify({ deletedUserId: id, username: user.username, email: user.email }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/audit-logs - Get audit logs with pagination
router.get('/audit-logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));
    const userId = req.query.userId as string;
    const action = req.query.action as string;
    const offset = (page - 1) * limit;

    let query = `
      SELECT al.*, u.username, u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (userId) {
      paramCount++;
      query += ` AND al.user_id = $${paramCount}`;
      params.push(userId);
    }

    if (action) {
      paramCount++;
      query += ` AND al.action = $${paramCount}`;
      params.push(action);
    }

    query += ` ORDER BY al.timestamp DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM audit_logs WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (userId) {
      countParamCount++;
      countQuery += ` AND user_id = $${countParamCount}`;
      countParams.push(userId);
    }

    if (action) {
      countParamCount++;
      countQuery += ` AND action = $${countParamCount}`;
      countParams.push(action);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      logs: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /api/admin/analytics - Get detailed analytics
router.get('/analytics', async (req, res) => {
  try {
    // Users by account type
    const accountTypesResult = await pool.query(`
      SELECT account_type, COUNT(*) as count
      FROM users
      GROUP BY account_type
      ORDER BY count DESC
    `);

    // User registrations over time (last 30 days)
    const registrationsResult = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Time entries over time (last 30 days)
    const entriesOverTimeResult = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count, SUM(duration) as total_seconds
      FROM time_entries
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Top users by time tracked
    const topUsersResult = await pool.query(`
      SELECT u.username, u.email,
        COUNT(te.id) as entry_count,
        SUM(te.duration) as total_seconds
      FROM users u
      LEFT JOIN time_entries te ON u.id = te.user_id
      GROUP BY u.id
      ORDER BY total_seconds DESC NULLS LAST
      LIMIT 10
    `);

    res.json({
      accountTypes: accountTypesResult.rows,
      registrations: registrationsResult.rows,
      entriesOverTime: entriesOverTimeResult.rows.map((row: any) => ({
        date: row.date,
        count: parseInt(row.count),
        hours: row.total_seconds ? (parseInt(row.total_seconds) / 3600).toFixed(2) : '0.00'
      })),
      topUsers: topUsersResult.rows.map((user: any) => ({
        ...user,
        entry_count: parseInt(user.entry_count),
        total_hours: user.total_seconds ? (parseInt(user.total_seconds) / 3600).toFixed(2) : '0.00'
      }))
    });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================
// MAINTENANCE MANAGEMENT
// ============================================

// GET /api/admin/maintenance - List all maintenance announcements
router.get('/maintenance', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const status = req.query.status as string;
    const userId = req.query.userId as string;
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        a.*,
        u.username as user_name,
        u.email as user_email,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id) as customer_count,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id AND status = 'approved') as approved_count,
        (SELECT COUNT(*) FROM maintenance_announcement_customers WHERE announcement_id = a.id AND notification_sent_at IS NOT NULL) as notified_count
      FROM maintenance_announcements a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
    }

    if (userId) {
      paramCount++;
      query += ` AND a.user_id = $${paramCount}`;
      params.push(userId);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM maintenance_announcements WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }

    if (userId) {
      countParamCount++;
      countQuery += ` AND user_id = $${countParamCount}`;
      countParams.push(userId);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      announcements: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching maintenance announcements:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance announcements' });
  }
});

// GET /api/admin/maintenance/stats - Get maintenance statistics
router.get('/maintenance/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled_count,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count
      FROM maintenance_announcements
    `);

    const customerStats = await pool.query(`
      SELECT
        COUNT(*) as total_notifications,
        COUNT(*) FILTER (WHERE notification_sent_at IS NOT NULL) as sent_notifications,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE status = 'pending' AND notification_sent_at IS NOT NULL) as pending_count
      FROM maintenance_announcement_customers
    `);

    res.json({
      announcements: stats.rows[0],
      notifications: customerStats.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching maintenance stats:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance stats' });
  }
});

// DELETE /api/admin/maintenance/:id - Delete maintenance announcement (admin)
router.delete('/maintenance/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Get announcement details before deleting
    const announcementResult = await pool.query(
      `SELECT a.*, u.username as user_name
       FROM maintenance_announcements a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [id]
    );

    if (announcementResult.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const announcement = announcementResult.rows[0];

    // Delete the announcement (cascades to customers and devices)
    await pool.query('DELETE FROM maintenance_announcements WHERE id = $1', [id]);

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'maintenance.admin_delete',
      details: JSON.stringify({
        announcementId: id,
        title: announcement.title,
        status: announcement.status,
        ownerId: announcement.user_id,
        ownerName: announcement.user_name
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Wartungsankündigung gelöscht' });
  } catch (error) {
    logger.error('Error deleting maintenance announcement:', error);
    res.status(500).json({ error: 'Failed to delete maintenance announcement' });
  }
});

// DELETE /api/admin/maintenance/bulk - Bulk delete maintenance announcements
router.delete('/maintenance/bulk', validate(bulkUpdateSchema), async (req: AuthRequest, res) => {
  try {
    const { ids, status, olderThan } = req.body;
    // At least one filter is required - Zod ensures ids array exists

    let query = 'DELETE FROM maintenance_announcements WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      paramCount++;
      query += ` AND id = ANY($${paramCount})`;
      params.push(ids);
    }

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (olderThan) {
      paramCount++;
      query += ` AND created_at < $${paramCount}`;
      params.push(new Date(olderThan).toISOString());
    }

    query += ' RETURNING id, title, status';

    const result = await pool.query(query, params);
    const deletedCount = result.rowCount || 0;

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'maintenance.admin_bulk_delete',
      details: JSON.stringify({
        deletedCount,
        filters: { ids, status, olderThan },
        deletedTitles: result.rows.map((r: any) => r.title)
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      deletedCount,
      message: `${deletedCount} Wartungsankündigung(en) gelöscht`
    });
  } catch (error) {
    logger.error('Error bulk deleting maintenance announcements:', error);
    res.status(500).json({ error: 'Failed to delete maintenance announcements' });
  }
});

// ============================================
// FEATURE MANAGEMENT
// ============================================

// Package definitions (mirrored from features.ts)
const PACKAGES = {
  support: {
    name: 'support',
    label: 'Support Paket',
    description: 'Tickets, Geräte/NinjaRMM, Alerts',
    features: ['tickets', 'devices', 'alerts', 'customer_portal_admin'],
  },
  business: {
    name: 'business',
    label: 'Business Paket',
    description: 'Dashboard, Finanzen, sevDesk, Berichte',
    features: ['dashboard_advanced', 'billing', 'sevdesk', 'reports'],
  },
} as const;

// GET /api/admin/features - Get all users with their feature packages
router.get('/features', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string || '';
    const offset = (page - 1) * limit;

    let query = `
      SELECT
        u.id, u.username, u.email, u.account_type, u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'packageName', fp.package_name,
              'enabled', fp.enabled,
              'enabledAt', fp.enabled_at,
              'expiresAt', fp.expires_at
            )
          ) FILTER (WHERE fp.id IS NOT NULL),
          '[]'
        ) as packages
      FROM users u
      LEFT JOIN feature_packages fp ON u.id = fp.user_id
    `;

    const params: any[] = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` WHERE (u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM users';
    const countParams: any[] = [];
    if (search) {
      countQuery += ' WHERE (username ILIKE $1 OR email ILIKE $1)';
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows,
      packages: Object.values(PACKAGES),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching features:', error);
    res.status(500).json({ error: 'Failed to fetch features' });
  }
});

// PUT /api/admin/features/:userId/:packageName - Enable/disable package for user
router.put('/features/:userId/:packageName', validate(featureToggleSchema), async (req: AuthRequest, res) => {
  try {
    const { userId, packageName } = req.params;
    const { enabled, expiresAt } = req.body;

    // Validate package name
    if (!PACKAGES[packageName as keyof typeof PACKAGES]) {
      return res.status(400).json({ error: 'Invalid package name' });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT id, username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (enabled) {
      // Enable package - upsert
      await pool.query(
        `INSERT INTO feature_packages (id, user_id, package_name, enabled, enabled_at, expires_at)
         VALUES ($1, $2, $3, true, NOW(), $4)
         ON CONFLICT (user_id, package_name)
         DO UPDATE SET enabled = true, enabled_at = NOW(), expires_at = $4`,
        [crypto.randomUUID(), userId, packageName, expiresAt || null]
      );
    } else {
      // Disable package
      await pool.query(
        `UPDATE feature_packages SET enabled = false WHERE user_id = $1 AND package_name = $2`,
        [userId, packageName]
      );
    }

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'features.update',
      details: JSON.stringify({
        targetUserId: userId,
        targetUsername: userResult.rows[0].username,
        packageName,
        enabled,
        expiresAt
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: `Package ${packageName} ${enabled ? 'enabled' : 'disabled'} for user` });
  } catch (error) {
    logger.error('Error updating feature:', error);
    res.status(500).json({ error: 'Failed to update feature' });
  }
});

// POST /api/admin/features/bulk - Bulk enable/disable package for multiple users
router.post('/features/bulk', validate(bulkFeatureSchema), async (req: AuthRequest, res) => {
  try {
    const { userIds, packageName, enabled, expiresAt } = req.body;
    // userIds validation handled by Zod

    if (!PACKAGES[packageName as keyof typeof PACKAGES]) {
      return res.status(400).json({ error: 'Invalid package name' });
    }

    let updatedCount = 0;

    for (const userId of userIds) {
      if (enabled) {
        await pool.query(
          `INSERT INTO feature_packages (id, user_id, package_name, enabled, enabled_at, expires_at)
           VALUES ($1, $2, $3, true, NOW(), $4)
           ON CONFLICT (user_id, package_name)
           DO UPDATE SET enabled = true, enabled_at = NOW(), expires_at = $4`,
          [crypto.randomUUID(), userId, packageName, expiresAt || null]
        );
      } else {
        await pool.query(
          `UPDATE feature_packages SET enabled = false WHERE user_id = $1 AND package_name = $2`,
          [userId, packageName]
        );
      }
      updatedCount++;
    }

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'features.bulk_update',
      details: JSON.stringify({
        userCount: updatedCount,
        packageName,
        enabled,
        expiresAt
      }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      updatedCount,
      message: `Package ${packageName} ${enabled ? 'enabled' : 'disabled'} for ${updatedCount} users`
    });
  } catch (error) {
    logger.error('Error bulk updating features:', error);
    res.status(500).json({ error: 'Failed to bulk update features' });
  }
});

// ============================================
// BACKUP MANAGEMENT
// ============================================

interface BackupFile {
  filename: string;
  size: string;
  sizeBytes: number;
  createdAt: string;
  compressed: boolean;
}

// GET /api/admin/backups - List available backups
router.get('/backups', async (req, res) => {
  try {
    // Check if backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ backups: [], backupDir: BACKUP_DIR });
    }

    const files = fs.readdirSync(BACKUP_DIR);
    const backups: BackupFile[] = [];

    for (const file of files) {
      if (file.startsWith('backup_') && (file.endsWith('.sql') || file.endsWith('.sql.gz'))) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);

        // Format file size
        const sizeBytes = stats.size;
        let size: string;
        if (sizeBytes >= 1024 * 1024 * 1024) {
          size = (sizeBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        } else if (sizeBytes >= 1024 * 1024) {
          size = (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
        } else if (sizeBytes >= 1024) {
          size = (sizeBytes / 1024).toFixed(2) + ' KB';
        } else {
          size = sizeBytes + ' B';
        }

        backups.push({
          filename: file,
          size,
          sizeBytes,
          createdAt: stats.mtime.toISOString(),
          compressed: file.endsWith('.gz')
        });
      }
    }

    // Sort by date, newest first
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ backups, backupDir: BACKUP_DIR });
  } catch (error) {
    logger.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// POST /api/admin/backups - Create a new backup
router.post('/backups', validate(backupSchema), async (req: AuthRequest, res) => {
  try {
    const { compress = true } = req.body;

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dbName = process.env.POSTGRES_DB || 'timetracking';
    const dbUser = process.env.POSTGRES_USER || 'timetracking';
    const dbContainer = process.env.DB_CONTAINER || 'timetracking-postgres';

    const baseFilename = `backup_${dbName}_${timestamp}`;
    const filename = compress ? `${baseFilename}.sql.gz` : `${baseFilename}.sql`;
    const filePath = path.join(BACKUP_DIR, filename);

    // Execute backup command
    let command: string;
    if (compress) {
      command = `docker exec ${dbContainer} pg_dump -U ${dbUser} ${dbName} | gzip > "${filePath}"`;
    } else {
      command = `docker exec ${dbContainer} pg_dump -U ${dbUser} ${dbName} > "${filePath}"`;
    }

    await execAsync(command, { timeout: 300000 }); // 5 minute timeout

    // Get file info
    const stats = fs.statSync(filePath);
    const sizeBytes = stats.size;
    let size: string;
    if (sizeBytes >= 1024 * 1024) {
      size = (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (sizeBytes >= 1024) {
      size = (sizeBytes / 1024).toFixed(2) + ' KB';
    } else {
      size = sizeBytes + ' B';
    }

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'backup.create',
      details: JSON.stringify({ filename, size, compressed: compress }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Backup erfolgreich erstellt',
      backup: {
        filename,
        size,
        sizeBytes,
        createdAt: stats.mtime.toISOString(),
        compressed: compress
      }
    });
  } catch (error: any) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ error: `Backup fehlgeschlagen: ${error.message}` });
  }
});

// POST /api/admin/backups/:filename/restore - Restore from a backup
router.post('/backups/:filename/restore', validate(restoreConfirmSchema), async (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;
    const { confirm } = req.body;
    // Validation handled by Zod

    const filePath = path.join(BACKUP_DIR, filename);

    // Security check - ensure file is in backup directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(BACKUP_DIR))) {
      return res.status(400).json({ error: 'Ungültiger Dateipfad' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup-Datei nicht gefunden' });
    }

    const dbName = process.env.POSTGRES_DB || 'timetracking';
    const dbUser = process.env.POSTGRES_USER || 'timetracking';
    const dbContainer = process.env.DB_CONTAINER || 'timetracking-postgres';

    // Terminate active connections
    await execAsync(
      `docker exec ${dbContainer} psql -U ${dbUser} -d postgres -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${dbName}' AND pid <> pg_backend_pid();"`,
      { timeout: 30000 }
    ).catch(() => {}); // Ignore errors if no connections

    // Drop and recreate database
    await execAsync(
      `docker exec ${dbContainer} psql -U ${dbUser} -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`,
      { timeout: 30000 }
    );
    await execAsync(
      `docker exec ${dbContainer} psql -U ${dbUser} -d postgres -c "CREATE DATABASE ${dbName} OWNER ${dbUser};"`,
      { timeout: 30000 }
    );

    // Restore backup
    let restoreCommand: string;
    if (filename.endsWith('.gz')) {
      restoreCommand = `gunzip -c "${filePath}" | docker exec -i ${dbContainer} psql -U ${dbUser} -d ${dbName}`;
    } else {
      restoreCommand = `docker exec -i ${dbContainer} psql -U ${dbUser} -d ${dbName} < "${filePath}"`;
    }

    await execAsync(restoreCommand, { timeout: 600000 }); // 10 minute timeout

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'backup.restore',
      details: JSON.stringify({ filename }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Datenbank erfolgreich wiederhergestellt. Server-Neustart empfohlen.'
    });
  } catch (error: any) {
    logger.error('Error restoring backup:', error);
    res.status(500).json({ error: `Wiederherstellung fehlgeschlagen: ${error.message}` });
  }
});

// DELETE /api/admin/backups/:filename - Delete a backup
router.delete('/backups/:filename', async (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(BACKUP_DIR, filename);

    // Security check - ensure file is in backup directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(BACKUP_DIR))) {
      return res.status(400).json({ error: 'Ungültiger Dateipfad' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup-Datei nicht gefunden' });
    }

    // Get file size before deleting
    const stats = fs.statSync(filePath);

    fs.unlinkSync(filePath);

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'backup.delete',
      details: JSON.stringify({ filename, sizeBytes: stats.size }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      message: 'Backup gelöscht'
    });
  } catch (error: any) {
    logger.error('Error deleting backup:', error);
    res.status(500).json({ error: `Löschen fehlgeschlagen: ${error.message}` });
  }
});

// DELETE /api/admin/backups - Delete old backups (cleanup)
router.delete('/backups', validate(cleanupSchema), async (req: AuthRequest, res) => {
  try {
    const { olderThanDays = 30 } = req.body;

    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ success: true, deletedCount: 0 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const files = fs.readdirSync(BACKUP_DIR);
    let deletedCount = 0;
    const deletedFiles: string[] = [];

    for (const file of files) {
      if (file.startsWith('backup_') && (file.endsWith('.sql') || file.endsWith('.sql.gz'))) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedFiles.push(file);
          deletedCount++;
        }
      }
    }

    // Log action
    await auditLog.log({
      userId: req.user!.id,
      action: 'backup.cleanup',
      details: JSON.stringify({ olderThanDays, deletedCount, deletedFiles }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      success: true,
      deletedCount,
      message: `${deletedCount} alte Backup(s) gelöscht`
    });
  } catch (error: any) {
    logger.error('Error cleaning up backups:', error);
    res.status(500).json({ error: `Aufräumen fehlgeschlagen: ${error.message}` });
  }
});

// ============================================
// SYSTEM STATUS / HEALTH CHECK
// ============================================

// GET /api/admin/system/status - Get system health status
router.get('/system/status', async (req, res) => {
  try {
    const status: any = {
      timestamp: new Date().toISOString(),
      database: { status: 'unknown', latency: 0 },
      docker: { containers: [] },
      disk: { used: 0, total: 0, percentage: 0 },
      memory: { used: 0, total: 0, percentage: 0 },
      uptime: process.uptime()
    };

    // Check database connection
    const dbStart = Date.now();
    try {
      await pool.query('SELECT 1');
      status.database = {
        status: 'connected',
        latency: Date.now() - dbStart
      };
    } catch (dbError: any) {
      status.database = {
        status: 'error',
        error: dbError.message,
        latency: Date.now() - dbStart
      };
    }

    // Check Docker containers
    try {
      const { stdout } = await execAsync(
        'docker ps --format "{{.Names}}|{{.Status}}|{{.Image}}" 2>/dev/null || echo ""',
        { timeout: 10000 }
      );
      if (stdout.trim()) {
        status.docker.containers = stdout.trim().split('\n').map(line => {
          const [name, containerStatus, image] = line.split('|');
          return { name, status: containerStatus, image };
        });
      }
    } catch {
      status.docker.error = 'Docker nicht verfügbar';
    }

    // Check disk usage
    try {
      const { stdout } = await execAsync(
        "df -h / | tail -1 | awk '{print $2,$3,$5}'",
        { timeout: 5000 }
      );
      const [total, used, percentage] = stdout.trim().split(' ');
      status.disk = {
        total,
        used,
        percentage: parseInt(percentage) || 0
      };
    } catch {
      status.disk.error = 'Festplatteninfo nicht verfügbar';
    }

    // Check memory usage
    try {
      const { stdout } = await execAsync(
        "free -h | grep Mem | awk '{print $2,$3}'",
        { timeout: 5000 }
      );
      const [total, used] = stdout.trim().split(' ');
      const memInfo = await execAsync("free | grep Mem | awk '{print $2,$3}'", { timeout: 5000 });
      const [totalBytes, usedBytes] = memInfo.stdout.trim().split(' ').map(Number);
      status.memory = {
        total,
        used,
        percentage: Math.round((usedBytes / totalBytes) * 100)
      };
    } catch {
      status.memory.error = 'Speicherinfo nicht verfügbar';
    }

    res.json(status);
  } catch (error: any) {
    logger.error('Error fetching system status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

// ============================================
// DATABASE STATISTICS
// ============================================

// GET /api/admin/database/stats - Get database statistics
router.get('/database/stats', async (req, res) => {
  try {
    // Get table sizes
    const tableSizes = await pool.query(`
      SELECT
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_total_relation_size(relid) as size_bytes,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
    `);

    // Get database size
    const dbSize = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);

    // Get connection stats
    const connections = await pool.query(`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    // Get index usage
    const indexUsage = await pool.query(`
      SELECT
        schemaname,
        relname as table_name,
        indexrelname as index_name,
        idx_scan as scans,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 20
    `);

    // Get cache hit ratio
    const cacheRatio = await pool.query(`
      SELECT
        sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 as ratio
      FROM pg_statio_user_tables
    `);

    // Get slow queries (if pg_stat_statements is available)
    let slowQueries: any[] = [];
    try {
      const slowQueryResult = await pool.query(`
        SELECT
          query,
          calls,
          mean_exec_time as avg_time_ms,
          total_exec_time as total_time_ms
        FROM pg_stat_statements
        WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `);
      slowQueries = slowQueryResult.rows;
    } catch {
      // pg_stat_statements not available
    }

    res.json({
      databaseSize: dbSize.rows[0]?.size || 'Unknown',
      tables: tableSizes.rows,
      connections: connections.rows[0] || { total: 0, active: 0, idle: 0 },
      indexes: indexUsage.rows,
      cacheHitRatio: cacheRatio.rows[0]?.ratio?.toFixed(2) || '0',
      slowQueries
    });
  } catch (error: any) {
    logger.error('Error fetching database stats:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});

// POST /api/admin/database/vacuum - Run VACUUM ANALYZE
router.post('/database/vacuum', validate(vacuumTableSchema), async (req: AuthRequest, res) => {
  try {
    const { table } = req.body;

    if (table) {
      // Validate table name against actual database tables
      const validTables = await pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
      );
      const tableNames = validTables.rows.map((r: any) => r.tablename);
      if (!tableNames.includes(table)) {
        return res.status(400).json({ error: 'Ungültige Tabelle' });
      }
      await pool.query(`VACUUM ANALYZE ${table}`);
    } else {
      await pool.query('VACUUM ANALYZE');
    }

    await auditLog.log({
      userId: req.user!.id,
      action: 'database.vacuum',
      details: JSON.stringify({ table: table || 'all' }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'VACUUM ANALYZE erfolgreich ausgeführt' });
  } catch (error: any) {
    logger.error('Error running vacuum:', error);
    res.status(500).json({ error: `VACUUM fehlgeschlagen: ${error.message}` });
  }
});

// ============================================
// SECURITY / SESSIONS
// ============================================

// GET /api/admin/security/sessions - Get active sessions
router.get('/security/sessions', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // Get active sessions from tokens table if exists
    let sessions: any[] = [];
    try {
      const result = await pool.query(`
        SELECT
          s.id,
          s.user_id,
          u.username,
          u.email,
          s.created_at,
          s.last_activity,
          s.ip_address,
          s.user_agent
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.expires_at > NOW()
        ORDER BY s.last_activity DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      sessions = result.rows;
    } catch {
      // Sessions table might not exist, try refresh_tokens
      try {
        const result = await pool.query(`
          SELECT
            rt.id,
            rt.user_id,
            u.username,
            u.email,
            rt.created_at,
            rt.expires_at
          FROM refresh_tokens rt
          JOIN users u ON rt.user_id = u.id
          WHERE rt.expires_at > NOW()
          ORDER BY rt.created_at DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]);
        sessions = result.rows;
      } catch {
        // No session tracking available
      }
    }

    // Get login attempts from audit log
    const loginAttempts = await pool.query(`
      SELECT
        action,
        COUNT(*) as count,
        MAX(timestamp) as last_attempt
      FROM audit_logs
      WHERE action IN ('login.success', 'login.failed', 'login.mfa_failed')
        AND timestamp > NOW() - INTERVAL '24 hours'
      GROUP BY action
    `);

    // Get failed logins by IP
    const failedByIp = await pool.query(`
      SELECT
        ip_address,
        COUNT(*) as attempts,
        MAX(timestamp) as last_attempt
      FROM audit_logs
      WHERE action = 'login.failed'
        AND timestamp > NOW() - INTERVAL '24 hours'
      GROUP BY ip_address
      ORDER BY attempts DESC
      LIMIT 10
    `);

    res.json({
      sessions,
      loginStats: {
        attempts: loginAttempts.rows.reduce((acc: any, row: any) => {
          acc[row.action] = parseInt(row.count);
          return acc;
        }, {}),
        failedByIp: failedByIp.rows
      }
    });
  } catch (error: any) {
    logger.error('Error fetching security data:', error);
    res.status(500).json({ error: 'Failed to fetch security data' });
  }
});

// DELETE /api/admin/security/sessions/:userId - Invalidate user sessions
router.delete('/security/sessions/:userId', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Try to delete from user_sessions
    try {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    } catch {
      // Try refresh_tokens
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    }

    await auditLog.log({
      userId: req.user!.id,
      action: 'security.sessions_invalidated',
      details: JSON.stringify({ targetUserId: userId }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, message: 'Sessions invalidiert' });
  } catch (error: any) {
    logger.error('Error invalidating sessions:', error);
    res.status(500).json({ error: 'Failed to invalidate sessions' });
  }
});

// ============================================
// SYSTEM LOGS
// ============================================

// GET /api/admin/system/logs - Get application logs
router.get('/system/logs', async (req, res) => {
  try {
    const lines = parseInt(req.query.lines as string) || 100;
    const logType = req.query.type as string || 'app';

    let logPath: string;
    switch (logType) {
      case 'error':
        logPath = '/var/log/app/error.log';
        break;
      case 'access':
        logPath = '/var/log/app/access.log';
        break;
      default:
        logPath = '/var/log/app/app.log';
    }

    let logs: string[] = [];

    // Try to read log file
    try {
      if (fs.existsSync(logPath)) {
        const { stdout } = await execAsync(`tail -n ${lines} "${logPath}"`, { timeout: 10000 });
        logs = stdout.split('\n').filter(Boolean).reverse();
      }
    } catch {
      // Log file not accessible, try docker logs
      try {
        const containerName = process.env.APP_CONTAINER || 'timetracking-app';
        const { stdout } = await execAsync(
          `docker logs --tail ${lines} ${containerName} 2>&1`,
          { timeout: 10000 }
        );
        logs = stdout.split('\n').filter(Boolean).reverse();
      } catch {
        logs = ['Logs nicht verfügbar'];
      }
    }

    res.json({ logs, logType });
  } catch (error: any) {
    logger.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ============================================
// SYSTEM NOTIFICATIONS
// ============================================

// GET /api/admin/notifications - Get system notifications
router.get('/notifications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ${SYSTEM_NOTIFICATION_COLUMNS} FROM system_notifications
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ notifications: result.rows });
  } catch (error: any) {
    // Table might not exist
    if (error.code === '42P01') {
      res.json({ notifications: [], tableExists: false });
    } else {
      logger.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }
});

// POST /api/admin/notifications - Create system notification
router.post('/notifications', validate(maintenanceSchema), async (req: AuthRequest, res) => {
  try {
    const { title, message, type = 'info', expiresAt } = req.body;
    // Validation handled by Zod

    // Create table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'info',
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    const result = await pool.query(`
      INSERT INTO system_notifications (title, message, type, created_by, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [title, message, type, req.user!.id, expiresAt || null]);

    await auditLog.log({
      userId: req.user!.id,
      action: 'notification.create',
      details: JSON.stringify({ title, type }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true, notification: result.rows[0] });
  } catch (error: any) {
    logger.error('Error creating notification:', error);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// DELETE /api/admin/notifications/:id - Delete notification
router.delete('/notifications/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM system_notifications WHERE id = $1', [id]);

    await auditLog.log({
      userId: req.user!.id,
      action: 'notification.delete',
      details: JSON.stringify({ notificationId: id }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// PUT /api/admin/notifications/:id/toggle - Toggle notification active status
router.put('/notifications/:id/toggle', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE system_notifications
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING *
    `, [id]);

    res.json({ success: true, notification: result.rows[0] });
  } catch (error: any) {
    logger.error('Error toggling notification:', error);
    res.status(500).json({ error: 'Failed to toggle notification' });
  }
});

// ============================================
// Email Dashboard Routes
// ============================================

// GET /api/admin/email/stats - Get email statistics
router.get('/email/stats', async (req, res) => {
  try {
    // Get stats for different time periods
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setDate(monthAgo.getDate() - 30);

    // Total emails today
    const todayResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM email_logs
      WHERE created_at >= $1
    `, [today.toISOString()]);

    // Emails this week
    const weekResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM email_logs
      WHERE created_at >= $1
    `, [weekAgo.toISOString()]);

    // Emails this month
    const monthResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM email_logs
      WHERE created_at >= $1
    `, [monthAgo.toISOString()]);

    // By provider
    const providerResult = await pool.query(`
      SELECT
        provider,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM email_logs
      WHERE created_at >= $1
      GROUP BY provider
    `, [monthAgo.toISOString()]);

    // By email type
    const typeResult = await pool.query(`
      SELECT
        email_type,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM email_logs
      WHERE created_at >= $1
      GROUP BY email_type
      ORDER BY total DESC
      LIMIT 10
    `, [monthAgo.toISOString()]);

    // Average processing time
    const avgTimeResult = await pool.query(`
      SELECT AVG(processing_time_ms) as avg_time
      FROM email_logs
      WHERE created_at >= $1 AND processing_time_ms IS NOT NULL
    `, [monthAgo.toISOString()]);

    // Daily trend (last 7 days)
    const trendResult = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM email_logs
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [weekAgo.toISOString()]);

    // Recent failures
    const recentFailuresResult = await pool.query(`
      SELECT id, email_type, recipient_email, error_message, created_at
      FROM email_logs
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      today: {
        total: parseInt(todayResult.rows[0]?.total || 0),
        sent: parseInt(todayResult.rows[0]?.sent || 0),
        failed: parseInt(todayResult.rows[0]?.failed || 0),
      },
      week: {
        total: parseInt(weekResult.rows[0]?.total || 0),
        sent: parseInt(weekResult.rows[0]?.sent || 0),
        failed: parseInt(weekResult.rows[0]?.failed || 0),
      },
      month: {
        total: parseInt(monthResult.rows[0]?.total || 0),
        sent: parseInt(monthResult.rows[0]?.sent || 0),
        failed: parseInt(monthResult.rows[0]?.failed || 0),
      },
      byProvider: providerResult.rows.map(r => ({
        provider: r.provider,
        total: parseInt(r.total),
        sent: parseInt(r.sent),
        failed: parseInt(r.failed),
      })),
      byType: typeResult.rows.map(r => ({
        type: r.email_type,
        total: parseInt(r.total),
        sent: parseInt(r.sent),
        failed: parseInt(r.failed),
      })),
      avgProcessingTime: Math.round(parseFloat(avgTimeResult.rows[0]?.avg_time || 0)),
      trend: trendResult.rows.map(r => ({
        date: r.date,
        total: parseInt(r.total),
        sent: parseInt(r.sent),
        failed: parseInt(r.failed),
      })),
      recentFailures: recentFailuresResult.rows,
    });
  } catch (error: any) {
    // Table might not exist yet
    if (error.code === '42P01') {
      res.json({
        today: { total: 0, sent: 0, failed: 0 },
        week: { total: 0, sent: 0, failed: 0 },
        month: { total: 0, sent: 0, failed: 0 },
        byProvider: [],
        byType: [],
        avgProcessingTime: 0,
        trend: [],
        recentFailures: [],
        tableExists: false,
      });
    } else {
      logger.error('Error fetching email stats:', error);
      res.status(500).json({ error: 'Failed to fetch email statistics' });
    }
  }
});

// GET /api/admin/email/logs - Get email logs with pagination
router.get('/email/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;
    const emailType = req.query.type as string;
    const search = req.query.search as string;

    let whereClause = '1=1';
    const params: any[] = [];
    let paramIndex = 0;

    if (status) {
      paramIndex++;
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
    }

    if (emailType) {
      paramIndex++;
      whereClause += ` AND email_type = $${paramIndex}`;
      params.push(emailType);
    }

    if (search) {
      paramIndex++;
      whereClause += ` AND (recipient_email ILIKE $${paramIndex} OR subject ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM email_logs WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get logs
    const logsResult = await pool.query(`
      SELECT
        el.*,
        u.username,
        u.email as user_email
      FROM email_logs el
      LEFT JOIN users u ON el.user_id = u.id
      WHERE ${whereClause}
      ORDER BY el.created_at DESC
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `, [...params, limit, offset]);

    res.json({
      logs: logsResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    if (error.code === '42P01') {
      res.json({ logs: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 }, tableExists: false });
    } else {
      logger.error('Error fetching email logs:', error);
      res.status(500).json({ error: 'Failed to fetch email logs' });
    }
  }
});

// GET /api/admin/email/config - Get current email configuration
router.get('/email/config', async (req, res) => {
  try {
    // Import emailService dynamically to get current state
    const { emailService } = await import('../services/emailService');
    const result = await emailService.testConnection();

    res.json({
      provider: result.provider,
      status: result.success ? 'connected' : 'disconnected',
      error: result.error,
      details: result.details,
      config: {
        emailProvider: process.env.EMAIL_PROVIDER || 'auto',
        smtpConfigured: !!process.env.EMAIL_HOST,
        graphConfigured: !!process.env.AZURE_CLIENT_ID && !!process.env.GRAPH_MAIL_FROM,
        testMode: process.env.EMAIL_TEST_MODE === 'true',
        fromAddress: process.env.EMAIL_FROM || process.env.GRAPH_MAIL_FROM || 'Not configured',
      },
    });
  } catch (error: any) {
    logger.error('Error fetching email config:', error);
    res.status(500).json({ error: 'Failed to fetch email configuration' });
  }
});

// POST /api/admin/email/test - Send a test email
router.post('/email/test', validate(testEmailSchema), async (req: AuthRequest, res) => {
  try {
    const { to } = req.body;
    const testEmail = to || req.user?.email;

    if (!testEmail) {
      return res.status(400).json({ error: 'Email address required' });
    }

    // Import emailService
    const { emailService } = await import('../services/emailService');

    const success = await emailService.sendEmail({
      to: testEmail,
      subject: '🧪 Test-Email von RamboFlow Admin',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #7c3aed;">Test-Email erfolgreich!</h2>
          <p>Diese Test-Email wurde vom Admin Portal gesendet.</p>
          <p><strong>Zeitpunkt:</strong> ${new Date().toLocaleString('de-DE')}</p>
          <p><strong>Gesendet von:</strong> ${req.user?.username}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            Diese E-Mail wurde automatisch von RamboFlow generiert.
          </p>
        </div>
      `,
      text: `Test-Email erfolgreich!\n\nDiese Test-Email wurde vom Admin Portal gesendet.\nZeitpunkt: ${new Date().toLocaleString('de-DE')}\nGesendet von: ${req.user?.username}`,
    }, {
      emailType: 'admin_test',
      subject: '🧪 Test-Email von RamboFlow Admin',
      recipientEmail: testEmail,
      userId: req.user?.id,
      metadata: { sentBy: req.user?.username },
    });

    await auditLog.log({
      userId: req.user!.id,
      action: 'email.test',
      details: JSON.stringify({ to: testEmail, success }),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (success) {
      res.json({ success: true, message: `Test-Email wurde an ${testEmail} gesendet` });
    } else {
      res.status(500).json({ success: false, error: 'Email konnte nicht gesendet werden' });
    }
  } catch (error: any) {
    logger.error('Error sending test email:', error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});

// GET /api/admin/email/types - Get distinct email types
router.get('/email/types', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT email_type, COUNT(*) as count
      FROM email_logs
      GROUP BY email_type
      ORDER BY count DESC
    `);
    res.json({ types: result.rows });
  } catch (error: any) {
    if (error.code === '42P01') {
      res.json({ types: [], tableExists: false });
    } else {
      logger.error('Error fetching email types:', error);
      res.status(500).json({ error: 'Failed to fetch email types' });
    }
  }
});

export default router;
