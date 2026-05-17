import { useState } from 'react';
import {
  Wand2,
  Sparkles,
  Target,
  Users,
  Megaphone,
  TrendingUp,
  ShoppingCart,
  Globe,
  Copy,
  Check,
  ArrowRight,
  Save,
  Clock,
  X,
  Calendar,
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
import { useSocialMedia } from '../../context';
import { PLATFORM_ICONS, PLATFORM_COLORS } from '../../constants';
import type { Platform, WizardTone, MarketingGoal, JourneyStage, ContentLength } from '../../types';

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

const WIZARD_TONES: { value: WizardTone; label: string }[] = [
  { value: 'professional', label: 'Professionell' },
  { value: 'inspirational', label: 'Inspirierend' },
  { value: 'urgent', label: 'Dringend' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'educational', label: 'Lehrreich' },
];

const MARKETING_GOALS: { value: MarketingGoal; label: string; icon: React.ReactNode }[] = [
  { value: 'leads', label: 'Lead-Generierung', icon: <Target size={20} /> },
  { value: 'brand', label: 'Markenbekanntheit', icon: <Megaphone size={20} /> },
  { value: 'engagement', label: 'Engagement', icon: <Users size={20} /> },
  { value: 'sales', label: 'Verkauf', icon: <ShoppingCart size={20} /> },
  { value: 'traffic', label: 'Website-Traffic', icon: <Globe size={20} /> },
];

const JOURNEY_STAGES: { value: JourneyStage; label: string }[] = [
  { value: 'awareness', label: 'Awareness (Aufmerksamkeit)' },
  { value: 'consideration', label: 'Consideration (Abwägung)' },
  { value: 'decision', label: 'Decision (Entscheidung)' },
];

const CONTENT_LENGTHS: { value: ContentLength; label: string }[] = [
  { value: 'short', label: 'Kurz (1-2 Sätze)' },
  { value: 'medium', label: 'Mittel (3-5 Sätze)' },
  { value: 'long', label: 'Lang (6+ Sätze)' },
];

interface WizardResult {
  platform: string;
  content: string;
  hashtags: string[];
}

export default function ContentWizard() {
  const { addPost } = useSocialMedia();

  // Wizard state
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>(['linkedin']);
  const [tone, setTone] = useState<WizardTone>('professional');
  const [goal, setGoal] = useState<MarketingGoal>('engagement');
  const [journeyStage, setJourneyStage] = useState<JourneyStage>('awareness');
  const [contentLength, setContentLength] = useState<ContentLength>('medium');
  const [targetAudience, setTargetAudience] = useState('');
  const [keyMessages, setKeyMessages] = useState('');
  const [callToAction, setCallToAction] = useState('');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<WizardResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Save/Schedule state
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [scheduleModal, setScheduleModal] = useState<{ index: number; result: WizardResult } | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');

  const togglePlatform = (platform: Platform) => {
    if (platforms.includes(platform)) {
      if (platforms.length > 1) {
        setPlatforms(platforms.filter((p) => p !== platform));
      }
    } else {
      setPlatforms([...platforms, platform]);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Build enhanced topic with marketing context
      const enhancedTopic = buildEnhancedTopic();

      // Map wizard tone to API tone
      const apiTone = mapToneToApi(tone);

      // Generate content for each platform
      const generatedResults: WizardResult[] = [];

      for (const platform of platforms) {
        try {
          const result = await socialMediaApi.generateContent({
            topic: enhancedTopic,
            platform,
            tone: apiTone,
            includeHashtags: true,
            includeEmoji: true,
          });

          generatedResults.push({
            platform,
            content: result.content,
            hashtags: result.hashtags || [],
          });
        } catch (err) {
          console.error(`Failed to generate for ${platform}:`, err);
        }
      }

      if (generatedResults.length > 0) {
        setResults(generatedResults);
        setStep(4);
      }
    } catch (error) {
      console.error('Failed to generate content:', error);
    } finally {
      setGenerating(false);
    }
  };

  // Build enhanced topic with all wizard context
  const buildEnhancedTopic = () => {
    let enhancedTopic = topic;

    // Add target audience context
    if (targetAudience) {
      enhancedTopic += `. Zielgruppe: ${targetAudience}`;
    }

    // Add key messages
    if (keyMessages) {
      const messages = keyMessages.split('\n').filter(m => m.trim());
      if (messages.length > 0) {
        enhancedTopic += `. Kernbotschaften: ${messages.join(', ')}`;
      }
    }

    // Add CTA
    if (callToAction) {
      enhancedTopic += `. Call-to-Action: ${callToAction}`;
    }

    // Add marketing goal context
    const goalLabels: Record<MarketingGoal, string> = {
      leads: 'Lead-Generierung',
      brand: 'Markenbekanntheit',
      engagement: 'Engagement fördern',
      sales: 'Verkauf',
      traffic: 'Website-Traffic',
    };
    enhancedTopic += `. Ziel: ${goalLabels[goal]}`;

    // Add content length hint
    const lengthHints: Record<ContentLength, string> = {
      short: 'Kurz und prägnant (1-2 Sätze)',
      medium: 'Mittlere Länge (3-5 Sätze)',
      long: 'Ausführlich (6+ Sätze)',
    };
    enhancedTopic += `. Länge: ${lengthHints[contentLength]}`;

    return enhancedTopic;
  };

  // Map wizard tones to API tones
  const mapToneToApi = (wizardTone: WizardTone): 'professional' | 'casual' | 'humorous' | 'informative' => {
    switch (wizardTone) {
      case 'professional':
        return 'professional';
      case 'inspirational':
      case 'storytelling':
        return 'casual';
      case 'urgent':
        return 'informative';
      case 'educational':
        return 'informative';
      default:
        return 'professional';
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Save as draft
  const saveAsDraft = async (result: WizardResult, index: number) => {
    setSavingIndex(index);
    try {
      const post = await socialMediaApi.createPost({
        content: result.content,
        hashtags: result.hashtags,
        platforms: [result.platform],
        aiGenerated: true,
      });
      addPost(post);
      setSavedIndices(prev => new Set(prev).add(index));
    } catch (error) {
      console.error('Failed to save post:', error);
    } finally {
      setSavingIndex(null);
    }
  };

  // Schedule post
  const schedulePost = async () => {
    if (!scheduleModal || !scheduleDate) return;
    setSavingIndex(scheduleModal.index);
    try {
      const post = await socialMediaApi.createPost({
        content: scheduleModal.result.content,
        hashtags: scheduleModal.result.hashtags,
        platforms: [scheduleModal.result.platform],
        scheduledAt: scheduleDate,
        aiGenerated: true,
      });
      addPost(post);
      setSavedIndices(prev => new Set(prev).add(scheduleModal.index));
      setScheduleModal(null);
      setScheduleDate('');
    } catch (error) {
      console.error('Failed to schedule post:', error);
    } finally {
      setSavingIndex(null);
    }
  };

  // Save all as drafts
  const saveAllAsDrafts = async () => {
    for (let i = 0; i < results.length; i++) {
      if (!savedIndices.has(i)) {
        await saveAsDraft(results[i], i);
      }
    }
  };

  const resetWizard = () => {
    setStep(1);
    setResults([]);
    setSavedIndices(new Set());
    setTopic('');
    setPlatforms(['linkedin']);
    setTone('professional');
    setGoal('engagement');
    setJourneyStage('awareness');
    setContentLength('medium');
    setTargetAudience('');
    setKeyMessages('');
    setCallToAction('');
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
              step >= s
                ? 'bg-pink-600 text-white'
                : 'bg-gray-200 dark:bg-dark-200 text-gray-500 dark:text-dark-400'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      {/* Step 1: Topic & Platforms */}
      {step === 1 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <div className="text-center mb-6">
            <Wand2 size={48} className="mx-auto text-pink-600 mb-4" />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
              Content Wizard
            </h2>
            <p className="text-gray-600 dark:text-dark-400">
              Erstelle optimierten Content für deine Marketing-Ziele
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Worüber soll dein Content handeln?
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="z.B. Launch unseres neuen Produkts, Tipps für Remote-Arbeit, Kundenreferenz..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Für welche Plattformen?
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      platforms.includes(platform)
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
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={() => setStep(2)}
              disabled={!topic.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Weiter
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Marketing Settings */}
      {step === 2 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">
            Marketing-Einstellungen
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Marketing-Ziel
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MARKETING_GOALS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGoal(g.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                      goal === g.value
                        ? 'border-pink-600 bg-pink-50 dark:bg-pink-900/20 text-pink-600'
                        : 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-dark-500 hover:bg-gray-50 dark:hover:bg-dark-200'
                    }`}
                  >
                    {g.icon}
                    <span className="text-sm">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Customer Journey Stage
              </label>
              <select
                value={journeyStage}
                onChange={(e) => setJourneyStage(e.target.value as JourneyStage)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
              >
                {JOURNEY_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Tonalität
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as WizardTone)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                >
                  {WIZARD_TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  Content-Länge
                </label>
                <select
                  value={contentLength}
                  onChange={(e) => setContentLength(e.target.value as ContentLength)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                >
                  {CONTENT_LENGTHS.map((length) => (
                    <option key={length.value} value={length.value}>
                      {length.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
            >
              Zurück
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
            >
              Weiter
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Additional Details */}
      {step === 3 && (
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-dark-border">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">
            Weitere Details (optional)
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Zielgruppe
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="z.B. Marketing Manager, kleine Unternehmen, Tech-Startups..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Kernbotschaften (eine pro Zeile)
              </label>
              <textarea
                value={keyMessages}
                onChange={(e) => setKeyMessages(e.target.value)}
                placeholder="z.B.&#10;Zeitersparnis von 50%&#10;Einfache Integration&#10;Kostenloser Support"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Call-to-Action
              </label>
              <input
                type="text"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="z.B. Jetzt Demo buchen, Link in Bio, Kommentar hinterlassen..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
            >
              Zurück
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Generiere...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Content generieren
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              Generierter Content ({results.length})
            </h2>
            <div className="flex items-center gap-3">
              {results.length > 1 && savedIndices.size < results.length && (
                <button
                  onClick={saveAllAsDrafts}
                  className="flex items-center gap-1 text-sm text-pink-600 hover:text-pink-700"
                >
                  <Save size={16} />
                  Alle speichern
                </button>
              )}
              <button
                onClick={resetWizard}
                className="text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
              >
                Neu erstellen
              </button>
            </div>
          </div>

          {results.map((result, index) => (
            <div
              key={index}
              className={`bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm border ${
                savedIndices.has(index)
                  ? 'border-green-300 dark:border-green-700'
                  : 'border-gray-200 dark:border-dark-border'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`p-1.5 rounded ${PLATFORM_COLORS[result.platform]} text-white`}
                  >
                    {PLATFORM_ICONS[result.platform]}
                  </span>
                  <span className="font-medium text-gray-800 dark:text-white capitalize">
                    {result.platform}
                  </span>
                  {savedIndices.has(index) && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check size={12} />
                      Gespeichert
                    </span>
                  )}
                </div>
                <button
                  onClick={() => copyToClipboard(result.content, index)}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white bg-gray-100 dark:bg-dark-200 rounded-lg"
                >
                  {copiedIndex === index ? (
                    <>
                      <Check size={14} />
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Kopieren
                    </>
                  )}
                </button>
              </div>

              <p className="text-gray-800 dark:text-white whitespace-pre-wrap mb-3">
                {result.content}
              </p>

              {result.hashtags && result.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {result.hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-500 rounded text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Save/Schedule Actions */}
              {!savedIndices.has(index) && (
                <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                  <button
                    onClick={() => saveAsDraft(result, index)}
                    disabled={savingIndex === index}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-dark-200 text-gray-700 dark:text-dark-500 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-300 disabled:opacity-50"
                  >
                    {savingIndex === index ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
                        Speichere...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Als Entwurf
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setScheduleModal({ index, result })}
                    disabled={savingIndex === index}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
                  >
                    <Clock size={16} />
                    Planen
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setScheduleModal(null)}
        >
          <div
            className="bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Post planen
              </h3>
              <button
                onClick={() => setScheduleModal(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400">
                <span className={`p-1 rounded ${PLATFORM_COLORS[scheduleModal.result.platform]} text-white`}>
                  {PLATFORM_ICONS[scheduleModal.result.platform]}
                </span>
                <span className="capitalize">{scheduleModal.result.platform}</span>
              </div>

              <p className="text-gray-800 dark:text-white text-sm line-clamp-3">
                {scheduleModal.result.content}
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  <Calendar size={16} className="inline mr-1" />
                  Datum und Uhrzeit
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setScheduleModal(null)}
                className="px-4 py-2 text-gray-600 dark:text-dark-400 hover:text-gray-800 dark:hover:text-white"
              >
                Abbrechen
              </button>
              <button
                onClick={schedulePost}
                disabled={!scheduleDate || savingIndex !== null}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingIndex !== null ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Plane...
                  </>
                ) : (
                  <>
                    <Clock size={16} />
                    Planen
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
