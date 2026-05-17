import { useState } from 'react';
import {
  Layers,
  Plus,
  X,
  Sparkles,
  Calendar,
  Copy,
  Check,
  Clock,
} from 'lucide-react';
import { useContentGeneration } from '../../hooks';
import { useSocialMedia } from '../../context';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { Platform, Tone, BatchResult } from '../../types';

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professionell' },
  { value: 'casual', label: 'Locker' },
  { value: 'humorous', label: 'Humorvoll' },
  { value: 'informative', label: 'Informativ' },
];

export default function BatchGenerator() {
  const { addPost } = useSocialMedia();
  const { generating } = useContentGeneration();

  // Input state
  const [topics, setTopics] = useState<string[]>(['']);
  const [platform, setPlatform] = useState<Platform>('linkedin');
  const [tone, setTone] = useState<Tone>('professional');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [includeEmoji, setIncludeEmoji] = useState(true);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [postsPerDay, setPostsPerDay] = useState(1);

  // Results state
  const [results, setResults] = useState<BatchResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  // Add/remove topic
  const addTopic = () => {
    setTopics([...topics, '']);
  };

  const removeTopic = (index: number) => {
    if (topics.length > 1) {
      setTopics(topics.filter((_, i) => i !== index));
    }
  };

  const updateTopic = (index: number, value: string) => {
    const newTopics = [...topics];
    newTopics[index] = value;
    setTopics(newTopics);
  };

  // Generate batch
  const handleGenerate = async () => {
    const validTopics = topics.filter((t) => t.trim());
    if (validTopics.length === 0) return;

    setIsGenerating(true);
    try {
      const result = await socialMediaApi.generateBatch({
        topics: validTopics,
        platform,
        tone,
        includeHashtags,
        includeEmoji,
        autoSchedule,
        startDate: autoSchedule ? startDate : undefined,
        postsPerDay,
      });
      setResults(result.posts || []);
    } catch (error) {
      console.error('Failed to generate batch:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Save as post
  const saveAsPost = async (result: BatchResult, index: number) => {
    setSavingIndex(index);
    try {
      const post = await socialMediaApi.createPost({
        content: result.content,
        hashtags: result.hashtags,
        platforms: [platform],
        scheduledAt: result.scheduledAt,
        status: result.scheduledAt ? 'scheduled' : 'draft',
      });
      addPost(post);
      // Remove from results
      setResults(results.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to save post:', error);
    } finally {
      setSavingIndex(null);
    }
  };

  // Save all as posts
  const saveAllAsPosts = async () => {
    for (let i = 0; i < results.length; i++) {
      await saveAsPost(results[i], i);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input Section */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={20} className="text-pink-600" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              Batch Generator
            </h2>
          </div>

          <p className="text-sm text-gray-600 dark:text-dark-400 mb-4">
            Generiere mehrere Posts auf einmal zu verschiedenen Themen.
          </p>

          {/* Topics */}
          <div className="space-y-3 mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500">
              Themen ({topics.length})
            </label>
            {topics.map((topic, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => updateTopic(index, e.target.value)}
                  placeholder={`Thema ${index + 1}...`}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
                {topics.length > 1 && (
                  <button
                    onClick={() => removeTopic(index)}
                    className="p-2 text-gray-400 hover:text-red-600"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTopic}
              className="flex items-center gap-2 text-sm text-pink-600 hover:text-pink-700"
            >
              <Plus size={16} />
              Thema hinzufügen
            </button>
          </div>

          {/* Platform Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Plattform
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    platform === p
                      ? `${PLATFORM_COLORS[p]} text-white`
                      : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400'
                  }`}
                >
                  {PLATFORM_ICONS[p]}
                  <span className="capitalize">{p}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Tonalität
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
            >
              {TONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Options */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeHashtags}
                onChange={(e) => setIncludeHashtags(e.target.checked)}
                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
              />
              <span className="text-sm text-gray-700 dark:text-dark-500">
                Hashtags
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeEmoji}
                onChange={(e) => setIncludeEmoji(e.target.checked)}
                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
              />
              <span className="text-sm text-gray-700 dark:text-dark-500">
                Emojis
              </span>
            </label>
          </div>

          {/* Auto Schedule */}
          <div className="border-t border-gray-200 dark:border-dark-border pt-4 mb-4">
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={autoSchedule}
                onChange={(e) => setAutoSchedule(e.target.checked)}
                className="w-4 h-4 text-pink-600 rounded border-gray-300 focus:ring-pink-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-dark-500">
                <Calendar size={16} className="inline mr-1" />
                Automatisch planen
              </span>
            </label>

            {autoSchedule && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">
                    Startdatum
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-dark-400 mb-1">
                    Posts pro Tag
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={postsPerDay}
                    onChange={(e) => setPostsPerDay(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || topics.every((t) => !t.trim())}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generiere {topics.filter((t) => t.trim()).length} Posts...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Batch generieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        {results.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Generierte Posts ({results.length})
              </h3>
              <button
                onClick={saveAllAsPosts}
                className="text-sm text-pink-600 hover:text-pink-700"
              >
                Alle speichern
              </button>
            </div>

            {results.map((result, index) => (
              <div
                key={index}
                className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-dark-border"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`p-1.5 rounded ${PLATFORM_COLORS[platform]} text-white`}
                    >
                      {PLATFORM_ICONS[platform]}
                    </span>
                    <span className="text-sm font-medium text-gray-600 dark:text-dark-400">
                      {result.topic}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.scheduledAt && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-400">
                        <Clock size={12} />
                        {new Date(result.scheduledAt).toLocaleDateString('de-DE')}
                      </span>
                    )}
                    <button
                      onClick={() => copyToClipboard(result.content, index)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-dark-500"
                    >
                      {copiedIndex === index ? (
                        <Check size={16} className="text-green-600" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-gray-800 dark:text-white whitespace-pre-wrap text-sm mb-3">
                  {result.content}
                </p>

                {result.hashtags && result.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {result.hashtags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-500 rounded text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => saveAsPost(result, index)}
                  disabled={savingIndex === index}
                  className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 disabled:opacity-50"
                >
                  {savingIndex === index ? 'Speichere...' : 'Als Post speichern'}
                </button>
              </div>
            ))}
          </>
        ) : (
          <div className="bg-white dark:bg-dark-100 rounded-xl p-8 shadow-sm border border-gray-200 dark:border-dark-border text-center">
            <Layers size={48} className="mx-auto mb-4 text-gray-300 dark:text-dark-400" />
            <p className="text-gray-500 dark:text-dark-400">
              Füge Themen hinzu und klicke auf "Batch generieren" um mehrere Posts zu erstellen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
