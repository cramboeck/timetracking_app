import { useState } from 'react';
import {
  Bell,
  BellOff,
  Smartphone,
  Trash2,
  Send,
  Settings,
  AlertTriangle,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Button, IconButton } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/UIContext';
import { pushApi } from '../services/api';

export const PushNotificationSettings = () => {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const isAdmin = currentUser?.role === 'admin';
  const [generatedKeys, setGeneratedKeys] = useState<{ VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerateKeys = async () => {
    setGenerating(true);
    try {
      const result = await pushApi.generateVapidKeys();
      if (result.success && result.keys) {
        setGeneratedKeys(result.keys);
      } else {
        showToast('Schlüssel konnten nicht erzeugt werden', 'error');
      }
    } catch (err: any) {
      showToast(`Schlüssel konnten nicht erzeugt werden: ${err?.message || 'Unbekannter Fehler'}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyEnv = async () => {
    if (!generatedKeys) return;
    const envBlock = [
      `VAPID_PUBLIC_KEY=${generatedKeys.VAPID_PUBLIC_KEY}`,
      `VAPID_PRIVATE_KEY=${generatedKeys.VAPID_PRIVATE_KEY}`,
      `VAPID_SUBJECT=mailto:support@ramboeck.it`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(envBlock);
      showToast('Env-Variablen in die Zwischenablage kopiert');
    } catch {
      showToast('Kopieren fehlgeschlagen — bitte manuell markieren', 'warning');
    }
  };

  const {
    isSupported,
    isConfigured,
    permission,
    isSubscribed,
    subscriptions,
    preferences,
    loading,
    error,
    subscribe,
    unsubscribe,
    deleteSubscription,
    updatePreferences,
    sendTestNotification,
  } = usePushNotifications();

  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ sent: number; failed: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setActionLoading('subscribe');
    await subscribe();
    setActionLoading(null);
  };

  const handleUnsubscribe = async () => {
    setActionLoading('unsubscribe');
    await unsubscribe();
    setActionLoading(null);
  };

  const handleDeleteSubscription = async (id: string) => {
    setActionLoading(`delete-${id}`);
    await deleteSubscription(id);
    setActionLoading(null);
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await sendTestNotification();
      setTestResult(result);
    } catch {
      setTestResult({ sent: 0, failed: 1 });
    }
    setTestSending(false);
  };

  const handlePreferenceChange = async (key: string, value: boolean) => {
    await updatePreferences({ [key]: value });
  };

  if (loading && permission === 'loading') {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-accent-primary" size={24} />
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5\" size={20} />
          <div>
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
              Push-Benachrichtigungen nicht verfügbar
            </h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              Ihr Browser unterstützt keine Push-Benachrichtigungen oder die Funktion ist deaktiviert.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={20} />
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200">
              Push-Benachrichtigungen nicht konfiguriert
            </h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              {isAdmin
                ? 'Dem Server fehlen die VAPID-Schlüssel — ohne sie können keine Push-Benachrichtigungen gesendet werden (z.B. bei Ticket-Zuweisungen).'
                : 'Der Server muss zunächst mit VAPID-Schlüsseln konfiguriert werden. Bitte wende dich an deinen Administrator.'}
            </p>

            {isAdmin && !generatedKeys && (
              <Button
                onClick={handleGenerateKeys}
                variant="primary"
                size="sm"
                className="mt-3"
                disabled={generating}
                icon={generating ? <Loader2 size={16} className="animate-spin" /> : <Settings size={16} />}
              >
                VAPID-Schlüssel erzeugen
              </Button>
            )}

            {isAdmin && generatedKeys && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Diese Zeilen in die <code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900/40 px-1 py-0.5 rounded">.env.production</code> auf
                  dem Server eintragen und danach neu deployen (<code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900/40 px-1 py-0.5 rounded">sudo ./scripts/deploy.sh</code>):
                </p>
                <pre className="text-xs font-mono bg-white dark:bg-dark-100 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
{`VAPID_PUBLIC_KEY=${generatedKeys.VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${generatedKeys.VAPID_PRIVATE_KEY}
VAPID_SUBJECT=mailto:support@ramboeck.it`}
                </pre>
                <Button onClick={handleCopyEnv} variant="secondary" size="sm" icon={<Check size={16} />}>
                  In Zwischenablage kopieren
                </Button>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  Hinweis: Der private Schlüssel wird nur hier angezeigt und nirgends gespeichert.
                  Nach dem Deploy erscheinen an dieser Stelle die Push-Einstellungen.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status & Subscribe/Unsubscribe */}
      <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubscribed ? (
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Bell className="text-green-600 dark:text-green-400" size={20} />
              </div>
            ) : (
              <div className="p-2 bg-gray-100 dark:bg-dark-200 rounded-lg">
                <BellOff className="text-gray-500 dark:text-dark-400" size={20} />
              </div>
            )}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                Push-Benachrichtigungen
              </h4>
              <p className="text-sm text-gray-500 dark:text-dark-400">
                {isSubscribed
                  ? 'Dieses Gerät empfängt Benachrichtigungen'
                  : permission === 'denied'
                  ? 'Benachrichtigungen wurden im Browser blockiert'
                  : 'Aktivieren Sie Push-Benachrichtigungen für dieses Gerät'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSubscribed && (
              <Button
                onClick={handleTestNotification}
                disabled={testSending || loading}
                loading={testSending}
                variant="secondary"
                size="sm"
                icon={<Send size={16} />}
              >
                Test
              </Button>
            )}
            <Button
              onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
              disabled={loading || permission === 'denied' || actionLoading !== null}
              loading={actionLoading === 'subscribe' || actionLoading === 'unsubscribe'}
              variant={isSubscribed ? 'secondary' : 'primary'}
              size="md"
              icon={isSubscribed ? <BellOff size={18} /> : <Bell size={18} />}
            >
              {isSubscribed ? 'Deaktivieren' : 'Aktivieren'}
            </Button>
          </div>
        </div>

        {/* Test result */}
        {testResult !== null && (
          <div
            className={`mt-3 p-2 rounded-lg text-sm flex items-center gap-2 ${
              testResult.sent > 0
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}
          >
            {testResult.sent > 0 ? <Check size={16} /> : <X size={16} />}
            {testResult.sent > 0
              ? `Test-Benachrichtigung an ${testResult.sent} Gerät(e) gesendet`
              : 'Konnte keine Test-Benachrichtigung senden'}
          </div>
        )}

        {/* Permission denied warning */}
        {permission === 'denied' && (
          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Benachrichtigungen wurden in deinem Browser blockiert. Bitte aktiviere sie in den Browser-Einstellungen für diese Website.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Notification Preferences */}
      {preferences && (
        <>
          {/* Push Notification Settings */}
          <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">
              Push-Benachrichtigungen
            </h4>
            <div className="space-y-3">
              <PreferenceToggle
                label="Push-Benachrichtigungen aktiviert"
                description="Alle Push-Benachrichtigungen aktivieren/deaktivieren"
                checked={preferences.push_enabled}
                onChange={(v) => handlePreferenceChange('push_enabled', v)}
                disabled={!isSubscribed}
              />
              <div className={preferences.push_enabled && isSubscribed ? '' : 'opacity-50 pointer-events-none'}>
                <PreferenceToggle
                  label="Neues Ticket erstellt"
                  description="Benachrichtigung bei neuen Tickets"
                  checked={preferences.push_on_new_ticket}
                  onChange={(v) => handlePreferenceChange('push_on_new_ticket', v)}
                />
                <PreferenceToggle
                  label="Neuer Kommentar"
                  description="Benachrichtigung bei Kommentaren zu deinen Tickets"
                  checked={preferences.push_on_ticket_comment}
                  onChange={(v) => handlePreferenceChange('push_on_ticket_comment', v)}
                />
                <PreferenceToggle
                  label="Ticket zugewiesen"
                  description="Benachrichtigung, wenn dir ein Ticket zugewiesen wird"
                  checked={preferences.push_on_ticket_assigned}
                  onChange={(v) => handlePreferenceChange('push_on_ticket_assigned', v)}
                />
                <PreferenceToggle
                  label="Status geändert"
                  description="Benachrichtigung bei Statusänderungen"
                  checked={preferences.push_on_status_change}
                  onChange={(v) => handlePreferenceChange('push_on_status_change', v)}
                />
                <PreferenceToggle
                  label="SLA-Warnung"
                  description="Benachrichtigung bei SLA-Verletzungen"
                  checked={preferences.push_on_sla_warning}
                  onChange={(v) => handlePreferenceChange('push_on_sla_warning', v)}
                />
              </div>
            </div>
          </div>

          {/* Email Notification Settings */}
          <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">
              E-Mail-Benachrichtigungen
            </h4>
            <div className="space-y-3">
              <PreferenceToggle
                label="E-Mail-Benachrichtigungen aktiviert"
                description="Alle E-Mail-Benachrichtigungen aktivieren/deaktivieren"
                checked={preferences.email_enabled}
                onChange={(v) => handlePreferenceChange('email_enabled', v)}
              />
              <div className={preferences.email_enabled ? '' : 'opacity-50 pointer-events-none'}>
                <PreferenceToggle
                  label="Neues Ticket"
                  description="E-Mail wenn ein neues Ticket erstellt wird"
                  checked={preferences.email_on_new_ticket ?? true}
                  onChange={(v) => handlePreferenceChange('email_on_new_ticket', v)}
                />
                <PreferenceToggle
                  label="Ticket zugewiesen"
                  description="E-Mail, wenn dir ein Ticket zugewiesen wird"
                  checked={preferences.email_on_ticket_assigned ?? true}
                  onChange={(v) => handlePreferenceChange('email_on_ticket_assigned', v)}
                />
                <PreferenceToggle
                  label="Neuer Kommentar"
                  description="E-Mail bei Kommentaren zu deinen zugewiesenen Tickets"
                  checked={preferences.email_on_ticket_comment ?? true}
                  onChange={(v) => handlePreferenceChange('email_on_ticket_comment', v)}
                />
                <PreferenceToggle
                  label="Status geändert"
                  description="E-Mail bei Statusänderungen Ihrer Tickets"
                  checked={preferences.email_on_status_change ?? false}
                  onChange={(v) => handlePreferenceChange('email_on_status_change', v)}
                />
                <PreferenceToggle
                  label="SLA-Warnung"
                  description="E-Mail bei SLA-Verletzungen"
                  checked={preferences.email_on_sla_warning ?? true}
                  onChange={(v) => handlePreferenceChange('email_on_sla_warning', v)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Registered Devices */}
      {subscriptions.length > 0 && (
        <div className="bg-white dark:bg-dark-100 border border-gray-200 dark:border-dark-border rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">
            Registrierte Geräte ({subscriptions.length})
          </h4>
          <div className="space-y-2">
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="text-gray-500 dark:text-dark-400" size={18} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {sub.device_name || 'Unbekanntes Gerät'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-400">
                      Registriert: {new Date(sub.created_at).toLocaleDateString('de-DE')}
                      {sub.last_used_at && (
                        <> · Zuletzt: {new Date(sub.last_used_at).toLocaleDateString('de-DE')}</>
                      )}
                    </p>
                  </div>
                </div>
                <IconButton
                  onClick={() => handleDeleteSubscription(sub.id)}
                  disabled={actionLoading === `delete-${sub.id}`}
                  variant="danger"
                  size="md"
                  tooltip="Gerät entfernen"
                  icon={<Trash2 size={16} />}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
};

// Preference toggle component
interface PreferenceToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

const PreferenceToggle = ({ label, description, checked, onChange, disabled }: PreferenceToggleProps) => (
  <div className={`flex items-center justify-between py-2 border-b border-gray-100 dark:border-dark-border last:border-b-0 ${disabled ? 'opacity-50' : ''}`}>
    <div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      <p className="text-xs text-gray-500 dark:text-dark-400">{description}</p>
    </div>
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-dark-300'
      } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

export default PushNotificationSettings;
