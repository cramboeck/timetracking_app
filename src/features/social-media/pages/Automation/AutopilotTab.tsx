import { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  Pause,
  Settings,
  Plus,
  X,
  Calendar,
  Target,
  Users,
  Sparkles,
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS, DEFAULT_AUTOPILOT_SETTINGS } from '../../constants';
import type { AutopilotSettings, Platform } from '../../types';

const PLATFORMS: Platform[] = ['linkedin', 'twitter', 'facebook', 'instagram'];

export default function AutopilotTab() {
  const [settings, setSettings] = useState<AutopilotSettings>(DEFAULT_AUTOPILOT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newTheme, setNewTheme] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await socialMediaApi.getAutopilotSettings();
      if (data) {
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load autopilot settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await socialMediaApi.updateAutopilotSettings(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    const newSettings = { ...settings, enabled: !settings.enabled };
    setSettings(newSettings);
    try {
      await socialMediaApi.updateAutopilotSettings(newSettings);
    } catch (error) {
      console.error('Failed to toggle autopilot:', error);
      setSettings(settings);
    }
  };

  const addTheme = () => {
    if (!newTheme.trim() || settings.contentThemes.includes(newTheme.trim())) return;
    setSettings({
      ...settings,
      contentThemes: [...settings.contentThemes, newTheme.trim()],
    });
    setNewTheme('');
  };

  const removeTheme = (theme: string) => {
    setSettings({
      ...settings,
      contentThemes: settings.contentThemes.filter((t) => t !== theme),
    });
  };

  const togglePlatform = (platform: string) => {
    if (settings.platforms.includes(platform)) {
      if (settings.platforms.length > 1) {
        setSettings({
          ...settings,
          platforms: settings.platforms.filter((p) => p !== platform),
        });
      }
    } else {
      setSettings({
        ...settings,
        platforms: [...settings.platforms, platform],
      });
    }
  };

  const generateContent = async () => {
    setGenerating(true);
    try {
      await socialMediaApi.generateAutopilotContent();
      setSettings({
        ...settings,
        lastGenerated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to generate content:', error);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className={`rounded-xl p-6 ${
        settings.enabled
          ? 'bg-gradient-to-r from-green-500 to-emerald-600'
          : 'bg-gradient-to-r from-gray-500 to-gray-600'
      } text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Zap size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Content Autopilot</h2>
              <p className="text-white/80">
                {settings.enabled
                  ? 'Automatische Content-Generierung aktiv'
                  : 'Autopilot ist deaktiviert'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleEnabled}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
              settings.enabled
                ? 'bg-white/20 hover:bg-white/30'
                : 'bg-white text-gray-800 hover:bg-gray-100'
            }`}
          >
            {settings.enabled ? (
              <>
                <Pause size={20} />
                Deaktivieren
              </>
            ) : (
              <>
                <Play size={20} />
                Aktivieren
              </>
            )}
          </button>
        </div>

        {settings.enabled && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{settings.postsPerWeek}</p>
              <p className="text-sm text-white/80">Posts/Woche</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{settings.contentThemes.length}</p>
              <p className="text-sm text-white/80">Themen</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{settings.platforms.length}</p>
              <p className="text-sm text-white/80">Plattformen</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Einstellungen
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Posts pro Woche
              </label>
              <input
                type="number"
                min={1}
                max={21}
                value={settings.postsPerWeek}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    postsPerWeek: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Freigabe-Modus
              </label>
              <select
                value={settings.approvalMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    approvalMode: e.target.value as 'auto' | 'review',
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              >
                <option value="review">Zur Überprüfung</option>
                <option value="auto">Automatisch veröffentlichen</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Plattformen
              </label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      settings.platforms.includes(platform)
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
        </div>

        {/* Content Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Target size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Content-Einstellungen
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Zielgruppe
              </label>
              <input
                type="text"
                value={settings.targetAudience}
                onChange={(e) =>
                  setSettings({ ...settings, targetAudience: e.target.value })
                }
                placeholder="z.B. Marketing Manager, Startups..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Markenstimme
              </label>
              <input
                type="text"
                value={settings.brandVoice}
                onChange={(e) =>
                  setSettings({ ...settings, brandVoice: e.target.value })
                }
                placeholder="z.B. professionell, freundlich, innovativ..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Content-Themen
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {settings.contentThemes.map((theme) => (
                  <span
                    key={theme}
                    className="flex items-center gap-1 px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded-full text-sm"
                  >
                    {theme}
                    <button
                      onClick={() => removeTheme(theme)}
                      className="hover:text-pink-900 dark:hover:text-pink-200"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTheme()}
                  placeholder="Neues Thema..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
                <button
                  onClick={addTheme}
                  disabled={!newTheme.trim()}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Mix */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Users size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Content-Mix
            </h3>
          </div>

          <div className="space-y-4">
            {(['educational', 'promotional', 'behindTheScenes', 'trending'] as const).map(
              (key) => {
                const labels: Record<string, string> = {
                  educational: 'Lehrreich',
                  promotional: 'Werbung',
                  behindTheScenes: 'Behind the Scenes',
                  trending: 'Trends',
                };
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{labels[key]}</span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {settings.contentMix[key]}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.contentMix[key]}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          contentMix: {
                            ...settings.contentMix,
                            [key]: parseInt(e.target.value),
                          },
                        })
                      }
                      className="w-full"
                    />
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Generate Now */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Jetzt generieren
            </h3>
          </div>

          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Generiere sofort neuen Content basierend auf deinen Einstellungen.
          </p>

          {settings.lastGenerated && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-1">
              <Calendar size={14} />
              Zuletzt generiert:{' '}
              {new Date(settings.lastGenerated).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}

          <button
            onClick={generateContent}
            disabled={generating || !settings.enabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generiere Content...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Content jetzt generieren
              </>
            )}
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50"
        >
          {saving ? 'Speichere...' : 'Einstellungen speichern'}
        </button>
      </div>
    </div>
  );
}
