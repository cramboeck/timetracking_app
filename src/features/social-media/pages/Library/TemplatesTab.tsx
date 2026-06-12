import { useState } from 'react';
import {
  Plus,
  BookMarked,
  Copy,
  Edit,
  Trash2,
  MoreVertical,
  X,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { Platform, SocialMediaTemplate } from '../../types';
import { useConfirm } from '../../../../contexts/UIContext';

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

export default function TemplatesTab() {
  const { templates, addTemplate, removeTemplate } = useSocialMedia();
  const confirm = useConfirm();

  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SocialMediaTemplate | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  // Editor state
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['linkedin']);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const resetEditor = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    setName('');
    setContent('');
    setCategory('');
    setPlatforms(['linkedin']);
  };

  const openEditor = (template?: SocialMediaTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setName(template.name);
      setContent(template.content);
      setCategory(template.category || '');
      setPlatforms(template.platforms as Platform[]);
    }
    setShowEditor(true);
  };

  const togglePlatform = (platform: Platform) => {
    if (platforms.includes(platform)) {
      if (platforms.length > 1) {
        setPlatforms(platforms.filter((p) => p !== platform));
      }
    } else {
      setPlatforms([...platforms, platform]);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      if (editingTemplate) {
        // Update existing
        const updated = await socialMediaApi.updateTemplate(editingTemplate.id, {
          name,
          content,
          category: category || undefined,
          platforms,
        });
        // Refresh templates in context would be needed here
      } else {
        // Create new
        const created = await socialMediaApi.createTemplate({
          name,
          content,
          category: category || undefined,
          platforms,
        });
        addTemplate(created);
      }
      resetEditor();
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    const ok = await confirm({
      title: 'Vorlage löschen?',
      message: 'Möchtest du diese Vorlage wirklich löschen?',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleting(templateId);
    try {
      await socialMediaApi.deleteTemplate(templateId);
      removeTemplate(templateId);
    } catch (error) {
      console.error('Failed to delete template:', error);
    } finally {
      setDeleting(null);
      setShowMenu(null);
    }
  };

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setShowMenu(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600 dark:text-dark-400">
          Speichere wiederverwendbare Content-Vorlagen.
        </p>
        <button
          onClick={() => openEditor()}
          className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
        >
          <Plus size={18} />
          Neue Vorlage
        </button>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-dark-border text-center">
          <BookMarked size={48} className="mx-auto mb-4 text-gray-300 dark:text-dark-400" />
          <p className="text-gray-500 dark:text-dark-400 mb-4">
            Noch keine Vorlagen erstellt.
          </p>
          <button
            onClick={() => openEditor()}
            className="text-pink-600 hover:text-pink-700 font-medium"
          >
            Erste Vorlage erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-800 dark:text-white">
                    {template.name}
                  </h3>
                  {template.category && (
                    <span className="text-xs text-gray-500 dark:text-dark-400">
                      {template.category}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(showMenu === template.id ? null : template.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-dark-500"
                  >
                    <MoreVertical size={18} />
                  </button>

                  {showMenu === template.id && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-dark-100 rounded-lg shadow-lg border border-gray-200 dark:border-dark-border py-1 z-10">
                      <button
                        onClick={() => handleCopy(template.content)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200"
                      >
                        <Copy size={14} />
                        Kopieren
                      </button>
                      <button
                        onClick={() => {
                          openEditor(template);
                          setShowMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200"
                      >
                        <Edit size={14} />
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        disabled={deleting === template.id}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 size={14} />
                        {deleting === template.id ? 'Lösche...' : 'Löschen'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-dark-400 line-clamp-3 mb-3">
                {template.content}
              </p>

              <div className="flex gap-1">
                {(template.platforms || []).map((platform) => (
                  <span
                    key={platform}
                    className={`p-1 rounded ${PLATFORM_COLORS[platform]} text-white`}
                  >
                    {PLATFORM_ICONS[platform]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={resetEditor}
        >
          <div
            className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                {editingTemplate ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
              </h2>
              <button
                onClick={resetEditor}
                className="text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Produkt-Launch"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Kategorie (optional)
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="z.B. Marketing, Sales, Support..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Vorlage mit {{variable}} Platzhaltern..."
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Plattformen
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => togglePlatform(platform)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        platforms.includes(platform)
                          ? `${PLATFORM_COLORS[platform]} text-white`
                          : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                      }`}
                    >
                      {PLATFORM_ICONS[platform]}
                      <span className="capitalize">{platform}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={resetEditor}
                className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !content.trim()}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Speichere...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
