import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

// NinjaRMM API Configuration
// Note: Users can configure their own instance URL in settings
const DEFAULT_NINJARMM_URL = 'https://app.ninjarmm.com';
const TOKEN_URL_PATH = '/oauth/token';
const API_BASE_PATH = '/api/v2';

// Types
export interface NinjaRMMConfig {
  id: string;
  userId: string;
  clientId: string | null;
  clientSecret: string | null;
  instanceUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  autoSyncDevices: boolean;
  syncIntervalMinutes: number;
  lastSyncAt: Date | null;
}

export interface NinjaRMMOrganization {
  id: number;
  name: string;
  description?: string;
  nodeApprovalMode?: string;
  userdata?: Record<string, unknown>;
}

export interface NinjaRMMDevice {
  id: number;
  parentDeviceId?: number;
  organizationId: number;
  locationId?: number;
  nodeClass: string; // WINDOWS_WORKSTATION, WINDOWS_SERVER, MAC, LINUX_WORKSTATION, etc.
  nodeRoleId?: number;
  rolePolicyId?: number;
  policyId?: number;
  approvalStatus?: string;
  offline: boolean;
  displayName?: string;
  systemName: string;
  dnsName?: string;
  netbiosName?: string;
  created: string;
  lastContact?: string;
  lastUpdate?: string;
  userData?: Record<string, unknown>;
  tags?: string[];
  // OS Info
  os?: {
    name?: string;
    manufacturer?: string;
    architecture?: string;
    buildNumber?: string;
  };
  // System info
  system?: {
    name?: string;
    manufacturer?: string;
    model?: string;
    biosSerialNumber?: string;
    serialNumber?: string;
  };
  // Processor
  processor?: {
    name?: string;
    count?: number;
    cores?: number;
    clockSpeed?: number;
  };
  // Memory in bytes
  memory?: {
    capacity?: number;
  };
  // Storage
  volumes?: Array<{
    name?: string;
    label?: string;
    capacity?: number;
    freeSpace?: number;
  }>;
  // Network
  publicIP?: string;
  nics?: Array<{
    name?: string;
    ipAddress?: string;
    macAddress?: string;
  }>;
  // Antivirus
  antivirus?: {
    productName?: string;
    productState?: string;
    definitionStatus?: string;
  };
  // Last logged in user
  lastLoggedInUser?: string;
  // References
  references?: {
    organization?: {
      name?: string;
    };
    location?: {
      name?: string;
    };
    role?: {
      name?: string;
    };
    policy?: {
      name?: string;
    };
  };
}

export interface NinjaRMMAlert {
  uid: string;
  deviceId: number;
  severity: string; // NONE, MINOR, MODERATE, MAJOR, CRITICAL
  priority: string; // NONE, LOW, MEDIUM, HIGH, CRITICAL
  activityType: string;
  activityTime: string;
  createTime: string;
  updateTime?: string;
  statusCode?: string;
  status?: string;
  message: string;
  sourceType?: string;
  sourceConfigUid?: string;
  sourceName?: string;
  subject?: string;
  data?: Record<string, unknown>;
  device?: NinjaRMMDevice;
}

