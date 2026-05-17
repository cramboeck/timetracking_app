import { useState, useEffect } from 'react';
import { Bot, Save, RefreshCw, CheckCircle, XCircle, Eye, EyeOff, Sparkles, Zap, Settings2, FileText, RotateCcw } from 'lucide-react';
import { aiApi, AIConfig, DEFAULT_SYSTEM_PROMPTS } from '../services/api';
import { Button, IconButton } from './ui';

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
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptTemplates, setPromptTemplates] = useState<Record<string, string>>({});
  const [activePromptTab, setActivePromptTab] = useState<'default' | 'solution' | 'category' | 'priority' | 'response'>('default');

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
        setSystemPrompt(response.data.systemPrompt || '');
        setPromptTemplates(response.data.promptTemplates || {});
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
        systemPrompt: systemPrompt || null,
        promptTemplates,
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

  // Get current prompt value (custom or default)
  const getCurrentPromptValue = (type: string): string => {
    if (type === 'default') {
      return systemPrompt || DEFAULT_SYSTEM_PROMPTS.default;
    }
    return promptTemplates[type] || DEFAULT_SYSTEM_PROMPTS[type] || '';
  };

  // Update prompt for specific type
  const updatePrompt = (type: string, value: string) => {
    if (type === 'default') {
      setSystemPrompt(value);
    } else {
      setPromptTemplates(prev => ({ ...prev, [type]: value }));
    }
  };

  // Reset prompt to default
  const resetPromptToDefault = (type: string) => {
    if (type === 'default') {
      setSystemPrompt('');
    } else {
      setPromptTemplates(prev => {
        const updated = { ...prev };
        delete updated[type];
        return updated;
      });
    }
  };

  // Check if prompt is customized
  const isPromptCustomized = (type: string): boolean => {
    if (type === 'default') {
      return !!systemPrompt && systemPrompt !== DEFAULT_SYSTEM_PROMPTS.default;
    }
    return !!promptTemplates[type] && promptTemplates[type] !== DEFAULT_SYSTEM_PROMPTS[type];
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
      <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-dark-border">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Bot className="text-purple-600 dark:text-purple-400" size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">KI-Assistent</h2>
          <p className="text-sm text-gray-500 dark:text-dark-400">
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
      <div className="p-4 bg-gray-50 dark:bg-dark-100 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className={enabled ? 'text-purple-500' : 'text-gray-400'} size={20} />
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">KI-Assistent aktivieren</h3>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                Zeigt KI-Lösungsvorschläge in der Ticket-Ansicht
              </p>
            </div>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-dark-300'
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
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500">
          KI-Anbieter
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleProviderChange('openai')}
            className={`p-4 border-2 rounded-lg transition-all ${
              provider === 'openai'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-border'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                provider === 'openai' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-dark-200'
              }`}>
                <Zap className={provider === 'openai' ? 'text-purple-600' : 'text-gray-500'} size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900 dark:text-white">OpenAI</h4>
                <p className="text-xs text-gray-500 dark:text-dark-400">GPT-4, GPT-3.5</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleProviderChange('anthropic')}
            className={`p-4 border-2 rounded-lg transition-all ${
              provider === 'anthropic'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-dark-border'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                provider === 'anthropic' ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-dark-200'
              }`}>
                <Bot className={provider === 'anthropic' ? 'text-purple-600' : 'text-gray-500'} size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-medium text-gray-900 dark:text-white">Anthropic</h4>
                <p className="text-xs text-gray-500 dark:text-dark-400">Claude 3.5, Claude 3</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500">
          API-Key
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.hasApiKey ? '••••••••••••••••••••••••' : 'API-Key eingeben...'}
            className="w-full px-4 py-2 pr-20 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <IconButton
              onClick={() => setShowApiKey(!showApiKey)}
              icon={showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              size="sm"
            />
            <Button
              onClick={handleTestConnection}
              disabled={testing || (!apiKey && !config?.hasApiKey)}
              variant="secondary"
              size="sm"
              loading={testing}
            >
              Test
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-dark-400">
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
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-500">
          Modell
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-dark-500 hover:text-gray-900 dark:hover:text-white">
          <Settings2 size={16} />
          Erweiterte Einstellungen
        </summary>
        <div className="mt-4 space-y-4 pl-6">
          {/* Max Tokens */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-600 dark:text-dark-400">
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
            <label className="block text-sm text-gray-600 dark:text-dark-400">
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

      {/* System Prompt Configuration */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-dark-500 hover:text-gray-900 dark:hover:text-white">
          <FileText size={16} />
          System-Prompt anpassen
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Passe die System-Prompts für verschiedene Assistenten-Funktionen an. Der System-Prompt definiert das Verhalten und den Kontext der KI.
          </p>

          {/* Prompt Type Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'default', label: 'Standard' },
              { key: 'solution', label: 'Lösung' },
              { key: 'category', label: 'Kategorie' },
              { key: 'priority', label: 'Priorität' },
              { key: 'response', label: 'Antwort' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActivePromptTab(tab.key as any)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                  activePromptTab === tab.key
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium'
                    : 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400 hover:bg-gray-200 dark:hover:bg-dark-300'
                }`}
              >
                {tab.label}
                {isPromptCustomized(tab.key) && (
                  <span className="w-2 h-2 bg-purple-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Prompt Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm text-gray-600 dark:text-dark-400">
                {activePromptTab === 'default' ? 'Standard System-Prompt' :
                 activePromptTab === 'solution' ? 'Lösungsvorschläge Prompt' :
                 activePromptTab === 'category' ? 'Kategorie-Klassifikation Prompt' :
                 activePromptTab === 'priority' ? 'Prioritäts-Analyse Prompt' :
                 'Antwort-Generator Prompt'}
              </label>
              {isPromptCustomized(activePromptTab) && (
                <Button
                  onClick={() => resetPromptToDefault(activePromptTab)}
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={12} />}
                >
                  Auf Standard zurücksetzen
                </Button>
              )}
            </div>
            <textarea
              value={getCurrentPromptValue(activePromptTab)}
              onChange={(e) => updatePrompt(activePromptTab, e.target.value)}
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
              placeholder={DEFAULT_SYSTEM_PROMPTS[activePromptTab] || DEFAULT_SYSTEM_PROMPTS.default}
            />
            <p className="text-xs text-gray-500 dark:text-dark-400">
              {activePromptTab === 'default' && 'Dieser Prompt wird verwendet, wenn kein spezifischer Prompt definiert ist.'}
              {activePromptTab === 'solution' && 'Wird bei "Lösung vorschlagen" im Ticket verwendet.'}
              {activePromptTab === 'category' && 'Wird für die automatische Kategorisierung von Tickets verwendet.'}
              {activePromptTab === 'priority' && 'Wird für die Prioritäts-Empfehlung verwendet.'}
              {activePromptTab === 'response' && 'Wird für das Generieren von Kundenantworten verwendet.'}
            </p>
          </div>

          {/* Quick Variables Info */}
          <div className="p-3 bg-gray-50 dark:bg-dark-100 rounded-lg text-xs text-gray-600 dark:text-dark-400">
            <p className="font-medium mb-1">Hinweis:</p>
            <p>Der System-Prompt definiert die Persönlichkeit und das Verhalten der KI. Der eigentliche Ticket-Kontext (Titel, Beschreibung, etc.) wird automatisch zum Prompt hinzugefügt.</p>
          </div>
        </div>
      </details>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-dark-border">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="primary"
          size="lg"
          loading={saving}
          icon={!saving ? <Save size={18} /> : undefined}
        >
          {saving ? 'Speichern...' : 'Einstellungen speichern'}
        </Button>
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

      {/* Social Media Features Info */}
      {provider === 'openai' && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
            <Sparkles size={16} />
            Auch für Social Media Manager
          </h4>
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
            Dieser OpenAI API-Key wird auch für folgende Social Media Funktionen verwendet:
          </p>
          <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
            <li><strong>DALL-E 3 Bildgenerierung</strong> - Professionelle Grafiken für Posts & Stories</li>
            <li><strong>Content Wizard</strong> - Marketing-Experte für optimierte Posts</li>
            <li><strong>Post-Generierung</strong> - KI-gestützte Content-Erstellung</li>
            <li><strong>Trend-Analyse</strong> - Branchentrends und Content-Ideen</li>
          </ul>
        </div>
      )}
    </div>
  );
};
