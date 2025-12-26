import { query } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { microsoftGraphService } from './microsoftGraphService';

export interface Microsoft365Config {
  id: string;
  organizationId: string;
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  mailFrom: string | null;
  supportMailbox: string | null;
  isConfigured: boolean;
  lastConnectionTest: string | null;
  lastConnectionStatus: string | null;
  featuresEnabled: {
    email: boolean;
    inboxMonitoring: boolean;
    calendar: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Microsoft365ConfigInput {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  mailFrom?: string;
  supportMailbox?: string;
  featuresEnabled?: {
    email?: boolean;
    inboxMonitoring?: boolean;
    calendar?: boolean;
  };
}

// Get config for organization
export async function getConfig(organizationId: string): Promise<Microsoft365Config | null> {
  const result = await query(
    'SELECT * FROM microsoft365_config WHERE organization_id = $1',
    [organizationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return mapRowToConfig(row);
}

// Save config for organization
export async function saveConfig(
  organizationId: string,
  input: Microsoft365ConfigInput
): Promise<Microsoft365Config> {
  const existing = await getConfig(organizationId);

  if (existing) {
    // Update existing config
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (input.tenantId !== undefined) {
      updates.push(`tenant_id = $${paramCount++}`);
      values.push(input.tenantId || null);
    }
    if (input.clientId !== undefined) {
      updates.push(`client_id = $${paramCount++}`);
      values.push(input.clientId || null);
    }
    if (input.clientSecret !== undefined) {
      updates.push(`client_secret = $${paramCount++}`);
      values.push(input.clientSecret || null);
    }
    if (input.mailFrom !== undefined) {
      updates.push(`mail_from = $${paramCount++}`);
      values.push(input.mailFrom || null);
    }
    if (input.supportMailbox !== undefined) {
      updates.push(`support_mailbox = $${paramCount++}`);
      values.push(input.supportMailbox || null);
    }
    if (input.featuresEnabled !== undefined) {
      const currentFeatures = existing.featuresEnabled || { email: false, inboxMonitoring: false, calendar: false };
      const newFeatures = {
        ...currentFeatures,
        ...input.featuresEnabled,
      };
      updates.push(`features_enabled = $${paramCount++}`);
      values.push(JSON.stringify(newFeatures));
    }

    // Check if configured (all required fields present)
    const newTenantId = input.tenantId ?? existing.tenantId;
    const newClientId = input.clientId ?? existing.clientId;
    const newClientSecret = input.clientSecret ?? existing.clientSecret;
    const isConfigured = !!(newTenantId && newClientId && newClientSecret);
    updates.push(`is_configured = $${paramCount++}`);
    values.push(isConfigured);

    updates.push('updated_at = NOW()');
    values.push(organizationId);

    await query(
      `UPDATE microsoft365_config SET ${updates.join(', ')} WHERE organization_id = $${paramCount}`,
      values
    );

    return (await getConfig(organizationId))!;
  } else {
    // Create new config
    const id = uuidv4();
    const featuresEnabled = input.featuresEnabled || { email: false, inboxMonitoring: false, calendar: false };
    const isConfigured = !!(input.tenantId && input.clientId && input.clientSecret);

    await query(
      `INSERT INTO microsoft365_config (
        id, organization_id, tenant_id, client_id, client_secret,
        mail_from, support_mailbox, is_configured, features_enabled, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        id,
        organizationId,
        input.tenantId || null,
        input.clientId || null,
        input.clientSecret || null,
        input.mailFrom || null,
        input.supportMailbox || null,
        isConfigured,
        JSON.stringify(featuresEnabled),
      ]
    );

    return (await getConfig(organizationId))!;
  }
}

// Test connection using the provided credentials
export async function testConnection(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  mailFrom?: string
): Promise<{ success: boolean; error?: string; userInfo?: { displayName: string; email: string } }> {
  try {
    // Import required Azure packages dynamically
    const { ClientSecretCredential } = await import('@azure/identity');
    const { Client } = await import('@microsoft/microsoft-graph-client');
    const { TokenCredentialAuthenticationProvider } = await import(
      '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
    );

    // Create credential
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    // Create auth provider
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    // Initialize Graph client
    const graphClient = Client.initWithMiddleware({
      authProvider,
    });

    // If mailFrom is provided, test mailbox access
    if (mailFrom) {
      try {
        // First try to get user info (works for regular users)
        const user = await graphClient
          .api(`/users/${mailFrom}`)
          .select('displayName,mail,userPrincipalName')
          .get();

        return {
          success: true,
          userInfo: {
            displayName: user.displayName || mailFrom,
            email: user.mail || user.userPrincipalName || mailFrom,
          },
        };
      } catch (userError: any) {
        // If user lookup fails, try to access mailbox directly (works for shared mailboxes)
        if (userError.statusCode === 404 || userError.code === 'Request_ResourceNotFound') {
          try {
            // Try to access the mailbox directly - this works for shared mailboxes
            const messages = await graphClient
              .api(`/users/${mailFrom}/messages`)
              .top(1)
              .select('id,subject')
              .get();

            return {
              success: true,
              userInfo: {
                displayName: `Shared Mailbox: ${mailFrom}`,
                email: mailFrom,
              },
            };
          } catch (mailboxError: any) {
            // Check if it's a permission issue
            if (mailboxError.statusCode === 403 || mailboxError.message?.includes('Insufficient privileges')) {
              return {
                success: false,
                error: `Keine Berechtigung fuer Postfach "${mailFrom}". Bitte Mail.Read und Mail.ReadWrite Berechtigungen pruefen.`,
              };
            }
            // Mailbox not found
            return {
              success: false,
              error: `Postfach "${mailFrom}" nicht gefunden. Bitte pruefen Sie die E-Mail-Adresse.`,
            };
          }
        }
        throw userError;
      }
    } else {
      // Just test the token by getting organization info
      const org = await graphClient.api('/organization').select('displayName').get();
      return {
        success: true,
        userInfo: {
          displayName: org.value?.[0]?.displayName || 'Organisation',
          email: '',
        },
      };
    }
  } catch (error: any) {
    console.error('Microsoft 365 connection test failed:', error);

    let errorMessage = 'Verbindung fehlgeschlagen';
    if (error.message?.includes('AADSTS')) {
      if (error.message.includes('AADSTS700016')) {
        errorMessage = 'Client ID nicht gefunden. Bitte pruefen Sie die Application ID.';
      } else if (error.message.includes('AADSTS7000215')) {
        errorMessage = 'Client Secret ungueltig. Bitte pruefen Sie das Secret.';
      } else if (error.message.includes('AADSTS90002')) {
        errorMessage = 'Tenant ID nicht gefunden. Bitte pruefen Sie die Tenant ID.';
      } else {
        errorMessage = `Azure AD Fehler: ${error.message}`;
      }
    } else if (error.message?.includes('Insufficient privileges')) {
      errorMessage = 'Berechtigungen fehlen. Bitte Admin Consent erteilen.';
    }

    return { success: false, error: errorMessage };
  }
}

// Update connection test result
export async function updateConnectionTestResult(
  organizationId: string,
  success: boolean,
  error?: string
): Promise<void> {
  await query(
    `UPDATE microsoft365_config
     SET last_connection_test = NOW(),
         last_connection_status = $1,
         updated_at = NOW()
     WHERE organization_id = $2`,
    [success ? 'success' : (error || 'failed'), organizationId]
  );
}

// Delete config for organization
export async function deleteConfig(organizationId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM microsoft365_config WHERE organization_id = $1',
    [organizationId]
  );
  return (result.rowCount ?? 0) > 0;
}

// Helper to map database row to config object
function mapRowToConfig(row: any): Microsoft365Config {
  return {
    id: row.id,
    organizationId: row.organization_id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    mailFrom: row.mail_from,
    supportMailbox: row.support_mailbox,
    isConfigured: row.is_configured,
    lastConnectionTest: row.last_connection_test,
    lastConnectionStatus: row.last_connection_status,
    featuresEnabled: row.features_enabled || { email: false, inboxMonitoring: false, calendar: false },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