// Helper to make authenticated NinjaRMM API requests
async function ninjaFetch(
  config: NinjaRMMConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  if (!config.accessToken) {
    throw new Error('Not authenticated with NinjaRMM');
  }

  // Check if token is expired and refresh if needed
  if (config.tokenExpiresAt && new Date() >= config.tokenExpiresAt) {
    if (config.refreshToken) {
      await refreshAccessToken(config.userId);
      // Re-fetch config with new token
      const newConfig = await getConfig(config.userId);
      if (!newConfig?.accessToken) {
        throw new Error('Failed to refresh NinjaRMM token');
      }
      config = newConfig;
    } else {
      throw new Error('NinjaRMM token expired and no refresh token available');
    }
  }

  const baseUrl = config.instanceUrl || DEFAULT_NINJARMM_URL;
  const url = `${baseUrl}${API_BASE_PATH}${endpoint}`;
  console.log(`NinjaRMM API call: ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`NinjaRMM API error: ${response.status} ${response.statusText}`, errorText);

    // Handle 401 - try to refresh token
    if (response.status === 401 && config.refreshToken) {
      await refreshAccessToken(config.userId);
      // Retry the request once
      const newConfig = await getConfig(config.userId);
      if (newConfig?.accessToken) {
        return ninjaFetch(newConfig, endpoint, options);
      }
    }

    throw new Error(`NinjaRMM API error: ${response.status} - ${errorText}`);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) return null;

  return JSON.parse(text);
}

// ============================================
// Configuration Management
// ============================================

export async function getConfig(userId: string): Promise<NinjaRMMConfig | null> {
  const result = await query(
    'SELECT * FROM ninjarmm_config WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    instanceUrl: row.instance_url || DEFAULT_NINJARMM_URL,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at) : null,
    autoSyncDevices: row.auto_sync_devices,
    syncIntervalMinutes: row.sync_interval_minutes,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : null,
  };
}

export async function saveConfig(
  userId: string,
  config: Partial<Omit<NinjaRMMConfig, 'id' | 'userId'>>
): Promise<NinjaRMMConfig> {
  const existing = await getConfig(userId);

  if (existing) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (config.clientId !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(config.clientId);
    }
    if (config.clientSecret !== undefined) {
      updates.push(`client_secret = $${paramCount++}`);
      values.push(config.clientSecret);
    }
    if (config.instanceUrl !== undefined) {
      updates.push(`instance_url = $${paramCount++}`);
      values.push(config.instanceUrl);
    }
    if (config.accessToken !== undefined) {
      updates.push(`access_token = $${paramCount++}`);
      values.push(config.accessToken);
    }
    if (config.refreshToken !== undefined) {
      updates.push(`refresh_token = $${paramCount++}`);
      values.push(config.refreshToken);
    }
    if (config.tokenExpiresAt !== undefined) {
      updates.push(`token_expires_at = $${paramCount++}`);
      values.push(config.tokenExpiresAt);
    }
    if (config.autoSyncDevices !== undefined) {
      updates.push(`auto_sync_devices = $${paramCount++}`);
      values.push(config.autoSyncDevices);
    }
    if (config.syncIntervalMinutes !== undefined) {
      updates.push(`sync_interval_minutes = $${paramCount++}`);
      values.push(config.syncIntervalMinutes);
    }
    if (config.lastSyncAt !== undefined) {
      updates.push(`last_sync_at = $${paramCount++}`);
      values.push(config.lastSyncAt);
    }

    updates.push('updated_at = NOW()');
    values.push(userId);

    await query(
      `UPDATE ninjarmm_config SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
      values
    );

    return (await getConfig(userId))!;
  } else {
    const id = uuidv4();
    await query(
      `INSERT INTO ninjarmm_config (
        id, user_id, client_id, client_secret, instance_url,
        access_token, refresh_token, token_expires_at,
        auto_sync_devices, sync_interval_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        userId,
        config.clientId || null,
        config.clientSecret || null,
        config.instanceUrl || DEFAULT_NINJARMM_URL,
        config.accessToken || null,
        config.refreshToken || null,
        config.tokenExpiresAt || null,
        config.autoSyncDevices ?? false,
        config.syncIntervalMinutes ?? 60,
      ]
    );

    return (await getConfig(userId))!;
  }
}

// ============================================
// OAuth2 Authentication
// ============================================

// Generate OAuth2 authorization URL
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  instanceUrl: string = DEFAULT_NINJARMM_URL,
  state?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'monitoring management control offline_access',
  });

  if (state) {
    params.append('state', state);
  }

  return `${instanceUrl}/oauth/authorize?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  userId: string,
  code: string,
  redirectUri: string
): Promise<{ success: boolean; error?: string }> {
  const config = await getConfig(userId);
  if (!config?.clientId || !config?.clientSecret) {
    return { success: false, error: 'NinjaRMM not configured (missing client credentials)' };
  }

  const tokenUrl = `${config.instanceUrl || DEFAULT_NINJARMM_URL}${TOKEN_URL_PATH}`;

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NinjaRMM token exchange error:', errorText);
      return { success: false, error: `Token exchange failed: ${response.status}` };
    }

    const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    // Calculate token expiration
    const expiresIn = data.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await saveConfig(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      tokenExpiresAt,
    });

    return { success: true };
  } catch (error: any) {
    console.error('NinjaRMM token exchange error:', error);
    return { success: false, error: error.message };
  }
}

