import { Router } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { attachOrganization, OrganizationRequest, requireOrgRole } from '../middleware/organization';
import { transformRows, transformRow } from '../utils/dbTransform';
import { z } from 'zod';
import { validate } from '../middleware/validation';
import crypto from 'crypto';
import * as aiService from '../services/aiService';

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
  customerId: z.string().uuid().optional(),
  contentCategory: z.string().max(50).optional()
});

const batchGenerateSchema = z.object({
  topics: z.array(z.string().min(1).max(500)).min(1).max(20),
  platform: z.enum(['linkedin', 'twitter', 'facebook', 'instagram', 'all']),
  tone: z.enum(['professional', 'casual', 'humorous', 'informative']).optional(),
  includeHashtags: z.boolean().optional(),
  includeEmoji: z.boolean().optional(),
  contentCategory: z.string().max(50).optional(),
  autoSchedule: z.boolean().optional(),
  startDate: z.string().datetime().optional(),
  postsPerDay: z.number().min(1).max(10).optional()
});

const generateIdeasSchema = z.object({
  category: z.string().min(1).max(100),
  count: z.number().min(1).max(30).optional()
});

const queueSettingsSchema = z.object({
  enabled: z.boolean(),
  postsPerDay: z.number().min(1).max(10),
  preferredTimes: z.array(z.string()).optional(), // e.g., ["09:00", "12:00", "17:00"]
  weekendPosting: z.boolean().optional(),
  contentMix: z.object({
    educational: z.number().min(0).max(100).optional(),
    promotional: z.number().min(0).max(100).optional(),
    behindTheScenes: z.number().min(0).max(100).optional(),
    news: z.number().min(0).max(100).optional()
  }).optional()
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

// POST /api/social-media/generate - Generate single post with AI
router.post('/generate', authenticateToken, attachOrganization, requireOrgRole('member'), validate(generateContentSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { topic, platform, tone, includeHashtags, includeEmoji, customerId, contentCategory } = req.body;

    // Get customer info if specified
    let customerContext = '';
    if (customerId) {
      const customerResult = await pool.query(
        'SELECT name, address FROM customers WHERE id = $1 AND organization_id = $2',
        [customerId, organizationId]
      );
      if (customerResult.rows.length > 0) {
        customerContext = customerResult.rows[0].name;
      }
    }

    const result = await aiService.generateSocialMediaContent(userId, {
      topic,
      platform,
      tone: tone || 'professional',
      includeHashtags: includeHashtags !== false,
      includeEmoji: includeEmoji || false,
      customerContext,
      contentCategory
    });

    res.json({
      content: result.content,
      hashtags: result.hashtags,
      platform: result.platform,
      characterCount: result.characterCount,
      prompt: topic
    });
  } catch (error: any) {
    console.error('Generate content error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate content' });
  }
});

