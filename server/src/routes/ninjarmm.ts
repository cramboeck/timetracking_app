import express, { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import * as ninjaService from '../services/ninjarmmService';

const router = express.Router();

// Middleware to check if NinjaRMM feature is enabled
async function requireNinjaFeature(req: AuthRequest, res: Response, next: Function) {
  try {
    const userId = req.user!.id;
    const result = await query(
      "SELECT feature_flags->>'ninja_rmm_enabled' as ninja_enabled FROM users WHERE id = $1",
      [userId]
    );

    const ninjaEnabled = result.rows[0]?.ninja_enabled === 'true';

    if (!ninjaEnabled) {
      return res.status(403).json({
        success: false,
        error: 'NinjaRMM feature is not enabled for your account',
        code: 'FEATURE_NOT_ENABLED',
      });
    }

    next();
  } catch (error) {
    console.error('Feature check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check feature access' });
  }
}

// ============================================
// Configuration
// ============================================

// GET /api/ninjarmm/config - Get NinjaRMM configuration
router.get('/config', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await ninjaService.getConfig(userId);

    res.json({
      success: true,
      data: config ? {
        instanceUrl: config.instanceUrl,
        clientId: config.clientId ? '••••••••' : null,
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        isConnected: !!config.accessToken,
        tokenExpiresAt: config.tokenExpiresAt,
        autoSyncDevices: config.autoSyncDevices,
        syncIntervalMinutes: config.syncIntervalMinutes,
        lastSyncAt: config.lastSyncAt,
      } : null,
    });
  } catch (error: any) {
    console.error('Get NinjaRMM config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ninjarmm/config - Save NinjaRMM configuration
router.put('/config', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { clientId, clientSecret, instanceUrl, autoSyncDevices, syncIntervalMinutes } = req.body;

    const config = await ninjaService.saveConfig(userId, {
      clientId,
      clientSecret,
      instanceUrl,
      autoSyncDevices,
      syncIntervalMinutes,
    });

    res.json({
      success: true,
      data: {
        instanceUrl: config.instanceUrl,
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        isConnected: !!config.accessToken,
        autoSyncDevices: config.autoSyncDevices,
        syncIntervalMinutes: config.syncIntervalMinutes,
      },
    });
  } catch (error: any) {
    console.error('Save NinjaRMM config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// OAuth2 Authentication
// ============================================

// GET /api/ninjarmm/auth-url - Get OAuth2 authorization URL
router.get('/auth-url', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await ninjaService.getConfig(userId);

    if (!config?.clientId) {
      return res.status(400).json({
        success: false,
        error: 'NinjaRMM client ID not configured',
      });
    }

    // Build redirect URI based on request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/ninjarmm/callback`;

    // Generate state for CSRF protection
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

    const authUrl = ninjaService.getAuthorizationUrl(
      config.clientId,
      redirectUri,
      config.instanceUrl,
      state
    );

    res.json({
      success: true,
      data: { authUrl, redirectUri },
    });
  } catch (error: any) {
    console.error('Get auth URL error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ninjarmm/callback - OAuth2 callback handler
router.get('/callback', async (req: express.Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('OAuth error:', oauthError);
      return res.redirect('/settings?ninja_error=' + encodeURIComponent(String(oauthError)));
    }

    if (!code || !state) {
      return res.redirect('/settings?ninja_error=missing_params');
    }

    // Decode state
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(String(state), 'base64').toString());
    } catch {
      return res.redirect('/settings?ninja_error=invalid_state');
    }

    // Check state is not too old (5 minutes)
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      return res.redirect('/settings?ninja_error=expired_state');
    }

    // Build redirect URI
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/ninjarmm/callback`;

    // Exchange code for tokens
    const result = await ninjaService.exchangeCodeForTokens(
      stateData.userId,
      String(code),
      redirectUri
    );

    if (!result.success) {
      return res.redirect('/settings?ninja_error=' + encodeURIComponent(result.error || 'unknown'));
    }

    // Redirect back to settings with success
    res.redirect('/settings?ninja_connected=true');
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.redirect('/settings?ninja_error=' + encodeURIComponent(error.message));
  }
});

// POST /api/ninjarmm/disconnect - Disconnect from NinjaRMM
router.post('/disconnect', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    await ninjaService.disconnect(userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Disconnect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ninjarmm/test - Test NinjaRMM connection
router.get('/test', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await ninjaService.testConnection(userId);

    res.json({
      success: result.success,
      data: result.success ? {
        organizationCount: result.organizationCount,
        deviceCount: result.deviceCount,
      } : undefined,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Test connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Sync Operations
// ============================================

// POST /api/ninjarmm/sync - Sync all data from NinjaRMM
router.post('/sync', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await ninjaService.syncAll(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ninjarmm/sync-status - Get sync status
router.get('/sync-status', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = await ninjaService.getSyncStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('Get sync status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Organizations
// ============================================

// GET /api/ninjarmm/organizations - Get synced organizations
router.get('/organizations', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizations = await ninjaService.getLocalOrganizations(userId);

    res.json({
      success: true,
      data: organizations,
    });
  } catch (error: any) {
    console.error('Get organizations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ninjarmm/organizations/:id/link - Link organization to customer
router.put('/organizations/:id/link', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { customerId } = req.body;

    if (customerId) {
      await ninjaService.linkOrganizationToCustomer(userId, id, customerId);
    } else {
      await ninjaService.unlinkOrganizationFromCustomer(userId, id);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Link organization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Devices
// ============================================

// GET /api/ninjarmm/devices - Get synced devices
router.get('/devices', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { organizationId, customerId, nodeClass, offline, search, limit, offset } = req.query;

    const devices = await ninjaService.getLocalDevices(userId, {
      organizationId: organizationId as string,
      customerId: customerId as string,
      nodeClass: nodeClass as string,
      offline: offline === 'true' ? true : offline === 'false' ? false : undefined,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    res.json({
      success: true,
      data: devices,
    });
  } catch (error: any) {
    console.error('Get devices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ninjarmm/devices/:id - Get device details (live from NinjaRMM)
router.get('/devices/:id/details', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Get ninja_id from local device
    const result = await query(
      'SELECT ninja_id FROM ninjarmm_devices WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const ninjaId = result.rows[0].ninja_id;
    const device = await ninjaService.getDeviceWithDetails(userId, ninjaId);

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found in NinjaRMM' });
    }

    res.json({
      success: true,
      data: device,
    });
  } catch (error: any) {
    console.error('Get device details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ninjarmm/devices/:id/refresh - Fetch and save device details from NinjaRMM
router.post('/devices/:id/refresh', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Get ninja_id from local device
    const result = await query(
      'SELECT ninja_id, ninja_device_id FROM ninjarmm_devices WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // Try ninja_id first, fall back to ninja_device_id parsed as integer
    let ninjaId = result.rows[0].ninja_id;
    if (!ninjaId && result.rows[0].ninja_device_id) {
      ninjaId = parseInt(result.rows[0].ninja_device_id, 10);
    }

    if (!ninjaId || isNaN(ninjaId)) {
      return res.status(400).json({ success: false, error: 'Keine gültige NinjaRMM Device ID vorhanden' });
    }

    console.log(`Refreshing device details for ninja_id: ${ninjaId}`);
    const device = await ninjaService.getDeviceWithDetails(userId, ninjaId);

    if (!device) {
      return res.status(404).json({ success: false, error: 'Gerät nicht in NinjaRMM gefunden - möglicherweise gelöscht?' });
    }

    // Update local device with fetched details
    await query(
      `UPDATE ninjarmm_devices SET
        os_name = $1,
        manufacturer = $2,
        model = $3,
        serial_number = $4,
        last_logged_in_user = $5,
        public_ip = $6,
        synced_at = NOW()
      WHERE id = $7 AND user_id = $8`,
      [
        device.os?.name || null,
        device.system?.manufacturer || null,
        device.system?.model || null,
        device.system?.serialNumber || null,
        device.lastLoggedInUser || null,
        device.publicIP || null,
        id,
        userId,
      ]
    );

    // Fetch and return updated local device
    const updatedResult = await query(
      `SELECT
        d.id, d.ninja_id, d.system_name, d.display_name, d.node_class,
        d.offline, d.last_contact, d.public_ip, d.os_name,
        d.manufacturer, d.model, d.serial_number, d.last_logged_in_user, d.synced_at,
        o.name as organization_name, c.name as customer_name
      FROM ninjarmm_devices d
      JOIN ninjarmm_organizations o ON d.organization_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId]
    );

    if (updatedResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found after update' });
    }

    const row = updatedResult.rows[0];
    res.json({
      success: true,
      data: {
        id: row.id,
        ninjaId: row.ninja_id,
        organizationName: row.organization_name,
        customerName: row.customer_name,
        systemName: row.system_name,
        displayName: row.display_name,
        nodeClass: row.node_class,
        offline: row.offline,
        lastContact: row.last_contact ? new Date(row.last_contact).toISOString() : null,
        publicIp: row.public_ip,
        osName: row.os_name,
        manufacturer: row.manufacturer,
        model: row.model,
        serialNumber: row.serial_number,
        lastLoggedInUser: row.last_logged_in_user,
        syncedAt: new Date(row.synced_at).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Refresh device details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Alerts
// ============================================

// GET /api/ninjarmm/alerts - Get synced alerts
router.get('/alerts', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { deviceId, customerId, severity, resolved, ticketId, limit } = req.query;

    const alerts = await ninjaService.getLocalAlerts(userId, {
      deviceId: deviceId as string,
      customerId: customerId as string,
      severity: severity as string,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      ticketId: ticketId as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error: any) {
    console.error('Get alerts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ninjarmm/alerts/:id/resolve - Mark alert as resolved
router.post('/alerts/:id/resolve', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { ticketId } = req.body;

    await ninjaService.markAlertResolved(userId, id, ticketId);

    // Optionally reset the alert in NinjaRMM
    if (req.body.resetInNinja) {
      const result = await query(
        'SELECT ninja_uid FROM ninjarmm_alerts WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (result.rows.length > 0) {
        await ninjaService.resetAlert(userId, result.rows[0].ninja_uid);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ninjarmm/alerts/:id/create-ticket - Create ticket from alert
router.post('/alerts/:id/create-ticket', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Get alert details
    const alertResult = await query(
      `SELECT a.*, d.system_name, d.display_name, o.customer_id
       FROM ninjarmm_alerts a
       LEFT JOIN ninjarmm_devices d ON a.device_id = d.id
       LEFT JOIN ninjarmm_organizations o ON d.organization_id = o.id
       WHERE a.id = $1 AND a.user_id = $2`,
      [id, userId]
    );

    if (alertResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const alert = alertResult.rows[0];
    const deviceName = alert.display_name || alert.system_name || 'Unbekanntes Gerät';
    const severity = alert.severity || 'INFO';
    const priority = alert.priority || 'NORMAL';

    // Get or create ticket sequence
    await query(
      'INSERT INTO ticket_sequences (user_id, last_number) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );

    // Increment and get next ticket number
    const seqResult = await query(
      'UPDATE ticket_sequences SET last_number = last_number + 1 WHERE user_id = $1 RETURNING last_number',
      [userId]
    );
    const ticketNumber = `TKT-${String(seqResult.rows[0].last_number).padStart(6, '0')}`;

    // Create ticket
    const ticketId = uuidv4();
    await query(
      `INSERT INTO tickets (
        id, ticket_number, user_id, customer_id, device_id, title, description,
        priority, status, source, ninja_alert_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        ticketId,
        ticketNumber,
        userId,
        alert.customer_id,
        alert.device_id,
        `[${severity}] ${alert.message.substring(0, 100)}`,
        `Alert from NinjaRMM:\n\nGerät: ${deviceName}\nSeverity: ${severity}\nPriorität: ${priority}\nQuelle: ${alert.source_name || 'N/A'}\n\nNachricht:\n${alert.message}`,
        severity === 'CRITICAL' ? 'urgent' : severity === 'MAJOR' ? 'high' : 'normal',
        'open',
        'ninja_alert',
        alert.ninja_uid,
      ]
    );

    // Mark alert as resolved with ticket reference
    await ninjaService.markAlertResolved(userId, id, ticketId);

    res.json({
      success: true,
      data: { ticketId },
    });
  } catch (error: any) {
    console.error('Create ticket from alert error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
