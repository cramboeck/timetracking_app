import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, List, Plus, Sparkles, Hash, FileText, Settings, Send,
  ChevronLeft, ChevronRight, Edit2, Trash2, Copy, Clock, Check, CheckCircle,
  Linkedin, Twitter, Facebook, Instagram, X, Loader2, AlertCircle,
  Layers, Lightbulb, ListOrdered, Zap, Upload, BarChart3, TrendingUp,
  Recycle, Search, RefreshCw, Rocket, Globe, FileCode, Users, MessageCircle,
  Play, Pause, ThumbsUp, ThumbsDown, ExternalLink, Image, Wand2, Film,
  LayoutDashboard, PenTool, Bot, Library, ArrowRight, ArrowUp, ArrowDown, Target, Eye, CalendarDays,
  Heart, MousePointer, MessageSquare
} from 'lucide-react';
import { socialMediaApi, SocialMediaPost, SocialMediaTemplate, SocialMediaHashtagGroup, SocialMediaAccount, SocialMediaStory, GeneratedStoryContent, GeneratedImage, MarketingAnalysis, WizardContentGeneration, ContentImprovement, AutoImprovementResult, CarouselContent, CarouselSlide, ThemeSelectionOutput } from '../services/api';
import { Customer } from '../types';
import { Modal } from './Modal';
import { useToast, useConfirm } from '../contexts/UIContext';

interface SocialMediaManagerProps {
  customers?: Customer[];
}

// Simplified view modes - grouped by function
type ViewMode = 'dashboard' | 'calendar' | 'list' | 'create' | 'stories' | 'ai-tools' | 'engagement' | 'library' | 'analytics';
// Sub-views for grouped sections
type CreateSubView = 'post' | 'batch' | 'remix' | 'carousel';
type AIToolsSubView = 'autopilot' | 'trends' | 'ideas';
type EngagementSubView = 'competitors' | 'bot';
type LibrarySubView = 'evergreen' | 'templates' | 'hashtags';

type Platform = 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';
type StoryType = 'promotional' | 'educational' | 'behind-the-scenes' | 'announcement' | 'poll' | 'quote';
type ImageStyle = 'modern' | 'minimalist' | 'vibrant' | 'professional' | 'artistic' | 'photorealistic';

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin size={16} />,
  twitter: <Twitter size={16} />,
  facebook: <Facebook size={16} />,
  instagram: <Instagram size={16} />,
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-accent-primary',
  twitter: 'bg-sky-500',
  facebook: 'bg-blue-500',
  instagram: 'bg-gradient-to-r from-accent-light0 via-pink-500 to-orange-500',
};

const PLATFORM_LIMITS: Record<string, number> = {
  linkedin: 3000,
  twitter: 280,
  facebook: 63206,
  instagram: 2200,
  all: 280, // Use lowest limit
};

