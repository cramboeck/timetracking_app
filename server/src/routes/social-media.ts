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

// ============================================
// AUTOPILOT MODE
// ============================================

const autopilotSettingsSchema = z.object({
  enabled: z.boolean(),
  postsPerWeek: z.number().min(1).max(21),
  contentThemes: z.array(z.string()).min(1).max(10),
  targetAudience: z.string().optional(),
  brandVoice: z.string().optional(),
  approvalMode: z.enum(['auto', 'review']), // auto = publish directly, review = need approval
  platforms: z.array(z.enum(['linkedin', 'twitter', 'facebook', 'instagram'])),
  contentMix: z.object({
    educational: z.number().min(0).max(100),
    promotional: z.number().min(0).max(100),
    behindTheScenes: z.number().min(0).max(100),
    trending: z.number().min(0).max(100)
  }).optional()
});

// GET /api/social-media/autopilot/settings - Get autopilot settings
router.get('/autopilot/settings', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT * FROM social_media_autopilot_settings WHERE organization_id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      // Return default settings
      res.json({
        enabled: false,
        postsPerWeek: 5,
        contentThemes: [],
        targetAudience: '',
        brandVoice: 'professional',
        approvalMode: 'review',
        platforms: ['linkedin'],
        contentMix: { educational: 40, promotional: 20, behindTheScenes: 20, trending: 20 },
        generatedQueue: [],
        lastGenerated: null
      });
      return;
    }

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Get autopilot settings error:', error);
    res.status(500).json({ error: 'Failed to get autopilot settings' });
  }
});

// PUT /api/social-media/autopilot/settings - Update autopilot settings
router.put('/autopilot/settings', authenticateToken, attachOrganization, requireOrgRole('member'), validate(autopilotSettingsSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { enabled, postsPerWeek, contentThemes, targetAudience, brandVoice, approvalMode, platforms, contentMix } = req.body;

    const result = await pool.query(
      `INSERT INTO social_media_autopilot_settings
       (organization_id, enabled, posts_per_week, content_themes, target_audience, brand_voice, approval_mode, platforms, content_mix)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (organization_id)
       DO UPDATE SET
         enabled = $2, posts_per_week = $3, content_themes = $4, target_audience = $5,
         brand_voice = $6, approval_mode = $7, platforms = $8, content_mix = $9, updated_at = NOW()
       RETURNING *`,
      [organizationId, enabled, postsPerWeek, contentThemes, targetAudience, brandVoice, approvalMode, platforms, JSON.stringify(contentMix)]
    );

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Update autopilot settings error:', error);
    res.status(500).json({ error: 'Failed to update autopilot settings' });
  }
});

// POST /api/social-media/autopilot/generate - Generate autopilot content for the next period
router.post('/autopilot/generate', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;

    // Get autopilot settings
    const settingsResult = await pool.query(
      `SELECT * FROM social_media_autopilot_settings WHERE organization_id = $1`,
      [organizationId]
    );

    if (settingsResult.rows.length === 0 || !settingsResult.rows[0].enabled) {
      res.status(400).json({ error: 'Autopilot is not configured or enabled' });
      return;
    }

    const settings = transformRow(settingsResult.rows[0]);

    // Get successful past posts for style learning
    const pastPostsResult = await pool.query(
      `SELECT content, hashtags FROM social_media_posts
       WHERE organization_id = $1 AND status = 'published'
       ORDER BY created_at DESC LIMIT 20`,
      [organizationId]
    );

    const pastPosts = pastPostsResult.rows.map(r => r.content);

    // Generate content using AI
    const generatedPosts = await aiService.generateAutopilotContent(userId, {
      themes: settings.contentThemes,
      targetAudience: settings.targetAudience,
      brandVoice: settings.brandVoice,
      platforms: settings.platforms,
      postsCount: settings.postsPerWeek,
      contentMix: settings.contentMix,
      pastPosts: pastPosts.slice(0, 10)
    });

    // Schedule posts across the week
    const now = new Date();
    const createdPosts = [];
    const preferredHours = [9, 12, 15, 17]; // Best posting hours

    for (let i = 0; i < generatedPosts.length; i++) {
      const post = generatedPosts[i];
      const daysAhead = Math.floor(i / 2) + 1; // Spread across days
      const hourIndex = i % preferredHours.length;

      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + daysAhead);
      scheduledDate.setHours(preferredHours[hourIndex], 0, 0, 0);

      // Skip weekends if not desired (can be made configurable)
      while (scheduledDate.getDay() === 0 || scheduledDate.getDay() === 6) {
        scheduledDate.setDate(scheduledDate.getDate() + 1);
      }

      const status = settings.approvalMode === 'auto' ? 'scheduled' : 'draft';

      const result = await pool.query(
        `INSERT INTO social_media_posts
         (id, user_id, organization_id, content, hashtags, status, scheduled_at, ai_generated, ai_prompt, content_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
         RETURNING *`,
        [
          crypto.randomUUID(),
          userId,
          organizationId,
          post.content,
          post.hashtags,
          status,
          scheduledDate.toISOString(),
          `Autopilot: ${post.theme}`,
          post.category
        ]
      );

      createdPosts.push(transformRow(result.rows[0]));
    }

    // Update last generated timestamp
    await pool.query(
      `UPDATE social_media_autopilot_settings SET last_generated = NOW() WHERE organization_id = $1`,
      [organizationId]
    );

    res.json({
      success: true,
      generated: createdPosts.length,
      posts: createdPosts,
      message: settings.approvalMode === 'auto'
        ? `${createdPosts.length} Posts wurden automatisch geplant.`
        : `${createdPosts.length} Posts wurden als Entwürfe erstellt und warten auf Genehmigung.`
    });
  } catch (error) {
    console.error('Autopilot generate error:', error);
    res.status(500).json({ error: 'Failed to generate autopilot content' });
  }
});

