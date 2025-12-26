import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle,
  Edit,
  MoreHorizontal,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { useCalendar } from '../../hooks';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { SocialMediaPost } from '../../types';

export default function CalendarPage() {
  const { setViewMode, setContentStudioTab } = useSocialMedia();
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

  // Quick action to create new post
  const handleNewPost = () => {
    setContentStudioTab('editor');
    setViewMode('content-studio');
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
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
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
              className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-medium text-gray-800 dark:text-white min-w-[160px] text-center">
              {monthYearLabel}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {weekDays.map((day) => (
            <div
              key={day}
              className="px-2 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
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
                className={`min-h-[120px] border-b border-r border-gray-100 dark:border-gray-700 p-2 ${
                  !day.isCurrentMonth
                    ? 'bg-gray-50 dark:bg-gray-900/50'
                    : 'bg-white dark:bg-gray-800'
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
                        : 'text-gray-400 dark:text-gray-600'
                    }`}
                  >
                    {day.dayOfMonth}
                  </span>
                  {day.posts.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
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
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
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
                      className="w-full text-center text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
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
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
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
                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                >
                  <MoreHorizontal size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Scheduled Time */}
              {selectedPost.scheduledAt && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
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
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm"
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
            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSelectedPost(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              >
                Schließen
              </button>
              <button
                onClick={() => {
                  // TODO: Open editor with this post
                  setSelectedPost(null);
                }}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
              >
                Bearbeiten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
