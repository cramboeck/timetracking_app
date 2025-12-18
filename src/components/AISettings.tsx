import { useState, useEffect } from 'react';
import { Bot, Save, RefreshCw, CheckCircle, XCircle, Eye, EyeOff, Sparkles, Zap, Settings2 } from 'lucide-react';
import { aiApi, AIConfig } from '../services/api';

export const AISettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [enabled, setEnabled] = useState(false);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [temperature, setTemperature] = useState(0.7);

  // UI state
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Model options per provider
  const modelOptions = {
    openai: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Schnell & Günstig)' },
      { value: 'gpt-4o', label: 'GPT-4o (Beste Qualität)' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Günstigste)' },
    ],
    anthropic: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Empfohlen)' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Schnell)' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Beste Qualität)' },
    ],
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await aiApi.getConfig();
      if (response.data) {
        setConfig(response.data);
        setProvider(response.data.provider);
        setModel(response.data.model);
        setEnabled(response.data.enabled);
        setMaxTokens(response.data.maxTokens);
        setTemperature(response.data.temperature);
        // Don't set apiKey - it's masked
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (newProvider: 'openai' | 'anthropic') => {
    setProvider(newProvider);
    // Set default model for provider
    if (newProvider === 'openai') {
      setModel('gpt-4o-mini');
    } else {
      setModel('claude-3-5-sonnet-20241022');
    }
    // Reset test result when provider changes
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!apiKey && !config?.hasApiKey) {
      setError('Bitte gib zuerst einen API-Key ein');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setError('');

    try {
      const keyToTest = apiKey || 'existing'; // Use existing key if not changed
      const response = await aiApi.testConnection(provider, apiKey || config?.apiKey || '');
      setTestResult(response);
      if (response.success) {
        setSuccess('Verbindung erfolgreich!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Verbindung fehlgeschlagen');
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updateData: any = {
        provider,
        model,
        enabled,
        maxTokens,
        temperature,
      };

      // Only include apiKey if it was changed
      if (apiKey) {
        updateData.apiKey = apiKey;
      }

      await aiApi.saveConfig(updateData);
      setSuccess('Einstellungen gespeichert!');
      setApiKey(''); // Clear the input field
      loadConfig(); // Reload to get updated masked key
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-purple-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Bot className="text-purple-600 dark:text-purple-400" size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">KI-Assistent</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Konfiguriere den KI-Assistenten für Ticket-Lösungsvorschläge
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
          <XCircle className="text-red-500 flex-shrink-0" size={20} />
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
          <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
          <p className="text-green-700 dark:text-green-300">{success}</p>
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className={enabled ? 'text-purple-500' : 'text-gray-400'} size={20} />
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">KI-Assistent aktivieren</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Zeigt KI-Lösungsvorschläge in der Ticket-Ansicht
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                enabled ? 'left-8' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Provider Selection */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          KI-Anbieter
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleProviderChange('openai')}
            className={`p-4 border-2 rounded-lg transition-all ${
              provider === 'openai'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                provider === 'openai' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <Zap className={provider === 'openai' ? 'text-purple-600' : 'text-gray-500'} size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900 dark:text-white">OpenAI</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">GPT-4, GPT-3.5</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleProviderChange('anthropic')}
            className={`p-4 border-2 rounded-lg transition-all ${
              provider === 'anthropic'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                provider === 'anthropic' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <Bot className={provider === 'anthropic' ? 'text-purple-600' : 'text-gray-500'} size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900 dark:text-white">Anthropic</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Claude 3.5, Claude 3</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          API-Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.hasApiKey ? '••••••••••••••••••••••••' : 'API-Key eingeben...'}
            className="w-full px-4 py-2 pr-20 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testing || (!apiKey && !config?.hasApiKey)}
              className="px-3 py-1.5 text-sm bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {testing ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                'Test'
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {provider === 'openai' ? (
            <>Hole deinen API-Key von <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">platform.openai.com</a></>
          ) : (
            <>Hole deinen API-Key von <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">console.anthropic.com</a></>
          )}
        </p>

        {/* Test Result */}
        {testResult && (
          <div className={`mt-2 p-2 rounded text-sm flex items-center gap-2 ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {testResult.success ? (
              <>
                <CheckCircle size={16} />
                Verbindung erfolgreich!
              </>
            ) : (
              <>
                <XCircle size={16} />
                {testResult.error}
              </>
            )}
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Modell
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          {modelOptions[provider].map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Advanced Settings */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          <Settings2 size={16} />
          Erweiterte Einstellungen
        </summary>
        <div className="mt-4 space-y-4 pl-6">
          {/* Max Tokens */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-600 dark:text-gray-400">
              Max. Tokens (Antwortlänge): {maxTokens}
            </label>
            <input
              type="range"
              min="256"
              max="4096"
              step="256"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Kurz (256)</span>
              <span>Lang (4096)</span>
            </div>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-600 dark:text-gray-400">
              Kreativität: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Präzise (0)</span>
              <span>Kreativ (1)</span>
            </div>
          </div>
        </div>
      </details>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg font-medium transition-colors"
        >
          {saving ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              Speichern...
            </>
          ) : (
            <>
              <Save size={18} />
              Einstellungen speichern
            </>
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
        <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-2">
          So funktioniert der KI-Assistent
        </h4>
        <ul className="text-sm text-purple-700 dark:text-purple-400 space-y-1 list-disc list-inside">
          <li>Öffne ein Ticket und klicke auf "KI-Assistent anzeigen"</li>
          <li>Die KI analysiert Ticket-Titel, Beschreibung und bisherige Kommentare</li>
          <li>Relevante Wissensdatenbank-Artikel werden automatisch einbezogen</li>
          <li>Erhalte konkrete Lösungsvorschläge auf Deutsch</li>
          <li>Gib Feedback (Daumen hoch/runter) um die Qualität zu verbessern</li>
        </ul>
      </div>
    </div>
  );
};