// POST /api/social-media/autopilot/approve - Approve/reject autopilot drafts
router.post('/autopilot/approve', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { postIds, action } = req.body; // action: 'approve' | 'reject'

    if (action === 'approve') {
      await pool.query(
        `UPDATE social_media_posts SET status = 'scheduled'
         WHERE id = ANY($1) AND organization_id = $2 AND status = 'draft'`,
        [postIds, organizationId]
      );
    } else {
      await pool.query(
        `DELETE FROM social_media_posts WHERE id = ANY($1) AND organization_id = $2 AND status = 'draft'`,
        [postIds, organizationId]
      );
    }

    res.json({ success: true, action, count: postIds.length });
  } catch (error) {
    console.error('Autopilot approve error:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

// GET /api/social-media/autopilot/pending - Get pending autopilot posts for review
router.get('/autopilot/pending', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT * FROM social_media_posts
       WHERE organization_id = $1 AND status = 'draft' AND ai_generated = true AND ai_prompt LIKE 'Autopilot:%'
       ORDER BY scheduled_at`,
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get autopilot pending error:', error);
    res.status(500).json({ error: 'Failed to get pending posts' });
  }
});

// ============================================
// TREND-SURFER
// ============================================

// GET /api/social-media/trends - Get current trends
router.get('/trends', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const userId = req.user!.id;
    const { industry } = req.query;

    // Get trending topics using AI
    const trends = await aiService.getTrendingTopics(userId, industry as string || 'technology');

    res.json({ trends });
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

// POST /api/social-media/trends/generate - Generate content from a trend
router.post('/trends/generate', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { trend, platform, tone, angle } = req.body;

    // Get company context from past posts
    const pastPostsResult = await pool.query(
      `SELECT content FROM social_media_posts
       WHERE organization_id = $1 AND status = 'published'
       ORDER BY created_at DESC LIMIT 5`,
      [organizationId]
    );

    const companyContext = pastPostsResult.rows.map(r => r.content).join('\n');

    // Generate trend-based content
    const result = await aiService.generateTrendContent(userId, {
      trend,
      platform: platform || 'linkedin',
      tone: tone || 'professional',
      angle: angle || 'informative', // 'opinion', 'analysis', 'how-to', 'news'
      companyContext
    });

    res.json(result);
  } catch (error) {
    console.error('Generate trend content error:', error);
    res.status(500).json({ error: 'Failed to generate trend content' });
  }
});

// ============================================
// CONTENT-REMIX-ENGINE
// ============================================

const remixContentSchema = z.object({
  sourceContent: z.string().min(100).max(50000), // Long-form content (blog post, video transcript)
  sourceType: z.enum(['blog', 'transcript', 'article', 'newsletter']),
  outputFormats: z.array(z.object({
    platform: z.enum(['linkedin', 'twitter', 'facebook', 'instagram', 'newsletter']),
    count: z.number().min(1).max(20)
  })),
  preserveLinks: z.boolean().optional(),
  includeHashtags: z.boolean().optional()
});

// POST /api/social-media/remix - Remix long-form content into social posts
router.post('/remix', authenticateToken, attachOrganization, requireOrgRole('member'), validate(remixContentSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { sourceContent, sourceType, outputFormats, preserveLinks, includeHashtags } = req.body;

    // Generate remixed content for each platform
    const remixedContent = await aiService.remixContent(userId, {
      sourceContent,
      sourceType,
      outputFormats,
      preserveLinks: preserveLinks ?? true,
      includeHashtags: includeHashtags ?? true
    });

    res.json({
      success: true,
      sourceLength: sourceContent.length,
      sourceType,
      outputs: remixedContent
    });
  } catch (error) {
    console.error('Content remix error:', error);
    res.status(500).json({ error: 'Failed to remix content' });
  }
});

// POST /api/social-media/remix/save - Save remixed content as posts
router.post('/remix/save', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { posts, autoSchedule, startDate, postsPerDay } = req.body;

    const createdPosts = [];
    const now = new Date(startDate || new Date());
    const preferredHours = [9, 12, 15, 17];
    let dayOffset = 0;
    let postsToday = 0;

    for (const post of posts) {
      let scheduledAt = null;

      if (autoSchedule) {
        const scheduledDate = new Date(now);
        scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
        scheduledDate.setHours(preferredHours[postsToday % preferredHours.length], 0, 0, 0);

        // Skip weekends
        while (scheduledDate.getDay() === 0 || scheduledDate.getDay() === 6) {
          scheduledDate.setDate(scheduledDate.getDate() + 1);
        }

        scheduledAt = scheduledDate.toISOString();
        postsToday++;

        if (postsToday >= (postsPerDay || 2)) {
          postsToday = 0;
          dayOffset++;
        }
      }

      const result = await pool.query(
        `INSERT INTO social_media_posts
         (id, user_id, organization_id, content, hashtags, status, scheduled_at, ai_generated, ai_prompt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'Content Remix')
         RETURNING *`,
        [
          crypto.randomUUID(),
          userId,
          organizationId,
          post.content,
          post.hashtags || [],
          scheduledAt ? 'scheduled' : 'draft',
          scheduledAt
        ]
      );

      createdPosts.push(transformRow(result.rows[0]));
    }

    res.json({
      success: true,
      created: createdPosts.length,
      posts: createdPosts
    });
  } catch (error) {
    console.error('Save remixed posts error:', error);
    res.status(500).json({ error: 'Failed to save remixed posts' });
  }
});

// ============================================
// COMPETITOR ANALYSIS
// ============================================

const competitorSchema = z.object({
  name: z.string().min(1).max(200),
  profiles: z.object({
    linkedin: z.string().optional(),
    twitter: z.string().optional(),
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    website: z.string().optional()
  }),
  notes: z.string().optional()
});

// GET /api/social-media/competitors - Get tracked competitors
router.get('/competitors', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT * FROM social_media_competitors WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get competitors error:', error);
    res.status(500).json({ error: 'Failed to get competitors' });
  }
});

// POST /api/social-media/competitors - Add a competitor to track
router.post('/competitors', authenticateToken, attachOrganization, requireOrgRole('member'), validate(competitorSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { name, profiles, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO social_media_competitors (id, organization_id, name, profiles, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [crypto.randomUUID(), organizationId, name, JSON.stringify(profiles), notes]
    );

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Add competitor error:', error);
    res.status(500).json({ error: 'Failed to add competitor' });
  }
});

// DELETE /api/social-media/competitors/:id - Delete a competitor
router.delete('/competitors/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    await pool.query(
      `DELETE FROM social_media_competitors WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete competitor error:', error);
    res.status(500).json({ error: 'Failed to delete competitor' });
  }
});