// Refresh access token
export async function refreshAccessToken(userId: string): Promise<{ success: boolean; error?: string }> {
  const config = await getConfig(userId);
  if (!config?.clientId || !config?.clientSecret || !config?.refreshToken) {
    return { success: false, error: 'Cannot refresh token (missing credentials or refresh token)' };
  }

  const tokenUrl = `${config.instanceUrl || DEFAULT_NINJARMM_URL}${TOKEN_URL_PATH}`;

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NinjaRMM token refresh error:', errorText);

      // Clear tokens on failure
      await saveConfig(userId, {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
      });

      return { success: false, error: `Token refresh failed: ${response.status}` };
    }

    const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    const expiresIn = data.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    await saveConfig(userId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || config.refreshToken,
      tokenExpiresAt,
    });

    return { success: true };
  } catch (error: any) {
    console.error('NinjaRMM token refresh error:', error);
    return { success: false, error: error.message };
  }
}

// Test connection (get current user info)
export async function testConnection(userId: string): Promise<{
  success: boolean;
  organizationCount?: number;
  deviceCount?: number;
  error?: string
}> {
  const config = await getConfig(userId);
  if (!config) {
    return { success: false, error: 'NinjaRMM not configured' };
  }
  if (!config.accessToken) {
    return { success: false, error: 'Not authenticated with NinjaRMM' };
  }

  try {
    // Get organizations to verify connection
    const orgsResponse = await ninjaFetch(config, '/organizations');
    const organizations = orgsResponse || [];

    // Get device count
    const devicesResponse = await ninjaFetch(config, '/devices');
    const devices = devicesResponse || [];

    return {
      success: true,
      organizationCount: organizations.length,
      deviceCount: devices.length,
    };
  } catch (error: any) {
    console.error('NinjaRMM connection test error:', error);
    return { success: false, error: error.message };
  }
}

// Disconnect (clear tokens)
export async function disconnect(userId: string): Promise<void> {
  await saveConfig(userId, {
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: null,
  });
}

// ============================================
// Organizations
// ============================================

export async function getOrganizations(userId: string): Promise<NinjaRMMOrganization[]> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  const response = await ninjaFetch(config, '/organizations');
  return response || [];
}

export async function getOrganization(userId: string, orgId: number): Promise<NinjaRMMOrganization | null> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  try {
    return await ninjaFetch(config, `/organization/${orgId}`);
  } catch {
    return null;
  }
}

// ============================================
// Devices
// ============================================

export async function getDevices(
  userId: string,
  options: {
    organizationId?: number;
    nodeClass?: string;
    offline?: boolean;
  } = {}
): Promise<NinjaRMMDevice[]> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  const params = new URLSearchParams();
  if (options.organizationId) params.append('org', options.organizationId.toString());
  if (options.nodeClass) params.append('class', options.nodeClass);
  if (options.offline !== undefined) params.append('offline', options.offline.toString());

  const queryString = params.toString();
  const endpoint = queryString ? `/devices?${queryString}` : '/devices';

  const response = await ninjaFetch(config, endpoint);
  return response || [];
}

export async function getDevice(userId: string, deviceId: number): Promise<NinjaRMMDevice | null> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  try {
    return await ninjaFetch(config, `/device/${deviceId}`);
  } catch {
    return null;
  }
}

