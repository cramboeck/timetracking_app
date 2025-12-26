import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { socialMediaApi } from '../../../services/api';
import type {
  SocialMediaPost,
  SocialMediaTemplate,
  SocialMediaHashtagGroup,
  SocialMediaAccount,
  ViewMode,
  ContentStudioTab,
  LibraryTab,
  InsightsTab,
  AutomationTab,
} from '../types';
import { Customer } from '../../../types';

// ============================================
// Context Types
// ============================================

interface SocialMediaContextValue {
  // Core data
  posts: SocialMediaPost[];
  templates: SocialMediaTemplate[];
  hashtagGroups: SocialMediaHashtagGroup[];
  accounts: SocialMediaAccount[];
  customers: Customer[];

  // Loading states
  loading: boolean;
  error: string | null;

  // Navigation
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  contentStudioTab: ContentStudioTab;
  setContentStudioTab: (tab: ContentStudioTab) => void;
  libraryTab: LibraryTab;
  setLibraryTab: (tab: LibraryTab) => void;
  insightsTab: InsightsTab;
  setInsightsTab: (tab: InsightsTab) => void;
  automationTab: AutomationTab;
  setAutomationTab: (tab: AutomationTab) => void;

  // Actions
  refreshData: () => Promise<void>;
  refreshPosts: () => Promise<void>;
  addPost: (post: SocialMediaPost) => void;
  updatePost: (post: SocialMediaPost) => void;
  removePost: (postId: string) => void;
  addTemplate: (template: SocialMediaTemplate) => void;
  removeTemplate: (templateId: string) => void;
  addHashtagGroup: (group: SocialMediaHashtagGroup) => void;
  removeHashtagGroup: (groupId: string) => void;
  setError: (error: string | null) => void;
}

// ============================================
// Context Creation
// ============================================

const SocialMediaContext = createContext<SocialMediaContextValue | null>(null);

// ============================================
// Provider Props
// ============================================

interface SocialMediaProviderProps {
  children: ReactNode;
  customers?: Customer[];
}

// ============================================
// Provider Component
// ============================================

export function SocialMediaProvider({ children, customers = [] }: SocialMediaProviderProps) {
  // Core data state
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [templates, setTemplates] = useState<SocialMediaTemplate[]>([]);
  const [hashtagGroups, setHashtagGroups] = useState<SocialMediaHashtagGroup[]>([]);
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [contentStudioTab, setContentStudioTab] = useState<ContentStudioTab>('editor');
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('posts');
  const [insightsTab, setInsightsTab] = useState<InsightsTab>('analytics');
  const [automationTab, setAutomationTab] = useState<AutomationTab>('autopilot');

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    } catch (err: any) {
      setError(err.message || 'Fehler beim Laden der Daten');
      console.error('Failed to load social media data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh just posts
  const refreshPosts = useCallback(async () => {
    try {
      const postsData = await socialMediaApi.getPosts();
      setPosts(postsData);
    } catch (err: any) {
      console.error('Failed to refresh posts:', err);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Post actions
  const addPost = useCallback((post: SocialMediaPost) => {
    setPosts(prev => [post, ...prev]);
  }, []);

  const updatePost = useCallback((updatedPost: SocialMediaPost) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  }, []);

  const removePost = useCallback((postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  }, []);

  // Template actions
  const addTemplate = useCallback((template: SocialMediaTemplate) => {
    setTemplates(prev => [template, ...prev]);
  }, []);

  const removeTemplate = useCallback((templateId: string) => {
    setTemplates(prev => prev.filter(t => t.id !== templateId));
  }, []);

  // Hashtag group actions
  const addHashtagGroup = useCallback((group: SocialMediaHashtagGroup) => {
    setHashtagGroups(prev => [group, ...prev]);
  }, []);

  const removeHashtagGroup = useCallback((groupId: string) => {
    setHashtagGroups(prev => prev.filter(g => g.id !== groupId));
  }, []);

  // Context value
  const value: SocialMediaContextValue = {
    // Core data
    posts,
    templates,
    hashtagGroups,
    accounts,
    customers,

    // Loading states
    loading,
    error,

    // Navigation
    viewMode,
    setViewMode,
    contentStudioTab,
    setContentStudioTab,
    libraryTab,
    setLibraryTab,
    insightsTab,
    setInsightsTab,
    automationTab,
    setAutomationTab,

    // Actions
    refreshData: loadData,
    refreshPosts,
    addPost,
    updatePost,
    removePost,
    addTemplate,
    removeTemplate,
    addHashtagGroup,
    removeHashtagGroup,
    setError,
  };

  return (
    <SocialMediaContext.Provider value={value}>
      {children}
    </SocialMediaContext.Provider>
  );
}

// ============================================
// Hook for using context
// ============================================

export function useSocialMedia() {
  const context = useContext(SocialMediaContext);
  if (!context) {
    throw new Error('useSocialMedia must be used within a SocialMediaProvider');
  }
  return context;
}