// POST /api/social-media/competitors/:id/analyze - Analyze competitor and generate similar content
router.post('/competitors/:id/analyze', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { id } = req.params;
    const { samplePosts, platform } = req.body; // User provides sample posts from competitor

    // Get competitor info
    const competitorResult = await pool.query(
      `SELECT * FROM social_media_competitors WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (competitorResult.rows.length === 0) {
      res.status(404).json({ error: 'Competitor not found' });
      return;
    }

    const competitor = transformRow(competitorResult.rows[0]);

    // Get our own posts for brand voice
    const ourPostsResult = await pool.query(
      `SELECT content FROM social_media_posts
       WHERE organization_id = $1 AND status = 'published'
       ORDER BY created_at DESC LIMIT 10`,
      [organizationId]
    );

    const ourBrandVoice = ourPostsResult.rows.map(r => r.content);

    // Analyze competitor posts and generate inspired content
    const analysis = await aiService.analyzeCompetitorAndGenerate(userId, {
      competitorName: competitor.name,
      competitorPosts: samplePosts,
      ourBrandVoice,
      platform: platform || 'linkedin',
      generateCount: 5
    });

    // Save analysis
    await pool.query(
      `UPDATE social_media_competitors SET last_analyzed = NOW(), analysis_data = $1 WHERE id = $2`,
      [JSON.stringify(analysis.insights), id]
    );

    res.json(analysis);
  } catch (error) {
    console.error('Competitor analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze competitor' });
  }
});

// ============================================
// SMART ENGAGEMENT BOT
// ============================================

const engagementSettingsSchema = z.object({
  enabled: z.boolean(),
  platforms: z.array(z.enum(['linkedin', 'twitter'])),
  targetKeywords: z.array(z.string()).min(1).max(20),
  targetAccounts: z.array(z.string()).max(50), // Accounts to engage with
  responseStyle: z.enum(['thoughtful', 'supportive', 'inquisitive', 'expert']),
  dailyLimit: z.number().min(1).max(50),
  excludeKeywords: z.array(z.string()).optional()
});

// GET /api/social-media/engagement/settings - Get engagement bot settings
router.get('/engagement/settings', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT * FROM social_media_engagement_settings WHERE organization_id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      res.json({
        enabled: false,
        platforms: [],
        targetKeywords: [],
        targetAccounts: [],
        responseStyle: 'thoughtful',
        dailyLimit: 10,
        excludeKeywords: []
      });
      return;
    }

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Get engagement settings error:', error);
    res.status(500).json({ error: 'Failed to get engagement settings' });
  }
});

// PUT /api/social-media/engagement/settings - Update engagement bot settings
router.put('/engagement/settings', authenticateToken, attachOrganization, requireOrgRole('member'), validate(engagementSettingsSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { enabled, platforms, targetKeywords, targetAccounts, responseStyle, dailyLimit, excludeKeywords } = req.body;

    const result = await pool.query(
      `INSERT INTO social_media_engagement_settings
       (organization_id, enabled, platforms, target_keywords, target_accounts, response_style, daily_limit, exclude_keywords)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id)
       DO UPDATE SET
         enabled = $2, platforms = $3, target_keywords = $4, target_accounts = $5,
         response_style = $6, daily_limit = $7, exclude_keywords = $8, updated_at = NOW()
       RETURNING *`,
      [organizationId, enabled, platforms, targetKeywords, targetAccounts, responseStyle, dailyLimit, excludeKeywords || []]
    );

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Update engagement settings error:', error);
    res.status(500).json({ error: 'Failed to update engagement settings' });
  }
});

// POST /api/social-media/engagement/generate - Generate engagement responses
router.post('/engagement/generate', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { posts } = req.body; // Array of posts to generate responses for

    // Get engagement settings
    const settingsResult = await pool.query(
      `SELECT * FROM social_media_engagement_settings WHERE organization_id = $1`,
      [organizationId]
    );

    const settings = settingsResult.rows.length > 0
      ? transformRow(settingsResult.rows[0])
      : { responseStyle: 'thoughtful' };

    // Get our brand voice from past posts
    const ourPostsResult = await pool.query(
      `SELECT content FROM social_media_posts
       WHERE organization_id = $1 AND status = 'published'
       ORDER BY created_at DESC LIMIT 10`,
      [organizationId]
    );

    const brandVoice = ourPostsResult.rows.map(r => r.content);

    // Generate responses
    const responses = await aiService.generateEngagementResponses(userId, {
      posts,
      style: settings.responseStyle,
      brandVoice
    });

    res.json({ responses });
  } catch (error) {
    console.error('Generate engagement responses error:', error);
    res.status(500).json({ error: 'Failed to generate engagement responses' });
  }
});

// GET /api/social-media/engagement/history - Get engagement history
router.get('/engagement/history', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;

    const result = await pool.query(
      `SELECT * FROM social_media_engagement_history
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [organizationId]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get engagement history error:', error);
    res.status(500).json({ error: 'Failed to get engagement history' });
  }
});

