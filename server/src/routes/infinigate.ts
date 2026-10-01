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

// ─── Bestellungen (Phase 2b): Preisliste + Angebote ─────────────────────────

// GET /api/infinigate/pricelist/search?q=&take=&skip= - EK-Preissuche
router.get('/pricelist/search', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2 || q.length > 100) {
      return res.status(400).json({ success: false, error: 'Suchbegriff muss 2–100 Zeichen lang sein' });
    }
    const take = Math.min(Math.max(parseInt(String(req.query.take)) || 25, 1), 100);
    const skip = Math.max(parseInt(String(req.query.skip)) || 0, 0);
    const result = await infinigateService.searchPricelist(req.user!.id, q, take, skip);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate pricelist search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/infinigate/quotes - Angebote des Resellers
router.get('/quotes', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const quotes = await infinigateService.getQuotes(req.user!.id);
    res.json({ success: true, data: quotes });
  } catch (error: any) {
    logger.error('Infinigate quotes error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const quoteActionSchema = z.object({
  documentNumber: z.string().min(1).max(100),
  documentRevision: z.number().int().min(0),
  comment: z.string().max(1000).optional(),
});

// POST /api/infinigate/quotes/accept - ⚠️ Angebot annehmen = VERBINDLICHE
// Bestellung beim Distributor (acceptedByUserMail = eingeloggter User)
router.post('/quotes/accept', authenticateToken, requireBillingFeature, validate(quoteActionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.acceptQuote(req.user!.id, {
      documentNumber: req.body.documentNumber,
      documentRevision: req.body.documentRevision,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate accept quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/infinigate/quotes/reject - Angebot ablehnen (optional mit Kommentar)
router.post('/quotes/reject', authenticateToken, requireBillingFeature, validate(quoteActionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.rejectQuote(req.user!.id, {
      documentNumber: req.body.documentNumber,
      documentRevision: req.body.documentRevision,
      comment: req.body.comment,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate reject quote error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/infinigate/debug/orders?q= - Struktur-Dump Preisliste + Angebote
// (echte Feldnamen, gekürzte Werte) zum Nachschärfen der Normalisierung
router.get('/debug/orders', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || 'microsoft').trim().slice(0, 100);
    const result = await infinigateService.inspectOrdersStructure(req.user!.id, q);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate debug orders error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/infinigate/debug/structure - Feldstruktur einer echten Rechnung
// (Typen + gekürzte Beispielwerte) — zum Abgleich Mapping vs. echte API
router.get('/debug/structure', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const structure = await infinigateService.inspectFirstInvoiceStructure(req.user!.id);
    res.json({ success: true, data: structure });
  } catch (error: any) {
    logger.error('Infinigate debug structure error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/infinigate/debug/pdf - Download-Endpoint-Kandidaten für Beleg-PDFs
// gegen die echte API proben (Status/Content-Type/%PDF-Magic je Kandidat)
router.get('/debug/pdf', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.probePdfEndpoints(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate debug pdf error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/infinigate/fetch-pdfs - Beleg-PDFs für bereits importierte
// Infinigate-Belege ohne Dokument nachladen (Backfill)
router.post('/fetch-pdfs', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.fetchMissingInvoicePdfs(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate fetch pdfs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/infinigate/resync - Unbearbeitete Infinigate-Belege löschen und
// komplett neu importieren (nach einem Mapping-Fix; bearbeitete bleiben)
router.post('/resync', authenticateToken, requireBillingFeature, async (req: AuthRequest, res: Response) => {
  try {
    const result = await infinigateService.resyncInvoices(req.user!.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Infinigate resync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
