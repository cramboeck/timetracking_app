import { useState } from 'react';
import {
  Send,
  Clock,
  Hash,
  Image,
  Sparkles,
  X,
  AlertCircle,
  Check,
} from 'lucide-react';
import { useSocialMedia } from '../../context';
import { usePostEditor, useContentGeneration } from '../../hooks';
import { PLATFORM_ICONS, PLATFORM_COLORS, PLATFORM_LIMITS } from '../../constants';
import type { Platform, Tone } from '../../types';

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

const TONES: { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professionell' },
  { value: 'casual', label: 'Locker' },
  { value: 'humorous', label: 'Humorvoll' },
  { value: 'informative', label: 'Informativ' },
];

export default function PostEditor() {
  const { customers } = useSocialMedia();
  const editor = usePostEditor();
  const { generating, generatePost } = useContentGeneration();

  const [showAIHelper, setShowAIHelper] = useState(false);
  const [aiTopic, setAITopic] = useState('');
  const [aiTone, setAITone] = useState<Tone>('professional');
  const [hashtagInput, setHashtagInput] = useState('');

  // Character count for primary platform
  const primaryPlatform = editor.platforms[0] || 'linkedin';
  const charLimit = PLATFORM_LIMITS[primaryPlatform];
  const charCount = editor.content.length;
  const isOverLimit = charCount > charLimit;

  // Handle AI generation
  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) return;
    const result = await generatePost({
      topic: aiTopic,
      platform: primaryPlatform,
      tone: aiTone,
      includeHashtags: true,
      includeEmoji: true,
    });
    if (result) {
      editor.applyGeneratedContent(result.content, result.hashtags);
      setShowAIHelper(false);
      setAITopic('');
    }
  };

  // Handle hashtag input
  const handleHashtagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (hashtagInput.trim()) {
        editor.addHashtag(hashtagInput.trim());
        setHashtagInput('');
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Editor */}
      <div className="lg:col-span-2 space-y-4">
        {/* Platform Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Plattformen auswählen
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                onClick={() => editor.togglePlatform(platform)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  editor.platforms.includes(platform)
                    ? `${PLATFORM_COLORS[platform]} text-white`
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {PLATFORM_ICONS[platform]}
                <span className="capitalize">{platform}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Editor */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Post-Inhalt
            </label>
            <button
              onClick={() => setShowAIHelper(!showAIHelper)}
              className="flex items-center gap-1 text-sm text-pink-600 hover:text-pink-700"
            >
              <Sparkles size={16} />
              KI-Assistent
            </button>
          </div>

          {/* AI Helper Panel */}
          {showAIHelper && (
            <div className="mb-4 p-4 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-lg border border-pink-200 dark:border-pink-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  KI-Content generieren
                </span>
                <button
                  onClick={() => setShowAIHelper(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAITopic(e.target.value)}
                  placeholder="Worüber soll der Post handeln?"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
                <div className="flex gap-2">
                  <select
                    value={aiTone}
                    onChange={(e) => setAITone(e.target.value as Tone)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    {TONES.map((tone) => (
                      <option key={tone.value} value={tone.value}>
                        {tone.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAIGenerate}
                    disabled={generating || !aiTopic.trim()}
                    className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {generating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Generiere...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generieren
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Text Area */}
          <textarea
            value={editor.content}
            onChange={(e) => editor.setContent(e.target.value)}
            placeholder="Was möchtest du teilen?"
            rows={8}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white resize-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          />

          {/* Character Count */}
          <div className="flex items-center justify-between mt-2 text-sm">
            <span className={isOverLimit ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}>
              {charCount} / {charLimit} Zeichen
            </span>
            {isOverLimit && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle size={14} />
                Limit überschritten
              </span>
            )}
          </div>
        </div>

        {/* Hashtags */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Hash size={18} className="text-gray-500" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Hashtags
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {editor.hashtags.map((tag, i) => (
              <span
                key={i}
                className="flex items-center gap-1 px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded-full text-sm"
              >
                {tag}
                <button
                  onClick={() => editor.removeHashtag(tag)}
                  className="hover:text-pink-900 dark:hover:text-pink-200"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={hashtagInput}
            onChange={(e) => setHashtagInput(e.target.value)}
            onKeyDown={handleHashtagKeyDown}
            placeholder="Hashtag eingeben und Enter drücken..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Customer Selection */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Kunde (optional)
          </label>
          <select
            value={editor.customerId}
            onChange={(e) => editor.setCustomerId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          >
            <option value="">Kein Kunde</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>

        {/* Scheduling */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-gray-500" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Veröffentlichung planen
            </label>
          </div>
          <input
            type="datetime-local"
            value={editor.scheduledAt}
            onChange={(e) => editor.setScheduledAt(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          />
        </div>

        {/* Media Upload */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <Image size={18} className="text-gray-500" />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Medien
            </label>
          </div>
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
            <Image size={32} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bilder oder Videos hierher ziehen
            </p>
            <button className="mt-2 text-sm text-pink-600 hover:text-pink-700">
              Datei auswählen
            </button>
          </div>
        </div>

        {/* Error Message */}
        {editor.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle size={18} />
              <span className="text-sm">{editor.error}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={editor.savePost}
            disabled={editor.saving || !editor.content.trim() || editor.platforms.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {editor.saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Speichern...
              </>
            ) : editor.scheduledAt ? (
              <>
                <Clock size={18} />
                Planen
              </>
            ) : (
              <>
                <Send size={18} />
                Als Entwurf speichern
              </>
            )}
          </button>

          {editor.content && (
            <button
              onClick={() => editor.setContent('')}
              className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
            >
              Zurücksetzen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
