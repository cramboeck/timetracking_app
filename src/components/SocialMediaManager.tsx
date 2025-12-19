import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, List, Plus, Sparkles, Hash, FileText, Settings, Send,
  ChevronLeft, ChevronRight, Edit2, Trash2, Copy, Clock, Check,
  Linkedin, Twitter, Facebook, Instagram, X, Loader2, AlertCircle,
  Layers, Lightbulb, ListOrdered, Zap, Upload, BarChart3, TrendingUp,
  Recycle, Search, RefreshCw
} from 'lucide-react';
import { socialMediaApi, SocialMediaPost, SocialMediaTemplate, SocialMediaHashtagGroup, SocialMediaAccount } from '../services/api';
import { Customer } from '../types';
import { Modal } from './Modal';

interface SocialMediaManagerProps {
  customers?: Customer[];
}

type ViewMode = 'calendar' | 'list' | 'templates' | 'hashtags' | 'accounts' | 'queue' | 'batch' | 'analytics' | 'evergreen';
type Platform = 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'all';

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin size={16} />,
  twitter: <Twitter size={16} />,
  facebook: <Facebook size={16} />,
  instagram: <Instagram size={16} />,
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: 'bg-blue-600',
  twitter: 'bg-sky-500',
  facebook: 'bg-blue-500',
  instagram: 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500',
};

const PLATFORM_LIMITS: Record<string, number> = {
  linkedin: 3000,
  twitter: 280,
  facebook: 63206,
  instagram: 2200,
  all: 280, // Use lowest limit
};

export const SocialMediaManager = ({ customers = [] }: SocialMediaManagerProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [templates, setTemplates] = useState<SocialMediaTemplate[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<SocialMediaHashtagGroup[]>([]);
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setViewMode('batch');
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
  }, [viewMode]);

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
    if (!confirm('Post wirklich löschen?')) return;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold dark:text-white">Social Media Manager</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
          >
            <Upload size={18} />
            CSV Import
          </button>
          <button
            onClick={() => setShowHashtagResearch(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
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

      {/* View Mode Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-dark-200 pb-2 overflow-x-auto">
        {[
          { id: 'calendar', label: 'Kalender', icon: Calendar },
          { id: 'list', label: 'Posts', icon: List },
          { id: 'queue', label: 'Queue', icon: ListOrdered },
          { id: 'batch', label: 'Batch', icon: Layers },
          { id: 'evergreen', label: 'Evergreen', icon: Recycle },
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'templates', label: 'Vorlagen', icon: FileText },
          { id: 'hashtags', label: 'Hashtags', icon: Hash },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id as ViewMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
              viewMode === tab.id
                ? 'bg-accent-primary text-white'
                : 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-300'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

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
              <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
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
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-accent-primary' : 'text-gray-700 dark:text-gray-300'}`}>
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
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                : 'bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-gray-400'
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
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
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
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-gray-400'
                    }`}>
                      {post.status === 'published' ? 'Veröffentlicht' :
                       post.status === 'scheduled' ? 'Geplant' : 'Entwurf'}
                    </span>
                    {post.aiGenerated && (
                      <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
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
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">
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
                  <div className="flex items-center gap-1 mt-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock size={14} />
                    {new Date(post.scheduledAt).toLocaleString('de-DE')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Templates View */}
      {viewMode === 'templates' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowTemplateEditor(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
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
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-3">
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
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
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
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
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
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-700 dark:text-blue-400">
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    <span className="text-sm dark:text-gray-300">Hashtags</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchIncludeEmoji}
                      onChange={(e) => setBatchIncludeEmoji(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm dark:text-gray-300">Emojis</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchAutoSchedule}
                      onChange={(e) => setBatchAutoSchedule(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm dark:text-gray-300">Auto-Planen</span>
                  </label>
                </div>

                {batchAutoSchedule && (
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 dark:bg-dark-200 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
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
                            <span key={i} className="text-xs text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
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
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm text-blue-700 dark:text-blue-400 font-medium mb-2">Empfehlungen:</p>
                        <ul className="text-sm text-blue-600 dark:text-blue-300 space-y-1">
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
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
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
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">
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

      {/* Ideas Generator Modal */}
      <Modal
        isOpen={showIdeasGenerator}
        onClose={() => setShowIdeasGenerator(false)}
        title="Content-Ideen generieren"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90"
          >
            <Sparkles size={18} />
            Mit KI generieren
          </button>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                        : 'border-gray-300 dark:border-dark-200 text-gray-600 dark:text-gray-400'
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              <span className="text-sm text-gray-700 dark:text-gray-300">Hashtags</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={aiIncludeEmoji}
                onChange={(e) => setAiIncludeEmoji(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-accent-primary"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Emojis</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setShowAiGenerator(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg"
            >
              Abbrechen
            </button>
            <button
              onClick={generateWithAi}
              disabled={generating || !aiTopic.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg disabled:opacity-50"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg"
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
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Format: <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Inhalt;Datum (YYYY-MM-DD HH:MM)</code>
              <br />
              Beispiel: <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">Mein Post-Text;2025-01-15 09:00</code>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
            className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
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
              className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                <span className="text-sm dark:text-gray-300">
                  Content leicht anpassen (KI-Variation)
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowRecycleModal(false);
                    setRecyclingPost(null);
                  }}
                  className="px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-gray-300 rounded-lg"
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
    </div>
  );
};

export default SocialMediaManager;
