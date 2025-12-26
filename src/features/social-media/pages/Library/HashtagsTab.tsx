import { useState } from 'react';
import {
  Plus,
  Hash,
  Copy,
  Edit,
  Trash2,
  MoreVertical,
  X,
  Check,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { socialMediaApi } from '../../../../services/api';
import type { SocialMediaHashtagGroup } from '../../types';

export default function HashtagsTab() {
  const { hashtagGroups, addHashtagGroup, removeHashtagGroup } = useSocialMedia();

  const [showEditor, setShowEditor] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SocialMediaHashtagGroup | null>(null);
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Editor state
  const [name, setName] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const resetEditor = () => {
    setShowEditor(false);
    setEditingGroup(null);
    setName('');
    setHashtags([]);
    setHashtagInput('');
  };

  const openEditor = (group?: SocialMediaHashtagGroup) => {
    if (group) {
      setEditingGroup(group);
      setName(group.name);
      setHashtags(group.hashtags);
    }
    setShowEditor(true);
  };

  const addHashtag = () => {
    if (!hashtagInput.trim()) return;
    const tag = hashtagInput.trim().replace(/^#/, '');
    if (!hashtags.includes(tag)) {
      setHashtags([...hashtags, tag]);
    }
    setHashtagInput('');
  };

  const removeHashtag = (tag: string) => {
    setHashtags(hashtags.filter((h) => h !== tag));
  };

  const handleHashtagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addHashtag();
    }
  };

  const handleSave = async () => {
    if (!name.trim() || hashtags.length === 0) return;
    setSaving(true);
    try {
      if (editingGroup) {
        // Update existing
        await socialMediaApi.updateHashtagGroup(editingGroup.id, {
          name,
          hashtags,
        });
        // Refresh would be needed here
      } else {
        // Create new
        const created = await socialMediaApi.createHashtagGroup({
          name,
          hashtags,
        });
        addHashtagGroup(created);
      }
      resetEditor();
    } catch (error) {
      console.error('Failed to save hashtag group:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm('Möchtest du diese Hashtag-Gruppe wirklich löschen?')) return;
    setDeleting(groupId);
    try {
      await socialMediaApi.deleteHashtagGroup(groupId);
      removeHashtagGroup(groupId);
    } catch (error) {
      console.error('Failed to delete hashtag group:', error);
    } finally {
      setDeleting(null);
      setShowMenu(null);
    }
  };

  const handleCopy = async (group: SocialMediaHashtagGroup) => {
    const text = group.hashtags.map((h) => `#${h}`).join(' ');
    await navigator.clipboard.writeText(text);
    setCopiedId(group.id);
    setTimeout(() => setCopiedId(null), 2000);
    setShowMenu(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600 dark:text-gray-400">
          Organisiere deine Hashtags in Gruppen für schnellen Zugriff.
        </p>
        <button
          onClick={() => openEditor()}
          className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
        >
          <Plus size={18} />
          Neue Gruppe
        </button>
      </div>

      {/* Hashtag Groups */}
      {hashtagGroups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <Hash size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Noch keine Hashtag-Gruppen erstellt.
          </p>
          <button
            onClick={() => openEditor()}
            className="text-pink-600 hover:text-pink-700 font-medium"
          >
            Erste Gruppe erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hashtagGroups.map((group) => (
            <div
              key={group.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-800 dark:text-white flex items-center gap-2">
                    <Hash size={16} className="text-pink-600" />
                    {group.name}
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {group.hashtags.length} Hashtags
                  </span>
                </div>
                <div className="relative flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(group)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Alle kopieren"
                  >
                    {copiedId === group.id ? (
                      <Check size={16} className="text-green-600" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                  <button
                    onClick={() => setShowMenu(showMenu === group.id ? null : group.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <MoreVertical size={18} />
                  </button>

                  {showMenu === group.id && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                      <button
                        onClick={() => {
                          openEditor(group);
                          setShowMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Edit size={14} />
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(group.id)}
                        disabled={deleting === group.id}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 size={14} />
                        {deleting === group.id ? 'Lösche...' : 'Löschen'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {group.hashtags.slice(0, 8).map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded text-sm"
                  >
                    #{tag}
                  </span>
                ))}
                {group.hashtags.length > 8 && (
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-sm">
                    +{group.hashtags.length - 8} mehr
                  </span>
                )}
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
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                {editingGroup ? 'Gruppe bearbeiten' : 'Neue Hashtag-Gruppe'}
              </h2>
              <button
                onClick={resetEditor}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Gruppenname
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Tech & Startup"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hashtags ({hashtags.length})
                </label>
                <div className="flex flex-wrap gap-1 mb-2 min-h-[40px] p-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  {hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded text-sm"
                    >
                      #{tag}
                      <button
                        onClick={() => removeHashtag(tag)}
                        className="hover:text-pink-900 dark:hover:text-pink-200"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {hashtags.length === 0 && (
                    <span className="text-gray-400 text-sm">
                      Noch keine Hashtags...
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={handleHashtagKeyDown}
                    placeholder="Hashtag eingeben..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                  <button
                    onClick={addHashtag}
                    disabled={!hashtagInput.trim()}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enter oder Komma zum Hinzufügen
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={resetEditor}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || hashtags.length === 0}
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
