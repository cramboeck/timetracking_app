import { Router } from 'express';
import { pool } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { auditLog } from '../services/auditLog';

const router = Router();

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
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/admin/users - List all users with pagination
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
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
    console.error('Error fetching users:', error);
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
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin"' });
    }

    // Check if user exists
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
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
    console.error('Error updating user role:', error);
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
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/audit-logs - Get audit logs with pagination
router.get('/audit-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
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
    console.error('Error fetching audit logs:', error);
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
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ============================================
// MAINTENANCE MANAGEMENT
// ============================================

// GET /api/admin/maintenance - List all maintenance announcements
router.get('/maintenance', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
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
    console.error('Error fetching maintenance announcements:', error);
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
    console.error('Error fetching maintenance stats:', error);
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
    console.error('Error deleting maintenance announcement:', error);
    res.status(500).json({ error: 'Failed to delete maintenance announcement' });
  }
});

// DELETE /api/admin/maintenance/bulk - Bulk delete maintenance announcements
router.delete('/maintenance/bulk', async (req: AuthRequest, res) => {
  try {
    const { ids, status, olderThan } = req.body;

    if (!ids && !status && !olderThan) {
      return res.status(400).json({
        error: 'Please provide ids, status, or olderThan filter'
      });
    }

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
    console.error('Error bulk deleting maintenance announcements:', error);
    res.status(500).json({ error: 'Failed to delete maintenance announcements' });
  }
});

export default router;