// POST /api/social-media/engagement/log - Log an engagement action
router.post('/engagement/log', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { platform, postUrl, authorName, originalContent, responseContent, responseType } = req.body;

    const result = await pool.query(
      `INSERT INTO social_media_engagement_history
       (id, organization_id, platform, post_url, author_name, original_content, response_content, response_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [crypto.randomUUID(), organizationId, platform, postUrl, authorName, originalContent, responseContent, responseType]
    );

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Log engagement error:', error);
    res.status(500).json({ error: 'Failed to log engagement' });
  }
});

// ============================================
// Carousel Generator Routes
// ============================================

const carouselOptionsSchema = z.object({
  topic: z.string().min(1).max(500),
  platform: z.enum(['instagram', 'linkedin']),
  slideCount: z.number().min(3).max(15).default(7),
  style: z.enum(['educational', 'storytelling', 'listicle', 'how-to', 'tips', 'myth-busting']),
  tone: z.enum(['professional', 'casual', 'inspirational', 'bold']),
  targetAudience: z.string().optional(),
  brandColors: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional()
  }).optional(),
  includeEmojis: z.boolean().default(true)
});

// POST /api/social-media/carousel/generate - Generate carousel content
router.post('/carousel/generate', authenticateToken, attachOrganization, requireOrgRole('member'), validate(carouselOptionsSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const options = req.body;

    const carousel = await aiService.generateCarouselContent(userId, options);

    res.json(carousel);
  } catch (error: any) {
    console.error('Generate carousel error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate carousel' });
  }
});

// POST /api/social-media/carousel/generate-images - Generate images for carousel slides
router.post('/carousel/generate-images', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { slides, style, colorScheme } = req.body;

    if (!slides || !Array.isArray(slides)) {
      return res.status(400).json({ error: 'Slides array is required' });
    }

    const images = await aiService.generateCarouselSlideImages(
      userId,
      slides,
      style || 'modern',
      colorScheme || { primary: '#1a365d', secondary: '#2563eb' }
    );

    res.json({ images });
  } catch (error: any) {
    console.error('Generate carousel images error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate carousel images' });
  }
});

// POST /api/social-media/carousel/save - Save carousel as draft post
router.post('/carousel/save', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { carousel, scheduleAt } = req.body;

    if (!carousel) {
      return res.status(400).json({ error: 'Carousel content is required' });
    }

    // Create post with carousel metadata
    const postId = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO social_media_posts
       (id, organization_id, title, content, hashtags, status, scheduled_at, ai_generated, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        postId,
        organizationId,
        carousel.title || 'Carousel Post',
        carousel.caption,
        carousel.hashtags,
        scheduleAt ? 'scheduled' : 'draft',
        scheduleAt || null,
        true,
        JSON.stringify({
          type: 'carousel',
          platform: carousel.platform,
          slides: carousel.slides,
          colorScheme: carousel.colorScheme,
          designTips: carousel.designTips,
          canvaInstructions: carousel.canvaInstructions,
          totalSlides: carousel.totalSlides
        })
      ]
    );

    // Add platform
    await pool.query(
      `INSERT INTO social_media_post_platforms (id, post_id, platform, status)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), postId, carousel.platform, scheduleAt ? 'scheduled' : 'draft']
    );

    res.json(transformRow(result.rows[0]));
  } catch (error: any) {
    console.error('Save carousel error:', error);
    res.status(500).json({ error: error.message || 'Failed to save carousel' });
  }
});