// POST /api/social-media/generate-batch - Generate multiple posts with AI
router.post('/generate-batch', authenticateToken, attachOrganization, requireOrgRole('member'), validate(batchGenerateSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { topics, platform, tone, includeHashtags, includeEmoji, contentCategory, autoSchedule, startDate, postsPerDay } = req.body;

    // Generate posts with AI
    const generatedPosts = await aiService.generateBatchSocialMediaContent(userId, {
      topics,
      platform,
      tone: tone || 'professional',
      includeHashtags: includeHashtags !== false,
      includeEmoji: includeEmoji || false,
      contentCategory,
      schedulingStrategy: autoSchedule ? 'spread' : 'custom',
      startDate: startDate ? new Date(startDate) : undefined,
      postsPerDay: postsPerDay || 2
    });

    // If autoSchedule is enabled, create posts in the database with scheduled times
    if (autoSchedule) {
      const createdPosts = [];
      const baseDate = startDate ? new Date(startDate) : new Date();
      const perDay = postsPerDay || 2;
      const preferredHours = [9, 12, 15, 17]; // Default posting times

      for (let i = 0; i < generatedPosts.length; i++) {
        const post = generatedPosts[i];
        const dayOffset = Math.floor(i / perDay);
        const timeIndex = i % perDay;

        const scheduledDate = new Date(baseDate);
        scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

        // Skip weekends
        while (scheduledDate.getDay() === 0 || scheduledDate.getDay() === 6) {
          scheduledDate.setDate(scheduledDate.getDate() + 1);
        }

        scheduledDate.setHours(preferredHours[timeIndex % preferredHours.length], 0, 0, 0);

        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO social_media_posts (id, user_id, organization_id, title, content, hashtags, status, scheduled_at, ai_generated, ai_prompt, content_category)
           VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, true, $8, $9)`,
          [
            id,
            userId,
            organizationId,
            topics[i] ? topics[i].substring(0, 100) : null,
            post.content,
            post.hashtags,
            scheduledDate,
            topics[i],
            contentCategory || null
          ]
        );

        createdPosts.push({
          id,
          content: post.content,
          hashtags: post.hashtags,
          scheduledAt: scheduledDate,
          topic: topics[i]
        });
      }

      res.json({
        success: true,
        posts: createdPosts,
        message: `${createdPosts.length} Posts erstellt und geplant`
      });
    } else {
      // Just return generated content without saving
      res.json({
        success: true,
        posts: generatedPosts.map((post, i) => ({
          content: post.content,
          hashtags: post.hashtags,
          platform: post.platform,
          characterCount: post.characterCount,
          topic: topics[i]
        }))
      });
    }
  } catch (error: any) {
    console.error('Batch generate error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate batch content' });
  }
});

// POST /api/social-media/generate-ideas - Generate content ideas with AI
router.post('/generate-ideas', authenticateToken, attachOrganization, requireOrgRole('member'), validate(generateIdeasSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { category, count } = req.body;

    const ideas = await aiService.generateContentIdeas(userId, category, count || 10);

    res.json({
      success: true,
      ideas,
      category
    });
  } catch (error: any) {
    console.error('Generate ideas error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate content ideas' });
  }
});

// ============================================
// Queue & Auto-Scheduling
// ============================================

// GET /api/social-media/queue - Get posts in queue (scheduled but not published)
router.get('/queue', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT p.*, c.name as customer_name
       FROM social_media_posts p
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE p.organization_id = $1 AND p.status = 'scheduled' AND p.scheduled_at > NOW()
       ORDER BY p.scheduled_at ASC`,
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({ error: 'Failed to get queue' });
  }
});

