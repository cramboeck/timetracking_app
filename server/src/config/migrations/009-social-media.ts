import { PoolClient } from 'pg';
import { logger } from '../../utils/logger';

/**
 * Social-Media-Modul (Accounts, Posts, Stories, Templates, Engagement, Autopilot)
 *
 * Mechanisch aus database.ts extrahiert (Split 6.9.2026) — Reihenfolge und
 * SQL unveraendert. Alle Statements sind idempotent (IF NOT EXISTS / guarded
 * DO-Bloecke) und laufen in EINER Transaktion (siehe initializeDatabase).
 */
export async function run(client: PoolClient): Promise<void> {
    // ============================================
    // Social Media Manager
    // ============================================

    // Social media accounts - connected platform accounts
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        platform TEXT NOT NULL CHECK(platform IN ('linkedin', 'twitter', 'facebook', 'instagram')),
        account_name TEXT NOT NULL,
        account_id TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media posts - planned and published posts
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        title TEXT,
        content TEXT NOT NULL,
        media_urls TEXT[],
        hashtags TEXT[],
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed')),
        scheduled_at TIMESTAMP,
        published_at TIMESTAMP,
        ai_generated BOOLEAN DEFAULT false,
        ai_prompt TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media post platforms - which platforms each post targets
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_post_platforms (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES social_media_posts(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES social_media_accounts(id) ON DELETE CASCADE,
        platform_post_id TEXT,
        platform_content TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
        error_message TEXT,
        published_at TIMESTAMP,
        engagement_likes INTEGER DEFAULT 0,
        engagement_comments INTEGER DEFAULT 0,
        engagement_shares INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media templates - reusable content templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        platform TEXT CHECK(platform IN ('linkedin', 'twitter', 'facebook', 'instagram', 'all')),
        category TEXT,
        hashtags TEXT[],
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media hashtag groups - collections of hashtags
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_hashtag_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        hashtags TEXT[] NOT NULL,
        category TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media queue settings - auto-scheduling configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_queue_settings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT true,
        posts_per_day INTEGER DEFAULT 2,
        preferred_times TEXT[] DEFAULT ARRAY['09:00', '15:00'],
        weekend_posting BOOLEAN DEFAULT false,
        content_mix JSONB DEFAULT '{"educational": 40, "promotional": 30, "behindTheScenes": 20, "news": 10}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media content categories - for organizing and balancing content
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_content_categories (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#6366f1',
        target_percentage INTEGER DEFAULT 25,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, name)
      )
    `);

    // Add content_category column to posts if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'content_category') THEN
          ALTER TABLE social_media_posts ADD COLUMN content_category TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'evergreen') THEN
          ALTER TABLE social_media_posts ADD COLUMN evergreen BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'recycle_count') THEN
          ALTER TABLE social_media_posts ADD COLUMN recycle_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'social_media_posts' AND column_name = 'last_recycled_at') THEN
          ALTER TABLE social_media_posts ADD COLUMN last_recycled_at TIMESTAMP;
        END IF;
      END $$;
    `);

    // Social media autopilot settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_autopilot_settings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT false,
        posts_per_week INTEGER DEFAULT 5,
        content_themes TEXT[] DEFAULT '{}',
        target_audience TEXT,
        brand_voice TEXT DEFAULT 'professional',
        approval_mode TEXT DEFAULT 'review' CHECK(approval_mode IN ('auto', 'review')),
        platforms TEXT[] DEFAULT ARRAY['linkedin'],
        content_mix JSONB DEFAULT '{"educational": 40, "promotional": 20, "behindTheScenes": 20, "trending": 20}',
        last_generated TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media competitors for tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_competitors (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        profiles JSONB DEFAULT '{}',
        notes TEXT,
        last_analyzed TIMESTAMP,
        analysis_data JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media engagement bot settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_engagement_settings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT false,
        platforms TEXT[] DEFAULT '{}',
        target_keywords TEXT[] DEFAULT '{}',
        target_accounts TEXT[] DEFAULT '{}',
        response_style TEXT DEFAULT 'thoughtful' CHECK(response_style IN ('thoughtful', 'supportive', 'inquisitive', 'expert')),
        daily_limit INTEGER DEFAULT 10,
        exclude_keywords TEXT[] DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social media engagement history
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_engagement_history (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        post_url TEXT,
        author_name TEXT,
        original_content TEXT,
        response_content TEXT,
        response_type TEXT DEFAULT 'comment' CHECK(response_type IN ('comment', 'like', 'share', 'reply')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Social Media Stories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_stories (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        content_type TEXT NOT NULL CHECK(content_type IN ('image', 'video', 'carousel', 'poll', 'quiz', 'countdown', 'link')),
        media_urls JSONB DEFAULT '[]',
        text_overlays JSONB DEFAULT '[]',
        background_color TEXT,
        background_gradient TEXT,
        music_suggestion TEXT,
        stickers JSONB DEFAULT '[]',
        link_url TEXT,
        link_text TEXT,
        poll_question TEXT,
        poll_options JSONB DEFAULT '[]',
        scheduled_at TIMESTAMP,
        platforms JSONB DEFAULT '["instagram"]',
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'published', 'failed', 'expired')),
        duration_seconds INTEGER DEFAULT 15,
        ai_generated BOOLEAN DEFAULT false,
        ai_prompt TEXT,
        template_id TEXT,
        engagement_data JSONB,
        expires_at TIMESTAMP,
        published_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // AI Image Generation Settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_image_settings (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider TEXT DEFAULT 'openai' CHECK(provider IN ('openai', 'stability', 'leonardo', 'replicate')),
        api_key_encrypted TEXT,
        default_style TEXT DEFAULT 'modern',
        default_aspect_ratio TEXT DEFAULT '9:16',
        quality TEXT DEFAULT 'hd' CHECK(quality IN ('standard', 'hd')),
        credits_used INTEGER DEFAULT 0,
        credits_limit INTEGER DEFAULT 100,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Generated Images History
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_generated_images (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        revised_prompt TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_data TEXT,
        aspect_ratio TEXT DEFAULT '9:16',
        style TEXT,
        size TEXT,
        cost_cents INTEGER,
        used_in_story_id TEXT REFERENCES social_media_stories(id) ON DELETE SET NULL,
        used_in_post_id TEXT REFERENCES social_media_posts(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Story Templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS social_media_story_templates (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        content_type TEXT NOT NULL CHECK(content_type IN ('image', 'video', 'carousel', 'poll', 'quiz')),
        layout JSONB NOT NULL,
        text_styles JSONB DEFAULT '{}',
        color_scheme JSONB DEFAULT '{}',
        is_system BOOLEAN DEFAULT false,
        preview_url TEXT,
        usage_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for social media tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_accounts_user ON social_media_accounts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_accounts_org ON social_media_accounts(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_user ON social_media_posts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_org ON social_media_posts(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_status ON social_media_posts(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_posts_scheduled ON social_media_posts(scheduled_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_post_platforms_post ON social_media_post_platforms(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_templates_user ON social_media_templates(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_hashtags_user ON social_media_hashtag_groups(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_competitors_org ON social_media_competitors(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_engagement_history_org ON social_media_engagement_history(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_org ON social_media_stories(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_user ON social_media_stories(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_status ON social_media_stories(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_stories_scheduled ON social_media_stories(scheduled_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_generated_images_org ON social_media_generated_images(organization_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sm_story_templates_org ON social_media_story_templates(organization_id)');

    logger.info('✅ Social Media Manager tables created');
}
