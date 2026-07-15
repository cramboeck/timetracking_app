import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { query } from '../config/database';
import * as infinigateService from '../services/infinigateService';
import { logger } from '../utils/logger';

const router = Router();

// Wie in sevdesk.ts: Distributor-Integration hängt am Billing-Feature-Flag.
async function requireBillingFeature(req: AuthRequest, res: Response, next: Function) {
  try {
    const userId = req.user!.id;
    const result = await query(
      "SELECT feature_flags->>'billing_enabled' as billing_enabled FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows[0]?.billing_enabled !== 'true') {
      return res.status(403).json({
        success: false,
        error: 'Billing feature is not enabled for your account',
        code: 'FEATURE_NOT_ENABLED',
      });
    }
    next();
  } catch (error) {
    logger.error('Feature check error:', error);
    res.status(500).json({ success: false, error: 'Feature check failed' });
  }
}

const configSchema = z.object({
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(500).optional(),
  apiKey: z.string().max(200).optional(),
  environment: z.enum(['production', 'test']).optional(),
  autoSync: z.boolean().optional(),
});

// GET /api/infinigate/config - Config lesen (Secrets maskiert)
router.get('/config', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const config = await infinigateService.getConfig(req.user!.id);
    res.json({
      success: true,
      data: config
        ? {
            configured: !!(config.clientId && config.clientSecret && config.apiKey),
            hasClientId: !!config.clientId,
            hasClientSecret: !!config.clientSecret,
            hasApiKey: !!config.apiKey,
            environment: config.environment,
            autoSync: config.autoSync,
            lastSyncAt: config.lastSyncAt,
          }
        : { configured: false, hasClientId: false, hasClientSecret: false, hasApiKey: false, environment: 'production', autoSync: false, lastSyncAt: null },
    });
  } catch (error: any) {
    logger.error('Infinigate get config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/infinigate/config - Config speichern (leere Felder = unverändert)
router.post('/config', authenticateToken, requireBillingFeature, validate(configSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, clientSecret, apiKey, environment, autoSync } = req.body;
    await infinigateService.saveConfig(req.user!.id, {
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
      apiKey: apiKey || undefined,
      environment,
      autoSync,
    });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Infinigate save config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/infinigate/test - Verbindungstest (Token + 1 Rechnung abrufen)
router.post('/test', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.testConnection(req.user!.id);
    res.json({ success: result.ok, message: result.message, invoiceCount: result.invoiceCount });
  } catch (error: any) {
    logger.error('Infinigate test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/infinigate/sync - Rechnungs-/Lizenz-Sync manuell anstoßen
router.post('/sync', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.syncInvoices(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