// GET /api/social-media/carousel/export/:format - Export carousel in different formats
router.get('/carousel/export/:format', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const { format } = req.params;
    const carouselData = req.query.data ? JSON.parse(req.query.data as string) : null;

    if (!carouselData) {
      return res.status(400).json({ error: 'Carousel data is required' });
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="carousel-${Date.now()}.json"`);
      res.json(carouselData);
    } else if (format === 'text') {
      // Text format for easy copy-paste to Canva
      let textContent = `# ${carouselData.title}\n\n`;
      textContent += `Platform: ${carouselData.platform}\n`;
      textContent += `Total Slides: ${carouselData.totalSlides}\n\n`;
      textContent += `## Farbschema\n`;
      textContent += `Primär: ${carouselData.colorScheme?.primary}\n`;
      textContent += `Sekundär: ${carouselData.colorScheme?.secondary}\n`;
      textContent += `Akzent: ${carouselData.colorScheme?.accent}\n`;
      textContent += `Hintergrund: ${carouselData.colorScheme?.background}\n`;
      textContent += `Text: ${carouselData.colorScheme?.text}\n\n`;
      textContent += `---\n\n`;

      carouselData.slides?.forEach((slide: any) => {
        textContent += `## Slide ${slide.slideNumber} (${slide.type})\n`;
        if (slide.emoji) textContent += `Emoji: ${slide.emoji}\n`;
        textContent += `### ${slide.headline}\n`;
        textContent += `${slide.body}\n`;
        if (slide.bulletPoints?.length) {
          textContent += `\nBullet Points:\n`;
          slide.bulletPoints.forEach((bp: string) => {
            textContent += `• ${bp}\n`;
          });
        }
        if (slide.designNote) textContent += `\nDesign-Hinweis: ${slide.designNote}\n`;
        textContent += `\n---\n\n`;
      });

      textContent += `## Caption\n${carouselData.caption}\n\n`;
      textContent += `## Hashtags\n${carouselData.hashtags?.map((h: string) => `#${h}`).join(' ')}\n\n`;
      textContent += `## Canva-Anleitung\n${carouselData.canvaInstructions}\n\n`;
      textContent += `## Design-Tipps\n`;
      carouselData.designTips?.forEach((tip: string) => {
        textContent += `• ${tip}\n`;
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="carousel-${Date.now()}.txt"`);
      res.send(textContent);
    } else {
      res.status(400).json({ error: 'Unsupported format. Use json or text.' });
    }
  } catch (error: any) {
    console.error('Export carousel error:', error);
    res.status(500).json({ error: error.message || 'Failed to export carousel' });
  }
});

// ============================================
// Stories Routes
// ============================================

// Validation schemas for Stories
const createStorySchema = z.object({
  title: z.string().max(200).optional(),
  contentType: z.enum(['image', 'video', 'carousel', 'poll', 'quiz', 'countdown', 'link']),
  mediaUrls: z.array(z.string()).optional(),
  textOverlays: z.array(z.object({
    text: z.string(),
    position: z.enum(['top', 'center', 'bottom']),
    style: z.enum(['bold', 'normal', 'highlight']).optional()
  })).optional(),
  backgroundColor: z.string().optional(),
  backgroundGradient: z.string().optional(),
  musicSuggestion: z.string().optional(),
  stickers: z.array(z.string()).optional(),
  linkUrl: z.string().url().optional(),
  linkText: z.string().optional(),
  pollQuestion: z.string().optional(),
  pollOptions: z.array(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  platforms: z.array(z.string()).optional(),
  durationSeconds: z.number().min(1).max(60).optional(),
  aiGenerated: z.boolean().optional(),
  aiPrompt: z.string().optional()
});

const generateStorySchema = z.object({
  topic: z.string().min(1).max(500),
  platform: z.enum(['instagram', 'facebook', 'linkedin']),
  storyType: z.enum(['promotional', 'educational', 'behind-the-scenes', 'announcement', 'poll', 'quote']),
  brandVoice: z.string().optional(),
  targetAudience: z.string().optional(),
  includeCallToAction: z.boolean().optional()
});

const generateImageSchema = z.object({
  prompt: z.string().min(1).max(1000),
  provider: z.enum(['openai', 'stability']).optional(),
  style: z.enum(['modern', 'minimalist', 'vibrant', 'professional', 'artistic', 'photorealistic']).optional(),
  aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:5']),
  quality: z.enum(['standard', 'hd']).optional()
});

const imagePromptSuggestionsSchema = z.object({
  topic: z.string().min(1).max(500),
  style: z.string().optional(),
  count: z.number().min(1).max(10).optional()
});

// GET /api/social-media/stories - Get all stories
router.get('/stories', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { status, platform } = req.query;

    let queryText = `SELECT * FROM social_media_stories WHERE organization_id = $1`;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      queryText += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (platform) {
      queryText += ` AND platforms ? $${paramIndex}`;
      params.push(platform);
    }

    queryText += ` ORDER BY created_at DESC`;

    const result = await pool.query(queryText, params);
    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({ error: 'Failed to get stories' });
  }
});

// POST /api/social-media/stories - Create a new story
router.post('/stories', authenticateToken, attachOrganization, requireOrgRole('member'), validate(createStorySchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const data = req.body;

    const result = await pool.query(
      `INSERT INTO social_media_stories
       (id, organization_id, user_id, title, content_type, media_urls, text_overlays,
        background_color, background_gradient, music_suggestion, stickers, link_url, link_text,
        poll_question, poll_options, scheduled_at, platforms, status, duration_seconds,
        ai_generated, ai_prompt)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [
        crypto.randomUUID(), organizationId, userId, data.title, data.contentType,
        JSON.stringify(data.mediaUrls || []), JSON.stringify(data.textOverlays || []),
        data.backgroundColor, data.backgroundGradient, data.musicSuggestion,
        JSON.stringify(data.stickers || []), data.linkUrl, data.linkText,
        data.pollQuestion, JSON.stringify(data.pollOptions || []),
        data.scheduledAt, JSON.stringify(data.platforms || ['instagram']),
        data.scheduledAt ? 'scheduled' : 'draft', data.durationSeconds || 15,
        data.aiGenerated || false, data.aiPrompt
      ]
    );

    res.status(201).json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ error: 'Failed to create story' });
  }
});

