import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Clock,
  CheckCircle,
  Edit,
  Trash2,
  Copy,
  MoreVertical,
  Calendar,
  X,
  Hash,
  Save,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { Platform, SocialMediaPost } from '../../types';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'published';
type PlatformFilter = 'all' | Platform;

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

export default function PostsTab() {
  const { posts, removePost, updatePost, refreshPosts, setViewMode, setContentStudioTab } = useSocialMedia();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Edit modal state
  const [editingPost, setEditingPost] = useState<SocialMediaPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [editPlatforms, setEditPlatforms] = useState<Platform[]>([]);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!post.content.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all' && post.status !== statusFilter) {
        return false;
      }

      // Platform filter
      if (platformFilter !== 'all' && !post.platforms.includes(platformFilter)) {
        return false;
      }

      return true;
    });
  }, [posts, searchQuery, statusFilter, platformFilter]);

  // Delete post
  const handleDelete = async (postId: string) => {
    if (!confirm('Möchtest du diesen Post wirklich löschen?')) return;
    setDeleting(postId);
    try {
      await socialMediaApi.deletePost(postId);
      removePost(postId);
    } catch (error) {
      console.error('Failed to delete post:', error);
    } finally {
      setDeleting(null);
      setShowMenu(null);
    }
  };

  // Copy content
  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setShowMenu(null);
  };

  // Open edit modal
  const openEditModal = (post: SocialMediaPost) => {
    setEditingPost(post);
    setEditContent(post.content);
    setEditHashtags(post.hashtags || []);
    setEditPlatforms((post.platforms || []) as Platform[]);
    setEditScheduledAt(post.scheduledAt ? post.scheduledAt.slice(0, 16) : '');
    setShowMenu(null);
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditingPost(null);
    setEditContent('');
    setEditHashtags([]);
    setEditPlatforms([]);
    setEditScheduledAt('');
    setHashtagInput('');
  };

  // Toggle platform in edit
  const toggleEditPlatform = (platform: Platform) => {
    if (editPlatforms.includes(platform)) {
      if (editPlatforms.length > 1) {
        setEditPlatforms(editPlatforms.filter(p => p !== platform));
      }
    } else {
      setEditPlatforms([...editPlatforms, platform]);
    }
  };

  // Add hashtag in edit
  const addEditHashtag = () => {
    if (!hashtagInput.trim()) return;
    const tag = hashtagInput.trim().replace(/^#/, '');
    if (!editHashtags.includes(tag)) {
      setEditHashtags([...editHashtags, tag]);
    }
    setHashtagInput('');
  };

  // Remove hashtag in edit
  const removeEditHashtag = (tag: string) => {
    setEditHashtags(editHashtags.filter(h => h !== tag));
  };

  // Save edited post
  const handleSaveEdit = async () => {
    if (!editingPost || !editContent.trim()) return;
    setSaving(true);
    try {
      const updatedPost = await socialMediaApi.updatePost(editingPost.id, {
        content: editContent,
        hashtags: editHashtags,
        scheduledAt: editScheduledAt || null,
        status: editScheduledAt ? 'scheduled' : 'draft',
      });
      updatePost(updatedPost);
      closeEditModal();
    } catch (error) {
      console.error('Failed to update post:', error);
    } finally {
      setSaving(false);
    }
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
            <CheckCircle size={12} />
            Veröffentlicht
          </span>
        );
      case 'scheduled':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs font-medium">
            <Clock size={12} />
            Geplant
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
            <Edit size={12} />
            Entwurf
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Posts durchsuchen..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          >
            <option value="all">Alle Status</option>
            <option value="draft">Entwürfe</option>
            <option value="scheduled">Geplant</option>
            <option value="published">Veröffentlicht</option>
          </select>

          {/* Platform Filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          >
            <option value="all">Alle Plattformen</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">Twitter</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </div>

      {/* Posts List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
        {filteredPosts.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <p className="mb-2">Keine Posts gefunden.</p>
            <button
              onClick={() => {
                setContentStudioTab('editor');
                setViewMode('content-studio');
              }}
              className="text-pink-600 hover:text-pink-700 font-medium"
            >
              Ersten Post erstellen
            </button>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <div
              key={post.id}
              className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Platforms */}
                <div className="flex gap-1 flex-shrink-0">
                  {(post.platforms || []).map((platform) => (
                    <span
                      key={platform}
                      className={`p-1.5 rounded ${PLATFORM_COLORS[platform]} text-white`}
                    >
                      {PLATFORM_ICONS[platform]}
                    </span>
                  ))}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 dark:text-white line-clamp-3 mb-2">
                    {post.content}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {getStatusBadge(post.status)}
                    {post.scheduledAt && (
                      <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                        <Calendar size={14} />
                        {new Date(post.scheduledAt).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                    {post.hashtags && post.hashtags.length > 0 && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {post.hashtags.length} Hashtags
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowMenu(showMenu === post.id ? null : post.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <MoreVertical size={18} />
                  </button>

                  {showMenu === post.id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                      <button
                        onClick={() => handleCopy(post.content)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Copy size={16} />
                        Kopieren
                      </button>
                      <button
                        onClick={() => openEditModal(post)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Edit size={16} />
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(post.id)}
                        disabled={deleting === post.id}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 size={16} />
                        {deleting === post.id ? 'Lösche...' : 'Löschen'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Post count */}
      {filteredPosts.length > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          {filteredPosts.length} von {posts.length} Posts
        </p>
      )}

      {/* Edit Modal */}
      {editingPost && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeEditModal}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Post bearbeiten
              </h2>
              <button
                onClick={closeEditModal}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Platforms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Plattformen
                </label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => toggleEditPlatform(platform)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        editPlatforms.includes(platform)
                          ? `${PLATFORM_COLORS[platform]} text-white`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {PLATFORM_ICONS[platform]}
                      <span className="capitalize">{platform}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Inhalt
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {editContent.length} Zeichen
                </p>
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Hash size={14} className="inline mr-1" />
                  Hashtags
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {editHashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded text-sm"
                    >
                      #{tag}
                      <button onClick={() => removeEditHashtag(tag)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEditHashtag())}
                    placeholder="Hashtag hinzufügen..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
                  />
                  <button
                    onClick={addEditHashtag}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar size={14} className="inline mr-1" />
                  Veröffentlichung planen
                </label>
                <input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
                {editScheduledAt && (
                  <button
                    onClick={() => setEditScheduledAt('')}
                    className="text-xs text-red-600 hover:text-red-700 mt-1"
                  >
                    Planung entfernen
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editContent.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Speichere...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Speichern
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
