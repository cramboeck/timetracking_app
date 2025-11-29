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

export const PushNotificationSettings = () => {
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
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Settings className="text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-medium text-gray-800 dark:text-gray-200">
              Push-Benachrichtigungen nicht konfiguriert
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Der Server muss zunächst mit VAPID-Schlüsseln konfiguriert werden.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status & Subscribe/Unsubscribe */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubscribed ? (
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Bell className="text-green-600 dark:text-green-400" size={20} />
              </div>
            ) : (
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <BellOff className="text-gray-500 dark:text-gray-400" size={20} />
              </div>
            )}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">
                Push-Benachrichtigungen
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
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
              <button
                onClick={handleTestNotification}
                disabled={testSending || loading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
              >
                {testSending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
                Test
              </button>
            )}
            <button
              onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
              disabled={loading || permission === 'denied' || actionLoading !== null}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${
                isSubscribed
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  : 'btn-accent'
              }`}
            >
              {actionLoading === 'subscribe' || actionLoading === 'unsubscribe' ? (
                <Loader2 className="animate-spin" size={18} />
              ) : isSubscribed ? (
                <BellOff size={18} />
              ) : (
                <Bell size={18} />
              )}
              {isSubscribed ? 'Deaktivieren' : 'Aktivieren'}
            </button>
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
                Benachrichtigungen wurden in Ihrem Browser blockiert. Bitte aktivieren Sie sie in den Browser-Einstellungen für diese Website.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Notification Preferences */}
      {preferences && isSubscribed && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">
            Benachrichtigungseinstellungen
          </h4>
          <div className="space-y-3">
            <PreferenceToggle
              label="Push-Benachrichtigungen aktiviert"
              description="Alle Push-Benachrichtigungen aktivieren/deaktivieren"
              checked={preferences.push_enabled}
              onChange={(v) => handlePreferenceChange('push_enabled', v)}
            />
            <div className={preferences.push_enabled ? '' : 'opacity-50 pointer-events-none'}>
              <PreferenceToggle
                label="Neues Ticket erstellt"
                description="Benachrichtigung bei neuen Tickets"
                checked={preferences.push_on_new_ticket}
                onChange={(v) => handlePreferenceChange('push_on_new_ticket', v)}
              />
              <PreferenceToggle
                label="Neuer Kommentar"
                description="Benachrichtigung bei neuen Kommentaren"
                checked={preferences.push_on_ticket_comment}
                onChange={(v) => handlePreferenceChange('push_on_ticket_comment', v)}
              />
              <PreferenceToggle
                label="Ticket zugewiesen"
                description="Benachrichtigung wenn Ihnen ein Ticket zugewiesen wird"
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
      )}

      {/* Registered Devices */}
      {subscriptions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-4">
            Registrierte Geräte ({subscriptions.length})
          </h4>
          <div className="space-y-2">
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="text-gray-500 dark:text-gray-400" size={18} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {sub.device_name || 'Unbekanntes Gerät'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Registriert: {new Date(sub.created_at).toLocaleDateString('de-DE')}
                      {sub.last_used_at && (
                        <> · Zuletzt: {new Date(sub.last_used_at).toLocaleDateString('de-DE')}</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteSubscription(sub.id)}
                  disabled={actionLoading === `delete-${sub.id}`}
                  className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg disabled:opacity-50"
                  title="Gerät entfernen"
                >
                  {actionLoading === `delete-${sub.id}` ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
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
}

const PreferenceToggle = ({ label, description, checked, onChange }: PreferenceToggleProps) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
    <div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-gray-600'
      }`}
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