export async function getDeviceWithDetails(userId: string, deviceId: number): Promise<NinjaRMMDevice | null> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  try {
    console.log(`Fetching device details from NinjaRMM for device ${deviceId}`);

    // Get basic device info
    const device = await ninjaFetch(config, `/device/${deviceId}`);
    if (!device) {
      console.log(`Device ${deviceId} not found in NinjaRMM (basic info)`);
      return null;
    }

    console.log(`Got basic device info for ${deviceId}, fetching additional details...`);

    // Get additional details in parallel
    const [osInfo, systemInfo, processors, disks, networkInterfaces] = await Promise.all([
      ninjaFetch(config, `/device/${deviceId}/os`).catch((e) => { console.log(`OS info fetch failed: ${e.message}`); return null; }),
      ninjaFetch(config, `/device/${deviceId}/system`).catch((e) => { console.log(`System info fetch failed: ${e.message}`); return null; }),
      ninjaFetch(config, `/device/${deviceId}/processors`).catch((e) => { console.log(`Processors fetch failed: ${e.message}`); return []; }),
      ninjaFetch(config, `/device/${deviceId}/disks`).catch((e) => { console.log(`Disks fetch failed: ${e.message}`); return []; }),
      ninjaFetch(config, `/device/${deviceId}/network-interfaces`).catch((e) => { console.log(`Network interfaces fetch failed: ${e.message}`); return []; }),
    ]);

    console.log(`Device ${deviceId} details: os=${!!osInfo}, system=${!!systemInfo}`);

    return {
      ...device,
      os: osInfo,
      system: systemInfo,
      processor: processors[0] || undefined,
      volumes: disks,
      nics: networkInterfaces,
    };
  } catch (err: any) {
    console.error(`Error fetching device ${deviceId} from NinjaRMM:`, err.message);
    return null;
  }
}

// ============================================
// Alerts
// ============================================

export async function getAlerts(
  userId: string,
  options: {
    sourceType?: string;
    severity?: string;
    deviceId?: number;
    since?: string; // ISO date string
  } = {}
): Promise<NinjaRMMAlert[]> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  const params = new URLSearchParams();
  if (options.sourceType) params.append('sourceType', options.sourceType);
  if (options.severity) params.append('severity', options.severity);
  if (options.deviceId) params.append('deviceId', options.deviceId.toString());
  if (options.since) params.append('since', options.since);

  const queryString = params.toString();
  const endpoint = queryString ? `/alerts?${queryString}` : '/alerts';

  const response = await ninjaFetch(config, endpoint);
  return response || [];
}

export async function getAlert(userId: string, alertUid: string): Promise<NinjaRMMAlert | null> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  try {
    return await ninjaFetch(config, `/alert/${alertUid}`);
  } catch {
    return null;
  }
}