// PUT /api/social-media/stories/:id - Update a story
router.put('/stories/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;
    const data = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'title', 'content_type', 'media_urls', 'text_overlays', 'background_color',
      'background_gradient', 'music_suggestion', 'stickers', 'link_url', 'link_text',
      'poll_question', 'poll_options', 'scheduled_at', 'platforms', 'status', 'duration_seconds'
    ];

    const fieldMap: Record<string, string> = {
      title: 'title',
      contentType: 'content_type',
      mediaUrls: 'media_urls',
      textOverlays: 'text_overlays',
      backgroundColor: 'background_color',
      backgroundGradient: 'background_gradient',
      musicSuggestion: 'music_suggestion',
      stickers: 'stickers',
      linkUrl: 'link_url',
      linkText: 'link_text',
      pollQuestion: 'poll_question',
      pollOptions: 'poll_options',
      scheduledAt: 'scheduled_at',
      platforms: 'platforms',
      status: 'status',
      durationSeconds: 'duration_seconds'
    };

    for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
      if (data[camelKey] !== undefined) {
        const value = ['mediaUrls', 'textOverlays', 'stickers', 'pollOptions', 'platforms'].includes(camelKey)
          ? JSON.stringify(data[camelKey])
          : data[camelKey];
        updates.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id, organizationId);

    const result = await pool.query(
      `UPDATE social_media_stories SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Update story error:', error);
    res.status(500).json({ error: 'Failed to update story' });
  }
});

// DELETE /api/social-media/stories/:id - Delete a story
router.delete('/stories/:id', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM social_media_stories WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete story error:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

// POST /api/social-media/stories/generate - Generate story content with AI
router.post('/stories/generate', authenticateToken, attachOrganization, requireOrgRole('member'), validate(generateStorySchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const options = req.body;

    const story = await aiService.generateStoryContent(userId, options);
    res.json(story);
  } catch (error: any) {
    console.error('Generate story error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate story content' });
  }
});

// ============================================
// AI Image Generation Routes
// ============================================

// POST /api/social-media/images/generate - Generate an AI image
router.post('/images/generate', authenticateToken, attachOrganization, requireOrgRole('member'), validate(generateImageSchema), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const options = req.body;

    const image = await aiService.generateImage(userId, {
      prompt: options.prompt,
      provider: options.provider || 'openai',
      style: options.style || 'modern',
      aspectRatio: options.aspectRatio,
      quality: options.quality || 'hd'
    });

    // Save to history
    await pool.query(
      `INSERT INTO social_media_generated_images
       (id, organization_id, user_id, prompt, revised_prompt, provider, model, image_url, aspect_ratio, style, cost_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        crypto.randomUUID(), organizationId, userId, options.prompt, image.revisedPrompt,
        image.provider, image.model, image.url, options.aspectRatio, options.style, image.costCents
      ]
    );

    res.json(image);
  } catch (error: any) {
    console.error('Generate image error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
});

