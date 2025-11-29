import { Router, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { CustomerAuthRequest, authenticateCustomerToken } from '../middleware/customerAuth';

const router = Router();

// Helper to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[char] || char))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

// Transform functions
function transformCategory(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sort_order,
    isPublic: row.is_public,
    articleCount: parseInt(row.article_count) || 0,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

function transformArticle(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    title: row.title,
    slug: row.slug,
    content: row.content,
    excerpt: row.excerpt,
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    viewCount: row.view_count,
    helpfulYes: row.helpful_yes,
    helpfulNo: row.helpful_no,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    publishedAt: row.published_at?.toISOString(),
  };
}

// ============================================================================
// ADMIN ROUTES (for service provider)
// ============================================================================

// GET /api/knowledge-base/categories - Get all categories for user
router.get('/categories', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM kb_articles a WHERE a.category_id = c.id) as article_count
      FROM kb_categories c
      WHERE c.user_id = $1
      ORDER BY c.sort_order ASC, c.name ASC
    `, [userId]);

    res.json({ success: true, data: result.rows.map(transformCategory) });
  } catch (error) {
    console.error('Error fetching KB categories:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// POST /api/knowledge-base/categories - Create category
router.post('/categories', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, description, icon, sortOrder, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const id = crypto.randomUUID();
    const result = await pool.query(`
      INSERT INTO kb_categories (id, user_id, name, description, icon, sort_order, is_public)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, userId, name, description || null, icon || 'folder', sortOrder || 0, isPublic !== false]);

    res.status(201).json({ success: true, data: transformCategory(result.rows[0]) });
  } catch (error) {
    console.error('Error creating KB category:', error);
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
});

// PUT /api/knowledge-base/categories/:id - Update category
router.put('/categories/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, description, icon, sortOrder, isPublic } = req.body;

    const result = await pool.query(`
      UPDATE kb_categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        icon = COALESCE($3, icon),
        sort_order = COALESCE($4, sort_order),
        is_public = COALESCE($5, is_public),
        updated_at = NOW()
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `, [name, description, icon, sortOrder, isPublic, id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: transformCategory(result.rows[0]) });
  } catch (error) {
    console.error('Error updating KB category:', error);
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
});

// DELETE /api/knowledge-base/categories/:id - Delete category
router.delete('/categories/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM kb_categories WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting KB category:', error);
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  }
});

// GET /api/knowledge-base/articles - Get all articles for user
router.get('/articles', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { categoryId, published } = req.query;

    let query = `
      SELECT a.*, c.name as category_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON a.category_id = c.id
      WHERE a.user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (categoryId) {
      query += ` AND a.category_id = $${paramIndex}`;
      params.push(categoryId);
      paramIndex++;
    }

    if (published === 'true') {
      query += ` AND a.is_published = TRUE`;
    } else if (published === 'false') {
      query += ` AND a.is_published = FALSE`;
    }

    query += ` ORDER BY a.updated_at DESC`;

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows.map(transformArticle) });
  } catch (error) {
    console.error('Error fetching KB articles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch articles' });
  }
});

// GET /api/knowledge-base/articles/:id - Get single article
router.get('/articles/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(`
      SELECT a.*, c.name as category_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON a.category_id = c.id
      WHERE a.id = $1 AND a.user_id = $2
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    res.json({ success: true, data: transformArticle(result.rows[0]) });
  } catch (error) {
    console.error('Error fetching KB article:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch article' });
  }
});

