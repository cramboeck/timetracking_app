import { useState, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, Book, FileText, FolderOpen, Eye, EyeOff,
  Star, Save, Palette, Globe, Image, ChevronDown, ChevronUp, Search, X
} from 'lucide-react';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { knowledgeBaseApi, portalSettingsApi, KbCategory, KbArticle, PortalSettings } from '../services/api';

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

  useEffect(() => {
    loadData();
  }, []);

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
    }
    setArticleModalOpen(true);
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
              : 'text-gray-600 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50'
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
              : 'text-gray-600 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50'
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
              : 'text-gray-600 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50'
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
            <button
              onClick={() => handleOpenCategoryModal()}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              <Plus size={18} />
              Neue Kategorie
            </button>
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
                    <button
                      onClick={() => handleOpenCategoryModal(category)}
                      className="p-2 text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-dark-100 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'category', id: category.id, name: category.name })}
                      className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
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
            <button
              onClick={() => handleOpenArticleModal()}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              <Plus size={18} />
              Neuer Artikel
            </button>
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
                    <button
                      onClick={() => handleToggleArticleFeatured(article)}
                      className={`p-2 rounded-lg transition-colors ${
                        article.isFeatured
                          ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                          : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-dark-100'
                      }`}
                      title={article.isFeatured ? 'Nicht mehr hervorheben' : 'Hervorheben'}
                    >
                      <Star size={16} className={article.isFeatured ? 'fill-current' : ''} />
                    </button>
                    <button
                      onClick={() => handleToggleArticlePublished(article)}
                      className={`p-2 rounded-lg transition-colors ${
                        article.isPublished
                          ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                          : 'text-gray-400 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-dark-100'
                      }`}
                      title={article.isPublished ? 'Veröffentlichung aufheben' : 'Veröffentlichen'}
                    >
                      {article.isPublished ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      onClick={() => handleOpenArticleModal(article)}
                      className="p-2 text-gray-500 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-dark-100 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'article', id: article.id, name: article.title })}
                      className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-2">
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
              <button
                onClick={handleSavePortalSettings}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? 'Speichere...' : 'Einstellungen speichern'}
              </button>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
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
            <span className="text-gray-700 dark:text-dark-300">Öffentlich sichtbar</span>
          </label>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setCategoryModalOpen(false)}
              className="px-4 py-2 text-gray-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveCategory}
              disabled={saving || !categoryForm.name.trim()}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
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
                <span className="text-gray-700 dark:text-dark-300">Veröffentlicht</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={articleForm.isFeatured}
                  onChange={(e) => setArticleForm({ ...articleForm, isFeatured: e.target.checked })}
                  className="w-5 h-5 text-accent-primary rounded focus:ring-accent-primary"
                />
                <span className="text-gray-700 dark:text-dark-300">Hervorgehoben</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
              Inhalt *
            </label>
            <textarea
              value={articleForm.content}
              onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
              placeholder="Artikel-Inhalt (HTML oder Markdown wird unterstützt)"
              rows={12}
              className="w-full px-4 py-2 border border-gray-200 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary/20 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
              Tipp: Du kannst einfachen Text oder HTML verwenden. Zeilenumbrüche werden automatisch formatiert.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => setArticleModalOpen(false)}
              className="px-4 py-2 text-gray-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-50 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveArticle}
              disabled={saving || !articleForm.title.trim() || !articleForm.content.trim()}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Speichere...' : 'Speichern'}
            </button>
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
          type="danger"
        />
      )}
    </div>
  );
};
