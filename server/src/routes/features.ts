import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Package definitions
export const PACKAGES = {
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

export type PackageName = keyof typeof PACKAGES;

// GET /api/features - Get all enabled packages for current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT package_name, enabled, enabled_at, expires_at
       FROM feature_packages
       WHERE user_id = $1 AND enabled = true
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    const enabledPackages = result.rows.map(row => row.package_name);

    // Build feature response
    const features = {
      // Core features (always enabled)
      core: true,
      timeTracking: true,

      // Package-based features
      support: enabledPackages.includes('support'),
      business: enabledPackages.includes('business'),

      // Detailed feature flags for convenience
      tickets: enabledPackages.includes('support'),
      devices: enabledPackages.includes('support'),
      alerts: enabledPackages.includes('support'),
      billing: enabledPackages.includes('business'),
      dashboardAdvanced: enabledPackages.includes('business'),

      // Package details
      packages: result.rows.map(row => ({
        name: row.package_name,
        enabled: row.enabled,
        enabledAt: row.enabled_at,
        expiresAt: row.expires_at,
      })),
    };

    res.json({ success: true, data: features });
  } catch (error: any) {
    console.error('Get features error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/features/:packageName/enable - Enable a package (admin only for now)
router.post('/:packageName/enable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { packageName } = req.params;
    const { expiresAt } = req.body;

    // Validate package name
    if (!PACKAGES[packageName as PackageName]) {
      return res.status(400).json({ success: false, error: 'Invalid package name' });
    }

    // Upsert package
    await query(
      `INSERT INTO feature_packages (id, user_id, package_name, enabled, enabled_at, expires_at)
       VALUES ($1, $2, $3, true, NOW(), $4)
       ON CONFLICT (user_id, package_name)
       DO UPDATE SET enabled = true, enabled_at = NOW(), expires_at = $4`,
      [uuidv4(), userId, packageName, expiresAt || null]
    );

    res.json({ success: true, message: `Package ${packageName} enabled` });
  } catch (error: any) {
    console.error('Enable package error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/features/:packageName/disable - Disable a package
router.post('/:packageName/disable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { packageName } = req.params;

    await query(
      `UPDATE feature_packages SET enabled = false WHERE user_id = $1 AND package_name = $2`,
      [userId, packageName]
    );

    res.json({ success: true, message: `Package ${packageName} disabled` });
  } catch (error: any) {
    console.error('Disable package error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/features/available - Get all available packages with descriptions
router.get('/available', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get user's enabled packages
    const result = await query(
      `SELECT package_name, enabled FROM feature_packages WHERE user_id = $1`,
      [userId]
    );

    const userPackages = new Map(result.rows.map(r => [r.package_name, r.enabled]));

    const available = Object.values(PACKAGES).map(pkg => ({
      ...pkg,
      enabled: userPackages.get(pkg.name) ?? false,
    }));

    res.json({ success: true, data: available });
  } catch (error: any) {
    console.error('Get available packages error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
