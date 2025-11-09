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

export default router;
