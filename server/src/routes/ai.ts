import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import * as aiService from '../services/aiService';

const router = express.Router();

// ============================================
// AI Configuration Routes
// ============================================

// GET /api/ai/config - Get AI configuration
router.get('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const config = await aiService.getAIConfig(userId);

    res.json({
      success: true,
      data: config
        ? {
            ...config,
            apiKey: config.apiKey ? '••••••••' : null,
            hasApiKey: !!config.apiKey,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Get AI config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ai/config - Save AI configuration
router.put('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { provider, apiKey, model, enabled, maxTokens, temperature } = req.body;

    const config = await aiService.saveAIConfig(userId, {
      provider,
      apiKey,
      model,
      enabled,
      maxTokens,
      temperature,
    });

    res.json({
      success: true,
      data: {
        ...config,
        apiKey: config.apiKey ? '••••••••' : null,
        hasApiKey: !!config.apiKey,
      },
    });
  } catch (error: any) {
    console.error('Save AI config error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/test-connection - Test AI API connection
router.post('/test-connection', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Provider und API-Key sind erforderlich',
      });
    }

    const result = await aiService.testAIConnection(provider, apiKey);

    res.json({
      success: result.success,
      error: result.error,
    });
  } catch (error: any) {
    console.error('Test AI connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Ticket Suggestion Routes
// ============================================

// POST /api/ai/tickets/:ticketId/suggest - Generate AI suggestion for ticket
router.post(
  '/tickets/:ticketId/suggest',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { ticketId } = req.params;
      const { suggestionType = 'solution' } = req.body;

      const suggestion = await aiService.generateTicketSuggestion(
        userId,
        ticketId,
        suggestionType
      );

      res.json({
        success: true,
        data: suggestion,
      });
    } catch (error: any) {
      console.error('Generate suggestion error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// GET /api/ai/tickets/:ticketId/suggestions - Get suggestion history for ticket
router.get(
  '/tickets/:ticketId/suggestions',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { ticketId } = req.params;

      const suggestions = await aiService.getTicketSuggestions(userId, ticketId);

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error: any) {
      console.error('Get suggestions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/ai/suggestions/:suggestionId/feedback - Mark suggestion as helpful/not helpful
router.post(
  '/suggestions/:suggestionId/feedback',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { suggestionId } = req.params;
      const { isHelpful } = req.body;

      if (typeof isHelpful !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'isHelpful muss ein Boolean sein',
        });
      }

      await aiService.markSuggestionHelpful(userId, suggestionId, isHelpful);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Mark suggestion feedback error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/ai/suggestions/:suggestionId/apply - Mark suggestion as applied
router.post(
  '/suggestions/:suggestionId/apply',
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { suggestionId } = req.params;

      await aiService.markSuggestionApplied(userId, suggestionId);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Mark suggestion applied error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
