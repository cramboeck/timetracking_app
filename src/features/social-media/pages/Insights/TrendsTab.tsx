import { useState } from 'react';
import {
  TrendingUp,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Lightbulb,
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
import { useSocialMedia } from '../../context';
import type { Trend } from '../../types';

export default function TrendsTab() {
  const { setViewMode, setContentStudioTab } = useSocialMedia();

  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [trends, setTrends] = useState<Trend[]>([]);

  const analyzeTrends = async () => {
    if (!industry.trim()) return;
    setLoading(true);
    try {
      const result = await socialMediaApi.getTrends(industry);
      setTrends(result.trends || []);
    } catch (error) {
      console.error('Failed to analyze trends:', error);
    } finally {
      setLoading(false);
    }
  };

  const createPostFromTrend = (trend: Trend) => {
    // Navigate to content studio with trend topic
    setContentStudioTab('wizard');
    setViewMode('content-studio');
    // The wizard would need to be pre-filled with the trend topic
    // This would require additional context state
  };

  const getRelevanceBadge = (relevance: string) => {
    switch (relevance) {
      case 'high':
        return (
          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs font-medium">
            Hohe Relevanz
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs font-medium">
            Mittlere Relevanz
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium">
            Niedrige Relevanz
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Industry Input */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-pink-600" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            Trend-Analyse
          </h2>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Entdecke aktuelle Trends in deiner Branche und erhalte Content-Ideen.
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Deine Branche eingeben (z.B. SaaS, E-Commerce, Fitness...)"
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          />
          <button
            onClick={analyzeTrends}
            disabled={loading || !industry.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Analysiere...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Trends analysieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Trends Results */}
      {trends.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Aktuelle Trends in "{industry}"
            </h3>
            <button
              onClick={analyzeTrends}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
            >
              <RefreshCw size={14} />
              Aktualisieren
            </button>
          </div>

          {trends.map((trend, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                    <TrendingUp size={18} className="text-pink-600" />
                    {trend.topic}
                  </h4>
                  {getRelevanceBadge(trend.relevance)}
                </div>
                <button
                  onClick={() => createPostFromTrend(trend)}
                  className="flex items-center gap-1 text-sm text-pink-600 hover:text-pink-700"
                >
                  Post erstellen
                  <ExternalLink size={14} />
                </button>
              </div>

              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {trend.description}
              </p>

              {trend.suggestedAngles && trend.suggestedAngles.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={16} className="text-yellow-600" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Content-Ideen
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {trend.suggestedAngles.map((angle, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <span className="text-pink-600">•</span>
                        {angle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && trends.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-gray-700 text-center">
          <TrendingUp size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 mb-2">
            Keine Trends analysiert.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Gib deine Branche ein, um aktuelle Trends zu entdecken.
          </p>
        </div>
      )}
    </div>
  );
}
