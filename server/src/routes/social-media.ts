import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { transformRows, transformRow } from '../utils/dbTransform';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import crypto from 'crypto';

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const createPostSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(5000),
  mediaUrls: z.array(z.string().url()).optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  customerId: z.string().uuid().optional(),
  platforms: z.array(z.string()).optional(),
  aiGenerated: z.boolean().optional(),
  aiPrompt: z.string().optional()
});

const updatePostSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(5000).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  hashtags: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional()
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  platform: z.enum(['linkedin', 'twitter', 'facebook', 'instagram', 'all']).optional(),
  category: z.string().max(50).optional(),
  hashtags: z.array(z.string()).optional()
});

const createHashtagGroupSchema = z.object({
  name: z.string().min(1).max(100),
  hashtags: z.array(z.string().min(1)).min(1),
  category: z.string().max(50).optional()
});

const generateContentSchema = z.object({
  topic: z.string().min(1).max(500),
  platform: z.enum(['linkedin', 'twitter', 'facebook', 'instagram', 'all']),
  tone: z.enum(['professional', 'casual', 'humorous', 'informative']).optional(),
  includeHashtags: z.boolean().optional(),
  includeEmoji: z.boolean().optional(),
  customerId: z.string().uuid().optional()
});

// ============================================
// Posts Routes
// ============================================

// GET /api/social-media/posts - Get all posts
router.get('/posts', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { status, customerId, startDate, endDate } = req.query;

    let query = `
      SELECT p.*, c.name as customer_name
      FROM social_media_posts p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramCount = 2;

    if (status) {
      query += ` AND p.status = $${paramCount++}`;
      params.push(status);
    }

    if (customerId) {
      query += ` AND p.customer_id = $${paramCount++}`;
      params.push(customerId);
    }

    if (startDate) {
      query += ` AND (p.scheduled_at >= $${paramCount++} OR p.created_at >= $${paramCount - 1})`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND (p.scheduled_at <= $${paramCount++} OR p.created_at <= $${paramCount - 1})`;
      params.push(endDate);
    }

    query += ' ORDER BY COALESCE(p.scheduled_at, p.created_at) DESC';

    const result = await pool.query(query, params);
    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// GET /api/social-media/posts/:id - Get single post with platform details
router.get('/posts/:id', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const postResult = await pool.query(
      `SELECT p.*, c.name as customer_name
       FROM social_media_posts p
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE p.id = $1 AND p.organization_id = $2`,
      [id, organizationId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const platformsResult = await pool.query(
      `SELECT pp.*, sa.platform, sa.account_name
       FROM social_media_post_platforms pp
       JOIN social_media_accounts sa ON pp.account_id = sa.id
       WHERE pp.post_id = $1`,
      [id]
    );

    const post = transformRow(postResult.rows[0]);
    post.platforms = transformRows(platformsResult.rows);

    res.json(post);
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// POST /api/social-media/posts - Create new post
router.post('/posts', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createPostSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { title, content, mediaUrls, hashtags, scheduledAt, customerId, platforms, aiGenerated, aiPrompt } = req.body;

    const id = crypto.randomUUID();
    const status = scheduledAt ? 'scheduled' : 'draft';

    await pool.query(
      `INSERT INTO social_media_posts
       (id, user_id, organization_id, customer_id, title, content, media_urls, hashtags, status, scheduled_at, ai_generated, ai_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, userId, organizationId, customerId || null, title || null, content, mediaUrls || [], hashtags || [], status, scheduledAt || null, aiGenerated || false, aiPrompt || null]
    );

    // Add platform targets if specified
    if (platforms && platforms.length > 0) {
      const accountsResult = await pool.query(
        `SELECT id, platform FROM social_media_accounts
         WHERE organization_id = $1 AND platform = ANY($2) AND is_active = true`,
        [organizationId, platforms]
      );

      for (const account of accountsResult.rows) {
        await pool.query(
          `INSERT INTO social_media_post_platforms (id, post_id, account_id)
           VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), id, account.id]
        );
      }
    }

    const result = await pool.query('SELECT * FROM social_media_posts WHERE id = $1', [id]);
    res.status(201).json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// PUT /api/social-media/posts/:id - Update post
