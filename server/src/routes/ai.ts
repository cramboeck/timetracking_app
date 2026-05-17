import express, { Response } from 'express';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import * as aiService from '../services/aiService';

const router = express.Router();

// ============================================================================
// Zod validation schemas
// ============================================================================

const aiProviderSchema = z.enum(['openai', 'anthropic', 'gemini', 'mistral', 'local']);

const aiConfigSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z.string().min(1).max(500),
  model: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  maxTokens: z.number().int().positive().max(200_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const testConnectionSchema = z.object({
  provider: aiProviderSchema,
  apiKey: z.string().min(1).max(500),
});

const ticketSuggestParamsSchema = z.object({
  // Free-form context object — keep loose, the AI service decides what to use
  context: z.record(z.unknown()).optional(),
}).passthrough();

const suggestionFeedbackSchema = z.object({
  helpful: z.boolean(),
  feedback: z.string().max(2_000).optional(),
});

const generateQuoteTextSchema = z.object({
  type: z.enum(['head', 'foot', 'header', 'footer']),
  context: z.string().max(10_000).optional(),
});

const researchPriceSchema = z.object({
  productName: z.string().trim().min(1).max(500),
  context: z.string().max(2_000).optional(),
});

const generatePositionDescriptionSchema = z.object({
  positionName: z.string().trim().min(1).max(500),
  context: z.string().max(2_000).optional(),
});

const kbFromTicketSchema = z.object({
  ticketId: z.string().uuid(),
});

const timeEntryDescriptionSchema = z.record(z.unknown());

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
router.put('/config', authenticateToken, validate(aiConfigSchema), async (req: AuthRequest, res: Response) => {
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
router.post('/test-connection', authenticateToken, validate(testConnectionSchema), async (req: AuthRequest, res: Response) => {
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
  validate(ticketSuggestParamsSchema),
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
  validate(suggestionFeedbackSchema),
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

// ============================================
// Quote AI Routes
// ============================================

// POST /api/ai/quote/generate-text - Generate quote text (head/foot)
router.post(
  '/quote/generate-text',
  authenticateToken,
  validate(generateQuoteTextSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { type, context } = req.body;

      if (!type || !['head', 'foot'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'Typ muss "head" oder "foot" sein',
        });
      }

      const text = await aiService.generateQuoteText(userId, type, context);

      res.json({
        success: true,
        data: { text },
      });
    } catch (error: any) {
      console.error('Generate quote text error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/ai/quote/research-price - Research price for product/service
router.post(
  '/quote/research-price',
  authenticateToken,
  validate(researchPriceSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { productName, context } = req.body;

      if (!productName) {
        return res.status(400).json({
          success: false,
          error: 'Produktname ist erforderlich',
        });
      }

      const result = await aiService.researchProductPrice(userId, productName, context);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Research price error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// POST /api/ai/quote/generate-position-description - Generate description for a quote position
router.post(
  '/quote/generate-position-description',
  authenticateToken,
  validate(generatePositionDescriptionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { positionName, context } = req.body;

      if (!positionName) {
        return res.status(400).json({
          success: false,
          error: 'Positionsname ist erforderlich',
        });
      }

      const description = await aiService.generatePositionDescription(userId, positionName, context);

      res.json({
        success: true,
        data: { description },
      });
    } catch (error: any) {
      console.error('Generate position description error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ============================================
// Time Entry AI Routes
// ============================================

// POST /api/ai/kb/generate-from-ticket - Generate KB article from ticket
router.post(
  '/kb/generate-from-ticket',
  authenticateToken,
  validate(kbFromTicketSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { ticketId } = req.body;

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          error: 'Ticket-ID ist erforderlich',
        });
      }

      const article = await aiService.generateKBArticleFromTicket(userId, ticketId);

      res.json({
        success: true,
        data: article,
      });
    } catch (error: any) {
      console.error('Generate KB article error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ============================================
// Time Entry AI Routes
// ============================================

// POST /api/ai/time-entry/suggest-description - Suggest description for time entry
router.post(
  '/time-entry/suggest-description',
  authenticateToken,
  validate(timeEntryDescriptionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const context = req.body;

      const suggestion = await aiService.suggestTimeEntryDescription(userId, context);

      res.json({
        success: true,
        data: { suggestion },
      });
    } catch (error: any) {
      console.error('Suggest time entry description error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

export default router;
