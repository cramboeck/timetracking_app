import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, Book, FileText, FolderOpen, Eye, EyeOff,
  Star, Save, Palette, Globe, Image, ChevronDown, ChevronUp, Search, X,
  Sparkles, Ticket, Loader2
} from 'lucide-react';
import { Button, IconButton } from './ui';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { knowledgeBaseApi, portalSettingsApi, aiApi, ticketsApi, KbCategory, KbArticle, PortalSettings } from '../services/api';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Ticket as TicketType } from '../types';

type KbTab = 'categories' | 'articles' | 'branding';

export const KnowledgeBaseSettings = () => {
  const [activeKbTab, setActiveKbTab] = useState<KbTab>('categories');
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [portalSettings, setPortalSettings] = useState<PortalSettings>({
    companyName: null,
    welcomeMessage: null,
    logoUrl: null,
    primaryColor: '#3b82f6',
    showKnowledgeBase: true,
    requireLoginForKb: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<KbCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: 'folder',
    sortOrder: 0,
    isPublic: true,
  });

  // Article modal state
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KbArticle | null>(null);
  const [articleForm, setArticleForm] = useState({
    categoryId: '',
    title: '',
    content: '',
    excerpt: '',
    isPublished: false,
    isFeatured: false,
  });

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'category' | 'article'; id: string; name: string } | null>(null);

  // Article filter state
  const [articleFilter, setArticleFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [articleSearch, setArticleSearch] = useState('');

  // Article editor preview mode
  const [articleEditorMode, setArticleEditorMode] = useState<'edit' | 'preview'>('edit');

  // AI state for KB article generation
  const [aiConfigured, setAiConfigured] = useState(false);
  const [generatingFromTicket, setGeneratingFromTicket] = useState(false);
  const [resolvedTickets, setResolvedTickets] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [showTicketSelector, setShowTicketSelector] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');

  useEffect(() => {
    loadData();
    checkAiConfig();
  }, []);

  const checkAiConfig = async () => {
    try {
      const response = await aiApi.getConfig();
      setAiConfigured(response.data?.enabled && response.data?.hasApiKey);
    } catch (err) {
      console.error('Failed to check AI config:', err);
    }
  };

  const loadResolvedTickets = async () => {
    try {
      // Load resolved/closed tickets that could be converted to KB articles
      const response = await ticketsApi.getAll();
      const resolved = response.data.filter(
        (t: TicketType) => t.status === 'resolved' || t.status === 'closed'
      );
      setResolvedTickets(resolved);
    } catch (err) {
      console.error('Failed to load resolved tickets:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesRes, articlesRes, settingsRes] = await Promise.all([
        knowledgeBaseApi.getCategories(),
        knowledgeBaseApi.getArticles(),
        portalSettingsApi.getSettings(),
      ]);
      setCategories(categoriesRes.data);
      setArticles(articlesRes.data);
      setPortalSettings(settingsRes.data);
    } catch (err) {
      console.error('Failed to load KB data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Category handlers
  const handleOpenCategoryModal = (category?: KbCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description || '',
        icon: category.icon || 'folder',
        sortOrder: category.sortOrder || 0,
        isPublic: category.isPublic !== false,
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        name: '',
        description: '',
        icon: 'folder',
        sortOrder: categories.length,
        isPublic: true,
      });
    }
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) return;

    try {
      setSaving(true);
      if (editingCategory) {
        await knowledgeBaseApi.updateCategory(editingCategory.id, categoryForm);
      } else {
        await knowledgeBaseApi.createCategory(categoryForm);
      }
      await loadData();
      setCategoryModalOpen(false);
      showSaveMessage('success', editingCategory ? 'Kategorie aktualisiert' : 'Kategorie erstellt');
    } catch (err) {
      console.error('Failed to save category:', err);
      showSaveMessage('error', 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await knowledgeBaseApi.deleteCategory(id);
      await loadData();
      setDeleteConfirm(null);
      showSaveMessage('success', 'Kategorie gelöscht');
    } catch (err) {
      console.error('Failed to delete category:', err);
      showSaveMessage('error', 'Fehler beim Löschen');
    }
  };

  // Article handlers
  const handleOpenArticleModal = (article?: KbArticle) => {
    if (article) {
      setEditingArticle(article);
      setArticleForm({
        categoryId: article.categoryId || '',
        title: article.title,
        content: article.content,
        excerpt: article.excerpt || '',
        isPublished: article.isPublished,
        isFeatured: article.isFeatured,
      });
    } else {
      setEditingArticle(null);
      setArticleForm({
        categoryId: categories.length > 0 ? categories[0].id : '',
        title: '',
        content: '',
        excerpt: '',
        isPublished: false,
        isFeatured: false,
      });
      // Load resolved tickets for AI generation when creating new article
      if (aiConfigured) {
        loadResolvedTickets();
      }
    }
    setArticleEditorMode('edit');
    setShowTicketSelector(false);
    setSelectedTicketId('');
    setTicketSearch('');
    setArticleModalOpen(true);
  };

  const handleGenerateFromTicket = async () => {
    if (!selectedTicketId) return;

    try {
      setGeneratingFromTicket(true);
      const response = await aiApi.generateKBArticleFromTicket(selectedTicketId);

      if (response.success && response.data) {
        // Update form with generated content
        setArticleForm({
          ...articleForm,
          title: response.data.title,
          content: response.data.content,
          excerpt: response.data.excerpt,
          // Try to match suggested category to existing categories
          categoryId: response.data.suggestedCategory
            ? categories.find(c => c.name.toLowerCase() === response.data.suggestedCategory?.toLowerCase())?.id || articleForm.categoryId
            : articleForm.categoryId,
        });
        setShowTicketSelector(false);
        showSaveMessage('success', 'Artikel aus Ticket generiert');
      }
    } catch (err: any) {
      console.error('Failed to generate article from ticket:', err);
      showSaveMessage('error', err.message || 'Fehler bei der Generierung');
    } finally {
      setGeneratingFromTicket(false);
    }
  };

  const handleSaveArticle = async () => {
    if (!articleForm.title.trim() || !articleForm.content.trim()) return;

    try {
      setSaving(true);
      const data = {
        ...articleForm,
        categoryId: articleForm.categoryId || undefined,
      };
      if (editingArticle) {
        await knowledgeBaseApi.updateArticle(editingArticle.id, data);
      } else {
        await knowledgeBaseApi.createArticle(data);
      }
      await loadData();
      setArticleModalOpen(false);
      showSaveMessage('success', editingArticle ? 'Artikel aktualisiert' : 'Artikel erstellt');
    } catch (err) {
      console.error('Failed to save article:', err);
      showSaveMessage('error', 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    try {
      await knowledgeBaseApi.deleteArticle(id);
      await loadData();
      setDeleteConfirm(null);
      showSaveMessage('success', 'Artikel gelöscht');
    } catch (err) {
      console.error('Failed to delete article:', err);
      showSaveMessage('error', 'Fehler beim Löschen');
    }
  };

  const handleToggleArticlePublished = async (article: KbArticle) => {
    try {
      await knowledgeBaseApi.updateArticle(article.id, { isPublished: !article.isPublished });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle published:', err);
    }
  };

  const handleToggleArticleFeatured = async (article: KbArticle) => {
    try {
      await knowledgeBaseApi.updateArticle(article.id, { isFeatured: !article.isFeatured });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle featured:', err);
    }
  };

  // Portal settings handlers
  const handleSavePortalSettings = async () => {
    try {
      setSaving(true);
      await portalSettingsApi.updateSettings(portalSettings);
      showSaveMessage('success', 'Portal-Einstellungen gespeichert');
    } catch (err) {
      console.error('Failed to save portal settings:', err);
      showSaveMessage('error', 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const showSaveMessage = (type: 'success' | 'error', text: string) => {
    setSaveMessage({ type, text });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // Filter articles
  const filteredArticles = articles.filter(article => {
    if (articleFilter === 'published' && !article.isPublished) return false;
    if (articleFilter === 'draft' && article.isPublished) return false;
    if (articleSearch && !article.title.toLowerCase().includes(articleSearch.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save message */}
      {saveMessage && (
        <div className={`p-4 rounded-lg ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
          {saveMessage.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-dark-200 pb-4">
        <button
          onClick={() => setActiveKbTab('categories')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeKbTab === 'categories'
              ? 'bg-accent-light dark:bg-accent-lighter/10 text-accent-primary'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-50'
          }`}
        >
          <FolderOpen size={18} />
          Kategorien
        </button>
        <button
          onClick={() => setActiveKbTab('articles')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeKbTab === 'articles'
              ? 'bg-accent-light dark:bg-accent-lighter/10 text-accent-primary'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-50'
          }`}
        >
          <FileText size={18} />
          Artikel
          <span className="text-xs bg-gray-200 dark:bg-dark-200 px-2 py-0.5 rounded-full">
            {articles.length}
          </span>
        </button>
        <button
          onClick={() => setActiveKbTab('branding')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            activeKbTab === 'branding'
              ? 'bg-accent-light dark:bg-accent-lighter/10 text-accent-primary'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-50'
          }`}
        >
          <Palette size={18} />
          Portal-Branding
        </button>
      </div>

      {/* Categories Tab */}
      {activeKbTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-dark-400">
              Kategorien organisieren deine Wissensdatenbank-Artikel
            </p>
            <Button
              onClick={() => handleOpenCategoryModal()}
              variant="primary"
              icon={<Plus size={18} />}
            >
              Neue Kategorie
            </Button>
          </div>

          {categories.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <FolderOpen size={48} className="mx-auto mb-4 opacity-50" />
              <p>Noch keine Kategorien erstellt</p>
              <p className="text-sm mt-1">Erstelle eine Kategorie, um Artikel zu organisieren</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                      <FolderOpen size={20} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                        {!category.isPublic && (
                          <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded">
                            Versteckt
                          </span>
                        )}
                      </div>
                      {category.description && (
                        <p className="text-sm text-gray-500 dark:text-dark-400">{category.description}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-dark-500">
                        {category.articleCount} Artikel
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconButton
                      onClick={() => handleOpenCategoryModal(category)}
                      icon={<Edit2 size={16} />}
                      tooltip="Bearbeiten"
                    />
                    <IconButton
                      onClick={() => setDeleteConfirm({ type: 'category', id: category.id, name: category.name })}
                      icon={<Trash2 size={16} />}
                      variant="danger"
                      tooltip="Löschen"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Articles Tab */}
      {activeKbTab === 'articles' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Artikel suchen..."
                  value={articleSearch}
                  onChange={(e) => setArticleSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                />
              </div>
              <select
                value={articleFilter}
                onChange={(e) => setArticleFilter(e.target.value as any)}
                className="px-3 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              >
                <option value="all">Alle ({articles.length})</option>
                <option value="published">Veröffentlicht ({articles.filter(a => a.isPublished).length})</option>
                <option value="draft">Entwurf ({articles.filter(a => !a.isPublished).length})</option>
              </select>
            </div>
            <Button
              onClick={() => handleOpenArticleModal()}
              variant="primary"
              icon={<Plus size={18} />}
            >
              Neuer Artikel
            </Button>
          </div>

          {filteredArticles.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-400">
              <FileText size={48} className="mx-auto mb-4 opacity-50" />
              <p>{articles.length === 0 ? 'Noch keine Artikel erstellt' : 'Keine Artikel gefunden'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredArticles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {article.title}
                      </span>
                      {article.isFeatured && (
                        <Star size={14} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        article.isPublished
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                      }`}>
                        {article.isPublished ? 'Veröffentlicht' : 'Entwurf'}
                      </span>
                    </div>
                    {article.categoryName && (
                      <p className="text-sm text-gray-500 dark:text-dark-400 flex items-center gap-1 mt-1">
                        <FolderOpen size={12} />
                        {article.categoryName}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-dark-500">
                      <span>{article.viewCount} Aufrufe</span>
                      {(article.helpfulYes > 0 || article.helpfulNo > 0) && (
                        <span>👍 {article.helpfulYes} / 👎 {article.helpfulNo}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <IconButton
                      onClick={() => handleToggleArticleFeatured(article)}
                      icon={<Star size={16} className={article.isFeatured ? 'fill-current' : ''} />}
                      variant={article.isFeatured ? 'warning' : 'default'}
                      tooltip={article.isFeatured ? 'Nicht mehr hervorheben' : 'Hervorheben'}
                    />
                    <IconButton
                      onClick={() => handleToggleArticlePublished(article)}
                      icon={article.isPublished ? <Eye size={16} /> : <EyeOff size={16} />}
                      variant={article.isPublished ? 'success' : 'default'}
                      tooltip={article.isPublished ? 'Veröffentlichung aufheben' : 'Veröffentlichen'}
                    />
                    <IconButton
                      onClick={() => handleOpenArticleModal(article)}
                      icon={<Edit2 size={16} />}
                      tooltip="Bearbeiten"
                    />
                    <IconButton
                      onClick={() => setDeleteConfirm({ type: 'article', id: article.id, name: article.title })}
                      icon={<Trash2 size={16} />}
                      variant="danger"
                      tooltip="Löschen"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Branding Tab */}
      {activeKbTab === 'branding' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Passe das Erscheinungsbild deines Kundenportals an
          </p>

          <div className="grid gap-6">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Firmenname im Portal
              </label>
              <input
                type="text"
                value={portalSettings.companyName || ''}
                onChange={(e) => setPortalSettings({ ...portalSettings, companyName: e.target.value || null })}
                placeholder="Dein Firmenname"
                className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              />
            </div>

            {/* Welcome Message */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Begrüßungstext
              </label>
              <textarea
                value={portalSettings.welcomeMessage || ''}
                onChange={(e) => setPortalSettings({ ...portalSettings, welcomeMessage: e.target.value || null })}
                placeholder="Willkommen in unserem Support-Portal..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              />
            </div>

            {/* Logo URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Logo URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={portalSettings.logoUrl || ''}
                  onChange={(e) => setPortalSettings({ ...portalSettings, logoUrl: e.target.value || null })}
                  placeholder="https://beispiel.de/logo.png"
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                />
                {portalSettings.logoUrl && (
                  <div className="w-12 h-12 border border-gray-200 dark:border-dark-200 rounded-lg overflow-hidden bg-white">
                    <img
                      src={portalSettings.logoUrl}
                      alt="Logo Preview"
                      className="w-full h-full object-contain"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Primary Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Primärfarbe
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={portalSettings.primaryColor}
                  onChange={(e) => setPortalSettings({ ...portalSettings, primaryColor: e.target.value })}
                  className="w-12 h-12 rounded-lg border border-gray-200 dark:border-dark-200 cursor-pointer"
                />
                <input
                  type="text"
                  value={portalSettings.primaryColor}
                  onChange={(e) => setPortalSettings({ ...portalSettings, primaryColor: e.target.value })}
                  className="w-32 px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20 font-mono"
                />
                <div className="flex gap-2">
                  {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setPortalSettings({ ...portalSettings, primaryColor: color })}
                      className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${
                        portalSettings.primaryColor === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900 dark:text-white">Funktionen</h3>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portalSettings.showKnowledgeBase}
                  onChange={(e) => setPortalSettings({ ...portalSettings, showKnowledgeBase: e.target.checked })}
                  className="w-5 h-5 text-accent-primary rounded focus:ring-accent-primary"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Wissensdatenbank anzeigen</span>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Kunden können auf die Wissensdatenbank im Portal zugreifen
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portalSettings.requireLoginForKb || false}
                  onChange={(e) => setPortalSettings({ ...portalSettings, requireLoginForKb: e.target.checked })}
                  className="w-5 h-5 text-accent-primary rounded focus:ring-accent-primary"
                />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">Login für KB erforderlich</span>
                  <p className="text-sm text-gray-500 dark:text-dark-400">
                    Kunden müssen angemeldet sein, um die Wissensdatenbank zu sehen
                  </p>
                </div>
              </label>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-dark-200">
              <Button
                onClick={handleSavePortalSettings}
                loading={saving}
                variant="primary"
                icon={<Save size={18} />}
              >
                {saving ? 'Speichere...' : 'Einstellungen speichern'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={editingCategory ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="z.B. Erste Schritte"
              className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Beschreibung
            </label>
            <textarea
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              placeholder="Kurze Beschreibung der Kategorie"
              rows={2}
              className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sortierung
            </label>
            <input
              type="number"
              value={categoryForm.sortOrder}
              onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: parseInt(e.target.value) || 0 })}
              className="w-24 px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={categoryForm.isPublic}
              onChange={(e) => setCategoryForm({ ...categoryForm, isPublic: e.target.checked })}
              className="w-5 h-5 text-accent-primary rounded focus:ring-accent-primary"
            />
            <span className="text-gray-700 dark:text-gray-300">Öffentlich sichtbar</span>
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={() => setCategoryModalOpen(false)}
              variant="secondary"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveCategory}
              disabled={!categoryForm.name.trim()}
              loading={saving}
              variant="primary"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Article Modal */}
      <Modal
        isOpen={articleModalOpen}
        onClose={() => setArticleModalOpen(false)}
        title={editingArticle ? 'Artikel bearbeiten' : 'Neuer Artikel'}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {/* AI Generation from Ticket - only for new articles */}
          {!editingArticle && aiConfigured && (
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              {!showTicketSelector ? (
                <Button
                  onClick={() => setShowTicketSelector(true)}
                  variant="ghost"
                  icon={<Sparkles size={18} />}
                  className="text-purple-700 dark:text-purple-300 hover:text-purple-800 dark:hover:text-purple-200"
                >
                  <span className="font-medium">Aus Ticket generieren</span>
                  <span className="text-sm text-purple-600 dark:text-purple-400">(KI)</span>
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                      <Ticket size={18} />
                      <span className="font-medium">Ticket auswählen</span>
                    </div>
                    <IconButton
                      onClick={() => setShowTicketSelector(false)}
                      icon={<X size={18} />}
                      tooltip="Schließen"
                    />
                  </div>

                  {/* Ticket search */}
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Tickets durchsuchen..."
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-purple-200 dark:border-purple-700 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    />
                  </div>

                  {/* Ticket list */}
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {resolvedTickets
                      .filter(t =>
                        !ticketSearch ||
                        t.title.toLowerCase().includes(ticketSearch.toLowerCase()) ||
                        t.ticketNumber?.toLowerCase().includes(ticketSearch.toLowerCase())
                      )
                      .slice(0, 10)
                      .map((ticket) => (
                        <button
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                            selectedTicketId === ticket.id
                              ? 'bg-purple-100 dark:bg-purple-900/40 border border-purple-300 dark:border-purple-700'
                              : 'hover:bg-gray-100 dark:hover:bg-dark-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-500">#{ticket.ticketNumber}</span>
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              ticket.status === 'resolved'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary'
                            }`}>
                              {ticket.status === 'resolved' ? 'Gelöst' : 'Geschlossen'}
                            </span>
                          </div>
                          <div className="font-medium text-gray-900 dark:text-white truncate">
                            {ticket.title}
                          </div>
                          {ticket.customerName && (
                            <div className="text-xs text-gray-500 dark:text-dark-400">
                              {ticket.customerName}
                            </div>
                          )}
                        </button>
                      ))}
                    {resolvedTickets.filter(t =>
                      !ticketSearch ||
                      t.title.toLowerCase().includes(ticketSearch.toLowerCase()) ||
                      t.ticketNumber?.toLowerCase().includes(ticketSearch.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-4 text-gray-500 dark:text-dark-400 text-sm">
                        Keine gelösten Tickets gefunden
                      </div>
                    )}
                  </div>

                  {/* Generate button */}
                  <Button
                    onClick={handleGenerateFromTicket}
                    disabled={!selectedTicketId}
                    loading={generatingFromTicket}
                    variant="primary"
                    fullWidth
                    icon={generatingFromTicket ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  >
                    {generatingFromTicket ? 'Generiere...' : 'Artikel generieren'}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Titel *
              </label>
              <input
                type="text"
                value={articleForm.title}
                onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                placeholder="Artikel-Titel"
                className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Kategorie
              </label>
              <select
                value={articleForm.categoryId}
                onChange={(e) => setArticleForm({ ...articleForm, categoryId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
              >
                <option value="">Keine Kategorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={articleForm.isPublished}
                  onChange={(e) => setArticleForm({ ...articleForm, isPublished: e.target.checked })}
                  className="w-5 h-5 text-accent-primary rounded focus:ring-accent-primary"
                />
                <span className="text-gray-700 dark:text-gray-300">Veröffentlicht</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={articleForm.isFeatured}
                  onChange={(e) => setArticleForm({ ...articleForm, isFeatured: e.target.checked })}
                  className="w-5 h-5 text-accent-primary rounded focus:ring-accent-primary"
                />
                <span className="text-gray-700 dark:text-gray-300">Hervorgehoben</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Kurzfassung
            </label>
            <textarea
              value={articleForm.excerpt}
              onChange={(e) => setArticleForm({ ...articleForm, excerpt: e.target.value })}
              placeholder="Kurze Zusammenfassung des Artikels (optional)"
              rows={2}
              className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Inhalt *
              </label>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-dark-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setArticleEditorMode('edit')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    articleEditorMode === 'edit'
                      ? 'bg-white dark:bg-dark-50 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => setArticleEditorMode('preview')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    articleEditorMode === 'preview'
                      ? 'bg-white dark:bg-dark-50 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Vorschau
                </button>
              </div>
            </div>
            {articleEditorMode === 'edit' ? (
              <>
                <MarkdownEditor
                  value={articleForm.content}
                  onChange={(value) => setArticleForm({ ...articleForm, content: value })}
                  placeholder="Artikel-Inhalt mit Markdown formatieren..."
                  rows={12}
                />
                <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                  Tipp: Verwende Markdown für Formatierung: # Überschrift, **fett**, *kursiv*, - Liste, `code`
                </p>
              </>
            ) : (
              <div className="border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 p-4 min-h-[300px] max-h-[400px] overflow-y-auto">
                {articleForm.content ? (
                  <MarkdownRenderer content={articleForm.content} />
                ) : (
                  <p className="text-gray-400 dark:text-dark-500 italic">
                    Kein Inhalt zum Anzeigen
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              onClick={() => setArticleModalOpen(false)}
              variant="secondary"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveArticle}
              disabled={!articleForm.title.trim() || !articleForm.content.trim()}
              loading={saving}
              variant="primary"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => {
            if (deleteConfirm.type === 'category') {
              handleDeleteCategory(deleteConfirm.id);
            } else {
              handleDeleteArticle(deleteConfirm.id);
            }
          }}
          title={deleteConfirm.type === 'category' ? 'Kategorie löschen' : 'Artikel löschen'}
          message={`Möchtest du "${deleteConfirm.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
          confirmText="Löschen"
          variant="danger"
        />
      )}
    </div>
  );
};