// POST /api/social-media/queue/add - Add post to queue (auto-schedule)
router.post('/queue/add', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { content, hashtags, platforms, title, contentCategory } = req.body;

    // Find the next available slot
    const lastScheduled = await pool.query(
      `SELECT scheduled_at FROM social_media_posts
       WHERE organization_id = $1 AND status = 'scheduled' AND scheduled_at > NOW()
       ORDER BY scheduled_at DESC LIMIT 1`,
      [organizationId]
    );

    // Get queue settings or use defaults
    const settingsResult = await pool.query(
      `SELECT * FROM social_media_queue_settings WHERE organization_id = $1`,
      [organizationId]
    );

    const settings = settingsResult.rows[0] || {
      posts_per_day: 2,
      preferred_times: ['09:00', '15:00'],
      weekend_posting: false
    };

    // Calculate next slot
    let nextSlot = new Date();
    if (lastScheduled.rows.length > 0) {
      nextSlot = new Date(lastScheduled.rows[0].scheduled_at);
    }

    // Find next available time based on settings
    const preferredTimes = settings.preferred_times || ['09:00', '15:00'];
    const postsToday = await pool.query(
      `SELECT COUNT(*) FROM social_media_posts
       WHERE organization_id = $1 AND status = 'scheduled'
       AND DATE(scheduled_at) = DATE($2)`,
      [organizationId, nextSlot]
    );

    if (parseInt(postsToday.rows[0].count) >= settings.posts_per_day) {
      // Move to next day
      nextSlot.setDate(nextSlot.getDate() + 1);
    }

    // Skip weekends if setting is disabled
    if (!settings.weekend_posting) {
      while (nextSlot.getDay() === 0 || nextSlot.getDay() === 6) {
        nextSlot.setDate(nextSlot.getDate() + 1);
      }
    }

    // Set to preferred time
    const timeIndex = parseInt(postsToday.rows[0].count) % preferredTimes.length;
    const [hours, minutes] = preferredTimes[timeIndex].split(':').map(Number);
    nextSlot.setHours(hours, minutes, 0, 0);

    // Ensure it's in the future
    if (nextSlot <= new Date()) {
      nextSlot.setDate(nextSlot.getDate() + 1);
      nextSlot.setHours(parseInt(preferredTimes[0].split(':')[0]), parseInt(preferredTimes[0].split(':')[1]), 0, 0);
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO social_media_posts (id, user_id, organization_id, title, content, hashtags, status, scheduled_at, content_category)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)`,
      [id, userId, organizationId, title || null, content, hashtags || [], nextSlot, contentCategory || null]
    );

    const newPost = await pool.query(
      `SELECT * FROM social_media_posts WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      post: transformRow(newPost.rows[0]),
      scheduledAt: nextSlot
    });
  } catch (error) {
    console.error('Add to queue error:', error);
    res.status(500).json({ error: 'Failed to add to queue' });
  }
});

// GET /api/social-media/queue/settings - Get queue settings
router.get('/queue/settings', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT * FROM social_media_queue_settings WHERE organization_id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      // Return defaults
      res.json({
        enabled: true,
        postsPerDay: 2,
        preferredTimes: ['09:00', '15:00'],
        weekendPosting: false,
        contentMix: {
          educational: 40,
          promotional: 30,
          behindTheScenes: 20,
          news: 10
        }
      });
    } else {
      res.json(transformRow(result.rows[0]));
    }
  } catch (error) {
    console.error('Get queue settings error:', error);
    res.status(500).json({ error: 'Failed to get queue settings' });
  }
});

// PUT /api/social-media/queue/settings - Update queue settings
router.put('/queue/settings', authenticateToken, attachOrganization, requireOrgRole('admin'), validate(queueSettingsSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { enabled, postsPerDay, preferredTimes, weekendPosting, contentMix } = req.body;

    await pool.query(
      `INSERT INTO social_media_queue_settings (organization_id, enabled, posts_per_day, preferred_times, weekend_posting, content_mix)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id) DO UPDATE SET
         enabled = $2,
         posts_per_day = $3,
         preferred_times = $4,
         weekend_posting = $5,
         content_mix = $6,
         updated_at = NOW()`,
      [organizationId, enabled, postsPerDay, preferredTimes || ['09:00', '15:00'], weekendPosting || false, contentMix || {}]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update queue settings error:', error);
    res.status(500).json({ error: 'Failed to update queue settings' });
  }
});

