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
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { Platform, SocialMediaPost } from '../../types';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'published';
type PlatformFilter = 'all' | Platform;

export default function PostsTab() {
  const { posts, removePost, refreshPosts, setViewMode, setContentStudioTab } = useSocialMedia();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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
                  {post.platforms.map((platform) => (
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
                        onClick={() => {
                          // TODO: Open editor with post
                          setShowMenu(null);
                        }}
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
    </div>
  );
}
