import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle,
  Edit,
  MoreHorizontal,
  X,
  Hash,
  Save,
  Calendar,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { useCalendar } from '../../hooks';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { SocialMediaPost, Platform } from '../../types';

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

export default function CalendarPage() {
  const { setViewMode, setContentStudioTab, updatePost } = useSocialMedia();
  const {
    calendarDays,
    monthYearLabel,
    weekDays,
    loading,
    previousMonth,
    nextMonth,
    goToToday,
  } = useCalendar();

  const [selectedPost, setSelectedPost] = useState<SocialMediaPost | null>(null);

  // Edit modal state
  const [editingPost, setEditingPost] = useState<SocialMediaPost | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [editPlatforms, setEditPlatforms] = useState<Platform[]>([]);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick action to create new post
  const handleNewPost = () => {
    setContentStudioTab('editor');
    setViewMode('content-studio');
  };

  // Open edit modal
  const openEditModal = (post: SocialMediaPost) => {
    setEditingPost(post);
    setEditContent(post.content);
    setEditHashtags(post.hashtags || []);
    setEditPlatforms((post.platforms || []) as Platform[]);
    setEditScheduledAt(post.scheduledAt ? post.scheduledAt.slice(0, 16) : '');
    setSelectedPost(null);
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
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle size={12} />
            Veröffentlicht
          </span>
        );
      case 'scheduled':
        return (
          <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
            <Clock size={12} />
            Geplant
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-400">
            <Edit size={12} />
            Entwurf
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">
            Content Kalender
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={previousMonth}
              className="p-2 text-gray-600 hover:text-gray-800 dark:text-dark-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-medium text-gray-800 dark:text-white min-w-[160px] text-center">
              {monthYearLabel}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 text-gray-600 hover:text-gray-800 dark:text-dark-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 dark:text-dark-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg transition-colors"
            >
              Heute
            </button>
          </div>
        </div>
        <button
          onClick={handleNewPost}
          className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
        >
          <Plus size={18} />
          Neuer Post
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-dark-border">
          {weekDays.map((day) => (
            <div
              key={day}
              className="px-2 py-3 text-center text-sm font-medium text-gray-500 dark:text-dark-400"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => (
              <div
                key={index}
                className={`min-h-[120px] border-b border-r border-gray-100 dark:border-dark-border p-2 ${
                  !day.isCurrentMonth
                    ? 'bg-gray-50 dark:bg-dark-50/50'
                    : 'bg-white dark:bg-dark-100'
                } ${index % 7 === 6 ? 'border-r-0' : ''}`}
              >
                {/* Day Number */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-sm font-medium ${
                      day.isToday
                        ? 'w-7 h-7 flex items-center justify-center bg-pink-600 text-white rounded-full'
                        : day.isCurrentMonth
                        ? 'text-gray-800 dark:text-white'
                        : 'text-gray-400 dark:text-dark-400'
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>
                  {day.posts.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-dark-400">
                      {day.posts.length} Post{day.posts.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Posts */}
                <div className="space-y-1">
                  {day.posts.slice(0, 3).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className={`w-full text-left px-2 py-1 rounded text-xs truncate ${
                        post.status === 'published'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : post.status === 'scheduled'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          : 'bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500'
                      } hover:opacity-80 transition-opacity`}
                    >
                      <div className="flex items-center gap-1">
                        {(post.platforms || []).slice(0, 2).map((platform) => (
                          <span
                            key={platform}
                            className={`w-3 h-3 flex items-center justify-center rounded text-white text-[8px] ${PLATFORM_COLORS[platform]}`}
                          >
                            {PLATFORM_ICONS[platform]}
                          </span>
                        ))}
                        <span className="truncate flex-1">
                          {post.scheduledAt
                            ? new Date(post.scheduledAt).toLocaleTimeString('de-DE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                  {day.posts.length > 3 && (
                    <button
                      onClick={() => {
                        // Show all posts for this day
                        if (day.posts.length > 0) {
                          setSelectedPost(day.posts[0]);
                        }
                      }}
                      className="w-full text-center text-xs text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-500"
                    >
                      +{day.posts.length - 3} weitere
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-2">
                {(selectedPost.platforms || []).map((platform) => (
                  <span
                    key={platform}
                    className={`p-1.5 rounded ${PLATFORM_COLORS[platform]} text-white`}
                  >
                    {PLATFORM_ICONS[platform]}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedPost.status)}
                <button
                  onClick={() => setSelectedPost(null)}
                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Scheduled Time */}
              {selectedPost.scheduledAt && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400">
                  <Clock size={16} />
                  <span>
                    {new Date(selectedPost.scheduledAt).toLocaleDateString('de-DE', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}

              {/* Content */}
              <div className="text-gray-800 dark:text-white whitespace-pre-wrap">
                {selectedPost.content}
              </div>

              {/* Hashtags */}
              {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedPost.hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-500 rounded text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Media */}
              {selectedPost.mediaUrls && selectedPost.mediaUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {selectedPost.mediaUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Media ${i + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setSelectedPost(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-dark-400 dark:hover:text-white"
              >
                Schließen
              </button>
              <button
                onClick={() => openEditModal(selectedPost)}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
              >
                <Edit size={16} />
                Bearbeiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingPost && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeEditModal}
        >
          <div
            className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Post bearbeiten
              </h2>
              <button
                onClick={closeEditModal}
                className="text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Platforms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
                          : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
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
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Inhalt
                </label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                  {editContent.length} Zeichen
                </p>
              </div>

              {/* Hashtags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white text-sm"
                  />
                  <button
                    onClick={addEditHashtag}
                    className="px-3 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  <Calendar size={14} className="inline mr-1" />
                  Veröffentlichung planen
                </label>
                <input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
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
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
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
