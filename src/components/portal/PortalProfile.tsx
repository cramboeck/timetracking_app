import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, User, Lock, Eye, EyeOff, Check, Smartphone, Shield, Copy, Trash2, Monitor, AlertCircle, X, Key, Bell, BellRing, Send } from 'lucide-react';
import { customerPortalApi, PortalContact, TrustedDevice } from '../../services/api';

interface PortalProfileProps {
  contact: PortalContact;
  onBack: () => void;
}

export const PortalProfile = ({ contact, onBack }: PortalProfileProps) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // MFA State
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState<{ qrCode: string; secret: string; manualEntryKey: string; recoveryCodes: string[] } | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState(['', '', '', '', '', '']);
  const [mfaSetupError, setMfaSetupError] = useState<string | null>(null);
  const [mfaSetupLoading, setMfaSetupLoading] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodesCount, setRecoveryCodesCount] = useState(0);
  const [showDisableMfa, setShowDisableMfa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [showTrustedDevices, setShowTrustedDevices] = useState(false);
  const mfaInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Notification Preferences State
  const [notifyTicketCreated, setNotifyTicketCreated] = useState(true);
  const [notifyTicketStatusChanged, setNotifyTicketStatusChanged] = useState(true);
  const [notifyTicketReply, setNotifyTicketReply] = useState(true);
  const [notifyLoading, setNotifyLoading] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifySuccess, setNotifySuccess] = useState(false);

  // Push Notification State
  const [pushSupported, setPushSupported] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSubscriptions, setPushSubscriptions] = useState<Array<{ id: string; endpoint: string; device_name: string | null; created_at: string; last_used_at: string | null }>>([]);
  const [pushPrefs, setPushPrefs] = useState({ push_enabled: true, push_on_ticket_reply: true, push_on_status_change: true });
  const [pushLoading, setPushLoading] = useState(true);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushTestSending, setPushTestSending] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  // Load MFA status
  useEffect(() => {
    loadMfaStatus();
  }, []);

  // Load notification preferences
  useEffect(() => {
    loadNotificationPreferences();
  }, []);

  const loadPushData = useCallback(async () => {
    // Check browser support
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setPushSupported(supported);

    if (!supported) {
      setPushLoading(false);
      return;
    }

    // Get permission state
    setPushPermission(Notification.permission);

    try {
      // Get VAPID key
      const vapidRes = await customerPortalApi.push.getVapidPublicKey();
      setVapidPublicKey(vapidRes.publicKey);
      setPushConfigured(vapidRes.configured);

      // Get subscriptions
      const subsRes = await customerPortalApi.push.getSubscriptions();
      setPushSubscriptions(subsRes.data);

      // Check if current device is subscribed
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const isSubscribed = subscription !== null && subsRes.data.some(s => s.endpoint === subscription.endpoint);
        setPushSubscribed(isSubscribed);
      }

      // Get preferences
      const prefsRes = await customerPortalApi.push.getPreferences();
      setPushPrefs(prefsRes.data);
    } catch (err) {
      console.error('Failed to load push data:', err);
      setPushError('Fehler beim Laden der Push-Einstellungen');
    } finally {
      setPushLoading(false);
    }
  }, []);

  // Load push notification data on mount
  useEffect(() => {
    loadPushData();
  }, [loadPushData]);

  // Helper: Convert VAPID key to Uint8Array
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Get device name
  const getDeviceName = (): string => {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android Phone' : 'Android Tablet';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unbekanntes Gerät';
  };

  const handlePushSubscribe = async () => {
    if (!vapidPublicKey || !pushSupported) return;

    setPushError(null);
    setPushLoading(true);

    try {
      // Request permission if needed
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission !== 'granted') {
          setPushError('Benachrichtigungen wurden abgelehnt');
          setPushLoading(false);
          return;
        }
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys) {
        throw new Error('Ungültige Subscription');
      }

      // Send to server
      await customerPortalApi.push.subscribe(
        { endpoint: subJson.endpoint, keys: { p256dh: subJson.keys.p256dh!, auth: subJson.keys.auth! } },
        getDeviceName()
      );

      // Reload data
      await loadPushData();
    } catch (err: any) {
      console.error('Push subscribe error:', err);
      setPushError(err.message || 'Fehler beim Aktivieren der Push-Benachrichtigungen');
    } finally {
      setPushLoading(false);
    }
  };

  const handlePushUnsubscribe = async () => {
    setPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await customerPortalApi.push.unsubscribe(subscription.endpoint);
      }

      await loadPushData();
    } catch (err: any) {
      console.error('Push unsubscribe error:', err);
      setPushError(err.message || 'Fehler beim Deaktivieren');
    } finally {
      setPushLoading(false);
    }
  };

  const handleDeletePushSubscription = async (id: string) => {
    try {
      await customerPortalApi.push.deleteSubscription(id);
      await loadPushData();
    } catch (err) {
      console.error('Delete subscription error:', err);
    }
  };

  const handleUpdatePushPrefs = async (updates: Partial<typeof pushPrefs>) => {
    try {
      await customerPortalApi.push.updatePreferences(updates);
      setPushPrefs(prev => ({ ...prev, ...updates }));
    } catch (err) {
      console.error('Update push prefs error:', err);
    }
  };

  const handleSendPushTest = async () => {
    setPushTestSending(true);
    try {
      await customerPortalApi.push.sendTest();
    } catch (err) {
      console.error('Send test push error:', err);
    } finally {
      setPushTestSending(false);
    }
  };

  const loadNotificationPreferences = async () => {
    try {
      const prefs = await customerPortalApi.getNotificationPreferences();
      setNotifyTicketCreated(prefs.notifyTicketCreated);
      setNotifyTicketStatusChanged(prefs.notifyTicketStatusChanged);
      setNotifyTicketReply(prefs.notifyTicketReply);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleSaveNotificationPreferences = async () => {
    setNotifySaving(true);
    setNotifySuccess(false);
    try {
      await customerPortalApi.updateNotificationPreferences({
        notifyTicketCreated,
        notifyTicketStatusChanged,
        notifyTicketReply,
      });
      setNotifySuccess(true);
      setTimeout(() => setNotifySuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    } finally {
      setNotifySaving(false);
    }
  };

  const loadMfaStatus = async () => {
    try {
      const status = await customerPortalApi.getMfaStatus();
      setMfaEnabled(status.enabled);
      if (status.enabled) {
        const codesCount = await customerPortalApi.getRecoveryCodesCount();
        setRecoveryCodesCount(codesCount.remaining);
        const devicesResult = await customerPortalApi.getTrustedDevices();
        setTrustedDevices(devicesResult.devices || []);
      }
    } catch (err) {
      console.error('Failed to load MFA status:', err);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleStartMfaSetup = async () => {
    setMfaSetupLoading(true);
    setMfaSetupError(null);
    try {
      const data = await customerPortalApi.setupMfa();
      setMfaSetupData(data);
      setShowMfaSetup(true);
      setTimeout(() => mfaInputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setMfaSetupError(err.message || 'Fehler beim Einrichten der 2FA');
    } finally {
      setMfaSetupLoading(false);
    }
  };

  const handleMfaSetupCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...mfaSetupCode];
    newCode[index] = value.slice(-1);
    setMfaSetupCode(newCode);
    if (value && index < 5) {
      mfaInputRefs.current[index + 1]?.focus();
    }
  };

  const handleMfaSetupKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !mfaSetupCode[index] && index > 0) {
      mfaInputRefs.current[index - 1]?.focus();
    }
  };

  const handleMfaSetupPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      const newCode = [...mfaSetupCode];
      for (let i = 0; i < pastedData.length; i++) {
        newCode[i] = pastedData[i];
      }
      setMfaSetupCode(newCode);
    }
  };

  const handleVerifyMfaSetup = async () => {
    const code = mfaSetupCode.join('');
    if (code.length !== 6) return;

    setMfaSetupLoading(true);
    setMfaSetupError(null);
    try {
      await customerPortalApi.verifyMfaSetup(code);
      setMfaEnabled(true);
      setShowMfaSetup(false);
      setShowRecoveryCodes(true);
      setRecoveryCodesCount(mfaSetupData?.recoveryCodes.length || 8);
    } catch (err: any) {
      setMfaSetupError(err.message || 'Ungültiger Code');
      setMfaSetupCode(['', '', '', '', '', '']);
      mfaInputRefs.current[0]?.focus();
    } finally {
      setMfaSetupLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disablePassword || !disableCode) return;
    setDisableLoading(true);
    setDisableError(null);
    try {
      await customerPortalApi.disableMfa(disablePassword, disableCode);
      setMfaEnabled(false);
      setShowDisableMfa(false);
      setDisablePassword('');
      setDisableCode('');
      setTrustedDevices([]);
    } catch (err: any) {
      setDisableError(err.message || 'Fehler beim Deaktivieren der 2FA');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRemoveTrustedDevice = async (deviceId: string) => {
    try {
      await customerPortalApi.removeTrustedDevice(deviceId);
      setTrustedDevices(prev => prev.filter(d => d.id !== deviceId));
    } catch (err) {
      console.error('Failed to remove trusted device:', err);
    }
  };

  const handleRemoveAllTrustedDevices = async () => {
    try {
      await customerPortalApi.removeAllTrustedDevices();
      setTrustedDevices([]);
    } catch (err) {
      console.error('Failed to remove all trusted devices:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Das neue Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein');
      return;
    }

    try {
      setLoading(true);
      await customerPortalApi.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Ändern des Passworts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Profil & Einstellungen
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Verwalten Sie Ihre Kontodaten
            </p>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <User size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {contact.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400">{contact.email}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {contact.customerName}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Tickets erstellen
            </p>
            <p className="font-medium text-gray-900 dark:text-white">
              {contact.canCreateTickets ? 'Ja' : 'Nein'}
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Alle Tickets sehen
            </p>
            <p className="font-medium text-gray-900 dark:text-white">
              {contact.canViewAllTickets ? 'Ja' : 'Nur eigene'}
            </p>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Lock size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Passwort ändern
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aktualisieren Sie Ihr Passwort regelmäßig
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3">
            <Check className="text-green-600 dark:text-green-400" size={20} />
            <p className="text-green-700 dark:text-green-300">
              Passwort wurde erfolgreich geändert!
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Aktuelles Passwort
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="Ihr aktuelles Passwort"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Neues Passwort
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="Mindestens 8 Zeichen"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Neues Passwort bestätigen
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Passwort wiederholen"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium transition-colors"
          >
            {loading ? 'Wird geändert...' : 'Passwort ändern'}
          </button>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Smartphone size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Zwei-Faktor-Authentifizierung (2FA)
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Zusätzliche Sicherheit für Ihr Konto
            </p>
          </div>
          {!mfaLoading && (
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${mfaEnabled
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {mfaEnabled ? 'Aktiviert' : 'Deaktiviert'}
            </div>
          )}
        </div>

        {mfaLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : mfaEnabled ? (
          <div className="space-y-4">
            {/* Recovery Codes Status */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center gap-3">
                <Key size={20} className="text-gray-500 dark:text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Wiederherstellungscodes</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {recoveryCodesCount} Code{recoveryCodesCount !== 1 ? 's' : ''} verfügbar
                  </p>
                </div>
              </div>
              {recoveryCodesCount <= 2 && (
                <span className="text-amber-600 dark:text-amber-400 text-sm">
                  Bald erneuern
                </span>
              )}
            </div>

            {/* Trusted Devices */}
            {trustedDevices.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Monitor size={18} className="text-gray-500 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      Vertrauenswürdige Geräte ({trustedDevices.length})
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTrustedDevices(!showTrustedDevices)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showTrustedDevices ? 'Ausblenden' : 'Anzeigen'}
                  </button>
                </div>
                {showTrustedDevices && (
                  <div className="space-y-2">
                    {trustedDevices.map(device => (
                      <div key={device.id} className="flex items-center justify-between py-2 border-t border-gray-200 dark:border-gray-600">
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {device.browser} auf {device.os}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Zuletzt: {new Date(device.lastUsedAt).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveTrustedDevice(device.id)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleRemoveAllTrustedDevices}
                      className="w-full mt-2 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      Alle Geräte entfernen
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Disable MFA */}
            <button
              onClick={() => setShowDisableMfa(true)}
              className="w-full py-3 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-xl font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              2FA deaktivieren
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Schützen Sie Ihr Konto mit einem zusätzlichen Sicherheitscode bei der Anmeldung.
              Sie benötigen eine Authenticator-App wie Google Authenticator oder Microsoft Authenticator.
            </p>
            {mfaSetupError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                <AlertCircle size={18} />
                <span>{mfaSetupError}</span>
              </div>
            )}
            <button
              onClick={handleStartMfaSetup}
              disabled={mfaSetupLoading}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {mfaSetupLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Wird vorbereitet...
                </>
              ) : (
                <>
                  <Shield size={20} />
                  2FA aktivieren
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Email Notification Preferences */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Bell size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              E-Mail-Benachrichtigungen
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Wählen Sie, welche Benachrichtigungen Sie erhalten möchten
            </p>
          </div>
        </div>

        {notifyLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {notifySuccess && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-2">
                <Check className="text-green-600 dark:text-green-400" size={18} />
                <p className="text-sm text-green-700 dark:text-green-300">
                  Einstellungen gespeichert!
                </p>
              </div>
            )}

            <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Ticket erstellt</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Bestätigung wenn Sie ein neues Ticket erstellen
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifyTicketCreated}
                onChange={(e) => setNotifyTicketCreated(e.target.checked)}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Status geändert</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Wenn sich der Status eines Tickets ändert
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifyTicketStatusChanged}
                onChange={(e) => setNotifyTicketStatusChanged(e.target.checked)}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Neue Antwort</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Wenn eine neue Antwort zu Ihrem Ticket hinzugefügt wird
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifyTicketReply}
                onChange={(e) => setNotifyTicketReply(e.target.checked)}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
              />
            </label>

            <button
              onClick={handleSaveNotificationPreferences}
              disabled={notifySaving}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium transition-colors"
            >
              {notifySaving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
            </button>
          </div>
        )}
      </div>

      {/* Push Notifications */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <BellRing size={20} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Push-Benachrichtigungen
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Erhalten Sie sofortige Benachrichtigungen auf diesem Gerät
            </p>
          </div>
        </div>

        {pushLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !pushSupported ? (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <AlertCircle size={18} />
              <p className="text-sm">
                Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.
              </p>
            </div>
          </div>
        ) : !pushConfigured ? (
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Push-Benachrichtigungen sind derzeit nicht verfügbar.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pushError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
                <AlertCircle className="text-red-600 dark:text-red-400" size={18} />
                <p className="text-sm text-red-700 dark:text-red-300">{pushError}</p>
              </div>
            )}

            {pushPermission === 'denied' && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Benachrichtigungen wurden blockiert. Bitte erlauben Sie Benachrichtigungen in den Browser-Einstellungen.
                </p>
              </div>
            )}

            {/* Subscribe/Unsubscribe Button */}
            <div className="flex gap-3">
              {pushSubscribed ? (
                <>
                  <button
                    onClick={handlePushUnsubscribe}
                    disabled={pushLoading}
                    className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
                  >
                    Deaktivieren
                  </button>
                  <button
                    onClick={handleSendPushTest}
                    disabled={pushTestSending}
                    className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                  >
                    <Send size={16} />
                    {pushTestSending ? 'Sende...' : 'Test'}
                  </button>
                </>
              ) : (
                <button
                  onClick={handlePushSubscribe}
                  disabled={pushLoading || pushPermission === 'denied'}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <BellRing size={18} />
                  Push-Benachrichtigungen aktivieren
                </button>
              )}
            </div>

            {/* Push Preferences */}
            {pushSubscribed && (
              <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Benachrichtigen bei:</p>

                <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <span className="text-sm text-gray-900 dark:text-white">Neue Antworten</span>
                  <input
                    type="checkbox"
                    checked={pushPrefs.push_on_ticket_reply}
                    onChange={(e) => handleUpdatePushPrefs({ push_on_ticket_reply: e.target.checked })}
                    className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <span className="text-sm text-gray-900 dark:text-white">Status-Änderungen</span>
                  <input
                    type="checkbox"
                    checked={pushPrefs.push_on_status_change}
                    onChange={(e) => handleUpdatePushPrefs({ push_on_status_change: e.target.checked })}
                    className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500"
                  />
                </label>
              </div>
            )}

            {/* Registered Devices */}
            {pushSubscriptions.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Registrierte Geräte ({pushSubscriptions.length})
                </p>
                <div className="space-y-2">
                  {pushSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone size={18} className="text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {sub.device_name || 'Unbekanntes Gerät'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Hinzugefügt: {new Date(sub.created_at).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePushSubscription(sub.id)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Entfernen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MFA Setup Modal */}
      {showMfaSetup && mfaSetupData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                2FA einrichten
              </h3>
              <button
                onClick={() => {
                  setShowMfaSetup(false);
                  setMfaSetupCode(['', '', '', '', '', '']);
                  setMfaSetupError(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* QR Code */}
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Scannen Sie diesen QR-Code mit Ihrer Authenticator-App
                </p>
                <div className="inline-block p-4 bg-white rounded-xl border border-gray-200">
                  <img src={mfaSetupData.qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>

              {/* Manual Entry Key */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Oder manuell eingeben:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-600 break-all">
                    {mfaSetupData.manualEntryKey}
                  </code>
                  <button
                    onClick={() => copyToClipboard(mfaSetupData.manualEntryKey)}
                    className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>

              {/* Verification Code Input */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 text-center">
                  Geben Sie den 6-stelligen Code aus Ihrer App ein
                </p>
                {mfaSetupError && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm text-center">
                    {mfaSetupError}
                  </div>
                )}
                <div className="flex justify-center gap-2 mb-4">
                  {mfaSetupCode.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => mfaInputRefs.current[index] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleMfaSetupCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleMfaSetupKeyDown(index, e)}
                      onPaste={handleMfaSetupPaste}
                      disabled={mfaSetupLoading}
                      className="w-11 h-13 text-center text-xl font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ))}
                </div>
                <button
                  onClick={handleVerifyMfaSetup}
                  disabled={mfaSetupLoading || mfaSetupCode.join('').length !== 6}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-medium"
                >
                  {mfaSetupLoading ? 'Wird überprüft...' : 'Bestätigen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Codes Modal */}
      {showRecoveryCodes && mfaSetupData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Wiederherstellungscodes
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Speichern Sie diese Codes an einem sicheren Ort
              </p>
            </div>
            <div className="p-6">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-4">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Diese Codes werden nur einmal angezeigt. Sie können sie verwenden, wenn Sie keinen Zugriff auf Ihre Authenticator-App haben.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {mfaSetupData.recoveryCodes.map((code, index) => (
                  <div key={index} className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-center">
                    {code}
                  </div>
                ))}
              </div>
              <button
                onClick={() => copyToClipboard(mfaSetupData.recoveryCodes.join('\n'))}
                className="w-full py-2 border border-gray-300 dark:border-gray-600 rounded-xl flex items-center justify-center gap-2 mb-4 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Copy size={18} />
                Alle kopieren
              </button>
              <button
                onClick={() => {
                  setShowRecoveryCodes(false);
                  setMfaSetupData(null);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable MFA Modal */}
      {showDisableMfa && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                2FA deaktivieren
              </h3>
              <button
                onClick={() => {
                  setShowDisableMfa(false);
                  setDisablePassword('');
                  setDisableCode('');
                  setDisableError(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <p className="text-sm text-red-700 dark:text-red-400">
                  Achtung: Die Deaktivierung der 2FA verringert die Sicherheit Ihres Kontos.
                </p>
              </div>

              {disableError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  {disableError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Passwort
                </label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ihr Passwort"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  2FA-Code
                </label>
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="6-stelliger Code"
                />
              </div>

              <button
                onClick={handleDisableMfa}
                disabled={disableLoading || !disablePassword || disableCode.length !== 6}
                className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-xl font-medium"
              >
                {disableLoading ? 'Wird deaktiviert...' : '2FA deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