export const SocialMediaManager = ({ customers = [] }: SocialMediaManagerProps) => {
  const showToast = useToast();
  const confirm = useConfirm();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [templates, setTemplates] = useState<SocialMediaTemplate[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<SocialMediaHashtagGroup[]>([]);
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-view states for grouped sections
  const [createSubView, setCreateSubView] = useState<CreateSubView>('post');
  const [aiToolsSubView, setAIToolsSubView] = useState<AIToolsSubView>('autopilot');
  const [engagementSubView, setEngagementSubView] = useState<EngagementSubView>('competitors');
  const [librarySubView, setLibrarySubView] = useState<LibrarySubView>('evergreen');

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  // Post Editor state
  const [showPostEditor, setShowPostEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialMediaPost | null>(null);
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postHashtags, setPostHashtags] = useState<string[]>([]);
  const [postPlatforms, setPostPlatforms] = useState<Platform[]>(['linkedin']);
  const [postScheduledAt, setPostScheduledAt] = useState('');
  const [postCustomerId, setPostCustomerId] = useState('');
  const [saving, setSaving] = useState(false);

  // AI Generation state
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiPlatform, setAiPlatform] = useState<Platform>('linkedin');
  const [aiTone, setAiTone] = useState<'professional' | 'casual' | 'humorous' | 'informative'>('professional');
  const [aiIncludeHashtags, setAiIncludeHashtags] = useState(true);
  const [aiIncludeEmoji, setAiIncludeEmoji] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Template Editor state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templatePlatform, setTemplatePlatform] = useState<Platform>('all');

  // Hashtag Group Editor state
  const [showHashtagEditor, setShowHashtagEditor] = useState(false);

  // Batch Generation state
  const [batchTopics, setBatchTopics] = useState('');
  const [batchPlatform, setBatchPlatform] = useState<Platform>('linkedin');
  const [batchTone, setBatchTone] = useState<'professional' | 'casual' | 'humorous' | 'informative'>('professional');
  const [batchIncludeHashtags, setBatchIncludeHashtags] = useState(true);
  const [batchIncludeEmoji, setBatchIncludeEmoji] = useState(false);
  const [batchAutoSchedule, setBatchAutoSchedule] = useState(true);
  const [batchStartDate, setBatchStartDate] = useState('');
  const [batchPostsPerDay, setBatchPostsPerDay] = useState(2);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{ content: string; hashtags: string[]; topic: string; scheduledAt?: string }>>([]);

  // Ideas Generation state
  const [showIdeasGenerator, setShowIdeasGenerator] = useState(false);
  const [ideasCategory, setIdeasCategory] = useState('');
  const [ideasCount, setIdeasCount] = useState(10);
  const [generatedIdeas, setGeneratedIdeas] = useState<string[]>([]);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);

  // Queue state
  const [queue, setQueue] = useState<SocialMediaPost[]>([]);
  const [queueSettings, setQueueSettings] = useState({
    enabled: true,
    postsPerDay: 2,
    preferredTimes: ['09:00', '15:00'],
    weekendPosting: false,
    contentMix: { educational: 40, promotional: 30, behindTheScenes: 20, news: 10 }
  });

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<{
    bestTimes: { recommendedTimes: Array<{ dayName: string; timeString: string; avgEngagement: number }>; heatmap: number[][] } | null;
    hashtagStats: { topPerforming: Array<{ hashtag: string; usageCount: number; avgEngagement: number }> } | null;
    contentMix: { distribution: Array<{ category: string; percentage: number }>; recommendations: string[] } | null;
    performance: { metrics: { totalPosts: number; totalEngagement: number }; topPosts: Array<{ content: string; engagement: number }> } | null;
  }>({ bestTimes: null, hashtagStats: null, contentMix: null, performance: null });
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Evergreen state
  const [evergreenPosts, setEvergreenPosts] = useState<SocialMediaPost[]>([]);
  const [showRecycleModal, setShowRecycleModal] = useState(false);
  const [recyclingPost, setRecyclingPost] = useState<SocialMediaPost | null>(null);
  const [recycleDate, setRecycleDate] = useState('');
  const [recycleModify, setRecycleModify] = useState(false);

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importPreviews, setImportPreviews] = useState<Array<{ content: string; scheduledAt?: string }>>([]);
  const [importing, setImporting] = useState(false);

  // Hashtag Research state
  const [showHashtagResearch, setShowHashtagResearch] = useState(false);
  const [hashtagTopic, setHashtagTopic] = useState('');
  const [researchedHashtags, setResearchedHashtags] = useState<Array<{ tag: string; reach: string; description: string }>>([]);
  const [researchingHashtags, setResearchingHashtags] = useState(false);

  const [hashtagGroupName, setHashtagGroupName] = useState('');
  const [hashtagGroupTags, setHashtagGroupTags] = useState('');

  // Autopilot state
  const [autopilotSettings, setAutopilotSettings] = useState({
    enabled: false,
    postsPerWeek: 5,
    contentThemes: [] as string[],
    targetAudience: '',
    brandVoice: 'professional',
    approvalMode: 'review' as 'auto' | 'review',
    platforms: ['linkedin'] as string[],
    contentMix: { educational: 40, promotional: 20, behindTheScenes: 20, trending: 20 },
    lastGenerated: null as string | null
  });
  const [autopilotPending, setAutopilotPending] = useState<SocialMediaPost[]>([]);
  const [autopilotGenerating, setAutopilotGenerating] = useState(false);
  const [newTheme, setNewTheme] = useState('');

  // Trends state
  const [trends, setTrends] = useState<Array<{ topic: string; description: string; relevance: 'high' | 'medium' | 'low'; suggestedAngles: string[] }>>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsIndustry, setTrendsIndustry] = useState('IT & Technologie');
  const [selectedTrend, setSelectedTrend] = useState<{ topic: string; description: string } | null>(null);
  const [trendPostContent, setTrendPostContent] = useState('');
  const [trendGenerating, setTrendGenerating] = useState(false);

  // Remix state
  const [remixSourceContent, setRemixSourceContent] = useState('');
  const [remixSourceType, setRemixSourceType] = useState<'blog' | 'transcript' | 'article' | 'newsletter'>('blog');
  const [remixOutputs, setRemixOutputs] = useState<Array<{ platform: string; posts: Array<{ content: string; hashtags: string[] }> }>>([]);
  const [remixPlatforms, setRemixPlatforms] = useState<Array<{ platform: string; count: number }>>([
    { platform: 'linkedin', count: 5 },
    { platform: 'twitter', count: 10 }
  ]);
  const [remixing, setRemixing] = useState(false);

  // Competitors state
  const [competitors, setCompetitors] = useState<Array<{ id: string; name: string; profiles: any; notes?: string; lastAnalyzed?: string }>>([]);
  const [showAddCompetitor, setShowAddCompetitor] = useState(false);
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [newCompetitorProfiles, setNewCompetitorProfiles] = useState({ linkedin: '', twitter: '', website: '' });
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [competitorSamplePosts, setCompetitorSamplePosts] = useState('');
  const [competitorAnalysis, setCompetitorAnalysis] = useState<any>(null);
  const [analyzingCompetitor, setAnalyzingCompetitor] = useState(false);

  // Engagement state
  const [engagementSettings, setEngagementSettings] = useState({
    enabled: false,
    platforms: [] as string[],
    targetKeywords: [] as string[],
    targetAccounts: [] as string[],
    responseStyle: 'thoughtful' as 'thoughtful' | 'supportive' | 'inquisitive' | 'expert',
    dailyLimit: 10,
    excludeKeywords: [] as string[]
  });
  const [engagementPosts, setEngagementPosts] = useState('');
  const [engagementResponses, setEngagementResponses] = useState<Array<{ originalPost: string; author: string; response: string; responseType: string }>>([]);
  const [generatingEngagement, setGeneratingEngagement] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [engagementHistory, setEngagementHistory] = useState<Array<{ id: string; originalPost: string; response: string; platform: string; createdAt: string }>>([]);
  const [savingEngagementSettings, setSavingEngagementSettings] = useState(false);
  const [engagementSettingsLoaded, setEngagementSettingsLoaded] = useState(false);

  // Stories state
  const [stories, setStories] = useState<SocialMediaStory[]>([]);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [storyTopic, setStoryTopic] = useState('');
  const [storyType, setStoryType] = useState<StoryType>('promotional');
  const [storyPlatform, setStoryPlatform] = useState<'instagram' | 'facebook' | 'linkedin'>('instagram');
  const [storyBrandVoice, setStoryBrandVoice] = useState('');
  const [storyTargetAudience, setStoryTargetAudience] = useState('');
  const [storyIncludeCTA, setStoryIncludeCTA] = useState(true);
  const [generatingStory, setGeneratingStory] = useState(false);
  const [generatedStory, setGeneratedStory] = useState<GeneratedStoryContent | null>(null);

  // Image Generation state
  const [showImageGenerator, setShowImageGenerator] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('modern');
  const [imageAspectRatio, setImageAspectRatio] = useState<'1:1' | '9:16' | '16:9' | '4:5'>('9:16');
  const [imageQuality, setImageQuality] = useState<'standard' | 'hd'>('hd');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [imageSuggestions, setImageSuggestions] = useState<Array<{ prompt: string; description: string }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Content Wizard state (Marketing Expert with Lead Generation focus)
  const [showContentWizard, setShowContentWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<'goal' | 'content' | 'analyze' | 'image' | 'preview'>('goal');
  const [wizardTopic, setWizardTopic] = useState('');
  const [wizardPlatform, setWizardPlatform] = useState<Platform>('linkedin');
  const [wizardGoal, setWizardGoal] = useState<'leads' | 'brand' | 'engagement' | 'sales' | 'traffic'>('leads');
  const [wizardTargetAudience, setWizardTargetAudience] = useState('');
  const [wizardTone, setWizardTone] = useState<'professional' | 'inspirational' | 'urgent' | 'storytelling' | 'educational'>('professional');
  const [wizardContentLength, setWizardContentLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [wizardGenerating, setWizardGenerating] = useState(false);
  const [wizardContent, setWizardContent] = useState<WizardContentGeneration | null>(null);
  const [wizardSelectedAlternative, setWizardSelectedAlternative] = useState(0);
  const [wizardAnalysis, setWizardAnalysis] = useState<MarketingAnalysis | null>(null);
  const [wizardAnalyzing, setWizardAnalyzing] = useState(false);
  const [wizardImprovement, setWizardImprovement] = useState<ContentImprovement | null>(null);
  const [wizardImproving, setWizardImproving] = useState(false);
  const [wizardAutoImprovement, setWizardAutoImprovement] = useState<AutoImprovementResult | null>(null);
  const [wizardAutoImproving, setWizardAutoImproving] = useState(false);
  const [wizardAutoImprovingStatus, setWizardAutoImprovingStatus] = useState('');
  const [wizardGeneratedImage, setWizardGeneratedImage] = useState<GeneratedImage | null>(null);
  const [wizardGeneratingImage, setWizardGeneratingImage] = useState(false);
  const [wizardEditedContent, setWizardEditedContent] = useState('');
  const [wizardIncludeImage, setWizardIncludeImage] = useState(true);
  const [wizardJourneyStage, setWizardJourneyStage] = useState<'awareness' | 'consideration' | 'decision'>('awareness');
  const [wizardThemePreview, setWizardThemePreview] = useState<ThemeSelectionOutput | null>(null);
  const [wizardLoadingTheme, setWizardLoadingTheme] = useState(false);

  // Carousel Generator state
  const [carouselTopic, setCarouselTopic] = useState('');
  const [carouselPlatform, setCarouselPlatform] = useState<'instagram' | 'linkedin'>('instagram');
  const [carouselSlideCount, setCarouselSlideCount] = useState(7);
  const [carouselStyle, setCarouselStyle] = useState<'educational' | 'storytelling' | 'listicle' | 'how-to' | 'tips' | 'myth-busting'>('tips');
  const [carouselTone, setCarouselTone] = useState<'professional' | 'casual' | 'inspirational' | 'bold'>('professional');
  const [carouselTargetAudience, setCarouselTargetAudience] = useState('');
  const [carouselIncludeEmojis, setCarouselIncludeEmojis] = useState(true);
  const [carouselBrandColors, setCarouselBrandColors] = useState({ primary: '#1a365d', secondary: '#2563eb' });
  const [carouselGenerating, setCarouselGenerating] = useState(false);
  const [carouselContent, setCarouselContent] = useState<CarouselContent | null>(null);
  const [carouselCurrentSlide, setCarouselCurrentSlide] = useState(0);
  const [carouselGeneratingImages, setCarouselGeneratingImages] = useState(false);
  const [carouselSlideImages, setCarouselSlideImages] = useState<Array<{ slideNumber: number; imageUrl: string }>>([]);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (viewMode === 'calendar') {
      loadCalendarPosts();
    }
  }, [currentMonth, currentYear, viewMode]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [postsData, templatesData, hashtagsData, accountsData] = await Promise.all([
        socialMediaApi.getPosts(),
        socialMediaApi.getTemplates(),
        socialMediaApi.getHashtagGroups(),
        socialMediaApi.getAccounts(),
      ]);
      setPosts(postsData);
      setTemplates(templatesData);
      setHashtagGroups(hashtagsData);
      setAccounts(accountsData);
    } catch (err) {
      setError('Fehler beim Laden der Daten');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCalendarPosts = async () => {
    try {
      const calendarPosts = await socialMediaApi.getCalendar(currentMonth + 1, currentYear);
      setPosts(calendarPosts);
    } catch (err) {
      console.error('Failed to load calendar posts:', err);
    }
  };

  const loadQueue = async () => {
    try {
      const [queueData, settingsData] = await Promise.all([
        socialMediaApi.getQueue(),
        socialMediaApi.getQueueSettings(),
      ]);
      setQueue(queueData);
      setQueueSettings(settingsData);
    } catch (err) {
      console.error('Failed to load queue:', err);
    }
  };

  // Load queue when switching to queue view
  useEffect(() => {
    if (viewMode === 'queue') {
      loadQueue();
    }
  }, [viewMode]);

  // Load engagement data when switching to engagement view
  useEffect(() => {
    if (viewMode === 'engagement') {
      loadEngagementData();
    }
  }, [viewMode]);

  // Batch generation
  const generateBatch = async () => {
    const topics = batchTopics.split('\n').map(t => t.trim()).filter(t => t.length > 0);
    if (topics.length === 0) return;

    setBatchGenerating(true);
    setBatchResults([]);
    try {
      const result = await socialMediaApi.generateBatch({
        topics,
        platform: batchPlatform,
        tone: batchTone,
        includeHashtags: batchIncludeHashtags,
        includeEmoji: batchIncludeEmoji,
        autoSchedule: batchAutoSchedule,
        startDate: batchStartDate || undefined,
        postsPerDay: batchPostsPerDay,
      });
      setBatchResults(result.posts);
      if (batchAutoSchedule) {
        // Reload posts to show newly created ones
        loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Batch-Generierung fehlgeschlagen');
    } finally {
      setBatchGenerating(false);
    }
  };

  // Ideas generation
  const generateIdeas = async () => {
    if (!ideasCategory.trim()) return;

    setGeneratingIdeas(true);
    setGeneratedIdeas([]);
    try {
      const result = await socialMediaApi.generateIdeas({
        category: ideasCategory,
        count: ideasCount,
      });
      setGeneratedIdeas(result.ideas);
    } catch (err: any) {
      setError(err.message || 'Ideen-Generierung fehlgeschlagen');
    } finally {
      setGeneratingIdeas(false);
    }
  };

  // Use idea for batch generation
  const useIdeasForBatch = () => {
    setBatchTopics(generatedIdeas.join('\n'));
    setShowIdeasGenerator(false);
    setViewMode('create');
    setCreateSubView('batch');
  };

  // Add single post to queue
  const addToQueue = async (content: string, hashtags: string[]) => {
    try {
      await socialMediaApi.addToQueue({ content, hashtags });
      loadQueue();
    } catch (err) {
      console.error('Failed to add to queue:', err);
    }
  };

  // Load analytics data
  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const [bestTimes, hashtagStats, contentMix, performance] = await Promise.all([
        socialMediaApi.getBestTimes(),
        socialMediaApi.getHashtagAnalytics(),
        socialMediaApi.getContentMix(),
        socialMediaApi.getPerformance(30),
      ]);
      setAnalyticsData({ bestTimes, hashtagStats, contentMix, performance });
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Load evergreen posts
  const loadEvergreen = async () => {
    try {
      const data = await socialMediaApi.getEvergreenPosts();
      setEvergreenPosts(data);
    } catch (err) {
      console.error('Failed to load evergreen posts:', err);
    }
  };

  // Toggle evergreen status
  const toggleEvergreen = async (postId: string, currentStatus: boolean) => {
    try {
      await socialMediaApi.setEvergreen(postId, !currentStatus);
      loadData();
      if (viewMode === 'evergreen') loadEvergreen();
    } catch (err) {
      console.error('Failed to toggle evergreen:', err);
    }
  };

  // Recycle evergreen post
  const handleRecycle = async () => {
    if (!recyclingPost || !recycleDate) return;
    try {
      await socialMediaApi.recycleEvergreen(recyclingPost.id, recycleDate, recycleModify);
      setShowRecycleModal(false);
      setRecyclingPost(null);
      loadData();
      loadEvergreen();
    } catch (err) {
      console.error('Failed to recycle post:', err);
    }
  };

  // CSV Import
  const parseCSV = () => {
    const lines = csvText.split('\n').filter(l => l.trim());
    const previews = lines.map(line => {
      const parts = line.split(';');
      return {
        content: parts[0]?.trim() || '',
        scheduledAt: parts[1]?.trim() || undefined
      };
    }).filter(p => p.content);
    setImportPreviews(previews);
  };

  const handleImport = async () => {
    if (importPreviews.length === 0) return;
    setImporting(true);
    try {
      await socialMediaApi.importPosts(importPreviews);
      setShowImportModal(false);
      setCsvText('');
      setImportPreviews([]);
      loadData();
    } catch (err) {
      console.error('Failed to import:', err);
    } finally {
      setImporting(false);
    }
  };

  // Hashtag Research
  const handleHashtagResearch = async () => {
    if (!hashtagTopic.trim()) return;
    setResearchingHashtags(true);
    try {
      const result = await socialMediaApi.researchHashtags(hashtagTopic);
      setResearchedHashtags(result.hashtags);
    } catch (err: any) {
      setError(err.message || 'Hashtag-Recherche fehlgeschlagen');
    } finally {
      setResearchingHashtags(false);
    }
  };

  // Load data when switching views
  useEffect(() => {
    if (viewMode === 'analytics') loadAnalytics();
    if (viewMode === 'evergreen') loadEvergreen();
    if (viewMode === 'autopilot') loadAutopilot();
    if (viewMode === 'trends') loadTrends();
    if (viewMode === 'competitors') loadCompetitors();
    if (viewMode === 'engagement') loadEngagementSettings();
  }, [viewMode]);

  // Load Autopilot data
  const loadAutopilot = async () => {
    try {
      const [settings, pending] = await Promise.all([
        socialMediaApi.getAutopilotSettings(),
        socialMediaApi.getAutopilotPending()
      ]);
      setAutopilotSettings(settings);
      setAutopilotPending(pending);
    } catch (err) {
      console.error('Failed to load autopilot settings:', err);
    }
  };

  const handleGenerateAutopilot = async () => {
    setAutopilotGenerating(true);
    try {
      const result = await socialMediaApi.generateAutopilotContent();
      setAutopilotPending(result.posts);
      showToast(result.message, 'info', 5000);
    } catch (err: any) {
      setError(err.message || 'Autopilot-Generierung fehlgeschlagen');
    } finally {
      setAutopilotGenerating(false);
    }
  };

  const handleApproveAutopilot = async (postIds: string[], action: 'approve' | 'reject') => {
    try {
      await socialMediaApi.approveAutopilotPosts(postIds, action);
      setAutopilotPending(prev => prev.filter(p => !postIds.includes(p.id)));
      if (action === 'approve') {
        loadData(); // Reload posts
      }
    } catch (err: any) {
      setError(err.message || 'Fehler beim Genehmigen/Ablehnen');
    }
  };

  const saveAutopilotSettings = async () => {
    try {
      await socialMediaApi.updateAutopilotSettings(autopilotSettings);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Einstellungen');
    }
  };

  // Load Trends
  const loadTrends = async () => {
    setTrendsLoading(true);
    try {
      const result = await socialMediaApi.getTrends(trendsIndustry);
      setTrends(result.trends);
    } catch (err) {
      console.error('Failed to load trends:', err);
    } finally {
      setTrendsLoading(false);
    }
  };

  const handleGenerateTrendPost = async () => {
    if (!selectedTrend) return;
    setTrendGenerating(true);
    try {
      const result = await socialMediaApi.generateTrendContent({
        trend: selectedTrend.topic,
        platform: 'linkedin',
        tone: 'professional',
        angle: 'informative'
      });
      setTrendPostContent(result.content);
    } catch (err: any) {
      setError(err.message || 'Trend-Content-Generierung fehlgeschlagen');
    } finally {
      setTrendGenerating(false);
    }
  };

  // Remix functions
  const handleRemix = async () => {
    if (!remixSourceContent.trim()) return;
    setRemixing(true);
    try {
      const result = await socialMediaApi.remixContent({
        sourceContent: remixSourceContent,
        sourceType: remixSourceType,
        outputFormats: remixPlatforms,
        preserveLinks: true,
        includeHashtags: true
      });
      setRemixOutputs(result.outputs);
    } catch (err: any) {
      setError(err.message || 'Content-Remix fehlgeschlagen');
    } finally {
      setRemixing(false);
    }
  };

  const handleSaveRemixedPosts = async (posts: Array<{ content: string; hashtags: string[] }>) => {
    try {
      await socialMediaApi.saveRemixedPosts({ posts, autoSchedule: true, postsPerDay: 2 });
      loadData();
      setRemixOutputs([]);
      setRemixSourceContent('');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    }
  };

  // Carousel Generator functions
  const generateCarousel = async () => {
    if (!carouselTopic.trim()) return;
    setCarouselGenerating(true);
    setCarouselContent(null);
    setCarouselCurrentSlide(0);
    setCarouselSlideImages([]);
    try {
      const result = await socialMediaApi.generateCarousel({
        topic: carouselTopic,
        platform: carouselPlatform,
        slideCount: carouselSlideCount,
        style: carouselStyle,
        tone: carouselTone,
        targetAudience: carouselTargetAudience || undefined,
        brandColors: carouselBrandColors,
        includeEmojis: carouselIncludeEmojis
      });
      setCarouselContent(result);
    } catch (err: any) {
      setError(err.message || 'Carousel-Generierung fehlgeschlagen');
    } finally {
      setCarouselGenerating(false);
    }
  };

  const generateCarouselImages = async () => {
    if (!carouselContent) return;
    setCarouselGeneratingImages(true);
    try {
      const result = await socialMediaApi.generateCarouselImages({
        slides: carouselContent.slides,
        style: 'modern',
        colorScheme: { primary: carouselContent.colorScheme.primary, secondary: carouselContent.colorScheme.secondary }
      });
      setCarouselSlideImages(result.images);
    } catch (err: any) {
      setError(err.message || 'Bildgenerierung fehlgeschlagen');
    } finally {
      setCarouselGeneratingImages(false);
    }
  };

  const saveCarousel = async (scheduleAt?: string) => {
    if (!carouselContent) return;
    try {
      await socialMediaApi.saveCarousel({ carousel: carouselContent, scheduleAt });
      loadData();
      setCarouselContent(null);
      setCarouselTopic('');
    } catch (err: any) {
      setError(err.message || 'Speichern fehlgeschlagen');
    }
  };

  // Competitors functions
  const loadCompetitors = async () => {
    try {
      const data = await socialMediaApi.getCompetitors();
      setCompetitors(data);
    } catch (err) {
      console.error('Failed to load competitors:', err);
    }
  };

  const handleAddCompetitor = async () => {
    if (!newCompetitorName.trim()) return;
    try {
      await socialMediaApi.addCompetitor({
        name: newCompetitorName,
        profiles: newCompetitorProfiles
      });
      setNewCompetitorName('');
      setNewCompetitorProfiles({ linkedin: '', twitter: '', website: '' });
      setShowAddCompetitor(false);
      loadCompetitors();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Hinzufügen');
    }
  };

  const handleAnalyzeCompetitor = async () => {
    if (!selectedCompetitor || !competitorSamplePosts.trim()) return;
    setAnalyzingCompetitor(true);
    try {
      const samplePosts = competitorSamplePosts.split('\n---\n').filter(p => p.trim());
      const result = await socialMediaApi.analyzeCompetitor(selectedCompetitor, { samplePosts });
      setCompetitorAnalysis(result);
    } catch (err: any) {
      setError(err.message || 'Analyse fehlgeschlagen');
    } finally {
      setAnalyzingCompetitor(false);
    }
  };

  // Engagement functions
  const loadEngagementSettings = async () => {
    try {
      const settings = await socialMediaApi.getEngagementSettings();
      setEngagementSettings(settings);
    } catch (err) {
      console.error('Failed to load engagement settings:', err);
    }
  };

  const handleGenerateEngagement = async () => {
    if (!engagementPosts.trim()) return;
    setGeneratingEngagement(true);
    try {
      const postsArray = engagementPosts.split('\n---\n').filter(p => p.trim()).map(p => ({
        author: 'Unbekannt',
        content: p,
        platform: 'linkedin'
      }));
      const result = await socialMediaApi.generateEngagementResponses(postsArray);
      setEngagementResponses(result.responses);
    } catch (err: any) {
      setError(err.message || 'Engagement-Generierung fehlgeschlagen');
    } finally {
      setGeneratingEngagement(false);
    }
  };

  // Load engagement settings and history
  const loadEngagementData = async () => {
    if (engagementSettingsLoaded) return;
    try {
      const [settings, history] = await Promise.all([
        socialMediaApi.getEngagementSettings(),
        socialMediaApi.getEngagementHistory()
      ]);
      setEngagementSettings({
        enabled: settings.enabled,
        platforms: settings.platforms || [],
        targetKeywords: settings.targetKeywords || [],
        targetAccounts: settings.targetAccounts || [],
        responseStyle: settings.responseStyle || 'thoughtful',
        dailyLimit: settings.dailyLimit || 10,
        excludeKeywords: settings.excludeKeywords || []
      });
      setEngagementHistory(history);
      setEngagementSettingsLoaded(true);
    } catch (err) {
      console.error('Failed to load engagement data:', err);
    }
  };

  // Save engagement settings
  const saveEngagementSettings = async () => {
    setSavingEngagementSettings(true);
    try {
      await socialMediaApi.updateEngagementSettings(engagementSettings);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Einstellungen');
    } finally {
      setSavingEngagementSettings(false);
    }
  };

  // Log engagement response (save to history)
  const logEngagementResponse = async (originalPost: string, response: string, platform: string) => {
    try {
      await socialMediaApi.logEngagement({
        originalPost,
        response,
        platform,
        responseType: engagementSettings.responseStyle
      });
      // Reload history
      const history = await socialMediaApi.getEngagementHistory();
      setEngagementHistory(history);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern der Antwort');
    }
  };

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDay = firstDay.getDay() || 7; // Monday = 1
    const daysInMonth = lastDay.getDate();

    const days: (number | null)[] = [];
    // Add empty cells for days before first day of month
    for (let i = 1; i < startDay; i++) {
      days.push(null);
    }
    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  }, [currentMonth, currentYear]);

  const getPostsForDay = (day: number) => {
    return posts.filter(post => {
      const postDate = post.scheduledAt ? new Date(post.scheduledAt) : new Date(post.createdAt);
      return postDate.getDate() === day &&
             postDate.getMonth() === currentMonth &&
             postDate.getFullYear() === currentYear;
    });
  };

  // Post Editor handlers
  const openPostEditor = (post?: SocialMediaPost) => {
    if (post) {
      setEditingPost(post);
      setPostContent(post.content);
      setPostTitle(post.title || '');
      setPostHashtags(post.hashtags || []);
      setPostScheduledAt(post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : '');
      setPostCustomerId(post.customerId || '');
    } else {
      setEditingPost(null);
      setPostContent('');
      setPostTitle('');
      setPostHashtags([]);
      setPostPlatforms(['linkedin']);
      setPostScheduledAt('');
      setPostCustomerId('');
    }
    setShowPostEditor(true);
  };

  const savePost = async () => {
    if (!postContent.trim()) return;

    setSaving(true);
    try {
      if (editingPost) {
        await socialMediaApi.updatePost(editingPost.id, {
          title: postTitle || undefined,
          content: postContent,
          hashtags: postHashtags,
          scheduledAt: postScheduledAt || null,
        });
      } else {
        await socialMediaApi.createPost({
          title: postTitle || undefined,
          content: postContent,
          hashtags: postHashtags,
          scheduledAt: postScheduledAt || undefined,
          customerId: postCustomerId || undefined,
          platforms: postPlatforms,
        });
      }
      setShowPostEditor(false);
      loadData();
    } catch (err) {
      setError('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (id: string) => {
    const ok = await confirm({
      title: 'Post löschen?',
      message: 'Post wirklich löschen?',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await socialMediaApi.deletePost(id);
      loadData();
    } catch (err) {
      setError('Fehler beim Löschen');
    }
  };

  // AI Generation handler
  const generateWithAi = async () => {
    if (!aiTopic.trim()) return;

    setGenerating(true);
    try {
      const result = await socialMediaApi.generateContent({
        topic: aiTopic,
        platform: aiPlatform,
        tone: aiTone,
        includeHashtags: aiIncludeHashtags,
        includeEmoji: aiIncludeEmoji,
      });
      setPostContent(result.content);
      setPostHashtags(result.hashtags);
      setShowAiGenerator(false);
    } catch (err) {
      setError('KI-Generierung fehlgeschlagen');
    } finally {
      setGenerating(false);
    }
  };

  // Template handlers
  const saveTemplate = async () => {
    if (!templateName.trim() || !templateContent.trim()) return;

    setSaving(true);
    try {
      await socialMediaApi.createTemplate({
        name: templateName,
        content: templateContent,
        platform: templatePlatform,
      });
      setShowTemplateEditor(false);
      setTemplateName('');
      setTemplateContent('');
      loadData();
    } catch (err) {
      setError('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const useTemplate = (template: SocialMediaTemplate) => {
    setPostContent(template.content);
    setPostHashtags(template.hashtags || []);
    setShowPostEditor(true);
  };

  // Hashtag Group handlers
  const saveHashtagGroup = async () => {
    if (!hashtagGroupName.trim() || !hashtagGroupTags.trim()) return;

    const hashtags = hashtagGroupTags.split(/[\s,]+/).filter(h => h.startsWith('#') || h.length > 0)
      .map(h => h.startsWith('#') ? h : `#${h}`);

    setSaving(true);
    try {
      await socialMediaApi.createHashtagGroup({
        name: hashtagGroupName,
        hashtags,
      });
      setShowHashtagEditor(false);
      setHashtagGroupName('');
      setHashtagGroupTags('');
      loadData();
    } catch (err) {
      setError('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const addHashtagsFromGroup = (group: SocialMediaHashtagGroup) => {
    setPostHashtags([...new Set([...postHashtags, ...group.hashtags])]);
  };

  // Character count helper
  const getCharacterCount = () => {
    const limit = postPlatforms.length === 1 ? PLATFORM_LIMITS[postPlatforms[0]] : PLATFORM_LIMITS.all;
    const count = postContent.length + postHashtags.join(' ').length;
    return { count, limit, isOver: count > limit };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-accent-primary" />
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Planen', icon: CalendarDays },
    { id: 'create', label: 'Erstellen', icon: PenTool },
    { id: 'stories', label: 'Stories', icon: Film },
    { id: 'ai-tools', label: 'KI-Tools', icon: Bot },
    { id: 'engagement', label: 'Engagement', icon: Target },
    { id: 'library', label: 'Bibliothek', icon: Library },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-200px)]">
      {/* Desktop Sidebar Navigation */}
      <div className="hidden lg:flex flex-col w-64 flex-shrink-0">
        <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4 sticky top-4">
          <h2 className="text-lg font-bold dark:text-white mb-4 flex items-center gap-2">
            <Globe size={20} className="text-accent-primary" />
            Social Media
          </h2>
          <nav className="space-y-1">
            {navItems.map(tab => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                  viewMode === tab.id
                    ? 'bg-accent-primary text-white'
                    : 'text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200'
                }`}
              >
                <tab.icon size={18} />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Quick Actions */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-200 space-y-2">
            <button
              onClick={() => openPostEditor()}
              className="w-full flex items-center gap-2 px-3 py-2 btn-accent rounded-lg"
            >
              <Plus size={18} />
              Neuer Post
            </button>
            <button
              onClick={() => setShowHashtagResearch(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
            >
              <Search size={18} />
              Hashtags
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
            >
              <Upload size={18} />
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Mobile Header */}
        <div className="lg:hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-2xl font-bold dark:text-white">Social Media Manager</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
            >
              <Upload size={18} />
              CSV Import
            </button>
            <button
              onClick={() => setShowHashtagResearch(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
            >
              <Search size={18} />
              Hashtag-Recherche
            </button>
            <button
              onClick={() => openPostEditor()}
              className="flex items-center gap-2 px-4 py-2 btn-accent"
            >
              <Plus size={18} />
              Neuer Post
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Mobile Navigation Tabs */}
        <div className="lg:hidden flex gap-2 border-b border-gray-200 dark:border-dark-200 pb-2 overflow-x-auto">
          {navItems.map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as ViewMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                viewMode === tab.id
                  ? 'bg-accent-primary text-white'
                  : 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 hover:bg-gray-200 dark:hover:bg-dark-300'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

      {/* Dashboard View */}
      {viewMode === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-lighter dark:bg-accent-primary/30 rounded-lg">
                  <CalendarDays size={20} className="text-accent-primary dark:text-accent-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold dark:text-white">{posts.filter(p => p.status === 'scheduled').length}</p>
                  <p className="text-xs text-gray-500">Geplant</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Edit2 size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold dark:text-white">{posts.filter(p => p.status === 'draft').length}</p>
                  <p className="text-xs text-gray-500">Entwürfe</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Check size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold dark:text-white">{posts.filter(p => p.status === 'published').length}</p>
                  <p className="text-xs text-gray-500">Veröffentlicht</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-dark-100 rounded-xl p-4 border border-gray-200 dark:border-dark-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-lighter dark:bg-accent-primary/20 rounded-lg">
                  <Recycle size={20} className="text-accent-primary dark:text-accent-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold dark:text-white">{evergreenPosts.length}</p>
                  <p className="text-xs text-gray-500">Evergreen</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
            <h3 className="font-semibold dark:text-white mb-4">Schnellaktionen</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Content Wizard - Hero Button */}
              <button
                onClick={() => {
                  setShowContentWizard(true);
                  setWizardStep('goal');
                  setWizardTopic('');
                  setWizardContent(null);
                  setWizardAnalysis(null);
                  setWizardGeneratedImage(null);
                  setWizardEditedContent('');
                }}
                className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white rounded-xl hover:opacity-90 md:col-span-1 ring-2 ring-amber-300/50"
              >
                <Wand2 size={24} />
                <span className="text-sm font-medium">Content Wizard</span>
                <span className="text-xs opacity-75">KI-Experte</span>
              </button>
              <button
                onClick={() => { setViewMode('create'); setCreateSubView('post'); setShowPostEditor(true); }}
                className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-accent-primary to-accent-dark text-white rounded-xl hover:opacity-90"
              >
                <Plus size={24} />
                <span className="text-sm font-medium">Neuer Post</span>
              </button>
              <button
                onClick={() => { setViewMode('create'); setCreateSubView('post'); setShowAiGenerator(true); }}
                className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-accent-light0 to-pink-500 text-white rounded-xl hover:opacity-90"
              >
                <Sparkles size={24} />
                <span className="text-sm font-medium">KI-Post</span>
              </button>
              <button
                onClick={() => setViewMode('stories')}
                className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-xl hover:opacity-90"
              >
                <Film size={24} />
                <span className="text-sm font-medium">Story erstellen</span>
              </button>
              <button
                onClick={() => { setViewMode('ai-tools'); setAIToolsSubView('trends'); }}
                className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-green-500 to-teal-500 text-white rounded-xl hover:opacity-90"
              >
                <TrendingUp size={24} />
                <span className="text-sm font-medium">Trends nutzen</span>
              </button>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Posts */}
            <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold dark:text-white">Nächste Posts</h3>
                <button
                  onClick={() => setViewMode('calendar')}
                  className="text-sm text-accent-primary hover:underline flex items-center gap-1"
                >
                  Alle anzeigen <ArrowRight size={14} />
                </button>
              </div>
              <div className="space-y-3">
                {posts
                  .filter(p => p.status === 'scheduled' && p.scheduledAt)
                  .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
                  .slice(0, 5)
                  .map(post => (
                    <div key={post.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                      <div className="flex-shrink-0 p-2 bg-accent-lighter dark:bg-accent-primary/30 rounded">
                        <Clock size={16} className="text-accent-primary dark:text-accent-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm dark:text-white truncate">{post.content.substring(0, 60)}...</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(post.scheduledAt!).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => { setEditingPost(post); setShowPostEditor(true); setViewMode('create'); }}
                        className="p-1 text-gray-400 hover:text-gray-600"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>
                  ))}
                {posts.filter(p => p.status === 'scheduled').length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">Keine geplanten Posts</p>
                )}
              </div>
            </div>

            {/* Draft Posts */}
            <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold dark:text-white">Entwürfe bearbeiten</h3>
                <span className="text-xs px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                  {posts.filter(p => p.status === 'draft').length} offen
                </span>
              </div>
              <div className="space-y-3">
                {posts
                  .filter(p => p.status === 'draft')
                  .slice(0, 5)
                  .map(post => (
                    <div key={post.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                      <div className="flex-shrink-0 p-2 bg-amber-100 dark:bg-amber-900/30 rounded">
                        <Edit2 size={16} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm dark:text-white truncate">{post.content.substring(0, 60)}...</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Erstellt: {new Date(post.createdAt).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingPost(post); setShowPostEditor(true); setViewMode('create'); }}
                          className="p-1 text-gray-400 hover:text-accent-primary"
                          title="Bearbeiten"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            const nextSlot = new Date();
                            nextSlot.setDate(nextSlot.getDate() + 1);
                            nextSlot.setHours(9, 0, 0, 0);
                            await socialMediaApi.updatePost(post.id, { scheduledAt: nextSlot.toISOString(), status: 'scheduled' });
                            loadData();
                          }}
                          className="p-1 text-gray-400 hover:text-green-600"
                          title="Schnell planen"
                        >
                          <Clock size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                {posts.filter(p => p.status === 'draft').length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">Keine Entwürfe</p>
                )}
              </div>
            </div>
          </div>

          {/* Workflow Suggestions */}
          <div className="bg-gradient-to-r from-accent-light to-accent-light dark:from-accent-primary/20 dark:to-accent-primary/20 rounded-xl p-6 border border-accent-primary/30 dark:border-accent-primary/40">
            <h3 className="font-semibold dark:text-white mb-3 flex items-center gap-2">
              <Lightbulb size={20} className="text-amber-500" />
              Empfehlungen
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {autopilotSettings.enabled ? (
                <div className="p-4 bg-white/50 dark:bg-dark-100/50 rounded-lg">
                  <p className="text-sm font-medium dark:text-white">Autopilot aktiv</p>
                  <p className="text-xs text-gray-500 mt-1">{autopilotSettings.postsPerWeek} Posts/Woche geplant</p>
                  <button
                    onClick={() => { setViewMode('ai-tools'); setAIToolsSubView('autopilot'); }}
                    className="mt-2 text-xs text-accent-primary hover:underline"
                  >
                    Verwalten →
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-white/50 dark:bg-dark-100/50 rounded-lg">
                  <p className="text-sm font-medium dark:text-white">Autopilot aktivieren</p>
                  <p className="text-xs text-gray-500 mt-1">Lass KI deine Posts automatisch erstellen</p>
                  <button
                    onClick={() => { setViewMode('ai-tools'); setAIToolsSubView('autopilot'); }}
                    className="mt-2 text-xs text-accent-primary hover:underline"
                  >
                    Einrichten →
                  </button>
                </div>
              )}
              <div className="p-4 bg-white/50 dark:bg-dark-100/50 rounded-lg">
                <p className="text-sm font-medium dark:text-white">Trends erkunden</p>
                <p className="text-xs text-gray-500 mt-1">Finde aktuelle Themen für mehr Reichweite</p>
                <button
                  onClick={() => { setViewMode('ai-tools'); setAIToolsSubView('trends'); }}
                  className="mt-2 text-xs text-accent-primary hover:underline"
                >
                  Trends ansehen →
                </button>
              </div>
              <div className="p-4 bg-white/50 dark:bg-dark-100/50 rounded-lg">
                <p className="text-sm font-medium dark:text-white">Content remixen</p>
                <p className="text-xs text-gray-500 mt-1">Verwandle Blogposts in Social Content</p>
                <button
                  onClick={() => { setViewMode('create'); setCreateSubView('remix'); }}
                  className="mt-2 text-xs text-accent-primary hover:underline"
                >
                  Content remixen →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                if (currentMonth === 0) {
                  setCurrentMonth(11);
                  setCurrentYear(currentYear - 1);
                } else {
                  setCurrentMonth(currentMonth - 1);
                }
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="text-lg font-semibold dark:text-white">
              {new Date(currentYear, currentMonth).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={() => {
                if (currentMonth === 11) {
                  setCurrentMonth(0);
                  setCurrentYear(currentYear + 1);
                } else {
                  setCurrentMonth(currentMonth + 1);
                }
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-dark-400 py-2">
                {day}
              </div>
            ))}
            {calendarDays.map((day, idx) => {
              const dayPosts = day ? getPostsForDay(day) : [];
              const isToday = day === new Date().getDate() &&
                             currentMonth === new Date().getMonth() &&
                             currentYear === new Date().getFullYear();

              return (
                <div
                  key={idx}
                  className={`min-h-[80px] p-1 border border-gray-100 dark:border-dark-200 rounded-lg ${
                    day ? 'bg-gray-50 dark:bg-dark-50' : ''
                  } ${isToday ? 'ring-2 ring-accent-primary' : ''}`}
                >
                  {day && (
                    <>
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-accent-primary' : 'text-gray-700 dark:text-dark-500'}`}>
                        {day}
                      </div>
                      <div className="space-y-1">
                        {dayPosts.slice(0, 2).map(post => (
                          <div
                            key={post.id}
                            onClick={() => openPostEditor(post)}
                            className={`text-xs p-1 rounded truncate cursor-pointer ${
                              post.status === 'published'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : post.status === 'scheduled'
                                ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary'
                                : 'bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                            }`}
                          >
                            {post.title || post.content.substring(0, 20)}...
                          </div>
                        ))}
                        {dayPosts.length > 2 && (
                          <div className="text-xs text-gray-500">+{dayPosts.length - 2} mehr</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              Noch keine Posts erstellt
            </div>
          ) : (
            posts.map(post => (
              <div
                key={post.id}
                className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      post.status === 'published'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : post.status === 'scheduled'
                        ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary'
                        : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                    }`}>
                      {post.status === 'published' ? 'Veröffentlicht' :
                       post.status === 'scheduled' ? 'Geplant' : 'Entwurf'}
                    </span>
                    {post.aiGenerated && (
                      <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-accent-lighter dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary">
                        <Sparkles size={12} />
                        KI
                      </span>
                    )}
                    {post.evergreen && (
                      <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <Recycle size={12} />
                        Evergreen
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleEvergreen(post.id, post.evergreen || false)}
                      className={`p-2 rounded-lg ${post.evergreen ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'hover:bg-gray-100 dark:hover:bg-dark-200 text-gray-500'}`}
                      title={post.evergreen ? 'Evergreen-Status entfernen' : 'Als Evergreen markieren'}
                    >
                      <Recycle size={16} />
                    </button>
                    <button
                      onClick={() => openPostEditor(post)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg text-gray-500"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deletePost(post.id)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {post.title && (
                  <h4 className="font-medium dark:text-white mb-1">{post.title}</h4>
                )}
                <p className="text-gray-700 dark:text-dark-500 whitespace-pre-wrap line-clamp-3">
                  {post.content}
                </p>
                {post.hashtags && post.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {post.hashtags.map((tag, idx) => (
                      <span key={idx} className="text-xs text-accent-primary">{tag}</span>
                    ))}
                  </div>
                )}
                {post.scheduledAt && (
                  <div className="flex items-center gap-1 mt-2 text-sm text-gray-500 dark:text-dark-400">
                    <Clock size={14} />
                    {new Date(post.scheduledAt).toLocaleString('de-DE')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Create View - with Sub-Tabs */}
      {viewMode === 'create' && (
        <div className="space-y-6">
          {/* Sub-Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-dark-200 pb-4 overflow-x-auto">
            {[
              { id: 'post', label: 'Einzelpost', icon: PenTool },
              { id: 'carousel', label: 'Carousel', icon: Layers },
              { id: 'batch', label: 'Batch', icon: ListOrdered },
              { id: 'remix', label: 'Remix', icon: RefreshCw },
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setCreateSubView(sub.id as CreateSubView)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  createSubView === sub.id
                    ? 'bg-accent-primary text-white'
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-gray-200'
                }`}
              >
                <sub.icon size={16} />
                {sub.label}
              </button>
            ))}
          </div>

          {/* Single Post Sub-View */}
          {createSubView === 'post' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Manual Post Card */}
                <div
                  onClick={() => setShowPostEditor(true)}
                  className="bg-white dark:bg-dark-100 rounded-xl p-6 border-2 border-dashed border-gray-300 dark:border-dark-200 hover:border-accent-primary cursor-pointer transition-colors"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-accent-lighter dark:bg-accent-primary/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <PenTool size={28} className="text-accent-primary" />
                    </div>
                    <h3 className="font-semibold dark:text-white mb-2">Manuell erstellen</h3>
                    <p className="text-sm text-gray-500">Schreibe deinen Post selbst mit voller Kontrolle</p>
                  </div>
                </div>

                {/* AI Post Card */}
                <div
                  onClick={() => setShowAiGenerator(true)}
                  className="bg-white dark:bg-dark-100 rounded-xl p-6 border-2 border-dashed border-gray-300 dark:border-dark-200 hover:border-accent-primary cursor-pointer transition-colors"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-accent-lighter dark:bg-accent-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles size={28} className="text-accent-primary" />
                    </div>
                    <h3 className="font-semibold dark:text-white mb-2">KI-Generierung</h3>
                    <p className="text-sm text-gray-500">Lass KI einen Post basierend auf deinem Thema erstellen</p>
                  </div>
                </div>

                {/* Content Wizard Card */}
                <div
                  onClick={() => {
                    setShowContentWizard(true);
                    setWizardStep('goal');
                    setWizardTopic('');
                    setWizardContent(null);
                    setWizardAnalysis(null);
                    setWizardGeneratedImage(null);
                  }}
                  className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border-2 border-amber-200 dark:border-amber-800 hover:border-amber-400 cursor-pointer transition-colors md:col-span-2"
                >
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Wand2 size={36} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg dark:text-white mb-1">Content Wizard</h3>
                      <p className="text-sm text-gray-600 dark:text-dark-400 mb-2">
                        Der Marketing-Experte erstellt professionellen Content mit kritischer Analyse und DALL-E Bildgenerierung
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <Sparkles size={12} /> Empfohlen für Lead-Generierung
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Drafts */}
              {posts.filter(p => p.status === 'draft').length > 0 && (
                <div className="bg-white dark:bg-dark-100 rounded-xl p-6 border border-gray-200 dark:border-dark-200">
                  <h3 className="font-semibold dark:text-white mb-4">Aktuelle Entwürfe</h3>
                  <div className="space-y-3">
                    {posts.filter(p => p.status === 'draft').slice(0, 3).map(post => (
                      <div key={post.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="text-sm dark:text-white truncate">{post.content.substring(0, 80)}...</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(post.createdAt).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <button
                          onClick={() => openPostEditor(post)}
                          className="px-3 py-1 text-sm bg-accent-primary text-white rounded-lg"
                        >
                          Bearbeiten
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Carousel Sub-View */}
          {createSubView === 'carousel' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Layers size={28} />
                  <h2 className="text-xl font-bold">Carousel Generator</h2>
                </div>
                <p className="opacity-90">Erstelle virale Carousel-Posts für Instagram & LinkedIn mit 3x mehr Engagement.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Settings */}
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                  <h3 className="font-semibold dark:text-white mb-4">Carousel Einstellungen</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-1">Thema *</label>
                      <input
                        type="text"
                        value={carouselTopic}
                        onChange={(e) => setCarouselTopic(e.target.value)}
                        placeholder="z.B. 5 Tipps für produktiveres Arbeiten"
                        className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium dark:text-dark-500 mb-1">Plattform</label>
                        <select
                          value={carouselPlatform}
                          onChange={(e) => setCarouselPlatform(e.target.value as 'instagram' | 'linkedin')}
                          className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                        >
                          <option value="instagram">Instagram</option>
                          <option value="linkedin">LinkedIn</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium dark:text-dark-500 mb-1">Anzahl Slides</label>
                        <input
                          type="number"
                          value={carouselSlideCount}
                          onChange={(e) => setCarouselSlideCount(Math.min(15, Math.max(3, parseInt(e.target.value) || 7)))}
                          min={3}
                          max={15}
                          className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium dark:text-dark-500 mb-1">Stil</label>
                        <select
                          value={carouselStyle}
                          onChange={(e) => setCarouselStyle(e.target.value as any)}
                          className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                        >
                          <option value="tips">Tipps & Tricks</option>
                          <option value="listicle">Listicle (5 Gründe...)</option>
                          <option value="how-to">How-To Anleitung</option>
                          <option value="educational">Lehrreich</option>
                          <option value="storytelling">Storytelling</option>
                          <option value="myth-busting">Mythen aufdecken</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium dark:text-dark-500 mb-1">Tonalität</label>
                        <select
                          value={carouselTone}
                          onChange={(e) => setCarouselTone(e.target.value as any)}
                          className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                        >
                          <option value="professional">Professionell</option>
                          <option value="casual">Locker</option>
                          <option value="inspirational">Inspirierend</option>
                          <option value="bold">Mutig/Provokant</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-1">Zielgruppe (optional)</label>
                      <input
                        type="text"
                        value={carouselTargetAudience}
                        onChange={(e) => setCarouselTargetAudience(e.target.value)}
                        placeholder="z.B. Unternehmer, Startups, Freelancer"
                        className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium dark:text-dark-500 mb-1">Primärfarbe</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={carouselBrandColors.primary}
                            onChange={(e) => setCarouselBrandColors(c => ({ ...c, primary: e.target.value }))}
                            className="w-10 h-10 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={carouselBrandColors.primary}
                            onChange={(e) => setCarouselBrandColors(c => ({ ...c, primary: e.target.value }))}
                            className="flex-1 px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium dark:text-dark-500 mb-1">Sekundärfarbe</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={carouselBrandColors.secondary}
                            onChange={(e) => setCarouselBrandColors(c => ({ ...c, secondary: e.target.value }))}
                            className="w-10 h-10 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={carouselBrandColors.secondary}
                            onChange={(e) => setCarouselBrandColors(c => ({ ...c, secondary: e.target.value }))}
                            className="flex-1 px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={carouselIncludeEmojis}
                        onChange={(e) => setCarouselIncludeEmojis(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm dark:text-dark-500">Emojis verwenden</span>
                    </label>

                    <button
                      onClick={generateCarousel}
                      disabled={carouselGenerating || !carouselTopic.trim()}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-500 to-accent-primary text-white rounded-lg disabled:opacity-50 font-medium"
                    >
                      {carouselGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                      {carouselGenerating ? 'Generiere...' : 'Carousel generieren'}
                    </button>
                  </div>
                </div>

                {/* Preview / Results */}
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                  {!carouselContent ? (
                    <div className="text-center py-12 text-gray-500">
                      <Layers size={48} className="mx-auto mb-4 opacity-30" />
                      <p>Generiere einen Carousel um die Vorschau zu sehen</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold dark:text-white">{carouselContent.title}</h3>
                        <span className="text-xs px-2 py-1 bg-accent-lighter dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary rounded">
                          {carouselContent.totalSlides} Slides
                        </span>
                      </div>

                      {/* Slide Preview */}
                      <div className="relative bg-gray-100 dark:bg-dark-200 rounded-xl overflow-hidden" style={{ aspectRatio: carouselPlatform === 'instagram' ? '4/5' : '1/1' }}>
                        {carouselContent.slides[carouselCurrentSlide] && (
                          <div
                            className="absolute inset-0 p-6 flex flex-col justify-center"
                            style={{ backgroundColor: carouselContent.colorScheme.background }}
                          >
                            <div className="text-center">
                              {carouselContent.slides[carouselCurrentSlide].emoji && (
                                <span className="text-4xl mb-4 block">{carouselContent.slides[carouselCurrentSlide].emoji}</span>
                              )}
                              <h4 className="text-xl font-bold mb-3" style={{ color: carouselContent.colorScheme.primary }}>
                                {carouselContent.slides[carouselCurrentSlide].headline}
                              </h4>
                              <p className="text-sm" style={{ color: carouselContent.colorScheme.text }}>
                                {carouselContent.slides[carouselCurrentSlide].body}
                              </p>
                              {carouselContent.slides[carouselCurrentSlide].bulletPoints?.map((bp, i) => (
                                <p key={i} className="text-sm mt-2" style={{ color: carouselContent.colorScheme.text }}>
                                  • {bp}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Navigation */}
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                          {carouselContent.slides.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => setCarouselCurrentSlide(idx)}
                              className={`w-2 h-2 rounded-full transition-colors ${
                                idx === carouselCurrentSlide ? 'bg-accent-primary' : 'bg-gray-400'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Arrow navigation */}
                        <button
                          onClick={() => setCarouselCurrentSlide(Math.max(0, carouselCurrentSlide - 1))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full"
                          disabled={carouselCurrentSlide === 0}
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          onClick={() => setCarouselCurrentSlide(Math.min(carouselContent.slides.length - 1, carouselCurrentSlide + 1))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-white/80 rounded-full"
                          disabled={carouselCurrentSlide === carouselContent.slides.length - 1}
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>

                      {/* Slide Info */}
                      <div className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium uppercase text-gray-500">
                            Slide {carouselCurrentSlide + 1} - {carouselContent.slides[carouselCurrentSlide]?.type}
                          </span>
                        </div>
                        {carouselContent.slides[carouselCurrentSlide]?.designNote && (
                          <p className="text-xs text-gray-500">
                            Design: {carouselContent.slides[carouselCurrentSlide].designNote}
                          </p>
                        )}
                      </div>

                      {/* Color Scheme */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Farbschema:</span>
                        <div className="flex gap-1">
                          {Object.entries(carouselContent.colorScheme).map(([key, color]) => (
                            <div
                              key={key}
                              className="w-6 h-6 rounded border border-gray-200"
                              style={{ backgroundColor: color }}
                              title={key}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Caption */}
                      <div className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <p className="text-xs font-medium text-gray-500 mb-1">Caption:</p>
                        <p className="text-sm dark:text-white">{carouselContent.caption}</p>
                      </div>

                      {/* Hashtags */}
                      <div className="flex flex-wrap gap-1">
                        {carouselContent.hashtags.map((tag, i) => (
                          <span key={i} className="text-xs text-accent-primary">#{tag}</span>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-4 border-t dark:border-dark-200">
                        <button
                          onClick={() => socialMediaApi.exportCarousel(carouselContent, 'text')}
                          className="flex items-center gap-1 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-sm"
                        >
                          <FileText size={16} />
                          Für Canva exportieren
                        </button>
                        <button
                          onClick={() => socialMediaApi.exportCarousel(carouselContent, 'json')}
                          className="flex items-center gap-1 px-3 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg text-sm"
                        >
                          <FileCode size={16} />
                          JSON Export
                        </button>
                        <button
                          onClick={generateCarouselImages}
                          disabled={carouselGeneratingImages}
                          className="flex items-center gap-1 px-3 py-2 bg-accent-lighter dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary rounded-lg text-sm"
                        >
                          {carouselGeneratingImages ? <Loader2 size={16} className="animate-spin" /> : <Image size={16} />}
                          Bilder generieren
                        </button>
                        <button
                          onClick={() => saveCarousel()}
                          className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg text-sm ml-auto"
                        >
                          <Check size={16} />
                          Speichern
                        </button>
                      </div>

                      {/* Canva Instructions */}
                      {carouselContent.canvaInstructions && (
                        <div className="p-4 bg-accent-light dark:bg-accent-primary/20 rounded-lg">
                          <h4 className="text-sm font-medium text-accent-dark dark:text-accent-primary mb-2 flex items-center gap-2">
                            <Lightbulb size={16} />
                            Canva-Anleitung
                          </h4>
                          <p className="text-sm text-accent-dark dark:text-accent-primary">{carouselContent.canvaInstructions}</p>
                        </div>
                      )}

                      {/* Design Tips */}
                      {carouselContent.designTips?.length > 0 && (
                        <div className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                          <h4 className="text-sm font-medium dark:text-white mb-2">Design-Tipps</h4>
                          <ul className="text-sm text-gray-600 dark:text-dark-400 space-y-1">
                            {carouselContent.designTips.map((tip, i) => (
                              <li key={i}>• {tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Batch Sub-View - Uses existing batch content */}
          {createSubView === 'batch' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-accent-primary to-accent-primary rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Layers size={28} />
                  <h2 className="text-xl font-bold">Batch-Generierung</h2>
                </div>
                <p className="opacity-90">Erstelle mehrere Posts auf einmal aus einer Liste von Themen.</p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                      Themen (ein Thema pro Zeile)
                    </label>
                    <textarea
                      value={batchTopics}
                      onChange={(e) => setBatchTopics(e.target.value)}
                      placeholder="Thema 1&#10;Thema 2&#10;Thema 3..."
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Plattform</label>
                      <select
                        value={batchPlatform}
                        onChange={(e) => setBatchPlatform(e.target.value as Platform)}
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      >
                        <option value="linkedin">LinkedIn</option>
                        <option value="twitter">Twitter</option>
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Ton</label>
                      <select
                        value={batchTone}
                        onChange={(e) => setBatchTone(e.target.value as any)}
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      >
                        <option value="professional">Professionell</option>
                        <option value="casual">Locker</option>
                        <option value="humorous">Humorvoll</option>
                        <option value="informative">Informativ</option>
                      </select>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm mt-6">
                        <input
                          type="checkbox"
                          checked={batchAutoSchedule}
                          onChange={(e) => setBatchAutoSchedule(e.target.checked)}
                          className="rounded"
                        />
                        <span className="dark:text-dark-500">Auto-Planen</span>
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Posts/Tag</label>
                      <input
                        type="number"
                        value={batchPostsPerDay}
                        onChange={(e) => setBatchPostsPerDay(parseInt(e.target.value) || 1)}
                        min={1}
                        max={10}
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                    </div>
                  </div>

                  <button
                    onClick={generateBatch}
                    disabled={batchGenerating || !batchTopics.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-primary text-white rounded-lg disabled:opacity-50"
                  >
                    {batchGenerating ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
                    {batchGenerating ? 'Generiere...' : 'Batch generieren'}
                  </button>
                </div>

                {/* Batch Results */}
                {batchResults.length > 0 && (
                  <div className="mt-6 pt-6 border-t dark:border-dark-200">
                    <h3 className="font-semibold dark:text-white mb-4">Generierte Posts ({batchResults.length})</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {batchResults.map((result, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-xs text-gray-500 mb-1">Thema: {result.topic}</p>
                              <p className="text-sm dark:text-white">{result.content}</p>
                              {result.scheduledAt && (
                                <p className="text-xs text-accent-primary mt-2">
                                  Geplant: {new Date(result.scheduledAt).toLocaleString('de-DE')}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setPostContent(result.content);
                                setPostHashtags(result.hashtags);
                                setShowPostEditor(true);
                              }}
                              className="text-accent-primary text-sm"
                            >
                              Bearbeiten
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Remix Sub-View - Uses existing remix content */}
          {createSubView === 'remix' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <RefreshCw size={28} />
                  <h2 className="text-xl font-bold">Content Remix</h2>
                </div>
                <p className="opacity-90">Verwandle Blog-Artikel, Transkripte oder Newsletters in Social Media Posts.</p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Quell-Typ</label>
                    <select
                      value={remixSourceType}
                      onChange={(e) => setRemixSourceType(e.target.value as any)}
                      className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                    >
                      <option value="blog">Blog-Artikel</option>
                      <option value="transcript">Video/Podcast Transkript</option>
                      <option value="article">Fachartikel</option>
                      <option value="newsletter">Newsletter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Quell-Content
                    </label>
                    <textarea
                      value={remixSourceContent}
                      onChange={(e) => setRemixSourceContent(e.target.value)}
                      placeholder="Füge hier deinen bestehenden Content ein..."
                      rows={8}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                      Output-Plattformen
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['linkedin', 'twitter', 'instagram', 'facebook'].map(p => {
                        const existing = remixPlatforms.find(rp => rp.platform === p);
                        return (
                          <button
                            key={p}
                            onClick={() => {
                              if (existing) {
                                setRemixPlatforms(remixPlatforms.filter(rp => rp.platform !== p));
                              } else {
                                setRemixPlatforms([...remixPlatforms, { platform: p, count: 3 }]);
                              }
                            }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                              existing
                                ? 'bg-accent-primary text-white'
                                : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                            }`}
                          >
                            {PLATFORM_ICONS[p]}
                            <span className="capitalize">{p}</span>
                            {existing && <span className="text-xs">({existing.count})</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={handleRemix}
                    disabled={remixing || !remixSourceContent.trim() || remixPlatforms.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {remixing ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}
                    {remixing ? 'Remixe...' : 'Content remixen'}
                  </button>
                </div>

                {/* Remix Results */}
                {remixOutputs.length > 0 && (
                  <div className="mt-6 pt-6 border-t dark:border-dark-200">
                    <h3 className="font-semibold dark:text-white mb-4">Generierte Posts</h3>
                    <div className="space-y-4">
                      {remixOutputs.map((output, idx) => (
                        <div key={idx} className="border dark:border-dark-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-dark-200">
                            {PLATFORM_ICONS[output.platform]}
                            <span className="font-medium dark:text-white capitalize">{output.platform}</span>
                            <span className="text-sm text-gray-500">({output.posts.length} Posts)</span>
                          </div>
                          <div className="p-4 space-y-3">
                            {output.posts.map((post, postIdx) => (
                              <div key={postIdx} className="p-3 bg-gray-50 dark:bg-dark-300 rounded-lg">
                                <p className="text-sm dark:text-white">{post.content}</p>
                                <div className="flex items-center justify-between mt-2">
                                  <div className="flex flex-wrap gap-1">
                                    {post.hashtags.slice(0, 3).map(tag => (
                                      <span key={tag} className="text-xs text-accent-primary">#{tag}</span>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setPostContent(post.content);
                                      setPostHashtags(post.hashtags);
                                      setPostPlatforms([output.platform as Platform]);
                                      setShowPostEditor(true);
                                    }}
                                    className="text-xs text-accent-primary"
                                  >
                                    Als Post verwenden
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI-Tools View - with Sub-Tabs */}
      {viewMode === 'ai-tools' && (
        <div className="space-y-6">
          {/* Sub-Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-dark-200 pb-4">
            {[
              { id: 'autopilot', label: 'Autopilot', icon: Zap },
              { id: 'trends', label: 'Trend-Radar', icon: TrendingUp },
              { id: 'ideas', label: 'Ideen-Generator', icon: Lightbulb },
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setAIToolsSubView(sub.id as AIToolsSubView)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  aiToolsSubView === sub.id
                    ? 'bg-accent-primary text-white'
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-gray-200'
                }`}
              >
                <sub.icon size={16} />
                {sub.label}
              </button>
            ))}
          </div>

          {/* Autopilot Sub-View */}
          {aiToolsSubView === 'autopilot' && (
            <div className="space-y-6">
              <div className={`rounded-xl p-6 ${autopilotSettings.enabled ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-gray-500 to-gray-600'} text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Zap size={28} />
                    <div>
                      <h2 className="text-xl font-bold">Social Media Autopilot</h2>
                      <p className="opacity-90">KI erstellt und plant Posts automatisch basierend auf deinen Vorgaben.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutopilotSettings(s => ({ ...s, enabled: !s.enabled }))}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      autopilotSettings.enabled
                        ? 'bg-white/20 hover:bg-white/30'
                        : 'bg-white text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    {autopilotSettings.enabled ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Settings */}
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                  <h3 className="font-semibold dark:text-white mb-4">Einstellungen</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-1">Posts pro Woche</label>
                      <input
                        type="number"
                        value={autopilotSettings.postsPerWeek}
                        onChange={(e) => setAutopilotSettings(s => ({ ...s, postsPerWeek: parseInt(e.target.value) || 1 }))}
                        min={1}
                        max={21}
                        className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-1">Zielgruppe</label>
                      <input
                        type="text"
                        value={autopilotSettings.targetAudience}
                        onChange={(e) => setAutopilotSettings(s => ({ ...s, targetAudience: e.target.value }))}
                        placeholder="z.B. IT-Entscheider, Startups..."
                        className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-2">Content-Themen</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {autopilotSettings.contentThemes.map((theme, idx) => (
                          <span key={idx} className="flex items-center gap-1 px-2 py-1 bg-accent-lighter dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary rounded text-sm">
                            {theme}
                            <button onClick={() => setAutopilotSettings(s => ({ ...s, contentThemes: s.contentThemes.filter((_, i) => i !== idx) }))}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTheme}
                          onChange={(e) => setNewTheme(e.target.value)}
                          placeholder="Neues Thema..."
                          className="flex-1 px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newTheme.trim()) {
                              setAutopilotSettings(s => ({ ...s, contentThemes: [...s.contentThemes, newTheme.trim()] }));
                              setNewTheme('');
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (newTheme.trim()) {
                              setAutopilotSettings(s => ({ ...s, contentThemes: [...s.contentThemes, newTheme.trim()] }));
                              setNewTheme('');
                            }
                          }}
                          className="px-3 py-2 bg-accent-primary text-white rounded-lg"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Generate */}
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                  <h3 className="font-semibold dark:text-white mb-4">Vorschau generieren</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Generiere eine Vorschau der nächsten Autopilot-Posts zur Überprüfung.
                  </p>
                  <button
                    onClick={handleGenerateAutopilot}
                    disabled={autopilotGenerating || autopilotSettings.contentThemes.length === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-accent-light0 to-pink-500 text-white rounded-lg disabled:opacity-50"
                  >
                    {autopilotGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                    {autopilotGenerating ? 'Generiere...' : 'Posts generieren'}
                  </button>

                  {autopilotPending.length > 0 && (
                    <div className="mt-4 space-y-3 max-h-64 overflow-y-auto">
                      {autopilotPending.map((post, idx) => (
                        <div key={idx} className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                          <p className="text-sm dark:text-white line-clamp-2">{post.content}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                              {post.scheduledAt && new Date(post.scheduledAt).toLocaleDateString('de-DE')}
                            </span>
                            <div className="flex gap-2">
                              <button className="text-green-600 text-xs">Genehmigen</button>
                              <button className="text-red-600 text-xs">Ablehnen</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Trends Sub-View */}
          {aiToolsSubView === 'trends' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp size={28} />
                  <h2 className="text-xl font-bold">Trend-Radar</h2>
                </div>
                <p className="opacity-90">Entdecke aktuelle Trends in deiner Branche für virale Posts.</p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                <div className="flex gap-4 mb-6">
                  <input
                    type="text"
                    value={trendsIndustry}
                    onChange={(e) => setTrendsIndustry(e.target.value)}
                    placeholder="Branche eingeben..."
                    className="flex-1 px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                  />
                  <button
                    onClick={loadTrends}
                    disabled={trendsLoading}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg disabled:opacity-50"
                  >
                    {trendsLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    Trends finden
                  </button>
                </div>

                {trends.length > 0 && (
                  <div className="space-y-4">
                    {trends.map((trend, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium dark:text-white">{trend.topic}</h4>
                            <p className="text-sm text-gray-600 dark:text-dark-400">{trend.description}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded ${
                            trend.relevance === 'high' ? 'bg-green-100 text-green-700' :
                            trend.relevance === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {trend.relevance === 'high' ? 'Hoch' : trend.relevance === 'medium' ? 'Mittel' : 'Niedrig'}
                          </span>
                        </div>
                        {trend.suggestedAngles && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {trend.suggestedAngles.map((angle, aIdx) => (
                              <button
                                key={aIdx}
                                onClick={() => {
                                  setSelectedTrend(trend);
                                  setWizardTopic(angle);
                                  setShowContentWizard(true);
                                }}
                                className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded hover:bg-orange-200"
                              >
                                {angle}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ideas Sub-View */}
          {aiToolsSubView === 'ideas' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-yellow-500 to-amber-500 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Lightbulb size={28} />
                  <h2 className="text-xl font-bold">Ideen-Generator</h2>
                </div>
                <p className="opacity-90">Generiere kreative Content-Ideen basierend auf deinen Themen.</p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium dark:text-dark-500 mb-1">Themenbereich</label>
                    <input
                      type="text"
                      value={ideasCategory}
                      onChange={(e) => setIdeasCategory(e.target.value)}
                      placeholder="z.B. Cloud Computing, Digitalisierung..."
                      className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium dark:text-dark-500 mb-1">Anzahl Ideen</label>
                    <input
                      type="number"
                      value={ideasCount}
                      onChange={(e) => setIdeasCount(parseInt(e.target.value) || 5)}
                      min={1}
                      max={20}
                      className="w-full px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                    />
                  </div>
                </div>

                <button
                  onClick={generateIdeas}
                  disabled={generatingIdeas || !ideasCategory.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-lg disabled:opacity-50"
                >
                  {generatingIdeas ? <Loader2 size={20} className="animate-spin" /> : <Lightbulb size={20} />}
                  {generatingIdeas ? 'Generiere Ideen...' : 'Ideen generieren'}
                </button>

                {generatedIdeas.length > 0 && (
                  <div className="mt-6 space-y-3">
                    <h3 className="font-semibold dark:text-white">Generierte Ideen</h3>
                    {generatedIdeas.map((idea, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <span className="dark:text-white">{idea}</span>
                        <button
                          onClick={() => {
                            setWizardTopic(idea);
                            setShowContentWizard(true);
                            setWizardStep('goal');
                          }}
                          className="text-sm text-accent-primary hover:underline"
                        >
                          Post erstellen
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Library View - with Sub-Tabs */}
      {viewMode === 'library' && (
        <div className="space-y-6">
          {/* Sub-Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-dark-200 pb-4">
            {[
              { id: 'evergreen', label: 'Evergreen', icon: Recycle },
              { id: 'templates', label: 'Vorlagen', icon: FileText },
              { id: 'hashtags', label: 'Hashtag-Gruppen', icon: Hash },
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setLibrarySubView(sub.id as LibrarySubView)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  librarySubView === sub.id
                    ? 'bg-accent-primary text-white'
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-gray-200'
                }`}
              >
                <sub.icon size={16} />
                {sub.label}
              </button>
            ))}
          </div>

          {/* Evergreen Sub-View */}
          {librarySubView === 'evergreen' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-500 to-teal-500 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Recycle size={28} />
                  <h2 className="text-xl font-bold">Evergreen Content</h2>
                </div>
                <p className="opacity-90">Zeitlose Posts die du regelmäßig wiederverwenden kannst.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {evergreenPosts.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <Recycle size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Evergreen-Posts</p>
                    <p className="text-sm mt-1">Markiere Posts als Evergreen um sie hier zu sehen</p>
                  </div>
                ) : (
                  evergreenPosts.map(post => (
                    <div key={post.id} className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                      <p className="text-sm dark:text-white line-clamp-4 mb-3">{post.content}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {post.publishedAt ? `Zuletzt: ${new Date(post.publishedAt).toLocaleDateString('de-DE')}` : 'Nie veröffentlicht'}
                        </span>
                        <button
                          onClick={() => {
                            setRecyclingPost(post);
                            setShowRecycleModal(true);
                          }}
                          className="flex items-center gap-1 text-sm text-green-600"
                        >
                          <RefreshCw size={14} />
                          Recyceln
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Templates Sub-View */}
          {librarySubView === 'templates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold dark:text-white">Post-Vorlagen</h2>
                <button
                  onClick={() => setShowTemplateEditor(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg"
                >
                  <Plus size={18} />
                  Neue Vorlage
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Vorlagen erstellt</p>
                  </div>
                ) : (
                  templates.map(template => (
                    <div key={template.id} className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium dark:text-white">{template.name}</h4>
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-dark-200 rounded">
                          {template.platform === 'all' ? 'Alle' : template.platform}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-dark-400 line-clamp-3 mb-3">{template.content}</p>
                      <button
                        onClick={() => useTemplate(template)}
                        className="text-sm text-accent-primary hover:underline"
                      >
                        Vorlage verwenden
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Hashtags Sub-View */}
          {librarySubView === 'hashtags' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold dark:text-white">Hashtag-Gruppen</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowHashtagResearch(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg"
                  >
                    <Search size={18} />
                    Hashtag-Recherche
                  </button>
                  <button
                    onClick={() => setShowHashtagEditor(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg"
                  >
                    <Plus size={18} />
                    Neue Gruppe
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hashtagGroups.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <Hash size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Hashtag-Gruppen</p>
                  </div>
                ) : (
                  hashtagGroups.map(group => (
                    <div key={group.id} className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                      <h4 className="font-medium dark:text-white mb-2">{group.name}</h4>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {group.hashtags.slice(0, 8).map((tag, idx) => (
                          <span key={idx} className="text-xs px-2 py-1 bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary rounded">
                            #{tag}
                          </span>
                        ))}
                        {group.hashtags.length > 8 && (
                          <span className="text-xs text-gray-500">+{group.hashtags.length - 8}</span>
                        )}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(group.hashtags.map(t => `#${t}`).join(' '))}
                        className="flex items-center gap-1 text-sm text-accent-primary"
                      >
                        <Copy size={14} />
                        Alle kopieren
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Templates View */}
      {viewMode === 'templates' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowTemplateEditor(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
          >
            <Plus size={18} />
            Neue Vorlage
          </button>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(template => (
              <div
                key={template.id}
                className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium dark:text-white">{template.name}</h4>
                  <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-dark-200 rounded">
                    {template.platform === 'all' ? 'Alle' : template.platform}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-dark-400 line-clamp-3 mb-3">
                  {template.content}
                </p>
                <button
                  onClick={() => useTemplate(template)}
                  className="text-sm text-accent-primary hover:underline"
                >
                  Vorlage verwenden
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hashtag Groups View */}
      {viewMode === 'hashtags' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowHashtagEditor(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
          >
            <Plus size={18} />
            Neue Hashtag-Gruppe
          </button>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hashtagGroups.map(group => (
              <div
                key={group.id}
                className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4"
              >
                <h4 className="font-medium dark:text-white mb-2">{group.name}</h4>
                <div className="flex flex-wrap gap-1 mb-3">
                  {group.hashtags.slice(0, 8).map((tag, idx) => (
                    <span key={idx} className="text-xs px-2 py-1 bg-accent-primary/10 text-accent-primary rounded">
                      {tag}
                    </span>
                  ))}
                  {group.hashtags.length > 8 && (
                    <span className="text-xs text-gray-500">+{group.hashtags.length - 8}</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(group.hashtags.join(' '));
                  }}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-dark-500"
                >
                  <Copy size={14} />
                  Kopieren
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accounts View */}
      {viewMode === 'accounts' && (
        <div className="space-y-4">
          <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-4">
            <p className="text-sm text-accent-dark dark:text-accent-primary">
              <strong>Hinweis:</strong> Die direkte Verbindung zu Social Media Plattformen wird in einer zukünftigen Version verfügbar sein.
              Aktuell können Sie Posts planen und den Content dann manuell auf den Plattformen veröffentlichen.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['linkedin', 'twitter', 'facebook', 'instagram'].map(platform => {
              const account = accounts.find(a => a.platform === platform);
              return (
                <div
                  key={platform}
                  className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white ${PLATFORM_COLORS[platform]}`}>
                      {PLATFORM_ICONS[platform]}
                    </div>
                    <div>
                      <h4 className="font-medium dark:text-white capitalize">{platform}</h4>
                      <p className="text-sm text-gray-500">
                        {account ? account.accountName : 'Nicht verbunden'}
                      </p>
                    </div>
                    {account && (
                      <Check size={20} className="ml-auto text-green-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue View */}
      {viewMode === 'queue' && (
        <div className="space-y-4">
          {/* Queue Settings Summary */}
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold dark:text-white flex items-center gap-2">
                <Settings size={18} />
                Queue-Einstellungen
              </h3>
              <span className={`px-2 py-1 rounded text-xs ${queueSettings.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {queueSettings.enabled ? 'Aktiv' : 'Pausiert'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Posts/Tag:</span>
                <span className="ml-2 font-medium dark:text-white">{queueSettings.postsPerDay}</span>
              </div>
              <div>
                <span className="text-gray-500">Zeiten:</span>
                <span className="ml-2 font-medium dark:text-white">{queueSettings.preferredTimes.join(', ')}</span>
              </div>
              <div>
                <span className="text-gray-500">Wochenende:</span>
                <span className="ml-2 font-medium dark:text-white">{queueSettings.weekendPosting ? 'Ja' : 'Nein'}</span>
              </div>
              <div>
                <span className="text-gray-500">In Queue:</span>
                <span className="ml-2 font-medium dark:text-white">{queue.length} Posts</span>
              </div>
            </div>
          </div>

          {/* Queue List */}
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
            <h3 className="font-semibold dark:text-white mb-4">Geplante Posts</h3>
            {queue.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Keine Posts in der Queue. Nutze "Batch" um mehrere Posts auf einmal zu generieren.
              </p>
            ) : (
              <div className="space-y-3">
                {queue.map((post, idx) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg"
                  >
                    <span className="text-gray-400 font-mono text-sm">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm dark:text-white line-clamp-2">{post.content}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        <Clock size={12} className="inline mr-1" />
                        {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString('de-DE') : 'Nicht geplant'}
                      </p>
                    </div>
                    <button
                      onClick={() => openPostEditor(post)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-dark-300 rounded"
                    >
                      <Edit2 size={16} className="text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Generation View */}
      {viewMode === 'batch' && (
        <div className="space-y-4">
          {/* Ideas Generator Button */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowIdeasGenerator(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:opacity-90"
            >
              <Lightbulb size={18} />
              Content-Ideen generieren
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input Section */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
              <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                <Zap size={18} />
                Batch-Generierung
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                    Themen (ein Thema pro Zeile)
                  </label>
                  <textarea
                    value={batchTopics}
                    onChange={(e) => setBatchTopics(e.target.value)}
                    placeholder="Cloud Computing für KMUs&#10;Cybersecurity-Tipps&#10;Digitalisierung im Alltag&#10;Home Office Best Practices"
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {batchTopics.split('\n').filter(t => t.trim()).length} Themen erkannt
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Plattform
                    </label>
                    <select
                      value={batchPlatform}
                      onChange={(e) => setBatchPlatform(e.target.value as Platform)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                    >
                      <option value="linkedin">LinkedIn</option>
                      <option value="twitter">Twitter/X</option>
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                      <option value="all">Alle Plattformen</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                      Tonalität
                    </label>
                    <select
                      value={batchTone}
                      onChange={(e) => setBatchTone(e.target.value as typeof batchTone)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                    >
                      <option value="professional">Professionell</option>
                      <option value="casual">Locker</option>
                      <option value="humorous">Humorvoll</option>
                      <option value="informative">Informativ</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchIncludeHashtags}
                      onChange={(e) => setBatchIncludeHashtags(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm dark:text-dark-500">Hashtags</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchIncludeEmoji}
                      onChange={(e) => setBatchIncludeEmoji(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm dark:text-dark-500">Emojis</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchAutoSchedule}
                      onChange={(e) => setBatchAutoSchedule(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm dark:text-dark-500">Auto-Planen</span>
                  </label>
                </div>

                {batchAutoSchedule && (
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                        Start-Datum
                      </label>
                      <input
                        type="date"
                        value={batchStartDate}
                        onChange={(e) => setBatchStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                        Posts/Tag
                      </label>
                      <input
                        type="number"
                        value={batchPostsPerDay}
                        onChange={(e) => setBatchPostsPerDay(parseInt(e.target.value) || 1)}
                        min={1}
                        max={5}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={generateBatch}
                  disabled={batchGenerating || batchTopics.split('\n').filter(t => t.trim()).length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-accent-light0 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {batchGenerating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Generiere Posts...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      {batchAutoSchedule ? 'Generieren & Planen' : 'Posts generieren'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results Section */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
              <h3 className="font-semibold dark:text-white mb-4">
                Generierte Posts ({batchResults.length})
              </h3>

              {batchResults.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  Gib links Themen ein und klicke auf "Generieren" um Posts zu erstellen.
                </p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {batchResults.map((post, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg"
                    >
                      <p className="text-xs text-gray-500 mb-1">{post.topic}</p>
                      <p className="text-sm dark:text-white whitespace-pre-wrap">{post.content}</p>
                      {post.scheduledAt && (
                        <p className="text-xs text-green-600 mt-2">
                          <Clock size={12} className="inline mr-1" />
                          Geplant: {new Date(post.scheduledAt).toLocaleString('de-DE')}
                        </p>
                      )}
                      {post.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {post.hashtags.map((tag, i) => (
                            <span key={i} className="text-xs text-accent-primary bg-accent-lighter dark:bg-accent-primary/30 px-1.5 py-0.5 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analytics View */}
      {viewMode === 'analytics' && (
        <div className="space-y-4">
          {analyticsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={32} className="animate-spin text-accent-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Best Posting Times */}
              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                  <Clock size={18} />
                  Beste Posting-Zeiten
                </h3>
                {analyticsData.bestTimes?.recommendedTimes?.length ? (
                  <div className="space-y-2">
                    {analyticsData.bestTimes.recommendedTimes.map((time, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-dark-200 rounded">
                        <span className="dark:text-white">{time.dayName} um {time.timeString}</span>
                        <span className="text-sm text-green-600">+{time.avgEngagement}% Engagement</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Noch keine Daten vorhanden. Veröffentliche mehr Posts um Insights zu erhalten.</p>
                )}
              </div>

              {/* Top Hashtags */}
              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                  <Hash size={18} />
                  Top Hashtags
                </h3>
                {analyticsData.hashtagStats?.topPerforming?.length ? (
                  <div className="space-y-2">
                    {analyticsData.hashtagStats.topPerforming.slice(0, 5).map((tag, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-dark-200 rounded">
                        <span className="text-accent-primary">{tag.hashtag}</span>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{tag.usageCount}x verwendet</span>
                          <span className="text-green-600">+{tag.avgEngagement}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Noch keine Hashtag-Daten vorhanden.</p>
                )}
              </div>

              {/* Content Mix */}
              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                  <Layers size={18} />
                  Content-Mix
                </h3>
                {analyticsData.contentMix?.distribution?.length ? (
                  <div className="space-y-3">
                    {analyticsData.contentMix.distribution.map((cat, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="dark:text-white capitalize">{cat.category}</span>
                          <span className="text-gray-500">{cat.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-dark-200 rounded-full h-2">
                          <div
                            className="bg-accent-primary h-2 rounded-full"
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {analyticsData.contentMix.recommendations?.length > 0 && (
                      <div className="mt-4 p-3 bg-accent-light dark:bg-accent-primary/20 rounded-lg">
                        <p className="text-sm text-accent-dark dark:text-accent-primary font-medium mb-2">Empfehlungen:</p>
                        <ul className="text-sm text-accent-primary dark:text-accent-primary space-y-1">
                          {analyticsData.contentMix.recommendations.map((rec, idx) => (
                            <li key={idx}>• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Noch keine Content-Mix-Daten vorhanden.</p>
                )}
              </div>

              {/* Performance Overview */}
              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                  <TrendingUp size={18} />
                  Performance (letzte 30 Tage)
                </h3>
                {analyticsData.performance?.metrics ? (
                  <div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg text-center">
                        <p className="text-2xl font-bold text-accent-primary">{analyticsData.performance.metrics.totalPosts}</p>
                        <p className="text-xs text-gray-500">Posts</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-600">{analyticsData.performance.metrics.totalEngagement}</p>
                        <p className="text-xs text-gray-500">Engagement</p>
                      </div>
                    </div>
                    {analyticsData.performance.topPosts?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium dark:text-white mb-2">Top Posts:</p>
                        <div className="space-y-2">
                          {analyticsData.performance.topPosts.slice(0, 3).map((post, idx) => (
                            <div key={idx} className="p-2 bg-gray-50 dark:bg-dark-200 rounded text-sm">
                              <p className="dark:text-white line-clamp-1">{post.content}</p>
                              <p className="text-xs text-green-600 mt-1">Engagement: {post.engagement}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Noch keine Performance-Daten vorhanden.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evergreen View */}
      {viewMode === 'evergreen' && (
        <div className="space-y-4">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-700 dark:text-green-400">
              <strong>Evergreen-Content</strong> sind zeitlose Posts, die immer wieder recycelt werden können.
              Markiere erfolgreiche Posts als Evergreen und plane sie erneut ein.
            </p>
          </div>

          {evergreenPosts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <Recycle size={48} className="mx-auto mb-4 opacity-50" />
              <p>Noch keine Evergreen-Posts vorhanden.</p>
              <p className="text-sm mt-2">Markiere Posts in der Listen-Ansicht als Evergreen.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {evergreenPosts.map(post => (
                <div
                  key={post.id}
                  className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        Evergreen
                      </span>
                      {post.recycleCount && post.recycleCount > 0 && (
                        <span className="text-xs text-gray-500">
                          {post.recycleCount}x recycelt
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setRecyclingPost(post);
                          setRecycleDate('');
                          setRecycleModify(false);
                          setShowRecycleModal(true);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 text-sm"
                      >
                        <RefreshCw size={14} />
                        Recyceln
                      </button>
                      <button
                        onClick={() => toggleEvergreen(post.id, true)}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500"
                        title="Evergreen-Status entfernen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-dark-500 whitespace-pre-wrap line-clamp-3">
                    {post.content}
                  </p>
                  {post.hashtags && post.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {post.hashtags.map((tag, idx) => (
                        <span key={idx} className="text-xs text-accent-primary">{tag}</span>
                      ))}
                    </div>
                  )}
                  {post.lastRecycledAt && (
                    <p className="text-xs text-gray-500 mt-2">
                      Zuletzt recycelt: {new Date(post.lastRecycledAt).toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Autopilot View */}
      {viewMode === 'autopilot' && (
        <div className="space-y-6">
          {/* Autopilot Header */}
          <div className="bg-gradient-to-r from-accent-light0 to-indigo-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Rocket size={28} />
              <h2 className="text-xl font-bold">Social Media Autopilot</h2>
            </div>
            <p className="opacity-90">Lass die KI automatisch Content für dich generieren und planen.</p>
          </div>

          {/* Settings */}
          <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
            <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
              <Settings size={18} />
              Einstellungen
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                <span className="dark:text-white">Autopilot aktiviert</span>
                <button
                  onClick={() => setAutopilotSettings(s => ({ ...s, enabled: !s.enabled }))}
                  className={`w-12 h-6 rounded-full transition-colors ${autopilotSettings.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${autopilotSettings.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium dark:text-dark-500 mb-1">Posts pro Woche</label>
                <input
                  type="number"
                  value={autopilotSettings.postsPerWeek}
                  onChange={(e) => setAutopilotSettings(s => ({ ...s, postsPerWeek: parseInt(e.target.value) || 5 }))}
                  min={1}
                  max={21}
                  className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium dark:text-dark-500 mb-1">Modus</label>
                <select
                  value={autopilotSettings.approvalMode}
                  onChange={(e) => setAutopilotSettings(s => ({ ...s, approvalMode: e.target.value as 'auto' | 'review' }))}
                  className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                >
                  <option value="review">Zur Genehmigung erstellen</option>
                  <option value="auto">Automatisch planen</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium dark:text-dark-500 mb-1">Zielgruppe</label>
                <input
                  type="text"
                  value={autopilotSettings.targetAudience}
                  onChange={(e) => setAutopilotSettings(s => ({ ...s, targetAudience: e.target.value }))}
                  placeholder="z.B. IT-Entscheider, KMUs"
                  className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                />
              </div>
            </div>

            {/* Content Themes */}
            <div className="mt-4">
              <label className="block text-sm font-medium dark:text-dark-500 mb-2">Content-Themen</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {autopilotSettings.contentThemes.map((theme, idx) => (
                  <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-accent-primary/10 text-accent-primary rounded-full text-sm">
                    {theme}
                    <button onClick={() => setAutopilotSettings(s => ({ ...s, contentThemes: s.contentThemes.filter((_, i) => i !== idx) }))}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  placeholder="Neues Thema..."
                  className="flex-1 px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTheme.trim()) {
                      setAutopilotSettings(s => ({ ...s, contentThemes: [...s.contentThemes, newTheme.trim()] }));
                      setNewTheme('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newTheme.trim()) {
                      setAutopilotSettings(s => ({ ...s, contentThemes: [...s.contentThemes, newTheme.trim()] }));
                      setNewTheme('');
                    }
                  }}
                  className="px-4 py-2 bg-accent-primary text-white rounded-lg"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveAutopilotSettings}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 rounded-lg dark:text-white"
              >
                <Check size={18} />
                Speichern
              </button>
              <button
                onClick={handleGenerateAutopilot}
                disabled={autopilotGenerating || !autopilotSettings.enabled || autopilotSettings.contentThemes.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light0 to-indigo-600 text-white rounded-lg disabled:opacity-50"
              >
                {autopilotGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                Jetzt generieren
              </button>
            </div>
          </div>

          {/* Pending Posts for Review */}
          {autopilotPending.length > 0 && (
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
              <h3 className="font-semibold dark:text-white mb-4 flex items-center justify-between">
                <span>Zur Genehmigung ({autopilotPending.length})</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveAutopilot(autopilotPending.map(p => p.id), 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm"
                  >
                    <ThumbsUp size={14} />
                    Alle genehmigen
                  </button>
                  <button
                    onClick={() => handleApproveAutopilot(autopilotPending.map(p => p.id), 'reject')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm"
                  >
                    <ThumbsDown size={14} />
                    Alle ablehnen
                  </button>
                </div>
              </h3>
              <div className="space-y-3">
                {autopilotPending.map(post => (
                  <div key={post.id} className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                    <p className="dark:text-white text-sm whitespace-pre-wrap">{post.content}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-gray-500">
                        {post.scheduledAt && new Date(post.scheduledAt).toLocaleString('de-DE')}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveAutopilot([post.id], 'approve')}
                          className="p-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 rounded hover:bg-green-200"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          onClick={() => handleApproveAutopilot([post.id], 'reject')}
                          className="p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 rounded hover:bg-red-200"
                        >
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trends View */}
      {viewMode === 'trends' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-cyan-500 to-accent-dark rounded-xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Globe size={28} />
              <h2 className="text-xl font-bold">Trend-Surfer</h2>
            </div>
            <p className="opacity-90">Entdecke aktuelle Trends und erstelle zeitnahen Content.</p>
          </div>

          <div className="flex gap-4">
            <input
              type="text"
              value={trendsIndustry}
              onChange={(e) => setTrendsIndustry(e.target.value)}
              placeholder="Branche eingeben..."
              className="flex-1 px-4 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-100 dark:text-white"
            />
            <button
              onClick={loadTrends}
              disabled={trendsLoading}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg disabled:opacity-50"
            >
              {trendsLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              Trends laden
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trends List */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
              <h3 className="font-semibold dark:text-white mb-4">Aktuelle Trends</h3>
              {trends.length === 0 ? (
                <p className="text-gray-500 text-sm">Klicke auf "Trends laden" um aktuelle Trends zu sehen.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {trends.map((trend, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedTrend(trend)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedTrend?.topic === trend.topic
                          ? 'bg-accent-primary/10 border border-accent-primary'
                          : 'bg-gray-50 dark:bg-dark-200 hover:bg-gray-100 dark:hover:bg-dark-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-medium dark:text-white">{trend.topic}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          trend.relevance === 'high' ? 'bg-green-100 text-green-700' :
                          trend.relevance === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {trend.relevance}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{trend.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Content Generator */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
              <h3 className="font-semibold dark:text-white mb-4">Content generieren</h3>
              {selectedTrend ? (
                <div className="space-y-4">
                  <div className="p-3 bg-accent-primary/10 rounded-lg">
                    <p className="text-sm text-accent-primary font-medium">Ausgewählter Trend:</p>
                    <p className="dark:text-white">{selectedTrend.topic}</p>
                  </div>
                  <button
                    onClick={handleGenerateTrendPost}
                    disabled={trendGenerating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg disabled:opacity-50"
                  >
                    {trendGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    Post generieren
                  </button>
                  {trendPostContent && (
                    <div className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                      <p className="dark:text-white text-sm whitespace-pre-wrap">{trendPostContent}</p>
                      <button
                        onClick={() => {
                          setPostContent(trendPostContent);
                          setShowPostEditor(true);
                        }}
                        className="mt-3 flex items-center gap-1 text-sm text-accent-primary"
                      >
                        <Edit2 size={14} />
                        Als Post bearbeiten
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Wähle links einen Trend aus, um Content zu generieren.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remix View */}
      {viewMode === 'remix' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-orange-500 to-pink-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <FileCode size={28} />
              <h2 className="text-xl font-bold">Content-Remix-Engine</h2>
            </div>
            <p className="opacity-90">Wandle Blogposts, Artikel oder Video-Transkripte in Social Media Posts um.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Source Content */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
              <h3 className="font-semibold dark:text-white mb-4">Quell-Content</h3>
              <select
                value={remixSourceType}
                onChange={(e) => setRemixSourceType(e.target.value as any)}
                className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white mb-3"
              >
                <option value="blog">Blogpost</option>
                <option value="article">Artikel</option>
                <option value="transcript">Video-Transkript</option>
                <option value="newsletter">Newsletter</option>
              </select>
              <textarea
                value={remixSourceContent}
                onChange={(e) => setRemixSourceContent(e.target.value)}
                placeholder="Füge hier deinen Langform-Content ein..."
                rows={12}
                className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white text-sm"
              />
              <p className="text-xs text-gray-500 mt-2">{remixSourceContent.length} Zeichen</p>
            </div>

            {/* Output Settings & Results */}
            <div className="space-y-4">
              <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                <h3 className="font-semibold dark:text-white mb-4">Output-Einstellungen</h3>
                {remixPlatforms.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-3 mb-2">
                    <span className="w-24 dark:text-white capitalize">{p.platform}</span>
                    <input
                      type="number"
                      value={p.count}
                      onChange={(e) => {
                        const newPlatforms = [...remixPlatforms];
                        newPlatforms[idx].count = parseInt(e.target.value) || 1;
                        setRemixPlatforms(newPlatforms);
                      }}
                      min={1}
                      max={20}
                      className="w-20 px-2 py-1 border dark:border-dark-200 rounded dark:bg-dark-200 dark:text-white"
                    />
                    <span className="text-sm text-gray-500">Posts</span>
                  </div>
                ))}
                <button
                  onClick={handleRemix}
                  disabled={remixing || !remixSourceContent.trim()}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg disabled:opacity-50"
                >
                  {remixing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  Content remixen
                </button>
              </div>

              {/* Results */}
              {remixOutputs.length > 0 && (
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                  <h3 className="font-semibold dark:text-white mb-4">Generierte Posts</h3>
                  {remixOutputs.map((output, idx) => (
                    <div key={idx} className="mb-4">
                      <h4 className="text-sm font-medium text-accent-primary capitalize mb-2">{output.platform}</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {output.posts.map((post, pIdx) => (
                          <div key={pIdx} className="p-2 bg-gray-50 dark:bg-dark-200 rounded text-sm">
                            <p className="dark:text-white line-clamp-3">{post.content}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleSaveRemixedPosts(output.posts)}
                        className="mt-2 text-sm text-accent-primary hover:underline"
                      >
                        Alle {output.posts.length} Posts speichern
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Competitors View */}
      {viewMode === 'competitors' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-red-500 to-orange-600 rounded-xl p-6 text-white">
            <div className="flex items-center gap-3 mb-2">
              <Users size={28} />
              <h2 className="text-xl font-bold">Konkurrenz-Analyse</h2>
            </div>
            <p className="opacity-90">Analysiere Wettbewerber und generiere inspirierten Content.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowAddCompetitor(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg"
            >
              <Plus size={18} />
              Konkurrent hinzufügen
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {competitors.map(comp => (
              <div
                key={comp.id}
                onClick={() => setSelectedCompetitor(comp.id)}
                className={`bg-white dark:bg-dark-100 rounded-xl shadow-sm border p-4 cursor-pointer transition-colors ${
                  selectedCompetitor === comp.id ? 'border-accent-primary' : 'border-gray-200 dark:border-dark-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <h4 className="font-medium dark:text-white">{comp.name}</h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      socialMediaApi.deleteCompetitor(comp.id).then(loadCompetitors);
                    }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  {comp.profiles?.linkedin && <Linkedin size={14} className="text-accent-primary" />}
                  {comp.profiles?.twitter && <Twitter size={14} className="text-sky-500" />}
                  {comp.profiles?.website && <ExternalLink size={14} className="text-gray-500" />}
                </div>
                {comp.lastAnalyzed && (
                  <p className="text-xs text-gray-500 mt-2">
                    Zuletzt analysiert: {new Date(comp.lastAnalyzed).toLocaleDateString('de-DE')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {selectedCompetitor && (
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
              <h3 className="font-semibold dark:text-white mb-4">Konkurrenten-Posts analysieren</h3>
              <p className="text-sm text-gray-500 mb-3">Füge Beispiel-Posts des Konkurrenten ein (getrennt durch ---)</p>
              <textarea
                value={competitorSamplePosts}
                onChange={(e) => setCompetitorSamplePosts(e.target.value)}
                placeholder="Post 1 hier einfügen...&#10;---&#10;Post 2 hier einfügen...&#10;---&#10;Post 3 hier einfügen..."
                rows={6}
                className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white text-sm"
              />
              <button
                onClick={handleAnalyzeCompetitor}
                disabled={analyzingCompetitor || !competitorSamplePosts.trim()}
                className="mt-3 flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg disabled:opacity-50"
              >
                {analyzingCompetitor ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                Analysieren & Content generieren
              </button>

              {competitorAnalysis && (
                <div className="mt-6 space-y-4">
                  <div className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                    <h4 className="font-medium dark:text-white mb-2">Erkenntnisse</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-gray-500">Posting-Frequenz:</span> <span className="dark:text-white">{competitorAnalysis.insights.postingFrequency}</span></div>
                      <div><span className="text-gray-500">Stärken:</span> <span className="dark:text-white">{competitorAnalysis.insights.strengths.join(', ')}</span></div>
                      <div><span className="text-gray-500">Themen:</span> <span className="dark:text-white">{competitorAnalysis.insights.topTopics.join(', ')}</span></div>
                      <div><span className="text-gray-500">Chancen:</span> <span className="dark:text-white">{competitorAnalysis.insights.opportunities.join(', ')}</span></div>
                    </div>
                  </div>
                  <h4 className="font-medium dark:text-white">Generierte Posts (inspiriert)</h4>
                  <div className="space-y-2">
                    {competitorAnalysis.generatedPosts.map((post: any, idx: number) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <p className="dark:text-white text-sm">{post.content}</p>
                        <p className="text-xs text-gray-500 mt-2">Inspiration: {post.inspiration}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Competitor Modal */}
          {showAddCompetitor && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-dark-100 rounded-xl p-6 w-full max-w-md">
                <h3 className="font-semibold dark:text-white mb-4">Konkurrent hinzufügen</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    placeholder="Firmenname"
                    className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newCompetitorProfiles.linkedin}
                    onChange={(e) => setNewCompetitorProfiles(p => ({ ...p, linkedin: e.target.value }))}
                    placeholder="LinkedIn URL"
                    className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newCompetitorProfiles.website}
                    onChange={(e) => setNewCompetitorProfiles(p => ({ ...p, website: e.target.value }))}
                    placeholder="Website"
                    className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button onClick={() => setShowAddCompetitor(false)} className="px-4 py-2 bg-gray-100 dark:bg-dark-200 rounded-lg dark:text-white">
                    Abbrechen
                  </button>
                  <button onClick={handleAddCompetitor} className="px-4 py-2 bg-accent-primary text-white rounded-lg">
                    Hinzufügen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Engagement View - with Sub-Tabs */}
      {viewMode === 'engagement' && (
        <div className="space-y-6">
          {/* Sub-Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-gray-200 dark:border-dark-200 pb-4">
            {[
              { id: 'competitors', label: 'Konkurrenz-Analyse', icon: Users },
              { id: 'bot', label: 'Engagement Bot', icon: MessageCircle },
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setEngagementSubView(sub.id as EngagementSubView)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  engagementSubView === sub.id
                    ? 'bg-accent-primary text-white'
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-gray-200'
                }`}
              >
                <sub.icon size={16} />
                {sub.label}
              </button>
            ))}
          </div>

          {/* Competitors Sub-View */}
          {engagementSubView === 'competitors' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-red-500 to-orange-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Users size={28} />
                  <h2 className="text-xl font-bold">Konkurrenz-Analyse</h2>
                </div>
                <p className="opacity-90">Analysiere Wettbewerber und generiere inspirierten Content.</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddCompetitor(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg"
                >
                  <Plus size={18} />
                  Konkurrent hinzufügen
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {competitors.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <Users size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Noch keine Konkurrenten hinzugefügt</p>
                    <p className="text-sm mt-1">Füge Wettbewerber hinzu um deren Strategien zu analysieren</p>
                  </div>
                ) : (
                  competitors.map(comp => (
                    <div
                      key={comp.id}
                      onClick={() => setSelectedCompetitor(comp.id)}
                      className={`bg-white dark:bg-dark-100 rounded-xl shadow-sm border p-4 cursor-pointer transition-colors ${
                        selectedCompetitor === comp.id ? 'border-accent-primary' : 'border-gray-200 dark:border-dark-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium dark:text-white">{comp.name}</h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            socialMediaApi.deleteCompetitor(comp.id).then(loadCompetitors);
                          }}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {comp.profiles?.linkedin && <Linkedin size={14} className="text-accent-primary" />}
                        {comp.profiles?.twitter && <Twitter size={14} className="text-sky-500" />}
                        {comp.profiles?.website && <ExternalLink size={14} className="text-gray-500" />}
                      </div>
                      {comp.lastAnalyzed && (
                        <p className="text-xs text-gray-500 mt-2">
                          Zuletzt analysiert: {new Date(comp.lastAnalyzed).toLocaleDateString('de-DE')}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {selectedCompetitor && (
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                  <h3 className="font-semibold dark:text-white mb-4">Konkurrenten-Posts analysieren</h3>
                  <p className="text-sm text-gray-500 mb-3">Füge Beispiel-Posts des Konkurrenten ein (getrennt durch ---)</p>
                  <textarea
                    value={competitorSamplePosts}
                    onChange={(e) => setCompetitorSamplePosts(e.target.value)}
                    placeholder="Post 1 hier einfügen...&#10;---&#10;Post 2 hier einfügen...&#10;---&#10;Post 3 hier einfügen..."
                    rows={6}
                    className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white text-sm"
                  />
                  <button
                    onClick={handleAnalyzeCompetitor}
                    disabled={analyzingCompetitor || !competitorSamplePosts.trim()}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg disabled:opacity-50"
                  >
                    {analyzingCompetitor ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    Analysieren & Content generieren
                  </button>

                  {competitorAnalysis && (
                    <div className="mt-6 space-y-4">
                      <div className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <h4 className="font-medium dark:text-white mb-2">Erkenntnisse</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div><span className="text-gray-500">Posting-Frequenz:</span> <span className="dark:text-white">{competitorAnalysis.insights.postingFrequency}</span></div>
                          <div><span className="text-gray-500">Stärken:</span> <span className="dark:text-white">{competitorAnalysis.insights.strengths.join(', ')}</span></div>
                          <div><span className="text-gray-500">Themen:</span> <span className="dark:text-white">{competitorAnalysis.insights.topTopics.join(', ')}</span></div>
                          <div><span className="text-gray-500">Chancen:</span> <span className="dark:text-white">{competitorAnalysis.insights.opportunities.join(', ')}</span></div>
                        </div>
                      </div>
                      <h4 className="font-medium dark:text-white">Generierte Posts (inspiriert)</h4>
                      <div className="space-y-2">
                        {competitorAnalysis.generatedPosts.map((post: any, idx: number) => (
                          <div key={idx} className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                            <p className="dark:text-white text-sm">{post.content}</p>
                            <p className="text-xs text-gray-500 mt-2">Inspiration: {post.inspiration}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add Competitor Modal */}
              {showAddCompetitor && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-dark-100 rounded-xl p-6 w-full max-w-md">
                    <h3 className="font-semibold dark:text-white mb-4">Konkurrent hinzufügen</h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={newCompetitorName}
                        onChange={(e) => setNewCompetitorName(e.target.value)}
                        placeholder="Firmenname"
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                      <input
                        type="text"
                        value={newCompetitorProfiles.linkedin}
                        onChange={(e) => setNewCompetitorProfiles(p => ({ ...p, linkedin: e.target.value }))}
                        placeholder="LinkedIn URL"
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                      <input
                        type="text"
                        value={newCompetitorProfiles.website}
                        onChange={(e) => setNewCompetitorProfiles(p => ({ ...p, website: e.target.value }))}
                        placeholder="Website"
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                      <button onClick={() => setShowAddCompetitor(false)} className="px-4 py-2 bg-gray-100 dark:bg-dark-200 rounded-lg dark:text-white">
                        Abbrechen
                      </button>
                      <button onClick={handleAddCompetitor} className="px-4 py-2 bg-accent-primary text-white rounded-lg">
                        Hinzufügen
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Engagement Bot Sub-View */}
          {engagementSubView === 'bot' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-green-500 to-teal-600 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <MessageCircle size={28} />
                  <h2 className="text-xl font-bold">Smart Engagement Bot</h2>
                </div>
                <p className="opacity-90">Generiere authentische Kommentare zu Posts in deiner Branche.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Settings */}
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold dark:text-white">Einstellungen</h3>
                    <button
                      onClick={saveEngagementSettings}
                      disabled={savingEngagementSettings}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                    >
                      {savingEngagementSettings ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Speichern
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-1">Antwort-Stil</label>
                      <select
                        value={engagementSettings.responseStyle}
                        onChange={(e) => setEngagementSettings(s => ({ ...s, responseStyle: e.target.value as any }))}
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      >
                        <option value="thoughtful">Nachdenklich</option>
                        <option value="supportive">Unterstützend</option>
                        <option value="inquisitive">Neugierig/Fragend</option>
                        <option value="expert">Experte</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-1">Tägliches Limit</label>
                      <input
                        type="number"
                        value={engagementSettings.dailyLimit}
                        onChange={(e) => setEngagementSettings(s => ({ ...s, dailyLimit: parseInt(e.target.value) || 10 }))}
                        min={1}
                        max={100}
                        className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">Maximale Anzahl an Antworten pro Tag</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium dark:text-dark-500 mb-2">Keywords zum Verfolgen</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {engagementSettings.targetKeywords.map((kw, idx) => (
                          <span key={idx} className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-sm">
                            {kw}
                            <button onClick={() => setEngagementSettings(s => ({ ...s, targetKeywords: s.targetKeywords.filter((_, i) => i !== idx) }))}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newKeyword}
                          onChange={(e) => setNewKeyword(e.target.value)}
                          placeholder="Keyword..."
                          className="flex-1 px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newKeyword.trim()) {
                              setEngagementSettings(s => ({ ...s, targetKeywords: [...s.targetKeywords, newKeyword.trim()] }));
                              setNewKeyword('');
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (newKeyword.trim()) {
                              setEngagementSettings(s => ({ ...s, targetKeywords: [...s.targetKeywords, newKeyword.trim()] }));
                              setNewKeyword('');
                            }
                          }}
                          className="px-3 py-2 bg-accent-primary text-white rounded-lg"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Generate Responses */}
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                  <h3 className="font-semibold dark:text-white mb-4">Antworten generieren</h3>
                  <p className="text-sm text-gray-500 mb-3">Füge Posts ein, auf die du antworten möchtest (getrennt durch ---)</p>
                  <textarea
                    value={engagementPosts}
                    onChange={(e) => setEngagementPosts(e.target.value)}
                    placeholder="Post 1...&#10;---&#10;Post 2...&#10;---&#10;Post 3..."
                    rows={6}
                    className="w-full px-3 py-2 border dark:border-dark-200 rounded-lg dark:bg-dark-200 dark:text-white text-sm"
                  />
                  <button
                    onClick={handleGenerateEngagement}
                    disabled={generatingEngagement || !engagementPosts.trim()}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {generatingEngagement ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                    Antworten generieren
                  </button>
                </div>
              </div>

              {/* Generated Responses */}
              {engagementResponses.length > 0 && (
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                  <h3 className="font-semibold dark:text-white mb-4">Generierte Antworten</h3>
                  <div className="space-y-4">
                    {engagementResponses.map((resp, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                        <div className="text-xs text-gray-500 mb-2">
                          <span className="font-medium">Original:</span> {resp.originalPost}
                        </div>
                        <p className="dark:text-white">{resp.response}</p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded capitalize">
                            {resp.responseType}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(resp.response)}
                              className="flex items-center gap-1 text-sm text-accent-primary"
                            >
                              <Copy size={14} />
                              Kopieren
                            </button>
                            <button
                              onClick={() => logEngagementResponse(resp.originalPost, resp.response, 'linkedin')}
                              className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
                            >
                              <Check size={14} />
                              Speichern
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Engagement History */}
              {engagementHistory.length > 0 && (
                <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-4">
                  <h3 className="font-semibold dark:text-white mb-4 flex items-center gap-2">
                    <Clock size={18} className="text-gray-500" />
                    Verlauf ({engagementHistory.length})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {engagementHistory.slice(0, 10).map((entry, idx) => (
                      <div key={entry.id || idx} className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">
                            {new Date(entry.createdAt).toLocaleDateString('de-DE', {
                              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary rounded capitalize">
                            {entry.platform}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1 line-clamp-1">
                          <span className="font-medium">Original:</span> {entry.originalPost}
                        </p>
                        <p className="dark:text-white">{entry.response}</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(entry.response)}
                          className="mt-2 flex items-center gap-1 text-xs text-accent-primary"
                        >
                          <Copy size={12} />
                          Kopieren
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stories View */}
      {viewMode === 'stories' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold dark:text-white">Stories & Bild-Generator</h2>
              <p className="text-sm text-gray-500 dark:text-dark-400">Erstelle virale Stories mit KI-generierten Bildern</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowImageGenerator(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light0 to-pink-500 text-white rounded-lg hover:opacity-90"
              >
                <Image size={18} />
                Bild generieren
              </button>
              <button
                onClick={() => setShowStoryCreator(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:opacity-90"
              >
                <Film size={18} />
                Story erstellen
              </button>
            </div>
          </div>

          {/* Story Creator */}
          {showStoryCreator && (
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold dark:text-white flex items-center gap-2">
                  <Wand2 size={20} className="text-orange-500" />
                  Story-Konzept erstellen
                </h3>
                <button onClick={() => setShowStoryCreator(false)} className="text-gray-500">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Thema</label>
                  <input
                    type="text"
                    value={storyTopic}
                    onChange={(e) => setStoryTopic(e.target.value)}
                    placeholder="z.B. Neue Produktvorstellung, Teambuilding-Event..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Plattform</label>
                  <select
                    value={storyPlatform}
                    onChange={(e) => setStoryPlatform(e.target.value as 'instagram' | 'facebook' | 'linkedin')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="linkedin">LinkedIn</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Story-Typ</label>
                  <select
                    value={storyType}
                    onChange={(e) => setStoryType(e.target.value as StoryType)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="promotional">Werbung / Promo</option>
                    <option value="educational">Tipps / Wissen</option>
                    <option value="behind-the-scenes">Behind the Scenes</option>
                    <option value="announcement">Ankündigung</option>
                    <option value="poll">Umfrage</option>
                    <option value="quote">Zitat / Inspiration</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Zielgruppe (optional)</label>
                  <input
                    type="text"
                    value={storyTargetAudience}
                    onChange={(e) => setStoryTargetAudience(e.target.value)}
                    placeholder="z.B. Unternehmer, Startups, IT-Profis..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Markenstimme (optional)</label>
                  <input
                    type="text"
                    value={storyBrandVoice}
                    onChange={(e) => setStoryBrandVoice(e.target.value)}
                    placeholder="z.B. Professionell aber nahbar, innovativ, vertrauenswürdig..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={storyIncludeCTA}
                      onChange={(e) => setStoryIncludeCTA(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700 dark:text-dark-500">Call-to-Action einbinden</span>
                  </label>
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!storyTopic.trim()) return;
                  setGeneratingStory(true);
                  try {
                    const result = await socialMediaApi.generateStoryContent({
                      topic: storyTopic,
                      platform: storyPlatform,
                      storyType,
                      brandVoice: storyBrandVoice || undefined,
                      targetAudience: storyTargetAudience || undefined,
                      includeCallToAction: storyIncludeCTA,
                    });
                    setGeneratedStory(result);
                  } catch (err: any) {
                    setError(err.message || 'Story-Generierung fehlgeschlagen');
                  } finally {
                    setGeneratingStory(false);
                  }
                }}
                disabled={generatingStory || !storyTopic.trim()}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {generatingStory ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generiere Story-Konzept...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Story-Konzept generieren
                  </>
                )}
              </button>

              {/* Generated Story Preview */}
              {generatedStory && (
                <div className="mt-6 p-4 bg-gray-50 dark:bg-dark-200 rounded-lg">
                  <h4 className="font-semibold dark:text-white mb-3">{generatedStory.title}</h4>

                  {/* Text Overlays */}
                  <div className="space-y-2 mb-4">
                    <p className="text-xs text-gray-500 uppercase">Text-Overlays:</p>
                    {generatedStory.textOverlays.map((overlay, idx) => (
                      <div key={idx} className={`p-2 rounded ${
                        overlay.style === 'bold' ? 'bg-black/10 font-bold' :
                        overlay.style === 'highlight' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                        'bg-white dark:bg-dark-100'
                      }`}>
                        <span className="text-xs text-gray-400">{overlay.position}:</span>
                        <p className="dark:text-white">{overlay.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Image Prompt */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Bild-Prompt (für KI-Generierung):</p>
                    <div className="flex gap-2">
                      <p className="flex-1 text-sm text-gray-700 dark:text-dark-500 bg-white dark:bg-dark-100 p-2 rounded">
                        {generatedStory.imagePrompt}
                      </p>
                      <button
                        onClick={() => {
                          setImagePrompt(generatedStory.imagePrompt);
                          setShowImageGenerator(true);
                        }}
                        className="px-3 py-1 bg-accent-primary text-white rounded text-sm hover:bg-accent-primary"
                      >
                        Bild generieren
                      </button>
                    </div>
                  </div>

                  {/* Image Suggestions */}
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 uppercase mb-1">Bild-Vorschläge:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600 dark:text-dark-400">
                      {generatedStory.imageSuggestions.map((suggestion, idx) => (
                        <li key={idx}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Hashtags & CTA */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {generatedStory.hashtags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary rounded text-sm">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {generatedStory.callToAction && (
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                      <p className="text-xs text-gray-500 uppercase">Call-to-Action:</p>
                      <p className="text-green-700 dark:text-green-400 font-medium">{generatedStory.callToAction}</p>
                    </div>
                  )}

                  {/* Additional info */}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
                    {generatedStory.musicSuggestion && (
                      <span>🎵 Musik: {generatedStory.musicSuggestion}</span>
                    )}
                    {generatedStory.stickers.length > 0 && (
                      <span>✨ Sticker: {generatedStory.stickers.join(' ')}</span>
                    )}
                    <span style={{ color: generatedStory.backgroundColor }}>
                      🎨 Farbe: {generatedStory.backgroundColor}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Image Generator */}
          {showImageGenerator && (
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold dark:text-white flex items-center gap-2">
                  <Image size={20} className="text-accent-primary" />
                  KI-Bild generieren (DALL-E 3)
                </h3>
                <button onClick={() => setShowImageGenerator(false)} className="text-gray-500">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Bild-Beschreibung</label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Beschreibe das gewünschte Bild detailliert auf Englisch oder Deutsch..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Stil</label>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value as ImageStyle)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="modern">Modern & Clean</option>
                    <option value="minimalist">Minimalistisch</option>
                    <option value="vibrant">Lebendig & Bunt</option>
                    <option value="professional">Professionell</option>
                    <option value="artistic">Künstlerisch</option>
                    <option value="photorealistic">Fotorealistisch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Seitenverhältnis</label>
                  <select
                    value={imageAspectRatio}
                    onChange={(e) => setImageAspectRatio(e.target.value as '1:1' | '9:16' | '16:9' | '4:5')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="9:16">9:16 (Story, Vertikal)</option>
                    <option value="1:1">1:1 (Quadrat)</option>
                    <option value="4:5">4:5 (Instagram Feed)</option>
                    <option value="16:9">16:9 (Landscape)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Qualität</label>
                  <select
                    value={imageQuality}
                    onChange={(e) => setImageQuality(e.target.value as 'standard' | 'hd')}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="hd">HD (~$0.12)</option>
                    <option value="standard">Standard (~$0.04)</option>
                  </select>
                </div>

                <div>
                  <button
                    onClick={async () => {
                      setLoadingSuggestions(true);
                      try {
                        const result = await socialMediaApi.getImagePromptSuggestions({
                          topic: imagePrompt || 'social media content',
                          style: imageStyle,
                          count: 5,
                        });
                        setImageSuggestions(result.suggestions);
                      } catch (err) {
                        console.error('Failed to get suggestions:', err);
                      } finally {
                        setLoadingSuggestions(false);
                      }
                    }}
                    disabled={loadingSuggestions}
                    className="w-full px-4 py-2 border border-accent-primary/40 text-accent-primary rounded-lg hover:bg-accent-light dark:border-accent-primary/40 dark:text-accent-primary dark:hover:bg-accent-primary/20"
                  >
                    {loadingSuggestions ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Prompt-Vorschläge'}
                  </button>
                </div>
              </div>

              {/* Prompt Suggestions */}
              {imageSuggestions.length > 0 && (
                <div className="mt-4 p-3 bg-accent-light dark:bg-accent-primary/20 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase mb-2">Prompt-Vorschläge:</p>
                  <div className="space-y-2">
                    {imageSuggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        onClick={() => setImagePrompt(suggestion.prompt)}
                        className="p-2 bg-white dark:bg-dark-100 rounded cursor-pointer hover:ring-2 ring-accent-primary/40"
                      >
                        <p className="text-xs text-gray-500">{suggestion.description}</p>
                        <p className="text-sm text-gray-700 dark:text-dark-500 truncate">{suggestion.prompt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  if (!imagePrompt.trim()) return;
                  setGeneratingImage(true);
                  try {
                    const result = await socialMediaApi.generateImage({
                      prompt: imagePrompt,
                      style: imageStyle,
                      aspectRatio: imageAspectRatio,
                      quality: imageQuality,
                    });
                    setGeneratedImages(prev => [result, ...prev]);
                  } catch (err: any) {
                    setError(err.message || 'Bild-Generierung fehlgeschlagen');
                  } finally {
                    setGeneratingImage(false);
                  }
                }}
                disabled={generatingImage || !imagePrompt.trim()}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-accent-light0 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {generatingImage ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generiere Bild (ca. 10-20 Sek.)...
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    Bild generieren
                  </>
                )}
              </button>

              {/* Generated Images Gallery */}
              {generatedImages.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold dark:text-white mb-3">Generierte Bilder</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {generatedImages.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={img.url}
                          alt={`Generated ${idx}`}
                          className="w-full aspect-[9/16] object-cover rounded-lg"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                          <a
                            href={img.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-white rounded-full"
                          >
                            <ExternalLink size={16} />
                          </a>
                          <button
                            onClick={() => navigator.clipboard.writeText(img.url)}
                            className="p-2 bg-white rounded-full"
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-gray-500 text-center">
                          {img.provider} • ${(img.costCents / 100).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Tips */}
          {!showStoryCreator && !showImageGenerator && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-6 text-white">
                <Film size={32} className="mb-3" />
                <h3 className="font-bold text-lg mb-2">Story-Tipps</h3>
                <ul className="text-sm space-y-1 opacity-90">
                  <li>• Erste 3 Sekunden entscheiden über Engagement</li>
                  <li>• Vertikales Format (9:16) für Stories</li>
                  <li>• Interaktive Elemente erhöhen Reichweite</li>
                  <li>• Authentizität schlägt Perfektion</li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-accent-light0 to-pink-500 rounded-xl p-6 text-white">
                <Image size={32} className="mb-3" />
                <h3 className="font-bold text-lg mb-2">Bild-Generierung</h3>
                <ul className="text-sm space-y-1 opacity-90">
                  <li>• DALL-E 3 für beste Qualität</li>
                  <li>• Detaillierte Prompts = bessere Ergebnisse</li>
                  <li>• HD-Qualität für Social Media empfohlen</li>
                  <li>• Bilder in der Historie verfügbar</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ideas Generator Modal */}
      <Modal
        isOpen={showIdeasGenerator}
        onClose={() => setShowIdeasGenerator(false)}
        title="Content-Ideen generieren"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Kategorie/Themenbereich
            </label>
            <input
              type="text"
              value={ideasCategory}
              onChange={(e) => setIdeasCategory(e.target.value)}
              placeholder="z.B. Cloud Computing, Cybersecurity, Digitalisierung..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Anzahl Ideen: {ideasCount}
            </label>
            <input
              type="range"
              value={ideasCount}
              onChange={(e) => setIdeasCount(parseInt(e.target.value))}
              min={5}
              max={20}
              className="w-full"
            />
          </div>

          <button
            onClick={generateIdeas}
            disabled={generatingIdeas || !ideasCategory.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {generatingIdeas ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generiere Ideen...
              </>
            ) : (
              <>
                <Lightbulb size={18} />
                Ideen generieren
              </>
            )}
          </button>

          {generatedIdeas.length > 0 && (
            <>
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium dark:text-white mb-3">Generierte Ideen:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {generatedIdeas.map((idea, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-dark-200 rounded"
                    >
                      <span className="text-gray-400 text-sm">{idx + 1}.</span>
                      <span className="text-sm dark:text-white flex-1">{idea}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={useIdeasForBatch}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:opacity-90"
              >
                <Layers size={18} />
                Alle Ideen für Batch verwenden
              </button>
            </>
          )}
        </div>
      </Modal>

      {/* Post Editor Modal */}
      <Modal
        isOpen={showPostEditor}
        onClose={() => setShowPostEditor(false)}
        title={editingPost ? 'Post bearbeiten' : 'Neuer Post'}
        size="lg"
      >
        <div className="space-y-4">
          {/* AI Generator Button */}
          <button
            onClick={() => setShowAiGenerator(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light0 to-pink-500 text-white rounded-lg hover:opacity-90"
          >
            <Sparkles size={18} />
            Mit KI generieren
          </button>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Titel (optional)
            </label>
            <input
              type="text"
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="Interner Titel für den Post"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          {/* Platform Selection */}
          {!editingPost && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Plattformen
              </label>
              <div className="flex flex-wrap gap-2">
                {(['linkedin', 'twitter', 'facebook', 'instagram'] as Platform[]).map(platform => (
                  <button
                    key={platform}
                    onClick={() => {
                      setPostPlatforms(prev =>
                        prev.includes(platform)
                          ? prev.filter(p => p !== platform)
                          : [...prev, platform]
                      );
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      postPlatforms.includes(platform)
                        ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                        : 'border-gray-300 dark:border-dark-200 text-gray-600 dark:text-dark-400'
                    }`}
                  >
                    {PLATFORM_ICONS[platform]}
                    <span className="capitalize">{platform}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500">
                Inhalt
              </label>
              <span className={`text-xs ${getCharacterCount().isOver ? 'text-red-500' : 'text-gray-500'}`}>
                {getCharacterCount().count} / {getCharacterCount().limit}
              </span>
            </div>
            <textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder="Was möchten Sie teilen?"
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none"
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Hashtags
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {postHashtags.map((tag, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-1 px-2 py-1 bg-accent-primary/10 text-accent-primary rounded text-sm"
                >
                  {tag}
                  <button onClick={() => setPostHashtags(postHashtags.filter((_, i) => i !== idx))}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="#hashtag"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const value = input.value.trim();
                    if (value) {
                      const tag = value.startsWith('#') ? value : `#${value}`;
                      if (!postHashtags.includes(tag)) {
                        setPostHashtags([...postHashtags, tag]);
                      }
                      input.value = '';
                    }
                  }
                }}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
              />
              {hashtagGroups.length > 0 && (
                <select
                  onChange={(e) => {
                    const group = hashtagGroups.find(g => g.id === e.target.value);
                    if (group) addHashtagsFromGroup(group);
                    e.target.value = '';
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Gruppe hinzufügen...</option>
                  {hashtagGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Customer */}
          {!editingPost && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Kunde (optional)
              </label>
              <select
                value={postCustomerId}
                onChange={(e) => setPostCustomerId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="">Kein Kunde</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Planen für (optional)
            </label>
            <input
              type="datetime-local"
              value={postScheduledAt}
              onChange={(e) => setPostScheduledAt(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowPostEditor(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={savePost}
              disabled={saving || !postContent.trim()}
              className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {editingPost ? 'Speichern' : postScheduledAt ? 'Planen' : 'Als Entwurf speichern'}
            </button>
          </div>
        </div>
      </Modal>

      {/* AI Generator Modal */}
      <Modal
        isOpen={showAiGenerator}
        onClose={() => setShowAiGenerator(false)}
        title="Post mit KI generieren"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Thema / Beschreibung
            </label>
            <textarea
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="z.B. Neue Produktfeatures vorstellen, Kundenerfolg teilen, Branchennews kommentieren..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Plattform
              </label>
              <select
                value={aiPlatform}
                onChange={(e) => setAiPlatform(e.target.value as Platform)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="linkedin">LinkedIn</option>
                <option value="twitter">Twitter / X</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="all">Universal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                Ton
              </label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value as typeof aiTone)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              >
                <option value="professional">Professionell</option>
                <option value="casual">Locker</option>
                <option value="humorous">Humorvoll</option>
                <option value="informative">Informativ</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={aiIncludeHashtags}
                onChange={(e) => setAiIncludeHashtags(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-accent-primary"
              />
              <span className="text-sm text-gray-700 dark:text-dark-500">Hashtags</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={aiIncludeEmoji}
                onChange={(e) => setAiIncludeEmoji(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-accent-primary"
              />
              <span className="text-sm text-gray-700 dark:text-dark-500">Emojis</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowAiGenerator(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={generateWithAi}
              disabled={generating || !aiTopic.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-light0 to-pink-500 text-white rounded-lg disabled:opacity-50"
            >
              {generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Generieren
            </button>
          </div>
        </div>
      </Modal>

      {/* Template Editor Modal */}
      <Modal
        isOpen={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
        title="Neue Vorlage"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="z.B. Produktankündigung"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Plattform
            </label>
            <select
              value={templatePlatform}
              onChange={(e) => setTemplatePlatform(e.target.value as Platform)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            >
              <option value="all">Alle Plattformen</option>
              <option value="linkedin">LinkedIn</option>
              <option value="twitter">Twitter / X</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Inhalt
            </label>
            <textarea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              placeholder="Vorlagen-Text mit Platzhaltern wie [PRODUKT], [DATUM], etc."
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowTemplateEditor(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={saveTemplate}
              disabled={saving || !templateName.trim() || !templateContent.trim()}
              className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* Hashtag Group Editor Modal */}
      <Modal
        isOpen={showHashtagEditor}
        onClose={() => setShowHashtagEditor(false)}
        title="Neue Hashtag-Gruppe"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Name
            </label>
            <input
              type="text"
              value={hashtagGroupName}
              onChange={(e) => setHashtagGroupName(e.target.value)}
              placeholder="z.B. IT-Branche, Marketing, etc."
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Hashtags (getrennt durch Leerzeichen oder Komma)
            </label>
            <textarea
              value={hashtagGroupTags}
              onChange={(e) => setHashtagGroupTags(e.target.value)}
              placeholder="#ITServices #CloudComputing #Digitalisierung #TechNews"
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowHashtagEditor(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={saveHashtagGroup}
              disabled={saving || !hashtagGroupName.trim() || !hashtagGroupTags.trim()}
              className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setCsvText('');
          setImportPreviews([]);
        }}
        title="CSV Import"
        size="lg"
      >
        <div className="space-y-4">
          <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-3">
            <p className="text-sm text-accent-dark dark:text-accent-primary">
              Format: <code className="bg-accent-lighter dark:bg-accent-primary/50 px-1 rounded">Inhalt;Datum (YYYY-MM-DD HH:MM)</code>
              <br />
              Beispiel: <code className="bg-accent-lighter dark:bg-accent-primary/50 px-1 rounded">Mein Post-Text;2025-01-15 09:00</code>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              CSV-Daten (eine Zeile pro Post)
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Post-Inhalt;2025-01-15 09:00&#10;Noch ein Post;2025-01-16 15:00&#10;Post ohne Datum"
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white font-mono text-sm"
            />
          </div>

          <button
            onClick={parseCSV}
            className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
          >
            Vorschau
          </button>

          {importPreviews.length > 0 && (
            <div>
              <h4 className="font-medium dark:text-white mb-2">Vorschau ({importPreviews.length} Posts)</h4>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {importPreviews.map((preview, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 dark:bg-dark-200 rounded text-sm">
                    <p className="dark:text-white line-clamp-2">{preview.content}</p>
                    {preview.scheduledAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        <Clock size={12} className="inline mr-1" />
                        {preview.scheduledAt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setShowImportModal(false);
                setCsvText('');
                setImportPreviews([]);
              }}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={handleImport}
              disabled={importing || importPreviews.length === 0}
              className="flex items-center gap-2 px-4 py-2 btn-accent disabled:opacity-50"
            >
              {importing ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {importPreviews.length} Posts importieren
            </button>
          </div>
        </div>
      </Modal>

      {/* Hashtag Research Modal */}
      <Modal
        isOpen={showHashtagResearch}
        onClose={() => {
          setShowHashtagResearch(false);
          setHashtagTopic('');
          setResearchedHashtags([]);
        }}
        title="Hashtag-Recherche"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
              Thema/Branche
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={hashtagTopic}
                onChange={(e) => setHashtagTopic(e.target.value)}
                placeholder="z.B. Cloud Computing, IT-Sicherheit, Marketing..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
              />
              <button
                onClick={handleHashtagResearch}
                disabled={researchingHashtags || !hashtagTopic.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg disabled:opacity-50"
              >
                {researchingHashtags ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                Recherchieren
              </button>
            </div>
          </div>

          {researchedHashtags.length > 0 && (
            <div>
              <h4 className="font-medium dark:text-white mb-3">Gefundene Hashtags ({researchedHashtags.length})</h4>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {researchedHashtags.map((hashtag, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-3 bg-gray-50 dark:bg-dark-200 rounded-lg"
                  >
                    <div>
                      <span className="text-accent-primary font-medium">{hashtag.tag}</span>
                      <p className="text-xs text-gray-500 mt-1">{hashtag.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                        {hashtag.reach}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(hashtag.tag)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-dark-300 rounded"
                        title="Kopieren"
                      >
                        <Copy size={14} className="text-gray-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const allTags = researchedHashtags.map(h => h.tag).join(' ');
                  navigator.clipboard.writeText(allTags);
                }}
                className="mt-3 flex items-center gap-2 text-sm text-accent-primary hover:underline"
              >
                <Copy size={14} />
                Alle Hashtags kopieren
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Recycle Modal */}
      <Modal
        isOpen={showRecycleModal}
        onClose={() => {
          setShowRecycleModal(false);
          setRecyclingPost(null);
        }}
        title="Evergreen-Post recyceln"
      >
        <div className="space-y-4">
          {recyclingPost && (
            <>
              <div className="p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                <p className="text-sm dark:text-white line-clamp-3">{recyclingPost.content}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Neues Veröffentlichungsdatum
                </label>
                <input
                  type="datetime-local"
                  value={recycleDate}
                  onChange={(e) => setRecycleDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recycleModify}
                  onChange={(e) => setRecycleModify(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm dark:text-dark-500">
                  Content leicht anpassen (KI-Variation)
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowRecycleModal(false);
                    setRecyclingPost(null);
                  }}
                  className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleRecycle}
                  disabled={!recycleDate}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700"
                >
                  <RefreshCw size={18} />
                  Recyceln & Planen
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Content Wizard Modal - Professional Marketing Expert */}
      <Modal
        isOpen={showContentWizard}
        onClose={() => setShowContentWizard(false)}
        title=""
        maxWidth="5xl"
      >
        <div className="w-full">
          {/* Wizard Header */}
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500/10 to-red-500/10 rounded-full border border-amber-200 dark:border-amber-800 mb-3">
              <Wand2 size={20} className="text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Content Wizard - Marketing Expert AI</span>
            </div>
            <h2 className="text-2xl font-bold dark:text-white">
              {wizardStep === 'goal' && 'Was möchten Sie erreichen?'}
              {wizardStep === 'content' && 'Professioneller Content wird erstellt...'}
              {wizardStep === 'analyze' && 'Marketing-Experten-Analyse'}
              {wizardStep === 'image' && 'Professionelle Grafik generieren'}
              {wizardStep === 'preview' && 'Finaler Content Review'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {wizardStep === 'goal' && 'Hochwertige, lead-generierende Inhalte mit KI-Marketing-Expertise'}
              {wizardStep === 'content' && 'Unser KI-Experte erstellt conversion-optimierten Content'}
              {wizardStep === 'analyze' && 'Kritische Prüfung durch virtuellen Marketing-Experten'}
              {wizardStep === 'image' && 'DALL-E generiert ein professionelles Corporate-Bild'}
              {wizardStep === 'preview' && 'Überprüfen und veröffentlichen Sie Ihren optimierten Content'}
            </p>
          </div>

          {/* Step Progress */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {['goal', 'content', 'analyze', 'image', 'preview'].map((step, idx) => (
              <div key={step} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    wizardStep === step
                      ? 'bg-amber-500 text-white'
                      : ['goal', 'content', 'analyze', 'image', 'preview'].indexOf(wizardStep) > idx
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-dark-200 text-gray-500'
                  }`}
                >
                  {['goal', 'content', 'analyze', 'image', 'preview'].indexOf(wizardStep) > idx ? (
                    <Check size={16} />
                  ) : (
                    idx + 1
                  )}
                </div>
                {idx < 4 && (
                  <div className={`w-12 h-1 mx-1 rounded ${
                    ['goal', 'content', 'analyze', 'image', 'preview'].indexOf(wizardStep) > idx
                      ? 'bg-green-500'
                      : 'bg-gray-200 dark:bg-dark-200'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Goal Selection */}
          {wizardStep === 'goal' && (
            <div className="space-y-6">
              {/* Platform Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Plattform auswählen
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['linkedin', 'instagram', 'facebook', 'twitter'] as Platform[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setWizardPlatform(p)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                        wizardPlatform === p
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                          : 'border-gray-200 dark:border-dark-200 hover:border-gray-300'
                      }`}
                    >
                      {PLATFORM_ICONS[p]}
                      <span className="capitalize">{p}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Business Goal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Business-Ziel
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { id: 'leads', label: 'Lead-Generierung', icon: Target, desc: 'Neue Kontakte & Anfragen' },
                    { id: 'sales', label: 'Verkauf', icon: Rocket, desc: 'Direkte Conversions' },
                    { id: 'brand', label: 'Markenbildung', icon: Eye, desc: 'Bekanntheit steigern' },
                    { id: 'traffic', label: 'Website Traffic', icon: Globe, desc: 'Besucher generieren' },
                    { id: 'engagement', label: 'Engagement', icon: MessageCircle, desc: 'Interaktionen fördern' },
                  ].map(goal => (
                    <button
                      key={goal.id}
                      onClick={() => setWizardGoal(goal.id as any)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                        wizardGoal === goal.id
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/30'
                          : 'border-gray-200 dark:border-dark-200 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-dark-200'
                      }`}
                    >
                      <goal.icon size={24} className={wizardGoal === goal.id ? 'text-amber-600' : 'text-gray-500'} />
                      <span className={`text-sm font-medium ${wizardGoal === goal.id ? 'text-amber-700 dark:text-amber-400' : 'dark:text-white'}`}>
                        {goal.label}
                      </span>
                      <span className="text-xs text-gray-500 text-center">{goal.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Thema / Produkt / Dienstleistung
                </label>
                <textarea
                  value={wizardTopic}
                  onChange={(e) => setWizardTopic(e.target.value)}
                  placeholder="z.B. 'IT-Sicherheitsberatung für mittelständische Unternehmen' oder 'Neues Cloud-Backup Produkt mit 99.9% Verfügbarkeit'"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none"
                  rows={3}
                />
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Zielgruppe
                </label>
                <input
                  type="text"
                  value={wizardTargetAudience}
                  onChange={(e) => setWizardTargetAudience(e.target.value)}
                  placeholder="z.B. 'IT-Entscheider in mittelständischen Unternehmen' oder 'Geschäftsführer mit 10-50 Mitarbeitern'"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                />
              </div>

              {/* Tone & Style */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Tonalität
                  </label>
                  <select
                    value={wizardTone}
                    onChange={(e) => setWizardTone(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="professional">Professionell & Seriös</option>
                    <option value="inspirational">Inspirierend & Motivierend</option>
                    <option value="urgent">Dringend & Aktionsorientiert</option>
                    <option value="storytelling">Storytelling & Emotional</option>
                    <option value="educational">Lehrreich & Informativ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Content-Länge
                  </label>
                  <select
                    value={wizardContentLength}
                    onChange={(e) => setWizardContentLength(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="short">Kurz & Prägnant</option>
                    <option value="medium">Mittel (Empfohlen)</option>
                    <option value="long">Ausführlich</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Buyer Journey
                  </label>
                  <select
                    value={wizardJourneyStage}
                    onChange={(e) => {
                      setWizardJourneyStage(e.target.value as any);
                      setWizardThemePreview(null); // Reset theme preview
                    }}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="awareness">Awareness (Problem erkennen)</option>
                    <option value="consideration">Consideration (Lösungen suchen)</option>
                    <option value="decision">Decision (Entscheidung treffen)</option>
                  </select>
                </div>
              </div>

              {/* Theme Strategy Preview */}
              {(wizardPlatform === 'linkedin' || wizardPlatform === 'instagram') && (
                <div className="bg-gradient-to-r from-accent-light to-accent-light dark:from-accent-primary/20 dark:to-accent-primary/20 rounded-lg p-4 border border-accent-primary/30 dark:border-accent-primary/40">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-accent-dark dark:text-accent-primary flex items-center gap-2">
                      <Lightbulb size={16} />
                      Strategische Theme-Auswahl
                    </h4>
                    <button
                      onClick={async () => {
                        setWizardLoadingTheme(true);
                        try {
                          const theme = await socialMediaApi.selectTheme({
                            platform: wizardPlatform as 'linkedin' | 'instagram',
                            goal: wizardGoal === 'brand' ? 'branding' : wizardGoal === 'sales' ? 'lead' : wizardGoal,
                            journeyStage: wizardJourneyStage,
                            targetAudience: wizardTargetAudience || 'B2B-Entscheider',
                            topicHint: wizardTopic
                          });
                          setWizardThemePreview(theme);
                        } catch (err: any) {
                          console.error('Theme preview error:', err);
                        } finally {
                          setWizardLoadingTheme(false);
                        }
                      }}
                      disabled={wizardLoadingTheme}
                      className="text-xs bg-accent-primary text-white px-3 py-1 rounded-full flex items-center gap-1 hover:bg-accent-dark disabled:opacity-50"
                    >
                      {wizardLoadingTheme ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Target size={12} />
                      )}
                      Theme analysieren
                    </button>
                  </div>

                  {wizardThemePreview ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-accent-primary text-white rounded-full text-sm font-medium">
                          {wizardThemePreview.selectedTheme.category.replace('_', ' ')}
                        </span>
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                          Beste Wahl
                        </span>
                      </div>
                      <div className="bg-white/50 dark:bg-black/20 rounded p-3">
                        <p className="text-xs text-gray-600 dark:text-dark-400 mb-1">
                          <strong>Winkel:</strong> {wizardThemePreview.selectedTheme.angle}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {wizardThemePreview.reasoning.summary}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-[10px] text-gray-500">Alternativen:</span>
                        {wizardThemePreview.alternatives.slice(0, 3).map((alt, i) => (
                          <span key={i} className="text-[10px] bg-gray-100 dark:bg-dark-100 px-2 py-0.5 rounded text-gray-600 dark:text-dark-400">
                            {alt.category.replace('_', ' ')} ({alt.score})
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-accent-primary dark:text-accent-primary">
                      Klicke "Theme analysieren" um zu sehen, welches strategische Thema die KI für deine Konfiguration empfiehlt.
                    </p>
                  )}
                </div>
              )}

              {/* Image Toggle */}
              <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-dark-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizardIncludeImage}
                  onChange={(e) => setWizardIncludeImage(e.target.checked)}
                  className="w-5 h-5 rounded text-amber-500"
                />
                <div>
                  <span className="font-medium dark:text-white">Professionelle Grafik generieren (DALL-E)</span>
                  <p className="text-sm text-gray-500">Erstellt ein hochwertiges, conversion-optimiertes Bild</p>
                </div>
                <Image size={24} className="ml-auto text-amber-500" />
              </label>

              {/* Continue Button */}
              <div className="flex justify-end pt-4">
                <button
                  onClick={async () => {
                    if (!wizardTopic.trim()) return;
                    setWizardGenerating(true);
                    setWizardStep('content');
                    try {
                      const goalMap: Record<string, string> = {
                        leads: 'Lead-Generierung und Kontaktanfragen',
                        sales: 'Direkter Verkauf und Conversions',
                        brand: 'Markenbekanntheit und Corporate Image',
                        traffic: 'Website-Traffic und Klicks',
                        engagement: 'Engagement und Community-Building'
                      };
                      const toneMap: Record<string, string> = {
                        professional: 'professionell und seriös',
                        inspirational: 'inspirierend und motivierend',
                        urgent: 'dringend und handlungsorientiert',
                        storytelling: 'storytelling und emotional',
                        educational: 'lehrreich und informativ'
                      };
                      const content = await socialMediaApi.generateWizardContent({
                        topic: wizardTopic,
                        platform: wizardPlatform,
                        goal: goalMap[wizardGoal],
                        targetAudience: wizardTargetAudience || 'Business-Entscheider',
                        journeyStage: wizardJourneyStage,
                        tone: toneMap[wizardTone],
                        includeImage: wizardIncludeImage,
                        includeHashtags: true,
                        contentLength: wizardContentLength
                      });
                      setWizardContent(content);
                      setWizardEditedContent(content.post.content);
                      setWizardStep('analyze');

                      // Auto-analyze
                      setWizardAnalyzing(true);
                      const analysis = await socialMediaApi.analyzeContent({
                        content: content.post.content,
                        platform: wizardPlatform,
                        goal: goalMap[wizardGoal],
                        targetAudience: wizardTargetAudience
                      });
                      setWizardAnalysis(analysis);
                    } catch (err: any) {
                      setError(err.message || 'Fehler bei der Content-Generierung');
                      setWizardStep('goal');
                    } finally {
                      setWizardGenerating(false);
                      setWizardAnalyzing(false);
                    }
                  }}
                  disabled={!wizardTopic.trim() || wizardGenerating}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-red-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
                >
                  {wizardGenerating ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Content wird erstellt...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Professionellen Content erstellen
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Content Generation (Loading) */}
          {wizardStep === 'content' && wizardGenerating && (
            <div className="text-center py-12">
              <Loader2 size={48} className="animate-spin text-amber-500 mx-auto mb-4" />
              <p className="text-lg dark:text-white mb-2">Marketing-Experte arbeitet...</p>
              <p className="text-sm text-gray-500">Analysiert Zielgruppe, optimiert für Conversions</p>
            </div>
          )}

          {/* Step 3: Marketing Analysis - Desktop: 2 Columns, Mobile: Stack */}
          {wizardStep === 'analyze' && wizardContent && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT SIDE: Content Editor */}
              <div className="space-y-4">
                {/* Generated Content Preview */}
                <div className="bg-gray-50 dark:bg-dark-200 rounded-xl p-5 h-fit">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold dark:text-white flex items-center gap-2">
                      <PenTool size={18} className="text-amber-500" />
                      Dein Content
                    </h3>
                    <div className="flex items-center gap-1">
                      {(wizardContent.alternatives || []).length > 0 && [wizardContent, ...wizardContent.alternatives].map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setWizardSelectedAlternative(idx);
                            setWizardEditedContent(idx === 0 ? wizardContent.post?.content || '' : wizardContent.alternatives?.[idx - 1]?.content || wizardContent.post?.content || '');
                          }}
                          className={`px-2 py-1 rounded text-xs ${
                            wizardSelectedAlternative === idx
                              ? 'bg-amber-500 text-white'
                              : 'bg-gray-200 dark:bg-dark-300 text-gray-600 dark:text-dark-400 hover:bg-gray-300'
                          }`}
                        >
                          {idx === 0 ? 'Original' : `V${idx}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={wizardEditedContent}
                    onChange={(e) => setWizardEditedContent(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-dark-300 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white resize-none text-sm leading-relaxed"
                    rows={10}
                    placeholder="Bearbeite deinen Content hier..."
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(wizardContent.post?.hashtags || []).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary rounded text-xs">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        setWizardAnalyzing(true);
                        try {
                          const newAnalysis = await socialMediaApi.analyzeContent({
                            content: wizardEditedContent,
                            platform: wizardPlatform,
                            goal: wizardGoal,
                            targetAudience: wizardTargetAudience
                          });
                          setWizardAnalysis(newAnalysis);
                        } catch (err) {
                          console.error('Re-analysis failed:', err);
                        } finally {
                          setWizardAnalyzing(false);
                        }
                      }}
                      disabled={wizardAnalyzing}
                      className="text-xs bg-accent-primary text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-accent-dark disabled:opacity-50"
                    >
                      {wizardAnalyzing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                      Neu analysieren
                    </button>
                  </div>
                </div>

                {/* Best Posting Time - Moved to left side */}
                {wizardContent.bestPostingTime && (
                  <div className="bg-accent-light dark:bg-accent-primary/20 rounded-xl p-4 flex items-center gap-3">
                    <Clock size={20} className="text-accent-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium dark:text-white text-sm">Optimaler Zeitpunkt</p>
                      <p className="text-xs text-gray-600 dark:text-dark-400">
                        {wizardContent.bestPostingTime.day} um {wizardContent.bestPostingTime.time}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT SIDE: Marketing Analysis */}
              <div className="space-y-4">
                {wizardAnalyzing ? (
                  <div className="bg-gradient-to-r from-accent-light to-accent-light dark:from-accent-primary/20 dark:to-accent-primary/20 rounded-xl p-8 text-center">
                    <Loader2 size={40} className="animate-spin text-accent-primary mx-auto mb-4" />
                    <p className="font-medium dark:text-white">Marketing-Experte analysiert...</p>
                    <p className="text-sm text-gray-500 mt-1">Prüft Hook, Mehrwert, CTA und Plattform-Fit</p>
                  </div>
                ) : wizardAnalysis && (
                  <>
                    {/* Score Header */}
                    <div className="bg-gradient-to-r from-accent-light to-accent-light dark:from-accent-primary/20 dark:to-accent-primary/20 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold dark:text-white flex items-center gap-2">
                          <Bot size={18} className="text-accent-primary" />
                          Experten-Analyse
                        </h3>
                        <div className={`text-2xl font-bold ${wizardAnalysis.overallScore >= 80 ? 'text-green-600' : wizardAnalysis.overallScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                          {wizardAnalysis.overallScore}/100
                        </div>
                      </div>

                      {/* Score Grid - Compact */}
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="bg-white/60 dark:bg-dark-100/60 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-accent-primary">{wizardAnalysis.platformFit?.score || 0}</div>
                          <div className="text-[10px] text-gray-500">Plattform</div>
                        </div>
                        <div className="bg-white/60 dark:bg-dark-100/60 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-accent-primary">{wizardAnalysis.viralPotential || 0}</div>
                          <div className="text-[10px] text-gray-500">Viral</div>
                        </div>
                        <div className="bg-white/60 dark:bg-dark-100/60 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-green-600">{wizardAnalysis.callToActionEffectiveness?.score || 0}</div>
                          <div className="text-[10px] text-gray-500">CTA</div>
                        </div>
                      </div>

                      {/* Strengths & Weaknesses - Compact */}
                      <div className="space-y-3">
                        {wizardAnalysis.strengths?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                              <ThumbsUp size={12} />
                              Stärken
                            </h4>
                            <ul className="space-y-0.5">
                              {wizardAnalysis.strengths?.slice(0, 3).map((s, i) => (
                                <li key={i} className="text-xs text-gray-600 dark:text-dark-400 flex items-start gap-1.5">
                                  <Check size={12} className="text-green-500 mt-0.5 flex-shrink-0" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {wizardAnalysis.weaknesses?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                              <ThumbsDown size={12} />
                              Verbesserungspotenzial
                            </h4>
                            <ul className="space-y-0.5">
                              {wizardAnalysis.weaknesses?.slice(0, 3).map((w, i) => (
                                <li key={i} className="text-xs text-gray-600 dark:text-dark-400 flex items-start gap-1.5">
                                  <AlertCircle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                  {/* Improvement Suggestions */}
                  {wizardAnalysis.improvements?.length > 0 && (
                    <div className="bg-white/50 dark:bg-dark-100/50 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium dark:text-white flex items-center gap-2">
                          <Wand2 size={16} className="text-accent-primary" />
                          Verbesserungsvorschläge
                        </h4>
                        {/* Main auto-improve button - iteratively improves until target score */}
                        <button
                          onClick={async () => {
                            setWizardAutoImproving(true);
                            setWizardAutoImprovingStatus('Starte Auto-Verbesserung...');
                            setWizardAutoImprovement(null);
                            try {
                              const result = await socialMediaApi.autoImproveContent({
                                content: wizardEditedContent,
                                platform: wizardPlatform,
                                goal: wizardGoal,
                                targetAudience: wizardTargetAudience,
                                minScore: 75,
                                maxIterations: 3
                              });
                              setWizardAutoImprovement(result);
                              setWizardEditedContent(result.finalContent);
                              // Re-analyze with final content
                              const analysis = await socialMediaApi.analyzeContent({
                                content: result.finalContent,
                                platform: wizardPlatform,
                                goal: wizardGoal,
                                targetAudience: wizardTargetAudience
                              });
                              setWizardAnalysis(analysis);
                            } catch (err: any) {
                              setError(err.message);
                            } finally {
                              setWizardAutoImproving(false);
                              setWizardAutoImprovingStatus('');
                            }
                          }}
                          disabled={wizardAutoImproving || wizardImproving}
                          className="text-xs bg-gradient-to-r from-accent-primary to-accent-dark text-white px-4 py-1.5 rounded-full flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 font-medium"
                        >
                          {wizardAutoImproving ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          {wizardAutoImproving ? 'Verbessere...' : 'Auto-Verbessern'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {wizardAnalysis.improvements.map((imp, i) => (
                          <div key={i} className="border border-gray-200 dark:border-dark-100 rounded-lg p-3 hover:border-accent-primary transition-colors">
                            <div className="flex items-start gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                imp.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                imp.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-gray-100 text-gray-700 dark:bg-dark-100 dark:text-dark-400'
                              }`}>
                                {imp.priority === 'high' ? '🔥' : imp.priority === 'medium' ? '⚡' : '○'}
                              </span>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium dark:text-white">{imp.area}</p>
                                  {/* Button to improve just this area */}
                                  <button
                                    onClick={async () => {
                                      setWizardImproving(true);
                                      try {
                                        const improved = await socialMediaApi.improveContent({
                                          content: wizardEditedContent,
                                          platform: wizardPlatform,
                                          improvementFocus: imp.area?.toLowerCase() || 'all'
                                        });
                                        setWizardImprovement(improved);
                                        setWizardEditedContent(improved.improvedContent);
                                        // Re-analyze
                                        const analysis = await socialMediaApi.analyzeContent({
                                          content: improved.improvedContent,
                                          platform: wizardPlatform,
                                          goal: wizardGoal,
                                          targetAudience: wizardTargetAudience
                                        });
                                        setWizardAnalysis(analysis);
                                      } catch (err: any) {
                                        setError(err.message);
                                      } finally {
                                        setWizardImproving(false);
                                      }
                                    }}
                                    disabled={wizardImproving}
                                    className="text-[10px] bg-accent-lighter dark:bg-accent-primary/20 text-accent-dark dark:text-accent-primary px-2 py-0.5 rounded flex items-center gap-1 hover:bg-accent-lighter disabled:opacity-50"
                                  >
                                    <Wand2 size={10} />
                                    Verbessern
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">{imp.suggestion}</p>
                                {imp.improvedExample && (
                                  <p className="text-xs text-accent-primary dark:text-accent-primary mt-1 italic">
                                    💡 Beispiel: "{imp.improvedExample}"
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CTA Suggestions - these ARE meant to be appended */}
                  {wizardAnalysis.callToActionEffectiveness?.suggestions?.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                        <MousePointer size={14} />
                        CTA-Vorschläge zum Anhängen
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {wizardAnalysis.callToActionEffectiveness.suggestions.map((cta, i) => (
                          <button
                            key={i}
                            onClick={() => setWizardEditedContent(prev => prev + '\n\n' + cta)}
                            className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                          >
                            + {cta}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Auto-Improvement Progress */}
                  {wizardAutoImproving && (
                    <div className="bg-accent-light dark:bg-accent-primary/20 rounded-lg p-4 border border-accent-primary/30 dark:border-accent-primary/40">
                      <div className="flex items-center gap-3">
                        <Loader2 size={20} className="animate-spin text-accent-primary" />
                        <div>
                          <p className="text-sm font-medium text-accent-dark dark:text-accent-primary">
                            Auto-Verbesserung läuft...
                          </p>
                          <p className="text-xs text-accent-primary dark:text-accent-primary">
                            Der Content wird iterativ analysiert und verbessert bis Score ≥ 75
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Auto-Improvement Results */}
                  {wizardAutoImprovement && !wizardAutoImproving && (
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center gap-2">
                          <CheckCircle size={16} />
                          Auto-Verbesserung abgeschlossen
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-dark-400">
                            Score: {wizardAutoImprovement.initialScore}
                          </span>
                          <ArrowRight size={12} className="text-green-600" />
                          <span className="text-sm font-bold text-green-700 dark:text-green-300">
                            {wizardAutoImprovement.finalScore}
                          </span>
                        </div>
                      </div>

                      {/* Iterations Summary */}
                      <div className="space-y-2 mb-3">
                        {wizardAutoImprovement.iterations.map((iter, i) => (
                          <div key={i} className="bg-white/50 dark:bg-black/20 rounded p-2 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-gray-700 dark:text-dark-500">
                                Iteration {iter.iteration}: {iter.focus}
                              </span>
                              <span className="text-green-600 dark:text-green-400">
                                {iter.beforeScore} → {iter.afterScore} (+{iter.afterScore - iter.beforeScore})
                              </span>
                            </div>
                            <ul className="text-gray-500 dark:text-dark-400 list-disc list-inside">
                              {iter.changes.slice(0, 2).map((change, j) => (
                                <li key={j}>{change}</li>
                              ))}
                              {iter.changes.length > 2 && (
                                <li className="text-gray-400">+{iter.changes.length - 2} weitere...</li>
                              )}
                            </ul>
                          </div>
                        ))}
                      </div>

                      {/* Alternative Hooks */}
                      {wizardAutoImprovement.alternativeHooks?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                            Alternative Hooks:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {wizardAutoImprovement.alternativeHooks.map((hook, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  // Replace the first line (hook) with the new hook
                                  const lines = wizardEditedContent.split('\n');
                                  lines[0] = hook;
                                  setWizardEditedContent(lines.join('\n'));
                                }}
                                className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-1 rounded hover:bg-green-200 dark:hover:bg-green-900/60"
                                title="Klicken um Hook zu ersetzen"
                              >
                                {hook.substring(0, 50)}...
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CTA Suggestions from auto-improvement */}
                      {wizardAutoImprovement.ctaSuggestions?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                            CTA-Vorschläge:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {wizardAutoImprovement.ctaSuggestions.map((cta, i) => (
                              <button
                                key={i}
                                onClick={() => setWizardEditedContent(prev => prev + '\n\n' + cta)}
                                className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-1 rounded hover:bg-green-200 dark:hover:bg-green-900/60"
                              >
                                + {cta}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-500 dark:text-dark-400 mt-2">
                        Dauer: {(wizardAutoImprovement.totalImprovementTime / 1000).toFixed(1)}s
                      </p>
                    </div>
                  )}
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons - Full Width Below Grid */}
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setWizardStep('goal')}
                className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
              >
                Zurück
              </button>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!wizardAnalysis?.weaknesses?.length && wizardAnalysis?.overallScore >= 75) {
                      setWizardStep(wizardIncludeImage ? 'image' : 'preview');
                      return;
                    }
                    setWizardAutoImproving(true);
                    setWizardAutoImprovingStatus('Starte Auto-Verbesserung...');
                    setWizardAutoImprovement(null);
                    try {
                      const result = await socialMediaApi.autoImproveContent({
                        content: wizardEditedContent,
                        platform: wizardPlatform,
                        goal: wizardGoal,
                        targetAudience: wizardTargetAudience,
                        minScore: 75,
                        maxIterations: 3
                      });
                      setWizardAutoImprovement(result);
                      setWizardEditedContent(result.finalContent);
                      // Re-analyze with final content
                      const analysis = await socialMediaApi.analyzeContent({
                        content: result.finalContent,
                        platform: wizardPlatform,
                        goal: wizardGoal,
                        targetAudience: wizardTargetAudience
                      });
                      setWizardAnalysis(analysis);
                    } catch (err: any) {
                      setError(err.message);
                    } finally {
                      setWizardAutoImproving(false);
                      setWizardAutoImprovingStatus('');
                    }
                  }}
                  disabled={wizardAutoImproving || wizardImproving}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                >
                  {wizardAutoImproving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  {wizardAutoImproving ? 'Verbessere...' : 'Auto-Verbessern'}
                </button>
                <button
                  onClick={() => setWizardStep(wizardIncludeImage ? 'image' : 'preview')}
                  className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-red-500 text-white rounded-lg hover:opacity-90"
                >
                  Weiter
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
            </div>
          )}

          {/* Step 4: Image Generation */}
          {wizardStep === 'image' && (
            <div className="space-y-6">
              {/* Image Prompt from AI */}
              {wizardContent?.imagePrompt && (
                <div className="bg-gray-50 dark:bg-dark-200 rounded-xl p-6">
                  <h3 className="font-semibold dark:text-white mb-3 flex items-center gap-2">
                    <Image size={18} className="text-amber-500" />
                    KI-Bildvorschlag
                  </h3>
                  <div className="p-4 bg-white dark:bg-dark-100 rounded-lg border border-gray-200 dark:border-dark-300">
                    <p className="text-sm dark:text-white mb-2">{wizardContent.imagePrompt.prompt}</p>
                    <p className="text-xs text-gray-500">
                      Stil: {wizardContent.imagePrompt.style} • {wizardContent.imagePrompt.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Image Options */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Bildformat
                  </label>
                  <select
                    value={imageAspectRatio}
                    onChange={(e) => setImageAspectRatio(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="1:1">Quadratisch (1:1) - Feed</option>
                    <option value="9:16">Hochformat (9:16) - Story</option>
                    <option value="16:9">Querformat (16:9) - Banner</option>
                    <option value="4:5">Portrait (4:5) - Instagram</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Qualität
                  </label>
                  <select
                    value={imageQuality}
                    onChange={(e) => setImageQuality(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white"
                  >
                    <option value="hd">HD - Maximale Qualität</option>
                    <option value="standard">Standard</option>
                  </select>
                </div>
              </div>

              {/* Generated Image Preview */}
              {wizardGeneratedImage && (
                <div className="bg-gray-50 dark:bg-dark-200 rounded-xl p-4">
                  <img
                    src={wizardGeneratedImage.url}
                    alt="Generated"
                    className="max-w-full h-auto rounded-lg mx-auto"
                    style={{ maxHeight: '400px' }}
                  />
                  {wizardGeneratedImage.revisedPrompt && (
                    <p className="text-xs text-gray-500 mt-3 text-center italic">
                      "{wizardGeneratedImage.revisedPrompt}"
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setWizardStep('analyze')}
                  className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
                >
                  Zurück
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!wizardContent?.imagePrompt?.prompt) return;
                      setWizardGeneratingImage(true);
                      try {
                        const image = await socialMediaApi.generateWizardImage({
                          prompt: wizardContent.imagePrompt.prompt,
                          aspectRatio: imageAspectRatio,
                          style: wizardContent.imagePrompt.style || 'modern',
                          quality: imageQuality
                        });
                        setWizardGeneratedImage(image);
                      } catch (err: any) {
                        setError(err.message || 'Fehler bei der Bildgenerierung');
                      } finally {
                        setWizardGeneratingImage(false);
                      }
                    }}
                    disabled={wizardGeneratingImage || !wizardContent?.imagePrompt}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
                  >
                    {wizardGeneratingImage ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Generiere Bild...
                      </>
                    ) : (
                      <>
                        <Image size={18} />
                        {wizardGeneratedImage ? 'Neues Bild' : 'Bild generieren'}
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setWizardStep('preview')}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-red-500 text-white rounded-lg hover:opacity-90"
                  >
                    {wizardGeneratedImage ? 'Weiter zur Vorschau' : 'Ohne Bild fortfahren'}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Final Preview */}
          {wizardStep === 'preview' && (
            <div className="space-y-6">
              {/* Final Post Preview */}
              <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 overflow-hidden">
                {wizardGeneratedImage && (
                  <img
                    src={wizardGeneratedImage.url}
                    alt="Post image"
                    className="w-full h-48 object-cover"
                  />
                )}
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-full ${PLATFORM_COLORS[wizardPlatform]}`}>
                      {PLATFORM_ICONS[wizardPlatform]}
                    </div>
                    <div>
                      <span className="font-medium dark:text-white capitalize">{wizardPlatform}</span>
                      {wizardContent?.bestPostingTime && (
                        <p className="text-xs text-gray-500">
                          Geplant: {wizardContent.bestPostingTime.day} um {wizardContent.bestPostingTime.time}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="dark:text-white whitespace-pre-wrap">{wizardEditedContent}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {(wizardContent?.post?.hashtags || []).map(tag => (
                      <span key={tag} className="text-sm text-accent-primary dark:text-accent-primary">#{tag}</span>
                    ))}
                  </div>
                  {wizardContent?.post.callToAction && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                        Call-to-Action: {wizardContent.post.callToAction}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Analysis Summary */}
              {wizardAnalysis && (
                <div className="flex items-center justify-center gap-6 p-4 bg-gray-50 dark:bg-dark-200 rounded-xl">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${wizardAnalysis.overallScore >= 80 ? 'text-green-600' : wizardAnalysis.overallScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {wizardAnalysis.overallScore}
                    </div>
                    <div className="text-xs text-gray-500">Qualitäts-Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-accent-primary">{wizardAnalysis.viralPotential || 0}</div>
                    <div className="text-xs text-gray-500">Viral-Potenzial</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-700 dark:text-dark-500">{wizardAnalysis.emotionalTone}</div>
                    <div className="text-xs text-gray-500">Emotionale Tonalität</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setWizardStep(wizardIncludeImage ? 'image' : 'analyze')}
                  className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
                >
                  Zurück
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      // Save as draft
                      try {
                        await socialMediaApi.createPost({
                          content: wizardEditedContent,
                          platforms: [wizardPlatform],
                          hashtags: wizardContent?.post?.hashtags || [],
                          mediaUrls: wizardGeneratedImage ? [wizardGeneratedImage.url] : [],
                          aiGenerated: true,
                          aiPrompt: wizardTopic
                        });
                        setShowContentWizard(false);
                        loadData();
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-200 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-200"
                  >
                    <Edit2 size={18} />
                    Als Entwurf speichern
                  </button>
                  <button
                    onClick={async () => {
                      // Schedule post
                      try {
                        const scheduledAt = new Date();
                        if (wizardContent?.bestPostingTime) {
                          // Parse best posting time
                          const [hours, minutes] = wizardContent.bestPostingTime.time.split(':').map(Number);
                          scheduledAt.setHours(hours, minutes, 0, 0);
                          // If time has passed, schedule for tomorrow
                          if (scheduledAt <= new Date()) {
                            scheduledAt.setDate(scheduledAt.getDate() + 1);
                          }
                        } else {
                          scheduledAt.setDate(scheduledAt.getDate() + 1);
                          scheduledAt.setHours(9, 0, 0, 0);
                        }

                        await socialMediaApi.createPost({
                          content: wizardEditedContent,
                          platforms: [wizardPlatform],
                          hashtags: wizardContent?.post?.hashtags || [],
                          mediaUrls: wizardGeneratedImage ? [wizardGeneratedImage.url] : [],
                          aiGenerated: true,
                          aiPrompt: wizardTopic,
                          scheduledAt: scheduledAt.toISOString()
                        });
                        setShowContentWizard(false);
                        loadData();
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-red-500 text-white rounded-lg hover:opacity-90 font-medium"
                  >
                    <Send size={18} />
                    Planen & Veröffentlichen
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
      </div>
    </div>
  );
};

export default SocialMediaManager;