// POST /api/social-media/images/suggestions - Get AI-generated image prompt suggestions
router.post('/images/suggestions', authenticateToken, attachOrganization, requireOrgRole('member'), validate(imagePromptSuggestionsSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { topic, style, count } = req.body;

    const suggestions = await aiService.generateImagePromptSuggestions(
      userId,
      topic,
      style || 'modern',
      count || 5
    );

    res.json({ suggestions });
  } catch (error: any) {
    console.error('Generate suggestions error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate suggestions' });
  }
});

// GET /api/social-media/images/history - Get image generation history
router.get('/images/history', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { limit = 50 } = req.query;

    const result = await pool.query(
      `SELECT * FROM social_media_generated_images
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [organizationId, parseInt(limit as string)]
    );

    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get image history error:', error);
    res.status(500).json({ error: 'Failed to get image history' });
  }
});

// ============================================
// Story Templates Routes
// ============================================

// GET /api/social-media/story-templates - Get story templates
router.get('/story-templates', authenticateToken, attachOrganization, async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const { category, contentType } = req.query;

    let queryText = `SELECT * FROM social_media_story_templates
                     WHERE (organization_id = $1 OR is_system = true)`;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (category) {
      queryText += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (contentType) {
      queryText += ` AND content_type = $${paramIndex}`;
      params.push(contentType);
    }

    queryText += ` ORDER BY is_system DESC, usage_count DESC`;

    const result = await pool.query(queryText, params);
    res.json(transformRows(result.rows));
  } catch (error) {
    console.error('Get story templates error:', error);
    res.status(500).json({ error: 'Failed to get story templates' });
  }
});

// POST /api/social-media/story-templates - Create a story template
router.post('/story-templates', authenticateToken, attachOrganization, requireOrgRole('member'), async (req: AuthRequest, res) => {
  try {
    const orgReq = req as unknown as OrganizationRequest;
    const organizationId = orgReq.organization.id;
    const userId = req.user!.id;
    const { name, description, category, contentType, layout, textStyles, colorScheme, previewUrl } = req.body;

    const result = await pool.query(
      `INSERT INTO social_media_story_templates
       (id, organization_id, user_id, name, description, category, content_type, layout, text_styles, color_scheme, preview_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        crypto.randomUUID(), organizationId, userId, name, description, category,
        contentType, JSON.stringify(layout), JSON.stringify(textStyles || {}),
        JSON.stringify(colorScheme || {}), previewUrl
      ]
    );

    res.status(201).json(transformRow(result.rows[0]));
  } catch (error) {
    console.error('Create story template error:', error);
    res.status(500).json({ error: 'Failed to create story template' });
  }
});

