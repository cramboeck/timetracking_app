import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { attachOrganization, requireOrgRole } from '../middleware/organization';
import * as microsoft365Service from '../services/microsoft365ConfigService';

interface OrganizationRequest extends AuthRequest {
  organization: {
    id: string;
    name: string;
    role: string;
  };
}

const router = Router();

// Apply auth and organization middleware to all routes
router.use(authenticateToken);
router.use(attachOrganization);

// GET /api/microsoft365/config - Get Microsoft 365 config
router.get('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const config = await microsoft365Service.getConfig(organizationId);

    if (!config) {
      return res.json({
        success: true,
        data: {
          configured: false,
          tenantId: '',
          clientId: '',
          hasClientSecret: false,
          mailFrom: '',
          supportMailbox: '',
          featuresEnabled: { email: false, inboxMonitoring: false, calendar: false },
        },
      });
    }

    // Don't return the actual client secret
    res.json({
      success: true,
      data: {
        configured: config.isConfigured,
        tenantId: config.tenantId || '',
        clientId: config.clientId || '',
        hasClientSecret: !!config.clientSecret,
        mailFrom: config.mailFrom || '',
        supportMailbox: config.supportMailbox || '',
        featuresEnabled: config.featuresEnabled,
        lastConnectionTest: config.lastConnectionTest,
        lastConnectionStatus: config.lastConnectionStatus,
      },
    });
  } catch (error) {
    console.error('Get Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to get config' });
  }
});

// POST /api/microsoft365/config - Save Microsoft 365 config
router.post('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { tenantId, clientId, clientSecret, mailFrom, supportMailbox, featuresEnabled } = req.body;

    const config = await microsoft365Service.saveConfig(organizationId, {
      tenantId,
      clientId,
      clientSecret,
      mailFrom,
      supportMailbox,
      featuresEnabled,
    });

    res.json({
      success: true,
      data: {
        configured: config.isConfigured,
        tenantId: config.tenantId || '',
        clientId: config.clientId || '',
        hasClientSecret: !!config.clientSecret,
        mailFrom: config.mailFrom || '',
        supportMailbox: config.supportMailbox || '',
        featuresEnabled: config.featuresEnabled,
      },
    });
  } catch (error) {
    console.error('Save Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// POST /api/microsoft365/test - Test Microsoft 365 connection
router.post('/test', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    let { tenantId, clientId, clientSecret, mailFrom } = req.body;

    // If clientSecret is placeholder, get it from database
    if (clientSecret === '__USE_STORED__') {
      const storedConfig = await microsoft365Service.getConfig(organizationId);
      if (storedConfig?.clientSecret) {
        clientSecret = storedConfig.clientSecret;
        console.log('Using stored client secret from database');
      } else {
        return res.status(400).json({
          success: false,
          error: 'Kein Client Secret gespeichert. Bitte geben Sie ein neues Secret ein.',
        });
      }
    }

    // Debug logging
    console.log('=== Microsoft 365 Test Debug ===');
    console.log('Tenant ID:', tenantId);
    console.log('Client ID:', clientId);
    console.log('Client Secret Length:', clientSecret?.length);
    console.log('Client Secret First 4:', clientSecret?.substring(0, 4));
    console.log('Client Secret Last 4:', clientSecret?.substring(clientSecret.length - 4));
    console.log('================================');

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID, Client ID und Client Secret sind erforderlich',
      });
    }

    const result = await microsoft365Service.testConnection(
      tenantId,
      clientId,
      clientSecret,
      mailFrom
    );

    // Update test result in database
    await microsoft365Service.updateConnectionTestResult(
      organizationId,
      result.success,
      result.error
    );

    if (result.success) {
      res.json({
        success: true,
        data: result.userInfo,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error('Microsoft 365 connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

// DELETE /api/microsoft365/config - Remove Microsoft 365 config
router.delete('/config', requireOrgRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    await microsoft365Service.deleteConfig(organizationId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete Microsoft 365 config error:', error);
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

export default router;