// POST /api/knowledge-base/articles - Create article
router.post('/articles', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { categoryId, title, content, excerpt, isPublished, isFeatured } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }

    const id = crypto.randomUUID();
    let slug = generateSlug(title);

    // Ensure unique slug
    const existingSlug = await pool.query(
      'SELECT id FROM kb_articles WHERE user_id = $1 AND slug = $2',
      [userId, slug]
    );
    if (existingSlug.rows.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    const publishedAt = isPublished ? new Date() : null;

    const result = await pool.query(`
      INSERT INTO kb_articles (id, user_id, category_id, title, slug, content, excerpt, is_published, is_featured, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [id, userId, categoryId || null, title, slug, content, excerpt || null, isPublished || false, isFeatured || false, publishedAt]);

    res.status(201).json({ success: true, data: transformArticle(result.rows[0]) });
  } catch (error) {
    console.error('Error creating KB article:', error);
    res.status(500).json({ success: false, error: 'Failed to create article' });
  }
});

// PUT /api/knowledge-base/articles/:id - Update article
router.put('/articles/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { categoryId, title, content, excerpt, isPublished, isFeatured } = req.body;

    // Get current article to check published state
    const current = await pool.query(
      'SELECT is_published FROM kb_articles WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    // Set published_at if publishing for first time
    let publishedAtUpdate = '';
    const params: any[] = [];
    if (isPublished && !current.rows[0].is_published) {
      publishedAtUpdate = ', published_at = NOW()';
    }

    const result = await pool.query(`
      UPDATE kb_articles SET
        category_id = COALESCE($1, category_id),
        title = COALESCE($2, title),
        content = COALESCE($3, content),
        excerpt = COALESCE($4, excerpt),
        is_published = COALESCE($5, is_published),
        is_featured = COALESCE($6, is_featured),
        updated_at = NOW()
        ${publishedAtUpdate}
      WHERE id = $7 AND user_id = $8
      RETURNING *
    `, [categoryId, title, content, excerpt, isPublished, isFeatured, id, userId]);

    res.json({ success: true, data: transformArticle(result.rows[0]) });
  } catch (error) {
    console.error('Error updating KB article:', error);
    res.status(500).json({ success: false, error: 'Failed to update article' });
  }
});

// DELETE /api/knowledge-base/articles/:id - Delete article
router.delete('/articles/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM kb_articles WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    res.json({ success: true, message: 'Article deleted' });
  } catch (error) {
    console.error('Error deleting KB article:', error);
    res.status(500).json({ success: false, error: 'Failed to delete article' });
  }
});

// ============================================================================
// PUBLIC PORTAL ROUTES (for customers)
// ============================================================================

// GET /api/knowledge-base/public/:userId - Get public KB for a user
router.get('/public/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get categories with article counts
    const categoriesResult = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM kb_articles a WHERE a.category_id = c.id AND a.is_published = TRUE) as article_count
      FROM kb_categories c
      WHERE c.user_id = $1 AND c.is_public = TRUE
      ORDER BY c.sort_order ASC, c.name ASC
    `, [userId]);

    // Get featured articles
    const featuredResult = await pool.query(`
      SELECT a.*, c.name as category_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON a.category_id = c.id
      WHERE a.user_id = $1 AND a.is_published = TRUE AND a.is_featured = TRUE
      ORDER BY a.view_count DESC
      LIMIT 5
    `, [userId]);

    // Get recent articles
    const recentResult = await pool.query(`
      SELECT a.*, c.name as category_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON a.category_id = c.id
      WHERE a.user_id = $1 AND a.is_published = TRUE
      ORDER BY a.published_at DESC
      LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      data: {
        categories: categoriesResult.rows.map(transformCategory),
        featuredArticles: featuredResult.rows.map(transformArticle),
        recentArticles: recentResult.rows.map(transformArticle),
      }
    });
  } catch (error) {
    console.error('Error fetching public KB:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch knowledge base' });
  }
});

// GET /api/knowledge-base/public/:userId/articles - Get articles by category
router.get('/public/:userId/articles', async (req, res) => {
  try {
    const { userId } = req.params;
    const { categoryId, search } = req.query;

    let query = `
      SELECT a.*, c.name as category_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON a.category_id = c.id
      WHERE a.user_id = $1 AND a.is_published = TRUE
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (categoryId) {
      query += ` AND a.category_id = $${paramIndex}`;
      params.push(categoryId);
      paramIndex++;
    }

    if (search && typeof search === 'string' && search.length >= 2) {
      query += ` AND (LOWER(a.title) LIKE $${paramIndex} OR LOWER(a.content) LIKE $${paramIndex})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIndex++;
    }

    query += ` ORDER BY a.view_count DESC, a.published_at DESC`;

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows.map(transformArticle) });
  } catch (error) {
    console.error('Error fetching public KB articles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch articles' });
  }
});

// GET /api/knowledge-base/public/:userId/articles/:slug - Get single article by slug
router.get('/public/:userId/articles/:slug', async (req, res) => {
  try {
    const { userId, slug } = req.params;

    const result = await pool.query(`
      SELECT a.*, c.name as category_name
      FROM kb_articles a
      LEFT JOIN kb_categories c ON a.category_id = c.id
      WHERE a.user_id = $1 AND a.slug = $2 AND a.is_published = TRUE
    `, [userId, slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    // Increment view count
    await pool.query(
      'UPDATE kb_articles SET view_count = view_count + 1 WHERE id = $1',
      [result.rows[0].id]
    );

    res.json({ success: true, data: transformArticle(result.rows[0]) });
  } catch (error) {
    console.error('Error fetching public KB article:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch article' });
  }
});

// POST /api/knowledge-base/public/:userId/articles/:slug/feedback - Rate article helpfulness
router.post('/public/:userId/articles/:slug/feedback', async (req, res) => {
  try {
    const { userId, slug } = req.params;
    const { helpful } = req.body;

    if (helpful === undefined) {
      return res.status(400).json({ success: false, error: 'helpful field is required' });
    }

    const column = helpful ? 'helpful_yes' : 'helpful_no';

    const result = await pool.query(`
      UPDATE kb_articles SET ${column} = ${column} + 1
      WHERE user_id = $1 AND slug = $2 AND is_published = TRUE
      RETURNING helpful_yes, helpful_no
    `, [userId, slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    res.json({
      success: true,
      data: {
        helpfulYes: result.rows[0].helpful_yes,
        helpfulNo: result.rows[0].helpful_no,
      }
    });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to record feedback' });
  }
});

// ============================================================================
// PORTAL SETTINGS / BRANDING
// ============================================================================

// Transform portal settings
function transformPortalSettings(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    welcomeMessage: row.welcome_message,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    showKnowledgeBase: row.show_knowledge_base,
    requireLoginForKb: row.require_login_for_kb,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

// GET /api/knowledge-base/portal-settings - Get portal settings for user (admin)
router.get('/portal-settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await pool.query(
      'SELECT * FROM portal_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default settings
      return res.json({
        success: true,
        data: {
          userId,
          companyName: null,
          welcomeMessage: null,
          logoUrl: null,
          primaryColor: '#3b82f6',
          showKnowledgeBase: true,
          requireLoginForKb: false,
        }
      });
    }

    res.json({ success: true, data: transformPortalSettings(result.rows[0]) });
  } catch (error) {
    console.error('Error fetching portal settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch portal settings' });
  }
});

// PUT /api/knowledge-base/portal-settings - Update portal settings (admin)
router.put('/portal-settings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { companyName, welcomeMessage, logoUrl, primaryColor, showKnowledgeBase, requireLoginForKb } = req.body;

    // Check if settings exist
    const existing = await pool.query(
      'SELECT id FROM portal_settings WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existing.rows.length === 0) {
      // Create new settings
      const id = crypto.randomUUID();
      result = await pool.query(`
        INSERT INTO portal_settings (id, user_id, company_name, welcome_message, logo_url, primary_color, show_knowledge_base, require_login_for_kb)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [id, userId, companyName || null, welcomeMessage || null, logoUrl || null, primaryColor || '#3b82f6', showKnowledgeBase !== false, requireLoginForKb || false]);
    } else {
      // Update existing settings
      result = await pool.query(`
        UPDATE portal_settings SET
          company_name = COALESCE($1, company_name),
          welcome_message = COALESCE($2, welcome_message),
          logo_url = COALESCE($3, logo_url),
          primary_color = COALESCE($4, primary_color),
          show_knowledge_base = COALESCE($5, show_knowledge_base),
          require_login_for_kb = COALESCE($6, require_login_for_kb),
          updated_at = NOW()
        WHERE user_id = $7
        RETURNING *
      `, [companyName, welcomeMessage, logoUrl, primaryColor, showKnowledgeBase, requireLoginForKb, userId]);
    }

    res.json({ success: true, data: transformPortalSettings(result.rows[0]) });
  } catch (error) {
    console.error('Error updating portal settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update portal settings' });
  }
});

// GET /api/knowledge-base/public/:userId/settings - Get public portal settings
router.get('/public/:userId/settings', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT company_name, welcome_message, logo_url, primary_color, show_knowledge_base FROM portal_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          companyName: null,
          welcomeMessage: null,
          logoUrl: null,
          primaryColor: '#3b82f6',
          showKnowledgeBase: true,
        }
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        companyName: row.company_name,
        welcomeMessage: row.welcome_message,
        logoUrl: row.logo_url,
        primaryColor: row.primary_color,
        showKnowledgeBase: row.show_knowledge_base,
      }
    });
  } catch (error) {
    console.error('Error fetching public portal settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch portal settings' });
  }
});

export default router;
