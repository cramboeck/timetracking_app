import { useState, useEffect } from 'react';
import {
  BarChart3,
  Clock,
  Hash,
  PieChart,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
import type { AnalyticsData } from '../../types';

export default function AnalyticsTab() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData>({
    bestTimes: null,
    hashtagStats: null,
    contentMix: null,
    performance: null,
  });

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [bestTimes, hashtagStats, contentMix, performance] = await Promise.all([
        socialMediaApi.getBestTimes().catch(() => null),
        socialMediaApi.getHashtagAnalytics().catch(() => null),
        socialMediaApi.getContentMix().catch(() => null),
        socialMediaApi.getPerformance().catch(() => null),
      ]);
      setData({ bestTimes, hashtagStats, contentMix, performance });
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
          Performance Analytics
        </h2>
        <button
          onClick={loadAnalytics}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
        >
          <RefreshCw size={18} />
          Aktualisieren
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-lighter dark:bg-accent-primary/30 rounded-lg">
              <BarChart3 size={20} className="text-accent-primary dark:text-accent-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {data.performance?.metrics.totalPosts || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-dark-400">Gesamt Posts</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {data.performance?.metrics.totalEngagement || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-dark-400">Gesamt Engagement</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Hash size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {data.hashtagStats?.topPerforming.length || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-dark-400">Top Hashtags</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Clock size={20} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800 dark:text-white">
                {data.bestTimes?.recommendedTimes.length || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-dark-400">Beste Zeiten</p>
            </div>
          </div>
        </div>
      </div>

      {/* Best Times */}
      {data.bestTimes && data.bestTimes.recommendedTimes.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Beste Posting-Zeiten
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {data.bestTimes.recommendedTimes.map((time, index) => (
              <div
                key={index}
                className="text-center p-3 bg-gray-50 dark:bg-dark-50 rounded-lg"
              >
                <p className="font-medium text-gray-800 dark:text-white">
                  {time.dayName}
                </p>
                <p className="text-lg font-bold text-pink-600">{time.timeString}</p>
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  Ø {time.avgEngagement}% Engagement
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Hashtags */}
      {data.hashtagStats && data.hashtagStats.topPerforming.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Hash size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Top-Performing Hashtags
            </h3>
          </div>
          <div className="space-y-3">
            {data.hashtagStats.topPerforming.slice(0, 10).map((hashtag, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-400 w-6">
                    #{index + 1}
                  </span>
                  <span className="font-medium text-pink-600">{hashtag.hashtag}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-dark-400">
                  <span>{hashtag.usageCount}x verwendet</span>
                  <span className="text-green-600 dark:text-green-400">
                    Ø {hashtag.avgEngagement}% Engagement
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Mix */}
      {data.contentMix && data.contentMix.distribution.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Content-Mix
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {data.contentMix.distribution.map((item, index) => (
              <div key={index} className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-2">
                  <svg className="w-20 h-20 transform -rotate-90">
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="transparent"
                      className="text-gray-200 dark:text-dark-500"
                    />
                    <circle
                      cx="40"
                      cy="40"
                      r="35"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={`${item.percentage * 2.2} 220`}
                      className="text-pink-600"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-800 dark:text-white">
                    {item.percentage}%
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-dark-400">{item.category}</p>
              </div>
            ))}
          </div>
          {data.contentMix.recommendations.length > 0 && (
            <div className="mt-4 p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
              <p className="text-sm font-medium text-pink-800 dark:text-pink-200 mb-2">
                Empfehlungen:
              </p>
              <ul className="text-sm text-pink-700 dark:text-pink-300 space-y-1">
                {data.contentMix.recommendations.map((rec, i) => (
                  <li key={i}>• {rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Top Posts */}
      {data.performance && data.performance.topPosts.length > 0 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Top-Performing Posts
            </h3>
          </div>
          <div className="space-y-3">
            {data.performance.topPosts.slice(0, 5).map((post, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-3 bg-gray-50 dark:bg-dark-50 rounded-lg"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-600 font-bold text-sm">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 dark:text-white line-clamp-2">
                    {post.content}
                  </p>
                </div>
                <span className="flex-shrink-0 text-sm font-medium text-green-600 dark:text-green-400">
                  {post.engagement} Engagement
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!data.bestTimes && !data.hashtagStats && !data.contentMix && !data.performance && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-dark-border text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-gray-300 dark:text-dark-400" />
          <p className="text-gray-500 dark:text-dark-400 mb-2">
            Noch keine Analytics-Daten verfügbar.
          </p>
          <p className="text-sm text-gray-400 dark:text-dark-400">
            Veröffentliche mehr Posts, um Insights zu erhalten.
          </p>
        </div>
      )}
    </div>
  );
}