router.put('/posts/:id', authenticateToken, attachOrganization, requireOrgRole('member'), validate(updatePostSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const updates = req.body;

    // Check post exists and belongs to organization
    const checkResult = await pool.query(
      'SELECT id, status FROM social_media_posts WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (checkResult.rows[0].status === 'published') {
      return res.status(400).json({ error: 'Cannot edit published post' });
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(updates.title);
    }
    if (updates.content !== undefined) {
      fields.push(`content = $${paramCount++}`);
      values.push(updates.content);
    }
    if (updates.mediaUrls !== undefined) {
      fields.push(`media_urls = $${paramCount++}`);
      values.push(updates.mediaUrls);
    }
    if (updates.hashtags !== undefined) {
      fields.push(`hashtags = $${paramCount++}`);
      values.push(updates.hashtags);
    }
    if (updates.scheduledAt !== undefined) {
      fields.push(`scheduled_at = $${paramCount++}`);
      values.push(updates.scheduledAt);
      if (updates.scheduledAt && updates.status !== 'draft') {
        fields.push(`status = 'scheduled'`);
      }
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }

    fields.push(`updated_at = NOW()`);

    if (fields.length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await pool.query(
      `UPDATE social_media_posts SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    const result = await pool.query('SELECT * FROM social_media_posts WHERE id = $1', [id]);
    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/social-media/posts/:id - Delete post
router.delete('/posts/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM social_media_posts WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ============================================
// Templates Routes
// ============================================

// GET /api/social-media/templates - Get all templates
router.get('/templates', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      'SELECT * FROM social_media_templates WHERE organization_id = $1 AND is_active = true ORDER BY name',
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// POST /api/social-media/templates - Create template
router.post('/templates', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createTemplateSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, content, platform, category, hashtags } = req.body;

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO social_media_templates (id, user_id, organization_id, name, content, platform, category, hashtags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId, organizationId, name, content, platform || 'all', category || null, hashtags || []]
    );

    const result = await pool.query('SELECT * FROM social_media_templates WHERE id = $1', [id]);
    res.status(201).json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// DELETE /api/social-media/templates/:id - Delete template
router.delete('/templates/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    await pool.query(
      'UPDATE social_media_templates SET is_active = false WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================
// Hashtag Groups Routes
// ============================================

// GET /api/social-media/hashtags - Get all hashtag groups
router.get('/hashtags', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      'SELECT * FROM social_media_hashtag_groups WHERE organization_id = $1 ORDER BY name',
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get hashtag groups error:', error);
    res.status(500).json({ error: 'Failed to get hashtag groups' });
  }
});

// POST /api/social-media/hashtags - Create hashtag group
router.post('/hashtags', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createHashtagGroupSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, hashtags, category } = req.body;

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO social_media_hashtag_groups (id, user_id, organization_id, name, hashtags, category)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, organizationId, name, hashtags, category || null]
    );

    const result = await pool.query('SELECT * FROM social_media_hashtag_groups WHERE id = $1', [id]);
    res.status(201).json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Create hashtag group error:', error);
    res.status(500).json({ error: 'Failed to create hashtag group' });
  }
});

// DELETE /api/social-media/hashtags/:id - Delete hashtag group
router.delete('/hashtags/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    await pool.query(
      'DELETE FROM social_media_hashtag_groups WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete hashtag group error:', error);
    res.status(500).json({ error: 'Failed to delete hashtag group' });
  }
});

// ============================================
// Accounts Routes
// ============================================

// GET /api/social-media/accounts - Get all connected accounts
router.get('/accounts', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT id, platform, account_name, account_id, is_active, created_at,
              CASE WHEN token_expires_at < NOW() THEN true ELSE false END as token_expired
       FROM social_media_accounts
       WHERE organization_id = $1
       ORDER BY platform, account_name`,
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// POST /api/social-media/accounts - Add account (manual for now, OAuth later)
router.post('/accounts', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { platform, accountName, accountId, accessToken, refreshToken, tokenExpiresAt } = req.body;

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO social_media_accounts
       (id, user_id, organization_id, platform, account_name, account_id, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, userId, organizationId, platform, accountName, accountId || null, accessToken || null, refreshToken || null, tokenExpiresAt || null]
    );

    const result = await pool.query(
      'SELECT id, platform, account_name, account_id, is_active, created_at FROM social_media_accounts WHERE id = $1',
      [id]
    );
    res.status(201).json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// DELETE /api/social-media/accounts/:id - Remove account
router.delete('/accounts/:id', authenticateToken, attachOrganization, requireOrgRole('admin'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    await pool.query(
      'DELETE FROM social_media_accounts WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ============================================
// AI Content Generation
// ============================================

// POST /api/social-media/generate - Generate content with AI
router.post('/generate', authenticateToken, attachOrganization, requireOrgRole('member'), validate(generateContentSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { topic, platform, tone, includeHashtags, includeEmoji, customerId } = req.body;

    // Get customer info if specified
    let customerContext = '';
    if (customerId) {
      const customerResult = await pool.query(
        'SELECT name, address FROM customers WHERE id = $1 AND organization_id = $2',
        [customerId, organizationId]
      );
      if (customerResult.rows.length > 0) {
        customerContext = `\nKunde: ${customerResult.rows[0].name}`;
      }
    }

    // Platform-specific guidelines
    const platformGuidelines: Record<string, string> = {
      linkedin: 'LinkedIn: Professionell, bis zu 3000 Zeichen, keine übermäßigen Emojis, 3-5 relevante Hashtags am Ende',
      twitter: 'Twitter/X: Maximal 280 Zeichen, prägnant, 1-3 Hashtags integriert',
      facebook: 'Facebook: Locker aber informativ, bis zu 500 Zeichen optimal, Emojis erlaubt',
      instagram: 'Instagram: Visuell orientiert, Emojis erwünscht, bis zu 30 Hashtags möglich',
      all: 'Erstelle einen universellen Post der auf allen Plattformen funktioniert, ca. 200-300 Zeichen'
    };

    const toneGuidelines: Record<string, string> = {
      professional: 'Professioneller, seriöser Ton',
      casual: 'Lockerer, freundlicher Ton',
      humorous: 'Humorvoller, unterhaltsamer Ton',
      informative: 'Informativer, lehrreicher Ton'
    };

    const prompt = `Erstelle einen Social Media Post auf Deutsch.

Thema: ${topic}${customerContext}

Plattform: ${platformGuidelines[platform]}
Ton: ${toneGuidelines[tone || 'professional']}
${includeHashtags !== false ? 'Füge passende Hashtags hinzu.' : 'Keine Hashtags.'}
${includeEmoji ? 'Verwende passende Emojis.' : 'Keine Emojis verwenden.'}

Antworte NUR mit dem fertigen Post-Text, keine Erklärungen.`;

    // Call the AI service (reuse existing infrastructure)
    const aiResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || ''
      },
      body: JSON.stringify({
        message: prompt,
        context: 'social_media_generation'
      })
    });

    if (!aiResponse.ok) {
      throw new Error('AI generation failed');
    }

    const aiResult = await aiResponse.json() as { response?: string };

    // Extract hashtags from generated content
    const hashtagRegex = /#[\wäöüÄÖÜß]+/g;
    const extractedHashtags = (aiResult.response?.match(hashtagRegex) || []) as string[];

    res.json({
      content: aiResult.response || '',
      hashtags: extractedHashtags,
      platform,
      prompt: topic
    });
  } catch (error) {
    console.error('Generate content error:', error);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// ============================================
// Calendar/Schedule View
// ============================================

// GET /api/social-media/calendar - Get posts for calendar view
router.get('/calendar', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { month, year } = req.query;

    const targetMonth = parseInt(month as string) || new Date().getMonth() + 1;
    const targetYear = parseInt(year as string) || new Date().getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.status, p.scheduled_at, p.published_at, p.hashtags,
              c.name as customer_name, c.color as customer_color,
              array_agg(DISTINCT sa.platform) as platforms
       FROM social_media_posts p
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN social_media_post_platforms pp ON p.id = pp.post_id
       LEFT JOIN social_media_accounts sa ON pp.account_id = sa.id
       WHERE p.organization_id = $1
         AND (p.scheduled_at BETWEEN $2 AND $3 OR p.published_at BETWEEN $2 AND $3)
       GROUP BY p.id, c.name, c.color
       ORDER BY COALESCE(p.scheduled_at, p.published_at)`,
      [organizationId, startDate.toISOString(), endDate.toISOString()]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: 'Failed to get calendar data' });
  }
});

// ============================================
// Statistics
// ============================================

// GET /api/social-media/stats - Get social media statistics
router.get('/stats', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const [postsStats, platformStats, scheduledCount] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'draft') as drafts,
           COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
           COUNT(*) FILTER (WHERE status = 'published') as published,
           COUNT(*) as total
         FROM social_media_posts WHERE organization_id = $1`,
        [organizationId]
      ),
      pool.query(
        `SELECT sa.platform, COUNT(pp.id) as post_count
         FROM social_media_accounts sa
         LEFT JOIN social_media_post_platforms pp ON sa.id = pp.account_id
         WHERE sa.organization_id = $1
         GROUP BY sa.platform`,
        [organizationId]
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM social_media_posts
         WHERE organization_id = $1 AND status = 'scheduled' AND scheduled_at > NOW()`,
        [organizationId]
      )
    ]);

    res.json({
      posts: postsStats.rows[0],
      platforms: platformStats.rows,
      upcomingScheduled: parseInt(scheduledCount.rows[0]?.count || '0')
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

export default router;
