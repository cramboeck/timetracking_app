import { useState, useEffect } from 'react';
import {
  MessageCircle,
  Play,
  Pause,
  Settings,
  Plus,
  X,
  Target,
  Users,
  History,
  Trash2,
} from 'lucide-react';
import { socialMediaApi } from '../../../../services/api';
import { PLATFORM_ICONS, PLATFORM_COLORS, DEFAULT_ENGAGEMENT_SETTINGS } from '../../constants';
import type { EngagementSettings, EngagementHistoryItem, Platform } from '../../types';

const PLATFORMS: Platform[] = ['linkedin', 'twitter'];

const RESPONSE_STYLES: { value: EngagementSettings['responseStyle']; label: string; description: string }[] = [
  { value: 'thoughtful', label: 'Nachdenklich', description: 'Tiefgehende, analytische Antworten' },
  { value: 'supportive', label: 'Unterstützend', description: 'Ermutigende, positive Antworten' },
  { value: 'inquisitive', label: 'Fragend', description: 'Weiterführende Fragen stellen' },
  { value: 'expert', label: 'Experte', description: 'Fachkundige Einblicke teilen' },
];

export default function EngagementBotTab() {
  const [settings, setSettings] = useState<EngagementSettings>(DEFAULT_ENGAGEMENT_SETTINGS);
  const [history, setHistory] = useState<EngagementHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newAccount, setNewAccount] = useState('');
  const [newExclude, setNewExclude] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsData, historyData] = await Promise.all([
        socialMediaApi.getEngagementSettings().catch(() => null),
        socialMediaApi.getEngagementHistory().catch(() => []),
      ]);
      if (settingsData) {
        setSettings({
          ...DEFAULT_ENGAGEMENT_SETTINGS,
          ...settingsData,
          platforms: settingsData.platforms || DEFAULT_ENGAGEMENT_SETTINGS.platforms,
          targetKeywords: settingsData.targetKeywords || DEFAULT_ENGAGEMENT_SETTINGS.targetKeywords,
          targetAccounts: settingsData.targetAccounts || DEFAULT_ENGAGEMENT_SETTINGS.targetAccounts,
          excludeKeywords: settingsData.excludeKeywords || DEFAULT_ENGAGEMENT_SETTINGS.excludeKeywords,
        });
      }
      setHistory(historyData || []);
    } catch (error) {
      console.error('Failed to load engagement data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await socialMediaApi.updateEngagementSettings(settings);
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
      await socialMediaApi.updateEngagementSettings(newSettings);
    } catch (error) {
      console.error('Failed to toggle engagement bot:', error);
      setSettings(settings);
    }
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

  const addKeyword = () => {
    if (!newKeyword.trim() || settings.targetKeywords.includes(newKeyword.trim())) return;
    setSettings({
      ...settings,
      targetKeywords: [...settings.targetKeywords, newKeyword.trim()],
    });
    setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
    setSettings({
      ...settings,
      targetKeywords: settings.targetKeywords.filter((k) => k !== keyword),
    });
  };

  const addAccount = () => {
    if (!newAccount.trim() || settings.targetAccounts.includes(newAccount.trim())) return;
    setSettings({
      ...settings,
      targetAccounts: [...settings.targetAccounts, newAccount.trim()],
    });
    setNewAccount('');
  };

  const removeAccount = (account: string) => {
    setSettings({
      ...settings,
      targetAccounts: settings.targetAccounts.filter((a) => a !== account),
    });
  };

  const addExclude = () => {
    if (!newExclude.trim() || settings.excludeKeywords.includes(newExclude.trim())) return;
    setSettings({
      ...settings,
      excludeKeywords: [...settings.excludeKeywords, newExclude.trim()],
    });
    setNewExclude('');
  };

  const removeExclude = (keyword: string) => {
    setSettings({
      ...settings,
      excludeKeywords: settings.excludeKeywords.filter((k) => k !== keyword),
    });
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
          ? 'bg-gradient-to-r from-blue-500 to-indigo-600'
          : 'bg-gradient-to-r from-gray-500 to-gray-600'
      } text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <MessageCircle size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Engagement Bot</h2>
              <p className="text-white/80">
                {settings.enabled
                  ? 'Automatisches Engagement aktiv'
                  : 'Engagement Bot ist deaktiviert'}
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
              <p className="text-2xl font-bold">{settings.dailyLimit}</p>
              <p className="text-sm text-white/80">Tägl. Limit</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{settings.targetKeywords.length}</p>
              <p className="text-sm text-white/80">Keywords</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{history.length}</p>
              <p className="text-sm text-white/80">Antworten</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Grid */}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Antworten pro Tag
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={settings.dailyLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dailyLimit: parseInt(e.target.value) || 1,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Antwort-Stil
              </label>
              <div className="space-y-2">
                {RESPONSE_STYLES.map((style) => (
                  <button
                    key={style.value}
                    onClick={() =>
                      setSettings({ ...settings, responseStyle: style.value })
                    }
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      settings.responseStyle === style.value
                        ? 'border-pink-600 bg-pink-50 dark:bg-pink-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <p className={`font-medium ${
                      settings.responseStyle === style.value
                        ? 'text-pink-700 dark:text-pink-400'
                        : 'text-gray-800 dark:text-white'
                    }`}>
                      {style.label}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {style.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Target Keywords & Accounts */}
        <div className="space-y-6">
          {/* Keywords */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Target size={20} className="text-pink-600" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Ziel-Keywords
              </h3>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {settings.targetKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="flex items-center gap-1 px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 rounded-full text-sm"
                >
                  {keyword}
                  <button onClick={() => removeKeyword(keyword)}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                placeholder="Keyword hinzufügen..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <button
                onClick={addKeyword}
                disabled={!newKeyword.trim()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Target Accounts */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-pink-600" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Ziel-Accounts
              </h3>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {settings.targetAccounts.map((account) => (
                <span
                  key={account}
                  className="flex items-center gap-1 px-3 py-1 bg-accent-lighter dark:bg-accent-primary/30 text-accent-dark dark:text-accent-primary rounded-full text-sm"
                >
                  @{account}
                  <button onClick={() => removeAccount(account)}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAccount()}
                placeholder="@account..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <button
                onClick={addAccount}
                disabled={!newAccount.trim()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Exclude Keywords */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <X size={20} className="text-red-600" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                Ausschließen
              </h3>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {settings.excludeKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-sm"
                >
                  {keyword}
                  <button onClick={() => removeExclude(keyword)}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newExclude}
                onChange={(e) => setNewExclude(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExclude()}
                placeholder="Keyword ausschließen..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
              />
              <button
                onClick={addExclude}
                disabled={!newExclude.trim()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg disabled:opacity-50"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Engagement History */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <History size={20} className="text-pink-600" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Letzte Antworten
            </h3>
          </div>

          <div className="space-y-4">
            {history.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`p-1 rounded ${PLATFORM_COLORS[item.platform] || 'bg-gray-500'} text-white`}>
                    {PLATFORM_ICONS[item.platform]}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(item.createdAt).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                  <strong>Original:</strong> {item.originalPost}
                </p>
                <p className="text-sm text-gray-800 dark:text-white">
                  <strong>Antwort:</strong> {item.response}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
