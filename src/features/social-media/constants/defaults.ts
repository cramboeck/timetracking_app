import type { QueueSettings, AutopilotSettings, EngagementSettings, AnalyticsData } from '../types';

// Default queue settings
export const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  enabled: true,
  postsPerDay: 2,
  preferredTimes: ['09:00', '15:00'],
  weekendPosting: false,
  contentMix: {
    educational: 40,
    promotional: 30,
    behindTheScenes: 20,
    news: 10,
  },
};

// Default autopilot settings
export const DEFAULT_AUTOPILOT_SETTINGS: AutopilotSettings = {
  enabled: false,
  postsPerWeek: 5,
  contentThemes: [],
  targetAudience: '',
  brandVoice: 'professional',
  approvalMode: 'review',
  platforms: ['linkedin'],
  contentMix: {
    educational: 40,
    promotional: 20,
    behindTheScenes: 20,
    trending: 20,
  },
  lastGenerated: null,
};

// Default engagement settings
export const DEFAULT_ENGAGEMENT_SETTINGS: EngagementSettings = {
  enabled: false,
  platforms: [],
  targetKeywords: [],
  targetAccounts: [],
  responseStyle: 'thoughtful',
  dailyLimit: 10,
  excludeKeywords: [],
};

// Default analytics data
export const DEFAULT_ANALYTICS_DATA: AnalyticsData = {
  bestTimes: null,
  hashtagStats: null,
  contentMix: null,
  performance: null,
};

// Default remix platform configuration
export const DEFAULT_REMIX_PLATFORMS = [
  { platform: 'linkedin', count: 5 },
  { platform: 'twitter', count: 10 },
];

// Default carousel brand colors
export const DEFAULT_CAROUSEL_COLORS = {
  primary: '#1a365d',
  secondary: '#2563eb',
};

// Tone options for content generation
export const TONE_OPTIONS = [
  { value: 'professional', label: 'Professionell' },
  { value: 'casual', label: 'Locker' },
  { value: 'humorous', label: 'Humorvoll' },
  { value: 'informative', label: 'Informativ' },
] as const;

// Wizard tone options
export const WIZARD_TONE_OPTIONS = [
  { value: 'professional', label: 'Professionell' },
  { value: 'inspirational', label: 'Inspirierend' },
  { value: 'urgent', label: 'Dringend' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'educational', label: 'Lehrreich' },
] as const;

// Marketing goal options
export const MARKETING_GOAL_OPTIONS = [
  { value: 'leads', label: 'Lead-Generierung', description: 'Neue Kontakte gewinnen' },
  { value: 'brand', label: 'Markenbekanntheit', description: 'Sichtbarkeit erhöhen' },
  { value: 'engagement', label: 'Engagement', description: 'Interaktion fördern' },
  { value: 'sales', label: 'Verkauf', description: 'Direkter Abschluss' },
  { value: 'traffic', label: 'Website Traffic', description: 'Besucher auf Website' },
] as const;

// Story type options
export const STORY_TYPE_OPTIONS = [
  { value: 'promotional', label: 'Werbung' },
  { value: 'educational', label: 'Lehrreich' },
  { value: 'behind-the-scenes', label: 'Behind the Scenes' },
  { value: 'announcement', label: 'Ankündigung' },
  { value: 'poll', label: 'Umfrage' },
  { value: 'quote', label: 'Zitat' },
] as const;

// Image style options
export const IMAGE_STYLE_OPTIONS = [
  { value: 'modern', label: 'Modern' },
  { value: 'minimalist', label: 'Minimalistisch' },
  { value: 'vibrant', label: 'Farbenfroh' },
  { value: 'professional', label: 'Professionell' },
  { value: 'artistic', label: 'Künstlerisch' },
  { value: 'photorealistic', label: 'Fotorealistisch' },
] as const;

// Carousel style options
export const CAROUSEL_STYLE_OPTIONS = [
  { value: 'tips', label: 'Tipps' },
  { value: 'educational', label: 'Lehrreich' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'listicle', label: 'Liste' },
  { value: 'how-to', label: 'Anleitung' },
  { value: 'myth-busting', label: 'Mythen aufklären' },
] as const;

// Aspect ratio options for images
export const ASPECT_RATIO_OPTIONS = [
  { value: '1:1', label: 'Quadrat (1:1)' },
  { value: '9:16', label: 'Story (9:16)' },
  { value: '16:9', label: 'Landscape (16:9)' },
  { value: '4:5', label: 'Portrait (4:5)' },
] as const;

// Response style options for engagement bot
export const RESPONSE_STYLE_OPTIONS = [
  { value: 'thoughtful', label: 'Nachdenklich' },
  { value: 'supportive', label: 'Unterstützend' },
  { value: 'inquisitive', label: 'Fragend' },
  { value: 'expert', label: 'Experte' },
] as const;