// POST /api/social-media/queue/reorder - Reorder posts in queue
router.post('/queue/reorder', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { postIds } = req.body; // Array of post IDs in new order

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ error: 'postIds array required' });
    }

    // Get current scheduled times
    const currentPosts = await pool.query(
      `SELECT id, scheduled_at FROM social_media_posts
       WHERE organization_id = $1 AND id = ANY($2) AND status = 'scheduled'
       ORDER BY scheduled_at ASC`,
      [organizationId, postIds]
    );

    const times = currentPosts.rows.map(p => p.scheduled_at);

    // Reassign times based on new order
    for (let i = 0; i < postIds.length && i < times.length; i++) {
      await pool.query(
        `UPDATE social_media_posts SET scheduled_at = $1, updated_at = NOW() WHERE id = $2`,
        [times[i], postIds[i]]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder queue error:', error);
    res.status(500).json({ error: 'Failed to reorder queue' });
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

// ============================================
// CSV/Bulk Import
// ============================================

const csvImportSchema = z.object({
  posts: z.array(z.object({
    content: z.string().min(1),
    title: z.string().optional(),
    scheduledAt: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    platform: z.enum(['linkedin', 'twitter', 'facebook', 'instagram', 'all']).optional(),
    contentCategory: z.string().optional()
  })).min(1).max(100)
});

// POST /api/social-media/import - Bulk import posts from CSV data
router.post('/import', authenticateToken, attachOrganization, requireOrgRole('member'), validate(csvImportSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { posts } = req.body;

    const createdPosts = [];
    for (const post of posts) {
      const id = crypto.randomUUID();
      const scheduledAt = post.scheduledAt ? new Date(post.scheduledAt) : null;
      const status = scheduledAt && scheduledAt > new Date() ? 'scheduled' : 'draft';

      await pool.query(
        `INSERT INTO social_media_posts (id, user_id, organization_id, title, content, hashtags, status, scheduled_at, content_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, userId, organizationId, post.title || null, post.content, post.hashtags || [], status, scheduledAt, post.contentCategory || null]
      );

      createdPosts.push({ id, content: post.content, status, scheduledAt });
    }

    res.json({
      success: true,
      imported: createdPosts.length,
      posts: createdPosts
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Failed to import posts' });
  }
});

// ============================================
// Best Time Analysis
// ============================================

// GET /api/social-media/analytics/best-times - Get best posting times based on engagement
router.get('/analytics/best-times', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Analyze published posts by hour of day and day of week
    const result = await pool.query(
      `SELECT
         EXTRACT(DOW FROM published_at) as day_of_week,
         EXTRACT(HOUR FROM published_at) as hour_of_day,
         COUNT(*) as post_count,
         AVG(COALESCE(
           (SELECT SUM(engagement_likes + engagement_comments + engagement_shares)
            FROM social_media_post_platforms WHERE post_id = p.id), 0
         )) as avg_engagement
       FROM social_media_posts p
       WHERE organization_id = $1 AND status = 'published' AND published_at IS NOT NULL
       GROUP BY EXTRACT(DOW FROM published_at), EXTRACT(HOUR FROM published_at)
       HAVING COUNT(*) >= 1
       ORDER BY avg_engagement DESC`,
      [organizationId]
    );

    // Calculate recommended times (top 5 by engagement)
    const recommendedTimes = result.rows.slice(0, 5).map(row => ({
      dayOfWeek: parseInt(row.day_of_week),
      dayName: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][parseInt(row.day_of_week)],
      hour: parseInt(row.hour_of_day),
      timeString: `${String(row.hour_of_day).padStart(2, '0')}:00`,
      postCount: parseInt(row.post_count),
      avgEngagement: parseFloat(row.avg_engagement) || 0
    }));

    // Generate heatmap data (7 days x 24 hours)
    const heatmap: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
    result.rows.forEach(row => {
      heatmap[parseInt(row.day_of_week)][parseInt(row.hour_of_day)] = parseFloat(row.avg_engagement) || 0;
    });

    res.json({
      recommendedTimes,
      heatmap,
      totalAnalyzedPosts: result.rows.reduce((sum, r) => sum + parseInt(r.post_count), 0)
    });
  } catch (error) {
    console.error('Best times analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze best times' });
  }
});

// ============================================
// Hashtag Research & Analysis
// ============================================

// GET /api/social-media/analytics/hashtags - Get hashtag performance
router.get('/analytics/hashtags', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Get all hashtags used and their frequency
    const hashtagResult = await pool.query(
      `SELECT unnest(hashtags) as hashtag, COUNT(*) as usage_count
       FROM social_media_posts
       WHERE organization_id = $1 AND hashtags IS NOT NULL AND array_length(hashtags, 1) > 0
       GROUP BY unnest(hashtags)
       ORDER BY usage_count DESC
       LIMIT 50`,
      [organizationId]
    );

    // Get engagement per hashtag (approximate)
    const engagementResult = await pool.query(
      `SELECT unnest(p.hashtags) as hashtag,
              AVG(COALESCE(
                (SELECT SUM(engagement_likes + engagement_comments + engagement_shares)
                 FROM social_media_post_platforms WHERE post_id = p.id), 0
              )) as avg_engagement
       FROM social_media_posts p
       WHERE organization_id = $1 AND hashtags IS NOT NULL AND status = 'published'
       GROUP BY unnest(p.hashtags)
       ORDER BY avg_engagement DESC
       LIMIT 30`,
      [organizationId]
    );

    const hashtagStats = hashtagResult.rows.map(row => {
      const engagement = engagementResult.rows.find(e => e.hashtag === row.hashtag);
      return {
        hashtag: row.hashtag,
        usageCount: parseInt(row.usage_count),
        avgEngagement: parseFloat(engagement?.avg_engagement || '0')
      };
    });

    // Top performing hashtags
    const topPerforming = [...hashtagStats].sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 10);

    res.json({
      allHashtags: hashtagStats,
      topPerforming,
      totalUniqueHashtags: hashtagStats.length
    });
  } catch (error) {
    console.error('Hashtag analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze hashtags' });
  }
});

// POST /api/social-media/analytics/hashtags/research - AI-powered hashtag research
router.post('/analytics/hashtags/research', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { topic, platform, count = 15 } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const platformContext = platform && platform !== 'all'
      ? `für ${platform === 'linkedin' ? 'LinkedIn' : platform === 'twitter' ? 'Twitter/X' : platform === 'instagram' ? 'Instagram' : 'Facebook'}`
      : 'für Social Media allgemein';

    const prompt = `Finde die ${count} besten Hashtags ${platformContext} zum Thema "${topic}".

Kriterien:
- Relevante Hashtags mit guter Reichweite
- Mix aus populären und Nischen-Hashtags
- Für deutschsprachige und internationale Zielgruppe

Antworte im JSON-Format:
{
  "hashtags": [
    {"tag": "#beispiel", "reach": "hoch/mittel/niedrig", "description": "Kurze Erklärung"}
  ]
}`;

    const result = await aiService.generateSocialMediaContent(userId, {
      topic: prompt,
      platform: 'all',
      tone: 'professional',
      includeHashtags: false,
      includeEmoji: false
    });

    // Parse the response
    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr) as { hashtags: Array<{ tag: string; reach: string; description: string }> };
      res.json({
        success: true,
        topic,
        platform,
        hashtags: parsed.hashtags
      });
    } catch {
      // If parsing fails, extract hashtags manually
      const hashtagRegex = /#[\wäöüÄÖÜß]+/g;
      const extractedHashtags = (result.content.match(hashtagRegex) || []) as string[];
      res.json({
        success: true,
        topic,
        platform,
        hashtags: extractedHashtags.map(tag => ({ tag, reach: 'unbekannt', description: '' }))
      });
    }
  } catch (error: any) {
    console.error('Hashtag research error:', error);
    res.status(500).json({ error: error.message || 'Failed to research hashtags' });
  }
});

// ============================================
// Evergreen Content Recycling
// ============================================

// GET /api/social-media/evergreen - Get evergreen posts
router.get('/evergreen', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT p.*, c.name as customer_name,
              COALESCE(
                (SELECT SUM(engagement_likes + engagement_comments + engagement_shares)
                 FROM social_media_post_platforms WHERE post_id = p.id), 0
              ) as total_engagement
       FROM social_media_posts p
       LEFT JOIN customers c ON p.customer_id = c.id
       WHERE p.organization_id = $1 AND p.evergreen = true
       ORDER BY total_engagement DESC, p.created_at DESC`,
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get evergreen posts error:', error);
    res.status(500).json({ error: 'Failed to get evergreen posts' });
  }
});

// PUT /api/social-media/posts/:id/evergreen - Toggle evergreen status
router.put('/posts/:id/evergreen', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const { evergreen } = req.body;

    await pool.query(
      `UPDATE social_media_posts SET evergreen = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
      [evergreen, id, organizationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update evergreen status error:', error);
    res.status(500).json({ error: 'Failed to update evergreen status' });
  }
});

// POST /api/social-media/evergreen/recycle - Recycle evergreen content
router.post('/evergreen/recycle', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { postId, scheduledAt, modifyContent } = req.body;

    // Get the original post
    const original = await pool.query(
      `SELECT * FROM social_media_posts WHERE id = $1 AND organization_id = $2`,
      [postId, organizationId]
    );

    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const originalPost = original.rows[0];
    let newContent = originalPost.content;

    // Optionally modify content slightly with AI
    if (modifyContent) {
      try {
        const result = await aiService.generateSocialMediaContent(userId, {
          topic: `Formuliere diesen Post leicht um, behalte aber die Kernaussage: "${originalPost.content}"`,
          platform: 'all',
          tone: 'professional',
          includeHashtags: false,
          includeEmoji: originalPost.content.match(/[\u{1F600}-\u{1F64F}]/gu) !== null
        });
        newContent = result.content;
      } catch {
        // If AI fails, use original content
      }
    }

    // Create recycled post
    const newId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO social_media_posts (id, user_id, organization_id, customer_id, title, content, hashtags, status, scheduled_at, content_category, evergreen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8, $9, true)`,
      [
        newId,
        userId,
        organizationId,
        originalPost.customer_id,
        originalPost.title ? `${originalPost.title} (Recycled)` : null,
        newContent,
        originalPost.hashtags,
        new Date(scheduledAt),
        originalPost.content_category
      ]
    );

    // Update recycle count on original
    await pool.query(
      `UPDATE social_media_posts SET recycle_count = COALESCE(recycle_count, 0) + 1, last_recycled_at = NOW() WHERE id = $1`,
      [postId]
    );

    res.json({
      success: true,
      newPostId: newId,
      scheduledAt
    });
  } catch (error) {
    console.error('Recycle evergreen error:', error);
    res.status(500).json({ error: 'Failed to recycle content' });
  }
});

// ============================================
// Content Mix & Categories
// ============================================

// GET /api/social-media/analytics/content-mix - Get content mix distribution
router.get('/analytics/content-mix', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    // Get distribution by content category
    const categoryResult = await pool.query(
      `SELECT
         COALESCE(content_category, 'Uncategorized') as category,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE status = 'published') as published_count,
         AVG(COALESCE(
           (SELECT SUM(engagement_likes + engagement_comments + engagement_shares)
            FROM social_media_post_platforms WHERE post_id = p.id), 0
         )) as avg_engagement
       FROM social_media_posts p
       WHERE organization_id = $1
       GROUP BY content_category
       ORDER BY count DESC`,
      [organizationId]
    );

    // Get target mix from queue settings
    const settingsResult = await pool.query(
      `SELECT content_mix FROM social_media_queue_settings WHERE organization_id = $1`,
      [organizationId]
    );

    const targetMix = settingsResult.rows[0]?.content_mix || {
      educational: 40,
      promotional: 30,
      behindTheScenes: 20,
      news: 10
    };

    const totalPosts = categoryResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    const distribution = categoryResult.rows.map(row => ({
      category: row.category,
      count: parseInt(row.count),
      percentage: totalPosts > 0 ? Math.round((parseInt(row.count) / totalPosts) * 100) : 0,
      publishedCount: parseInt(row.published_count),
      avgEngagement: parseFloat(row.avg_engagement) || 0
    }));

    res.json({
      distribution,
      targetMix,
      totalPosts,
      recommendations: generateMixRecommendations(distribution, targetMix)
    });
  } catch (error) {
    console.error('Content mix analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze content mix' });
  }
});

