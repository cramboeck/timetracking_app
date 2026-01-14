// ============================================
// Social Media Feature Types
// ============================================

// Re-export API types
export type {
  SocialMediaPost,
  SocialMediaTemplate,
  SocialMediaHashtagGroup,
  SocialMediaAccount,
  SocialMediaStory,
  GeneratedStoryContent,
  GeneratedImage,
  MarketingAnalysis,
  WizardContentGeneration,
  ContentImprovement,
  AutoImprovementResult,
  CarouselContent,
  CarouselSlide,
  ThemeSelectionOutput
} from '../../../services/api';

// ============================================
// Navigation Types
// ============================================

export type ViewMode = 'dashboard' | 'calendar' | 'content-studio' | 'library' | 'insights' | 'automation';

export type ContentStudioTab = 'editor' | 'wizard' | 'batch' | 'carousel' | 'stories';
export type LibraryTab = 'posts' | 'evergreen' | 'templates' | 'hashtags';
export type InsightsTab = 'analytics' | 'trends' | 'competitors';
export type AutomationTab = 'autopilot' | 'engagement-bot';

// ============================================
// Platform Types
// ============================================

export type Platform = 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';

export type StoryType = 'promotional' | 'educational' | 'behind-the-scenes' | 'announcement' | 'poll' | 'quote';

export type ImageStyle = 'modern' | 'minimalist' | 'vibrant' | 'professional' | 'artistic' | 'photorealistic';

export type Tone = 'professional' | 'casual' | 'humorous' | 'informative';

export type WizardTone = 'professional' | 'inspirational' | 'urgent' | 'storytelling' | 'educational';

export type CarouselStyle = 'educational' | 'storytelling' | 'listicle' | 'how-to' | 'tips' | 'myth-busting';

export type CarouselTone = 'professional' | 'casual' | 'inspirational' | 'bold';

export type MarketingGoal = 'leads' | 'brand' | 'engagement' | 'sales' | 'traffic';

export type JourneyStage = 'awareness' | 'consideration' | 'decision';

export type ContentLength = 'short' | 'medium' | 'long';

// ============================================
// Settings Types
// ============================================

export interface QueueSettings {
  enabled: boolean;
  postsPerDay: number;
  preferredTimes: string[];
  weekendPosting: boolean;
  contentMix: {
    educational: number;
    promotional: number;
    behindTheScenes: number;
    news: number;
  };
}

export interface AutopilotSettings {
  enabled: boolean;
  postsPerWeek: number;
  contentThemes: string[];
  targetAudience: string;
  brandVoice: string;
  approvalMode: 'auto' | 'review';
  platforms: string[];
  contentMix: {
    educational: number;
    promotional: number;
    behindTheScenes: number;
    trending: number;
  };
  lastGenerated: string | null;
}

export interface EngagementSettings {
  enabled: boolean;
  platforms: string[];
  targetKeywords: string[];
  targetAccounts: string[];
  responseStyle: 'thoughtful' | 'supportive' | 'inquisitive' | 'expert';
  dailyLimit: number;
  excludeKeywords: string[];
}

// ============================================
// Analytics Types
// ============================================

export interface BestTimesData {
  recommendedTimes: Array<{
    dayName: string;
    timeString: string;
    avgEngagement: number;
  }>;
  heatmap: number[][];
}

export interface HashtagStats {
  topPerforming: Array<{
    hashtag: string;
    usageCount: number;
    avgEngagement: number;
  }>;
}

export interface ContentMixData {
  distribution: Array<{
    category: string;
    percentage: number;
  }>;
  recommendations: string[];
}

export interface PerformanceData {
  metrics: {
    totalPosts: number;
    totalEngagement: number;
  };
  topPosts: Array<{
    content: string;
    engagement: number;
  }>;
}

export interface AnalyticsData {
  bestTimes: BestTimesData | null;
  hashtagStats: HashtagStats | null;
  contentMix: ContentMixData | null;
  performance: PerformanceData | null;
}

// ============================================
// Competitor Types
// ============================================

export interface Competitor {
  id: string;
  name: string;
  profiles: {
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
  notes?: string;
  lastAnalyzed?: string;
}

export interface CompetitorAnalysis {
  strengths: string[];
  weaknesses: string[];
  contentThemes: string[];
  postingFrequency: string;
  engagementRate: string;
  recommendations: string[];
}

// ============================================
// Trend Types
// ============================================

export interface Trend {
  topic: string;
  description: string;
  relevance: 'high' | 'medium' | 'low';
  suggestedAngles: string[];
}

// ============================================
// Batch Generation Types
// ============================================

export interface BatchResult {
  content: string;
  hashtags: string[];
  topic: string;
  scheduledAt?: string;
}

// ============================================
// Engagement Types
// ============================================

export interface EngagementResponse {
  originalPost: string;
  author: string;
  response: string;
  responseType: string;
}

export interface EngagementHistoryItem {
  id: string;
  originalPost: string;
  response: string;
  platform: string;
  createdAt: string;
}

// ============================================
// Remix Types
// ============================================

export type RemixSourceType = 'blog' | 'transcript' | 'article' | 'newsletter';

export interface RemixPlatformConfig {
  platform: string;
  count: number;
}

export interface RemixOutput {
  platform: string;
  posts: Array<{
    content: string;
    hashtags: string[];
  }>;
}

// ============================================
// Image Types
// ============================================

export interface ImageSuggestion {
  prompt: string;
  description: string;
}

// ============================================
// Hashtag Types
// ============================================

export interface ResearchedHashtag {
  tag: string;
  reach: string;
  description: string;
}