// Reset/acknowledge an alert
export async function resetAlert(userId: string, alertUid: string): Promise<boolean> {
  const config = await getConfig(userId);
  if (!config) throw new Error('NinjaRMM not configured');

  try {
    await ninjaFetch(config, `/alert/${alertUid}/reset`, { method: 'POST' });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Sync Functions - Store in local DB
// ============================================

interface SyncResult {
  synced: number;
  errors: number;
}

// Sync organizations to local database
export async function syncOrganizations(userId: string): Promise<SyncResult> {
  let synced = 0;
  let errors = 0;

  try {
    const orgs = await getOrganizations(userId);
    console.log(`Syncing ${orgs.length} organizations for user ${userId}`);

    for (const org of orgs) {
      try {
        // Note: UNIQUE constraint is on (user_id, ninja_org_id) where ninja_org_id is TEXT
        await query(
          `INSERT INTO ninjarmm_organizations (
            id, user_id, ninja_org_id, ninja_id, name, description, userdata, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (user_id, ninja_org_id)
          DO UPDATE SET
            ninja_id = EXCLUDED.ninja_id,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            userdata = EXCLUDED.userdata,
            synced_at = NOW()`,
          [
            `${userId}_${org.id}`,
            userId,
            String(org.id),  // ninja_org_id is TEXT
            org.id,          // ninja_id is INTEGER
            org.name,
            org.description || null,
            JSON.stringify(org.userdata || {}),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`Error syncing organization ${org.id}:`, err);
        errors++;
      }
    }
  } catch (err) {
    console.error('Error fetching organizations for sync:', err);
    errors++;
  }

  console.log(`Organizations sync complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}

// Sync devices to local database
// Helper to convert Unix timestamp or ISO string to Date
function parseNinjaTimestamp(value: string | number | null | undefined): Date | null {
  if (!value) return null;
  // If it's a number or looks like a Unix timestamp (all digits)
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const timestamp = typeof value === 'number' ? value : parseInt(value);
    // Unix timestamps from NinjaRMM are in seconds, not milliseconds
    return new Date(timestamp * 1000);
  }
  // Otherwise try to parse as ISO string
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

export async function syncDevices(userId: string): Promise<SyncResult> {
  let synced = 0;
  let errors = 0;

  try {
    const devices = await getDevices(userId);
    console.log(`Syncing ${devices.length} devices for user ${userId}`);

    for (const device of devices) {
      try {
        const lastContact = parseNinjaTimestamp(device.lastContact);

        // Note: UNIQUE constraint is on (user_id, ninja_device_id) where ninja_device_id is TEXT
        // Organization lookup uses ninja_org_id (TEXT) to match the organization
        await query(
          `INSERT INTO ninjarmm_devices (
            id, user_id, ninja_device_id, ninja_id, organization_id, ninja_org_id,
            system_name, display_name, dns_name, node_class,
            offline, last_contact, public_ip, os_name,
            manufacturer, model, serial_number, last_logged_in_user, device_data, synced_at
          ) VALUES (
            $1, $2, $3, $4,
            (SELECT id FROM ninjarmm_organizations WHERE user_id = $2 AND ninja_org_id = $5),
            $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
          )
          ON CONFLICT (user_id, ninja_device_id)
          DO UPDATE SET
            ninja_id = EXCLUDED.ninja_id,
            organization_id = EXCLUDED.organization_id,
            system_name = EXCLUDED.system_name,
            display_name = EXCLUDED.display_name,
            dns_name = EXCLUDED.dns_name,
            node_class = EXCLUDED.node_class,
            offline = EXCLUDED.offline,
            last_contact = EXCLUDED.last_contact,
            public_ip = EXCLUDED.public_ip,
            os_name = EXCLUDED.os_name,
            manufacturer = EXCLUDED.manufacturer,
            model = EXCLUDED.model,
            serial_number = EXCLUDED.serial_number,
            last_logged_in_user = EXCLUDED.last_logged_in_user,
            device_data = EXCLUDED.device_data,
            synced_at = NOW()`,
          [
            `${userId}_${device.id}`,
            userId,
            String(device.id),      // ninja_device_id is TEXT
            device.id,              // ninja_id is INTEGER
            String(device.organizationId),  // ninja_org_id for lookup is TEXT
            device.systemName,
            device.displayName || null,
            device.dnsName || null,
            device.nodeClass,
            device.offline,
            lastContact,
            device.publicIP || null,
            device.os?.name || null,
            device.system?.manufacturer || null,
            device.system?.model || null,
            device.system?.serialNumber || null,
            device.lastLoggedInUser || null,
            JSON.stringify(device),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`Error syncing device ${device.id}:`, err);
        errors++;
      }
    }
  } catch (err) {
    console.error('Error fetching devices for sync:', err);
    errors++;
  }

  console.log(`Devices sync complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}

// Sync alerts to local database
export async function syncAlerts(userId: string): Promise<SyncResult> {
  let synced = 0;
  let errors = 0;

  try {
    const alerts = await getAlerts(userId);
    console.log(`Syncing ${alerts.length} alerts for user ${userId}`);

    for (const alert of alerts) {
      try {
        const activityTime = parseNinjaTimestamp(alert.activityTime);
        const createTime = parseNinjaTimestamp(alert.createTime);

        // Note: UNIQUE constraint is on (user_id, ninja_alert_id) where ninja_alert_id is TEXT
        // Device lookup uses ninja_device_id (TEXT) to match the device
        await query(
          `INSERT INTO ninjarmm_alerts (
            id, user_id, ninja_alert_id, ninja_uid, device_id, ninja_device_id,
            severity, priority, message, source_type, source_name,
            activity_time, created_at, alert_data, synced_at
          ) VALUES (
            $1, $2, $3, $4,
            (SELECT id FROM ninjarmm_devices WHERE user_id = $2 AND ninja_device_id = $5),
            $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
          )
          ON CONFLICT (user_id, ninja_alert_id)
          DO UPDATE SET
            ninja_uid = EXCLUDED.ninja_uid,
            severity = EXCLUDED.severity,
            priority = EXCLUDED.priority,
            message = EXCLUDED.message,
            alert_data = EXCLUDED.alert_data,
            synced_at = NOW()`,
          [
            `${userId}_${alert.uid}`,
            userId,
            alert.uid,          // ninja_alert_id is TEXT
            alert.uid,          // ninja_uid is also TEXT (same value)
            String(alert.deviceId),  // ninja_device_id for lookup is TEXT
            alert.severity,
            alert.priority,
            alert.message,
            alert.sourceType || null,
            alert.sourceName || null,
            activityTime,
            createTime,
            JSON.stringify(alert),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`Error syncing alert ${alert.uid}:`, err);
        errors++;
      }
    }
  } catch (err) {
    console.error('Error fetching alerts for sync:', err);
    errors++;
  }

  console.log(`Alerts sync complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}

// Full sync
export async function syncAll(userId: string): Promise<{
  organizations: SyncResult;
  devices: SyncResult;
  alerts: SyncResult;
}> {
  // Sync in order: orgs first (devices reference them), then devices (alerts reference them)
  const organizations = await syncOrganizations(userId);
  const devices = await syncDevices(userId);
  const alerts = await syncAlerts(userId);

  // Update last sync time
  await saveConfig(userId, { lastSyncAt: new Date() });

  return { organizations, devices, alerts };
}

// ============================================
// Local Database Queries
// ============================================

// Get synced organizations from local DB
export async function getLocalOrganizations(userId: string): Promise<Array<{
  id: string;
  ninjaId: number;
  name: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  deviceCount: number;
  syncedAt: Date;
}>> {
  const result = await query(
    `SELECT
      o.id, o.ninja_id, o.name, o.description, o.customer_id,
      c.name as customer_name, o.synced_at,
      COUNT(d.id) as device_count
    FROM ninjarmm_organizations o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN ninjarmm_devices d ON d.organization_id = o.id
    WHERE o.user_id = $1
    GROUP BY o.id, o.ninja_id, o.name, o.description, o.customer_id, c.name, o.synced_at
    ORDER BY o.name`,
    [userId]
  );

  return result.rows.map(row => ({
    id: row.id,
    ninjaId: row.ninja_id,
    name: row.name,
    description: row.description,
    customerId: row.customer_id,
    customerName: row.customer_name,
    deviceCount: parseInt(row.device_count) || 0,
    syncedAt: new Date(row.synced_at),
  }));
}

// Get synced devices from local DB
export async function getLocalDevices(
  userId: string,
  options: {
    organizationId?: string;
    customerId?: string;
    nodeClass?: string;
    offline?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<Array<{
  id: string;
  ninjaId: number;
  organizationName: string;
  customerName: string | null;
  systemName: string;
  displayName: string | null;
  nodeClass: string;
  offline: boolean;
  lastContact: Date | null;
  publicIp: string | null;
  osName: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  lastLoggedInUser: string | null;
  syncedAt: Date;
}>> {
  let sql = `
    SELECT
      d.id, d.ninja_id, d.system_name, d.display_name, d.node_class,
      d.offline, d.last_contact, d.public_ip, d.os_name,
      d.manufacturer, d.model, d.serial_number, d.last_logged_in_user, d.synced_at,
      o.name as organization_name, c.name as customer_name
    FROM ninjarmm_devices d
    JOIN ninjarmm_organizations o ON d.organization_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE d.user_id = $1
  `;

  const params: any[] = [userId];
  let paramCount = 2;

  if (options.organizationId) {
    sql += ` AND d.organization_id = $${paramCount++}`;
    params.push(options.organizationId);
  }

  if (options.customerId) {
    sql += ` AND o.customer_id = $${paramCount++}`;
    params.push(options.customerId);
  }

  if (options.nodeClass) {
    sql += ` AND d.node_class = $${paramCount++}`;
    params.push(options.nodeClass);
  }

  if (options.offline !== undefined) {
    sql += ` AND d.offline = $${paramCount++}`;
    params.push(options.offline);
  }

  if (options.search) {
    sql += ` AND (d.system_name ILIKE $${paramCount} OR d.display_name ILIKE $${paramCount} OR d.serial_number ILIKE $${paramCount})`;
    params.push(`%${options.search}%`);
    paramCount++;
  }

  sql += ` ORDER BY d.offline ASC, d.system_name ASC`;

  if (options.limit) {
    sql += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  if (options.offset) {
    sql += ` OFFSET $${paramCount++}`;
    params.push(options.offset);
  }

  const result = await query(sql, params);

  return result.rows.map(row => ({
    id: row.id,
    ninjaId: row.ninja_id,
    organizationName: row.organization_name,
    customerName: row.customer_name,
    systemName: row.system_name,
    displayName: row.display_name,
    nodeClass: row.node_class,
    offline: row.offline,
    lastContact: row.last_contact ? new Date(row.last_contact) : null,
    publicIp: row.public_ip,
    osName: row.os_name,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    lastLoggedInUser: row.last_logged_in_user,
    syncedAt: new Date(row.synced_at),
  }));
}

// Get synced alerts from local DB
export async function getLocalAlerts(
  userId: string,
  options: {
    deviceId?: string;
    customerId?: string;
    severity?: string;
    resolved?: boolean;
    ticketId?: string;
    limit?: number;
  } = {}
): Promise<Array<{
  id: string;
  ninjaUid: string;
  deviceName: string | null;
  organizationName: string | null;
  customerName: string | null;
  severity: string;
  priority: string;
  message: string;
  sourceType: string | null;
  sourceName: string | null;
  activityTime: Date;
  createdAt: Date;
  resolved: boolean;
  resolvedAt: Date | null;
  ticketId: string | null;
}>> {
  let sql = `
    SELECT
      a.id, a.ninja_uid, a.severity, a.priority, a.message,
      a.source_type, a.source_name, a.activity_time, a.created_at,
      a.resolved, a.resolved_at, a.ticket_id,
      d.system_name as device_name, o.name as organization_name, c.name as customer_name
    FROM ninjarmm_alerts a
    LEFT JOIN ninjarmm_devices d ON a.device_id = d.id
    LEFT JOIN ninjarmm_organizations o ON d.organization_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE a.user_id = $1
  `;

  const params: any[] = [userId];
  let paramCount = 2;

  if (options.deviceId) {
    sql += ` AND a.device_id = $${paramCount++}`;
    params.push(options.deviceId);
  }

  if (options.customerId) {
    sql += ` AND o.customer_id = $${paramCount++}`;
    params.push(options.customerId);
  }

  if (options.severity) {
    sql += ` AND a.severity = $${paramCount++}`;
    params.push(options.severity);
  }

  if (options.resolved !== undefined) {
    sql += ` AND a.resolved = $${paramCount++}`;
    params.push(options.resolved);
  }

  if (options.ticketId) {
    sql += ` AND a.ticket_id = $${paramCount++}`;
    params.push(options.ticketId);
  }

  sql += ` ORDER BY a.activity_time DESC`;

  if (options.limit) {
    sql += ` LIMIT $${paramCount++}`;
    params.push(options.limit);
  }

  const result = await query(sql, params);

  return result.rows.map(row => ({
    id: row.id,
    ninjaUid: row.ninja_uid,
    deviceName: row.device_name,
    organizationName: row.organization_name,
    customerName: row.customer_name,
    severity: row.severity,
    priority: row.priority,
    message: row.message,
    sourceType: row.source_type,
    sourceName: row.source_name,
    activityTime: new Date(row.activity_time),
    createdAt: new Date(row.created_at),
    resolved: row.resolved,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    ticketId: row.ticket_id,
  }));
}

// ============================================
// Customer Linking
// ============================================

// Link a NinjaRMM organization to a customer
export async function linkOrganizationToCustomer(
  userId: string,
  organizationId: string,
  customerId: string
): Promise<void> {
  // First, clear any existing organization link for this customer
  await query(
    `UPDATE customers
     SET ninjarmm_organization_id = NULL
     WHERE ninjarmm_organization_id = $1 AND user_id = $2`,
    [organizationId, userId]
  );

  // Update organization's customer reference
  await query(
    `UPDATE ninjarmm_organizations
     SET customer_id = $1
     WHERE id = $2 AND user_id = $3`,
    [customerId, organizationId, userId]
  );

  // Also update customer's organization reference (for customer portal)
  await query(
    `UPDATE customers
     SET ninjarmm_organization_id = $1
     WHERE id = $2 AND user_id = $3`,
    [organizationId, customerId, userId]
  );
}

// Unlink organization from customer
export async function unlinkOrganizationFromCustomer(
  userId: string,
  organizationId: string
): Promise<void> {
  // Get the customer ID first
  const result = await query(
    `SELECT customer_id FROM ninjarmm_organizations WHERE id = $1 AND user_id = $2`,
    [organizationId, userId]
  );

  const customerId = result.rows[0]?.customer_id;

  // Update organization
  await query(
    `UPDATE ninjarmm_organizations
     SET customer_id = NULL
     WHERE id = $1 AND user_id = $2`,
    [organizationId, userId]
  );

  // Also clear customer's organization reference
  if (customerId) {
    await query(
      `UPDATE customers
       SET ninjarmm_organization_id = NULL
       WHERE id = $1 AND user_id = $2`,
      [customerId, userId]
    );
  }
}

// ============================================
// Alert to Ticket Conversion
// ============================================

// Mark alert as resolved
export async function markAlertResolved(
  userId: string,
  alertId: string,
  ticketId?: string
): Promise<void> {
  await query(
    `UPDATE ninjarmm_alerts
     SET resolved = true, resolved_at = NOW(), ticket_id = $1
     WHERE id = $2 AND user_id = $3`,
    [ticketId || null, alertId, userId]
  );
}

// Get sync status
export async function getSyncStatus(userId: string): Promise<{
  lastSync: Date | null;
  organizationCount: number;
  deviceCount: number;
  alertCount: number;
  unresolvedAlertCount: number;
}> {
  const config = await getConfig(userId);

  const countsResult = await query(
    `SELECT
      (SELECT COUNT(*) FROM ninjarmm_organizations WHERE user_id = $1) as org_count,
      (SELECT COUNT(*) FROM ninjarmm_devices WHERE user_id = $1) as device_count,
      (SELECT COUNT(*) FROM ninjarmm_alerts WHERE user_id = $1) as alert_count,
      (SELECT COUNT(*) FROM ninjarmm_alerts WHERE user_id = $1 AND resolved = false) as unresolved_count`,
    [userId]
  );

  const row = countsResult.rows[0];

  return {
    lastSync: config?.lastSyncAt || null,
    organizationCount: parseInt(row?.org_count) || 0,
    deviceCount: parseInt(row?.device_count) || 0,
    alertCount: parseInt(row?.alert_count) || 0,
    unresolvedAlertCount: parseInt(row?.unresolved_count) || 0,
  };
}
