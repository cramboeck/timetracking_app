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
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
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
      const result = await socialMediaApi.generateWizardContent({
        topic,
        platforms,
        tone,
        marketingGoal: goal,
        journeyStage,
        contentLength,
        targetAudience: targetAudience || undefined,
        keyMessages: keyMessages ? keyMessages.split('\n').filter((m) => m.trim()) : undefined,
        callToAction: callToAction || undefined,
      });
      setResults(result.posts);
      setStep(4);
    } catch (error) {
      console.error('Failed to generate content:', error);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const resetWizard = () => {
    setStep(1);
    setResults([]);
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
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      {/* Step 1: Topic & Platforms */}
      {step === 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-center mb-6">
            <Wand2 size={48} className="mx-auto text-pink-600 mb-4" />
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
              Content Wizard
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Erstelle optimierten Content für deine Marketing-Ziele
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Worüber soll dein Content handeln?
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="z.B. Launch unseres neuen Produkts, Tipps für Remote-Arbeit, Kundenreferenz..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
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
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">
            Marketing-Einstellungen
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                        : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {g.icon}
                    <span className="text-sm">{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customer Journey Stage
              </label>
              <select
                value={journeyStage}
                onChange={(e) => setJourneyStage(e.target.value as JourneyStage)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tonalität
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as WizardTone)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  {WIZARD_TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Content-Länge
                </label>
                <select
                  value={contentLength}
                  onChange={(e) => setContentLength(e.target.value as ContentLength)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
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
              className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
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
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6">
            Weitere Details (optional)
          </h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Zielgruppe
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="z.B. Marketing Manager, kleine Unternehmen, Tech-Startups..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Kernbotschaften (eine pro Zeile)
              </label>
              <textarea
                value={keyMessages}
                onChange={(e) => setKeyMessages(e.target.value)}
                placeholder="z.B.&#10;Zeitersparnis von 50%&#10;Einfache Integration&#10;Kostenloser Support"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Call-to-Action
              </label>
              <input
                type="text"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="z.B. Jetzt Demo buchen, Link in Bio, Kommentar hinterlassen..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
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
              Generierter Content
            </h2>
            <button
              onClick={resetWizard}
              className="text-pink-600 hover:text-pink-700"
            >
              Neuen Content erstellen
            </button>
          </div>

          {results.map((result, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
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
                </div>
                <button
                  onClick={() => copyToClipboard(result.content, index)}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white bg-gray-100 dark:bg-gray-700 rounded-lg"
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
                <div className="flex flex-wrap gap-1">
                  {result.hashtags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
