import { useMemo } from 'react';
import {
  Plus,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  Send,
  Zap,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';

export default function DashboardPage() {
  const { posts, setViewMode, setContentStudioTab } = useSocialMedia();

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const scheduled = posts.filter(p => p.status === 'scheduled');
    const published = posts.filter(p => p.status === 'published');
    const draft = posts.filter(p => p.status === 'draft');

    // Upcoming posts (next 7 days)
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcoming = scheduled.filter(p => {
      if (!p.scheduledAt) return false;
      const date = new Date(p.scheduledAt);
      return date >= now && date <= nextWeek;
    });

    return {
      total: posts.length,
      scheduled: scheduled.length,
      published: published.length,
      draft: draft.length,
      upcoming: upcoming.length,
    };
  }, [posts]);

  // Recent posts
  const recentPosts = useMemo(() => {
    return posts
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [posts]);

  // Quick action handlers
  const handleNewPost = () => {
    setContentStudioTab('editor');
    setViewMode('content-studio');
  };

  const handleOpenWizard = () => {
    setContentStudioTab('wizard');
    setViewMode('content-studio');
  };

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">Social Media Manager</h1>
        <p className="text-pink-100 mb-4">
          Plane, erstelle und veröffentliche Content für alle deine Kanäle.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleNewPost}
            className="flex items-center gap-2 px-4 py-2 bg-white text-pink-600 rounded-lg font-medium hover:bg-pink-50 transition-colors"
          >
            <Plus size={18} />
            Neuer Post
          </button>
          <button
            onClick={handleOpenWizard}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition-colors"
          >
            <Zap size={18} />
            Content Wizard
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition-colors"
          >
            <Calendar size={18} />
            Kalender
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Send size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.total}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Gesamt Posts</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Clock size={20} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.scheduled}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Geplant</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.published}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Veröffentlicht</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <TrendingUp size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.upcoming}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Diese Woche</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Posts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 dark:text-white">Letzte Posts</h2>
          <button
            onClick={() => setViewMode('library')}
            className="text-sm text-pink-600 hover:text-pink-700"
          >
            Alle anzeigen
          </button>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {recentPosts.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p>Noch keine Posts vorhanden.</p>
              <button
                onClick={handleNewPost}
                className="mt-2 text-pink-600 hover:text-pink-700 font-medium"
              >
                Ersten Post erstellen
              </button>
            </div>
          ) : (
            recentPosts.map((post) => (
              <div key={post.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="flex items-start gap-3">
                  <div className="flex gap-1 mt-1">
                    {post.platforms.map((platform) => (
                      <span
                        key={platform}
                        className={`p-1 rounded ${PLATFORM_COLORS[platform]} text-white`}
                      >
                        {PLATFORM_ICONS[platform]}
                      </span>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 dark:text-white line-clamp-2">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        post.status === 'published'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : post.status === 'scheduled'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {post.status === 'published' ? 'Veröffentlicht' :
                         post.status === 'scheduled' ? 'Geplant' : 'Entwurf'}
                      </span>
                      {post.scheduledAt && (
                        <span>
                          {new Date(post.scheduledAt).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
