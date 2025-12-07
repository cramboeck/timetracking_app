import express, { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import * as ninjaService from '../services/ninjarmmService';
import { sendPushToUser } from '../services/pushNotifications';

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

    // Get existing device data including device_data JSON
    const result = await query(
      'SELECT ninja_id, ninja_device_id, device_data, os_name, manufacturer, model, serial_number FROM ninjarmm_devices WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const existingRow = result.rows[0];

    // Parse existing device_data to preserve it
    let existingDeviceData: any = {};
    try {
      existingDeviceData = typeof existingRow.device_data === 'string'
        ? JSON.parse(existingRow.device_data)
        : (existingRow.device_data || {});
    } catch (e) {
      console.log('Failed to parse existing device_data:', e);
    }

    // Try ninja_id first, fall back to ninja_device_id parsed as integer
    let ninjaId = existingRow.ninja_id;
    if (!ninjaId && existingRow.ninja_device_id) {
      ninjaId = parseInt(existingRow.ninja_device_id, 10);
    }

    if (!ninjaId || isNaN(ninjaId)) {
      return res.status(400).json({ success: false, error: 'Keine gültige NinjaRMM Device ID vorhanden' });
    }

    console.log(`Refreshing device details for ninja_id: ${ninjaId}`);
    const device = await ninjaService.getDeviceWithDetails(userId, ninjaId);

    if (!device) {
      return res.status(404).json({ success: false, error: 'Gerät nicht in NinjaRMM gefunden - möglicherweise gelöscht?' });
    }

    // Merge new data with existing data - only update if new value exists
    const mergedDeviceData = {
      ...existingDeviceData,
      ...device,
      // Preserve existing detailed info if new API didn't return it
      os: device.os || existingDeviceData.os,
      system: device.system || existingDeviceData.system,
      processor: device.processor || existingDeviceData.processor,
      memory: device.memory || existingDeviceData.memory,
      volumes: device.volumes || existingDeviceData.volumes,
      nics: device.nics || existingDeviceData.nics,
    };

    // Update local device - only update columns if we have new values, else keep existing
    await query(
      `UPDATE ninjarmm_devices SET
        os_name = COALESCE($1, os_name),
        manufacturer = COALESCE($2, manufacturer),
        model = COALESCE($3, model),
        serial_number = COALESCE($4, serial_number),
        last_logged_in_user = COALESCE($5, last_logged_in_user),
        public_ip = COALESCE($6, public_ip),
        device_data = $7,
        synced_at = NOW()
      WHERE id = $8 AND user_id = $9`,
      [
        device.os?.name || null,
        device.system?.manufacturer || null,
        device.system?.model || null,
        device.system?.serialNumber || null,
        device.lastLoggedInUser || null,
        device.publicIP || null,
        JSON.stringify(mergedDeviceData),
        id,
        userId,
      ]
    );

    // Fetch and return updated local device with device_data
    const updatedResult = await query(
      `SELECT
        d.id, d.ninja_id, d.system_name, d.display_name, d.node_class,
        d.offline, d.last_contact, d.public_ip, d.os_name,
        d.manufacturer, d.model, d.serial_number, d.last_logged_in_user, d.synced_at,
        d.device_data,
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

    // Parse device_data for additional details
    let deviceData: any = {};
    try {
      deviceData = typeof row.device_data === 'string' ? JSON.parse(row.device_data) : (row.device_data || {});
    } catch (e) {
      console.error('Failed to parse device_data:', e);
    }

    const osInfo = deviceData.os || {};
    const systemInfo = deviceData.system || {};
    const processorInfo = deviceData.processor || (deviceData.processors?.[0]) || {};
    const memoryInfo = deviceData.memory || {};

    // Build full OS version string
    let osVersion = osInfo.name || row.os_name || '';
    if (osInfo.buildNumber) {
      osVersion = `${osVersion} (Build ${osInfo.buildNumber})`;
    }

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
        osVersion: osVersion,
        osBuild: osInfo.buildNumber || null,
        osArchitecture: osInfo.architecture || null,
        manufacturer: row.manufacturer || systemInfo.manufacturer,
        model: row.model || systemInfo.model,
        serialNumber: row.serial_number || systemInfo.serialNumber || systemInfo.biosSerialNumber,
        lastLoggedInUser: row.last_logged_in_user,
        processorName: processorInfo.name || null,
        processorCores: processorInfo.cores || null,
        memoryGb: memoryInfo.capacity ? Math.round(memoryInfo.capacity / (1024 * 1024 * 1024)) : null,
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

// ============================================
// Webhook Endpoints (Public - No Auth Required)
// ============================================

// POST /api/ninjarmm/webhook/:userId - Receive NinjaRMM webhook events
// This endpoint is called by NinjaRMM when alerts are triggered/reset
router.post('/webhook/:userId', async (req: any, res: Response) => {
  const startTime = Date.now();
  const { userId } = req.params;
  const webhookSecret = req.headers['x-webhook-secret'] || req.query.secret;

  let webhookEventId: string | null = null;

  try {
    // Validate user exists and get webhook config
    const configResult = await query(
      `SELECT nc.*, u.id as user_exists
       FROM ninjarmm_config nc
       JOIN users u ON nc.user_id = u.id
       WHERE nc.user_id = $1`,
      [userId]
    );

    if (configResult.rows.length === 0) {
      console.warn(`Webhook received for unknown/unconfigured user: ${userId}`);
      return res.status(404).json({ error: 'User not found or NinjaRMM not configured' });
    }

    const config = configResult.rows[0];

    // Check if webhook is enabled
    if (!config.webhook_enabled) {
      console.warn(`Webhook received but not enabled for user: ${userId}`);
      return res.status(403).json({ error: 'Webhook not enabled' });
    }

    // Validate webhook secret
    if (config.webhook_secret && webhookSecret !== config.webhook_secret) {
      console.warn(`Invalid webhook secret for user: ${userId}`);
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    // Parse the webhook payload
    const payload = req.body;
    console.log('📥 NinjaRMM Webhook received:');
    console.log('   Raw payload:', JSON.stringify(payload, null, 2));
    console.log('   Config - auto_create_tickets:', config.webhook_auto_create_tickets);
    console.log('   Config - min_severity:', config.webhook_min_severity);

    // Extract alert information from NinjaRMM webhook payload
    // NinjaRMM sends different event types with different structures:
    // - CONDITION / CONDITION_TRIGGERED / CONDITION_CLEARED - monitoring conditions
    // - ACTIONSET - automated actions/scripts
    // - ALERT / ALERT_RESET - standard alerts
    const eventType = payload.activityType || payload.eventType || payload.type || 'UNKNOWN';
    const ninjaAlertId = payload.id?.toString() || payload.alertId?.toString() || payload.uid || payload.activityId?.toString();
    const ninjaDeviceId = payload.deviceId?.toString() || payload.device?.id?.toString() || payload.nodeId?.toString();

    // NinjaRMM severity mapping - they use different field names
    let severity = payload.severity || payload.priority || 'INFO';
    // Map NinjaRMM severity strings
    if (payload.conditionSeverity) severity = payload.conditionSeverity;
    if (payload.alertSeverity) severity = payload.alertSeverity;

    // Extract message from various NinjaRMM payload formats
    let message = '';
    if (payload.message) message = payload.message;
    else if (payload.subject) message = payload.subject;
    else if (payload.description) message = payload.description;
    else if (payload.conditionName) message = payload.conditionName;
    else if (payload.name) message = payload.name;
    else if (payload.activityDescription) message = payload.activityDescription;
    else if (payload.statusText) message = payload.statusText;
    else if (payload.data?.message) message = payload.data.message;
    else if (payload.data?.name) message = payload.data.name;
    // For CONDITION events, build a descriptive message
    if (!message && eventType.includes('CONDITION')) {
      message = payload.conditionDisplayName || payload.conditionName || payload.condition?.name || `Monitoring Condition ${eventType}`;
    }
    // For ACTIONSET events
    if (!message && eventType === 'ACTIONSET') {
      message = payload.actionsetName || payload.actionName || payload.scriptName || 'Script/Action ausgeführt';
    }

    // Extract device name from various fields
    const deviceName = payload.deviceName
      || payload.device?.systemName
      || payload.device?.displayName
      || payload.nodeName
      || payload.systemName
      || payload.displayName
      || '';
    const orgId = payload.organizationId?.toString() || payload.device?.organizationId?.toString() || payload.orgId?.toString();

    // Log the webhook event with extracted message and device name
    webhookEventId = uuidv4();
    await query(
      `INSERT INTO ninjarmm_webhook_events
       (id, user_id, event_type, ninja_alert_id, ninja_device_id, severity, message, device_name, status, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received', $9, NOW())`,
      [webhookEventId, userId, eventType, ninjaAlertId, ninjaDeviceId, severity, message, deviceName, JSON.stringify(payload)]
    );

    // Handle different event types
    // NinjaRMM sends various CONDITION_* types for alerts
    // Also handles plain "CONDITION" events which are common in Windows Event Log alerts
    const isAlertEvent = eventType === 'CONDITION'
      || (eventType.startsWith('CONDITION_') && !eventType.includes('CLEARED') && !eventType.includes('RESET'))
      || eventType === 'CONDITION_TRIGGERED'
      || eventType === 'ALERT' || eventType === 'alert';
    const isResetEvent = eventType === 'ALERT_RESET' || eventType === 'CONDITION_CLEARED'
      || eventType === 'CONDITION_RESET'
      || eventType === 'reset' || eventType.includes('RESET');

    if (isAlertEvent) {
      // New alert - create or update alert record
      await handleNewAlert(userId, config, {
        ninjaAlertId,
        ninjaDeviceId,
        severity,
        message,
        deviceName,
        orgId,
        payload,
        webhookEventId,
      });
    } else if (isResetEvent) {
      // Alert resolved - mark as resolved and optionally close ticket
      await handleAlertReset(userId, config, {
        ninjaAlertId,
        ninjaDeviceId,
        webhookEventId,
      });
    } else {
      // Unknown event type - just log it
      await query(
        `UPDATE ninjarmm_webhook_events SET status = 'ignored', processing_time_ms = $1 WHERE id = $2`,
        [Date.now() - startTime, webhookEventId]
      );
    }

    res.json({ success: true, eventId: webhookEventId });
  } catch (error: any) {
    console.error('Webhook processing error:', error);

    // Update webhook event with error
    if (webhookEventId) {
      await query(
        `UPDATE ninjarmm_webhook_events
         SET status = 'failed', error_message = $1, processing_time_ms = $2
         WHERE id = $3`,
        [error.message, Date.now() - startTime, webhookEventId]
      ).catch(e => console.error('Failed to update webhook event:', e));
    }

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Helper function to handle new alert from webhook
async function handleNewAlert(
  userId: string,
  config: any,
  data: {
    ninjaAlertId: string;
    ninjaDeviceId: string;
    severity: string;
    message: string;
    deviceName: string;
    orgId: string;
    payload: any;
    webhookEventId: string;
  }
) {
  const startTime = Date.now();
  const { ninjaAlertId, ninjaDeviceId, severity, message, deviceName, orgId, payload, webhookEventId } = data;

  // Find device in our database
  let deviceId: string | null = null;
  let customerId: string | null = null;

  console.log('   handleNewAlert - ninjaDeviceId:', ninjaDeviceId);
  console.log('   handleNewAlert - deviceName:', deviceName);

  if (ninjaDeviceId) {
    const deviceResult = await query(
      `SELECT d.id, o.customer_id
       FROM ninjarmm_devices d
       LEFT JOIN ninjarmm_organizations o ON d.organization_id = o.id
       WHERE d.user_id = $1 AND (d.ninja_device_id = $2 OR d.ninja_id::TEXT = $2)`,
      [userId, ninjaDeviceId]
    );
    console.log('   Device lookup result:', deviceResult.rows.length, 'rows');
    if (deviceResult.rows.length > 0) {
      deviceId = deviceResult.rows[0].id;
      customerId = deviceResult.rows[0].customer_id;
      console.log('   Found device:', deviceId, 'customer:', customerId);
    }
  }

  // Create or update alert record
  const alertId = uuidv4();
  const result = await query(
    `INSERT INTO ninjarmm_alerts
     (id, user_id, ninja_alert_id, ninja_uid, ninja_device_id, device_id, severity, priority, message, source_type, source_name, alert_data, activity_time, status, created_at, synced_at)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'new', NOW(), NOW())
     ON CONFLICT (user_id, ninja_uid) WHERE ninja_uid IS NOT NULL
     DO UPDATE SET
       severity = EXCLUDED.severity,
       priority = EXCLUDED.priority,
       message = EXCLUDED.message,
       alert_data = EXCLUDED.alert_data,
       activity_time = EXCLUDED.activity_time,
       status = CASE WHEN ninjarmm_alerts.status = 'resolved' THEN 'new' ELSE ninjarmm_alerts.status END,
       resolved = FALSE,
       resolved_at = NULL,
       synced_at = NOW()
     RETURNING id, (xmax = 0) as is_new`,
    [
      alertId,
      userId,
      ninjaAlertId,
      ninjaDeviceId,
      deviceId,
      severity,
      payload.priority || 'NORMAL',
      message,
      payload.sourceType || payload.activitySourceType || 'webhook',
      payload.sourceName || payload.activitySourceName || deviceName,
      JSON.stringify(payload),
      payload.activityTime ? new Date(payload.activityTime) : new Date(),
    ]
  );

  const finalAlertId = result.rows[0]?.id || alertId;
  const isNew = result.rows[0]?.is_new;

  // Check if we should auto-create a ticket
  let ticketId: string | null = null;
  console.log('   Auto-create tickets enabled:', config.webhook_auto_create_tickets);
  console.log('   Is new alert:', isNew);
  if (config.webhook_auto_create_tickets && isNew) {
    // Check severity threshold
    const severityLevels: Record<string, number> = { 'CRITICAL': 4, 'MAJOR': 3, 'MODERATE': 2, 'MINOR': 1, 'INFO': 0 };
    const alertSeverityLevel = severityLevels[severity.toUpperCase()] || 0;
    const minSeverityLevel = severityLevels[config.webhook_min_severity?.toUpperCase()] || 0;
    console.log('   Alert severity level:', alertSeverityLevel, '(', severity, ')');
    console.log('   Min severity level:', minSeverityLevel, '(', config.webhook_min_severity, ')');
    console.log('   Should create ticket:', alertSeverityLevel >= minSeverityLevel);

    if (alertSeverityLevel >= minSeverityLevel) {
      ticketId = await createTicketFromWebhook(userId, {
        alertId: finalAlertId,
        ninjaAlertId,
        severity,
        message,
        deviceName,
        deviceId,
        customerId,
        payload,
      });

      // Link ticket to alert
      if (ticketId) {
        await query(
          `UPDATE ninjarmm_alerts SET ticket_id = $1, status = 'ticket_created' WHERE id = $2`,
          [ticketId, finalAlertId]
        );
      }
    }
  }

  // Update webhook event
  await query(
    `UPDATE ninjarmm_webhook_events
     SET status = 'processed', alert_id = $1, ticket_id = $2, processing_time_ms = $3
     WHERE id = $4`,
    [finalAlertId, ticketId, Date.now() - startTime, webhookEventId]
  );

  // Send push notification for CRITICAL and MAJOR alerts
  const upperSeverity = severity.toUpperCase();
  if (isNew && (upperSeverity === 'CRITICAL' || upperSeverity === 'MAJOR')) {
    try {
      const title = upperSeverity === 'CRITICAL'
        ? '🚨 KRITISCHER Alert!'
        : '⚠️ Wichtiger Alert';

      const body = deviceName
        ? `${deviceName}: ${message.substring(0, 100)}`
        : message.substring(0, 150);

      // Get ticket URL if created
      const ticketUrl = ticketId ? `/tickets/${ticketId}` : '/ninja';

      await sendPushToUser(userId, {
        title,
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: `ninja-alert-${finalAlertId}`,
        data: { url: ticketUrl },
      });
      console.log(`📢 Push notification sent for ${upperSeverity} alert to user ${userId}`);
    } catch (pushError) {
      console.error('Failed to send push notification for alert:', pushError);
    }
  }
}

// Helper function to handle alert reset from webhook
async function handleAlertReset(
  userId: string,
  config: any,
  data: {
    ninjaAlertId: string;
    ninjaDeviceId: string;
    webhookEventId: string;
  }
) {
  const startTime = Date.now();
  const { ninjaAlertId, ninjaDeviceId, webhookEventId } = data;

  // Find and update the alert
  const alertResult = await query(
    `UPDATE ninjarmm_alerts
     SET resolved = TRUE, resolved_at = NOW(), status = 'resolved'
     WHERE user_id = $1 AND (ninja_uid = $2 OR ninja_alert_id = $2)
     RETURNING id, ticket_id`,
    [userId, ninjaAlertId]
  );

  let ticketId: string | null = null;
  if (alertResult.rows.length > 0) {
    const alert = alertResult.rows[0];
    ticketId = alert.ticket_id;

    // Auto-resolve ticket if enabled
    if (config.webhook_auto_resolve_tickets && ticketId) {
      await query(
        `UPDATE tickets
         SET status = 'resolved', resolved_at = NOW(),
             internal_notes = COALESCE(internal_notes, '') || E'\n\n[Auto-resolved via NinjaRMM webhook at ' || NOW() || ']'
         WHERE id = $1 AND status NOT IN ('closed', 'resolved')`,
        [ticketId]
      );
    }
  }

  // Update webhook event
  await query(
    `UPDATE ninjarmm_webhook_events
     SET status = 'processed', alert_id = $1, ticket_id = $2, processing_time_ms = $3
     WHERE id = $4`,
    [alertResult.rows[0]?.id, ticketId, Date.now() - startTime, webhookEventId]
  );
}

// Helper function to create ticket from webhook alert
async function createTicketFromWebhook(
  userId: string,
  data: {
    alertId: string;
    ninjaAlertId: string;
    severity: string;
    message: string;
    deviceName: string;
    deviceId: string | null;
    customerId: string | null;
    payload: any;
  }
): Promise<string | null> {
  try {
    const { alertId, ninjaAlertId, severity, message, deviceName, deviceId, customerId, payload } = data;

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

    // Determine priority based on severity
    let priority = 'normal';
    if (severity.toUpperCase() === 'CRITICAL') priority = 'urgent';
    else if (severity.toUpperCase() === 'MAJOR') priority = 'high';
    else if (severity.toUpperCase() === 'MINOR' || severity.toUpperCase() === 'INFO') priority = 'low';

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
        customerId,
        deviceId,
        `[${severity}] ${message.substring(0, 100)}`,
        `🚨 Alert von NinjaRMM (Webhook)\n\n**Gerät:** ${deviceName || 'Unbekannt'}\n**Severity:** ${severity}\n**Quelle:** ${payload.sourceName || payload.activitySourceName || 'N/A'}\n\n**Nachricht:**\n${message}\n\n---\n_Automatisch erstellt via Webhook_`,
        priority,
        'open',
        'ninja_webhook',
        ninjaAlertId,
      ]
    );

    console.log(`📝 Auto-created ticket ${ticketNumber} from NinjaRMM webhook alert`);
    return ticketId;
  } catch (error) {
    console.error('Failed to create ticket from webhook:', error);
    return null;
  }
}

// GET /api/ninjarmm/webhook-config - Get webhook configuration
router.get('/webhook-config', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT webhook_secret, webhook_enabled, webhook_auto_create_tickets,
              webhook_min_severity, webhook_auto_resolve_tickets
       FROM ninjarmm_config WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          webhookUrl: `${process.env.BACKEND_URL || ''}/api/ninjarmm/webhook/${userId}`,
          webhookEnabled: false,
          webhookSecret: null,
          hasSecret: false,
          autoCreateTickets: false,
          minSeverity: 'MAJOR',
          autoResolveTickets: true,
        },
      });
    }

    const config = result.rows[0];
    // Build webhook URL with secret as query parameter (since NinjaRMM doesn't support custom headers)
    let webhookUrl = `${process.env.BACKEND_URL || ''}/api/ninjarmm/webhook/${userId}`;
    if (config.webhook_secret) {
      webhookUrl += `?secret=${encodeURIComponent(config.webhook_secret)}`;
    }

    res.json({
      success: true,
      data: {
        webhookUrl,
        webhookEnabled: config.webhook_enabled || false,
        webhookSecret: null, // Don't expose secret in response, it's in the URL
        hasSecret: !!config.webhook_secret,
        autoCreateTickets: config.webhook_auto_create_tickets || false,
        minSeverity: config.webhook_min_severity || 'MAJOR',
        autoResolveTickets: config.webhook_auto_resolve_tickets !== false,
      },
    });
  } catch (error: any) {
    console.error('Get webhook config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ninjarmm/webhook-config - Update webhook configuration
router.put('/webhook-config', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      webhookEnabled,
      webhookSecret,
      autoCreateTickets,
      minSeverity,
      autoResolveTickets
    } = req.body;

    // Ensure config exists
    await query(
      `INSERT INTO ninjarmm_config (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [uuidv4(), userId]
    );

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (webhookEnabled !== undefined) {
      updates.push(`webhook_enabled = $${paramIndex++}`);
      values.push(webhookEnabled);
    }
    if (webhookSecret !== undefined) {
      updates.push(`webhook_secret = $${paramIndex++}`);
      values.push(webhookSecret || null);
    }
    if (autoCreateTickets !== undefined) {
      updates.push(`webhook_auto_create_tickets = $${paramIndex++}`);
      values.push(autoCreateTickets);
    }
    if (minSeverity !== undefined) {
      updates.push(`webhook_min_severity = $${paramIndex++}`);
      values.push(minSeverity);
    }
    if (autoResolveTickets !== undefined) {
      updates.push(`webhook_auto_resolve_tickets = $${paramIndex++}`);
      values.push(autoResolveTickets);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(userId);

      await query(
        `UPDATE ninjarmm_config SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
        values
      );
    }

    res.json({ success: true, message: 'Webhook-Konfiguration gespeichert' });
  } catch (error: any) {
    console.error('Update webhook config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ninjarmm/webhook-config/generate-secret - Generate new webhook secret
router.post('/webhook-config/generate-secret', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Generate a secure random secret
    const crypto = require('crypto');
    const newSecret = crypto.randomBytes(32).toString('hex');

    // Ensure config exists and update secret
    await query(
      `INSERT INTO ninjarmm_config (id, user_id, webhook_secret, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET webhook_secret = $3, updated_at = NOW()`,
      [uuidv4(), userId, newSecret]
    );

    // Return the new secret and the updated webhook URL
    const webhookUrl = `${process.env.BACKEND_URL || ''}/api/ninjarmm/webhook/${userId}?secret=${encodeURIComponent(newSecret)}`;

    res.json({
      success: true,
      data: {
        secret: newSecret,
        webhookUrl,
      },
      message: 'Neues Webhook-Secret generiert'
    });
  } catch (error: any) {
    console.error('Generate webhook secret error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ninjarmm/webhook-events - Get webhook event logs
router.get('/webhook-events', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit = 50, status } = req.query;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const result = await query(
      `SELECT id, event_type, ninja_alert_id, ninja_device_id, severity, message, device_name, status,
              error_message, alert_id, ticket_id, processing_time_ms, created_at
       FROM ninjarmm_webhook_events
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, parseInt(limit as string)]
    );

    // Map snake_case to camelCase for frontend
    const events = result.rows.map(row => ({
      id: row.id,
      eventType: row.event_type,
      ninjaAlertId: row.ninja_alert_id,
      ninjaDeviceId: row.ninja_device_id,
      severity: row.severity,
      message: row.message,
      deviceName: row.device_name,
      status: row.status,
      errorMessage: row.error_message,
      alertId: row.alert_id,
      ticketId: row.ticket_id,
      processingTimeMs: row.processing_time_ms,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    console.error('Get webhook events error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ninjarmm/webhook-events/:id/payload - Get raw payload of a webhook event
router.get('/webhook-events/:id/payload', authenticateToken, requireNinjaFeature, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT id, event_type, payload, created_at
       FROM ninjarmm_webhook_events
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Webhook event not found' });
    }

    const event = result.rows[0];

    // Parse payload if it's a string
    let payload = event.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    res.json({
      success: true,
      data: {
        id: event.id,
        eventType: event.event_type,
        payload,
        createdAt: event.created_at,
      },
    });
  } catch (error: any) {
    console.error('Get webhook payload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