function generateMixRecommendations(
  distribution: Array<{ category: string; percentage: number }>,
  targetMix: Record<string, number>
): string[] {
  const recommendations: string[] = [];

  Object.entries(targetMix).forEach(([category, target]) => {
    const actual = distribution.find(d => d.category.toLowerCase() === category.toLowerCase())?.percentage || 0;
    const diff = target - actual;

    if (diff > 10) {
      recommendations.push(`Mehr "${category}" Content erstellen (aktuell ${actual}%, Ziel ${target}%)`);
    } else if (diff < -10) {
      recommendations.push(`Weniger "${category}" Content (aktuell ${actual}%, Ziel ${target}%)`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push('Content-Mix ist gut ausbalanciert! ✓');
  }

  return recommendations;
}

// ============================================
// Post Performance Analytics
// ============================================

// GET /api/social-media/analytics/performance - Get overall performance metrics
router.get('/analytics/performance', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { period = '30' } = req.query;

    const days = parseInt(period as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Overall metrics
    const metricsResult = await pool.query(
      `SELECT
         COUNT(*) as total_posts,
         COUNT(*) FILTER (WHERE status = 'published') as published_posts,
         SUM(COALESCE(
           (SELECT SUM(engagement_likes) FROM social_media_post_platforms WHERE post_id = p.id), 0
         )) as total_likes,
         SUM(COALESCE(
           (SELECT SUM(engagement_comments) FROM social_media_post_platforms WHERE post_id = p.id), 0
         )) as total_comments,
         SUM(COALESCE(
           (SELECT SUM(engagement_shares) FROM social_media_post_platforms WHERE post_id = p.id), 0
         )) as total_shares
       FROM social_media_posts p
       WHERE organization_id = $1 AND created_at >= $2`,
      [organizationId, startDate.toISOString()]
    );

    // Top performing posts
    const topPostsResult = await pool.query(
      `SELECT p.id, p.title, p.content, p.published_at,
              COALESCE(
                (SELECT SUM(engagement_likes + engagement_comments + engagement_shares)
                 FROM social_media_post_platforms WHERE post_id = p.id), 0
              ) as total_engagement
       FROM social_media_posts p
       WHERE organization_id = $1 AND status = 'published' AND published_at >= $2
       ORDER BY total_engagement DESC
       LIMIT 5`,
      [organizationId, startDate.toISOString()]
    );

    // Daily posting trend
    const trendResult = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(*) as posts
       FROM social_media_posts
       WHERE organization_id = $1 AND created_at >= $2
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [organizationId, startDate.toISOString()]
    );

    const metrics = metricsResult.rows[0];
    res.json({
      period: days,
      metrics: {
        totalPosts: parseInt(metrics.total_posts) || 0,
        publishedPosts: parseInt(metrics.published_posts) || 0,
        totalLikes: parseInt(metrics.total_likes) || 0,
        totalComments: parseInt(metrics.total_comments) || 0,
        totalShares: parseInt(metrics.total_shares) || 0,
        totalEngagement: (parseInt(metrics.total_likes) || 0) + (parseInt(metrics.total_comments) || 0) + (parseInt(metrics.total_shares) || 0)
      },
      topPosts: topPostsResult.rows.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content?.substring(0, 100) + (row.content?.length > 100 ? '...' : ''),
        publishedAt: row.published_at,
        engagement: parseInt(row.total_engagement) || 0
      })),
      dailyTrend: trendResult.rows.map(row => ({
        date: row.date,
        posts: parseInt(row.posts)
      }))
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ error: 'Failed to get performance analytics' });
  }
});

export default router;
