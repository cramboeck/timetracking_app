import { useState, useEffect } from 'react';
import {
  ArrowLeft, Search, Book, FolderOpen, FileText, ChevronRight,
  Star, ThumbsUp, ThumbsDown, Eye, Clock
} from 'lucide-react';
import { publicKbApi, KbCategory, KbArticle } from '../../services/api';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface PortalKnowledgeBaseProps {
  userId: string;
  onBack: () => void;
}

type KbView = 'home' | 'category' | 'article' | 'search';

export const PortalKnowledgeBase = ({ userId, onBack }: PortalKnowledgeBaseProps) => {
  const [view, setView] = useState<KbView>('home');
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [featuredArticles, setFeaturedArticles] = useState<KbArticle[]>([]);
  const [recentArticles, setRecentArticles] = useState<KbArticle[]>([]);
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<KbCategory | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    loadKnowledgeBase();
  }, [userId]);

  const loadKnowledgeBase = async () => {
    try {
      setLoading(true);
      const response = await publicKbApi.getKnowledgeBase(userId);
      setCategories(response.data.categories);
      setFeaturedArticles(response.data.featuredArticles);
      setRecentArticles(response.data.recentArticles);
    } catch (err) {
      console.error('Failed to load knowledge base:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = async (category: KbCategory) => {
    setSelectedCategory(category);
    setView('category');
    try {
      const response = await publicKbApi.getArticles(userId, { categoryId: category.id });
      setArticles(response.data);
    } catch (err) {
      console.error('Failed to load articles:', err);
    }
  };

  const handleArticleSelect = async (article: KbArticle) => {
    try {
      const response = await publicKbApi.getArticle(userId, article.slug);
      setSelectedArticle(response.data);
      setView('article');
      setFeedbackGiven(null);
    } catch (err) {
      console.error('Failed to load article:', err);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    try {
      setView('search');
      const response = await publicKbApi.getArticles(userId, { search: searchQuery });
      setArticles(response.data);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const handleFeedback = async (helpful: boolean) => {
    if (!selectedArticle || feedbackGiven) return;
    try {
      await publicKbApi.sendFeedback(userId, selectedArticle.slug, helpful);
      setFeedbackGiven(helpful ? 'yes' : 'no');
    } catch (err) {
      console.error('Failed to send feedback:', err);
    }
  };

  const handleBackToHome = () => {
    setView('home');
    setSelectedCategory(null);
    setSelectedArticle(null);
    setSearchQuery('');
  };

  const handleBackToCategory = () => {
    setView('category');
    setSelectedArticle(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Article View
  if (view === 'article' && selectedArticle) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={selectedCategory ? handleBackToCategory : handleBackToHome}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex-1">
              {selectedArticle.categoryName && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                  {selectedArticle.categoryName}
                </p>
              )}
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedArticle.title}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {formatDate(selectedArticle.publishedAt || selectedArticle.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye size={14} />
                  {selectedArticle.viewCount} Aufrufe
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <MarkdownRenderer content={selectedArticle.content} />
        </div>

        {/* Feedback */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm text-center">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            War dieser Artikel hilfreich?
          </p>
          {feedbackGiven ? (
            <p className="text-green-600 dark:text-green-400">
              Vielen Dank für Ihr Feedback!
            </p>
          ) : (
            <div className="flex justify-center gap-4">
              <button
                onClick={() => handleFeedback(true)}
                className="flex items-center gap-2 px-6 py-3 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded-xl font-medium transition-colors"
              >
                <ThumbsUp size={20} />
                Ja
              </button>
              <button
                onClick={() => handleFeedback(false)}
                className="flex items-center gap-2 px-6 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
              >
                <ThumbsDown size={20} />
                Nein
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Category or Search Results View
  if (view === 'category' || view === 'search') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToHome}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {view === 'search' ? `Suchergebnisse: "${searchQuery}"` : selectedCategory?.name}
              </h1>
              {selectedCategory?.description && (
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  {selectedCategory.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Articles */}
        {articles.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {view === 'search' ? 'Keine Artikel gefunden' : 'Noch keine Artikel in dieser Kategorie'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => handleArticleSelect(article)}
                className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                        {article.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{article.viewCount} Aufrufe</span>
                      {article.helpfulYes > 0 && (
                        <span className="flex items-center gap-1">
                          <ThumbsUp size={12} />
                          {article.helpfulYes}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Home View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-white/20 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Wissensdatenbank</h1>
            <p className="text-blue-100">
              Finden Sie Antworten auf häufige Fragen
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Artikel durchsuchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur text-white placeholder-blue-200 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
        </div>
      </div>

      {/* Featured Articles */}
      {featuredArticles.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Star size={20} className="text-yellow-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Beliebte Artikel
            </h2>
          </div>
          <div className="grid gap-3">
            {featuredArticles.map((article) => (
              <button
                key={article.id}
                onClick={() => handleArticleSelect(article)}
                className="w-full text-left p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {article.title}
                    </p>
                    {article.categoryName && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {article.categoryName}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Book size={20} className="text-indigo-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Kategorien
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategorySelect(category)}
                className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <FolderOpen size={24} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {category.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {category.articleCount} Artikel
                  </p>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Articles */}
      {recentArticles.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={20} className="text-green-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Neue Artikel
            </h2>
          </div>
          <div className="grid gap-3">
            {recentArticles.map((article) => (
              <button
                key={article.id}
                onClick={() => handleArticleSelect(article)}
                className="w-full text-left p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {article.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(article.publishedAt || article.createdAt)}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {categories.length === 0 && featuredArticles.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Book size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            Die Wissensdatenbank ist noch leer.
          </p>
        </div>
      )}
    </div>
  );
};