// ============================================
// Content Wizard Routes (Marketing Expert AI)
// ============================================

// POST /api/social-media/wizard/analyze - Analyze content with marketing expert
router.post('/wizard/analyze', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { content, platform, goal, targetAudience } = req.body;

    if (!content || !platform || !goal) {
      return res.status(400).json({
        error: 'Content, platform, and goal are required'
      });
    }

    const analysis = await aiService.analyzeContentAsExpert(
      userId,
      content,
      platform,
      goal,
      targetAudience
    );

    res.json(analysis);
  } catch (error: any) {
    console.error('Analyze content error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze content' });
  }
});

// POST /api/social-media/wizard/generate - Generate complete content package
router.post('/wizard/generate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const {
      topic,
      platform,
      goal,
      targetAudience,
      tone,
      includeImage,
      includeHashtags,
      contentLength
    } = req.body;

    if (!topic || !platform || !goal) {
      return res.status(400).json({
        error: 'Topic, platform, and goal are required'
      });
    }

    const content = await aiService.generateWizardContent(userId, {
      topic,
      platform,
      goal,
      targetAudience,
      tone,
      includeImage: includeImage ?? true,
      includeHashtags: includeHashtags ?? true,
      contentLength: contentLength || 'medium'
    });

    res.json(content);
  } catch (error: any) {
    console.error('Generate wizard content error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate content' });
  }
});

// POST /api/social-media/wizard/improve - Improve content based on feedback focus
router.post('/wizard/improve', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { content, platform, improvementFocus, targetAudience, goal } = req.body;

    if (!content || !platform || !improvementFocus) {
      return res.status(400).json({
        error: 'Content, platform, and improvementFocus are required'
      });
    }

    const improved = await aiService.improveContentWithExpert(
      userId,
      content,
      platform,
      improvementFocus,
      targetAudience,
      goal
    );

    res.json(improved);
  } catch (error: any) {
    console.error('Improve content error:', error);
    res.status(500).json({ error: error.message || 'Failed to improve content' });
  }
});

// POST /api/social-media/wizard/auto-improve - Automatically improve content with self-improvement loop
router.post('/wizard/auto-improve', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { content, platform, goal, targetAudience, minScore, maxIterations } = req.body;

    if (!content || !platform || !goal) {
      return res.status(400).json({
        error: 'Content, platform, and goal are required'
      });
    }

    const result = await aiService.autoImproveContent(
      userId,
      content,
      platform,
      goal,
      targetAudience,
      minScore || 75,
      maxIterations || 3
    );

    res.json(result);
  } catch (error: any) {
    console.error('Auto-improve content error:', error);
    res.status(500).json({ error: error.message || 'Failed to auto-improve content' });
  }
});

// POST /api/social-media/wizard/generate-image - Generate image for content
router.post('/wizard/generate-image', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { prompt, aspectRatio, style, quality } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const image = await aiService.generateImage(userId, {
      prompt,
      aspectRatio: aspectRatio || '1:1',
      style: style || 'modern',
      quality: quality || 'standard'
    });

    res.json(image);
  } catch (error: any) {
    console.error('Generate wizard image error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
});

export default router;
