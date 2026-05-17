import React, { useState, useEffect } from 'react';
import { Shield, Check, X, Copy, Key, AlertTriangle, RefreshCw, Eye, EyeOff, Smartphone, Trash2, Monitor } from 'lucide-react';
import { mfaApi, TrustedDevice } from '../services/api';
import { Modal } from './Modal';
import { Button, IconButton } from './ui/Button';

interface MFASettingsProps {
  onStatusChange?: (enabled: boolean) => void;
}

export const MFASettings: React.FC<MFASettingsProps> = ({ onStatusChange }) => {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoveryCodesRemaining, setRecoveryCodesRemaining] = useState<number | null>(null);

  // Setup state
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<'qr' | 'verify' | 'recovery'>('qr');
  const [setupData, setSetupData] = useState<{
    qrCode: string;
    secret: string;
    recoveryCodes: string[];
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);

  // Disable state
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [showDisablePassword, setShowDisablePassword] = useState(false);

  // Regenerate recovery codes state
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [regeneratePassword, setRegeneratePassword] = useState('');
  const [regenerateCode, setRegenerateCode] = useState('');
  const [regenerateError, setRegenerateError] = useState('');
  const [regenerateLoading, setRegenerateLoading] = useState(false);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [showRegeneratePassword, setShowRegeneratePassword] = useState(false);

  // Trusted devices state
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [trustedDevicesLoading, setTrustedDevicesLoading] = useState(false);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const status = await mfaApi.getStatus();
      setMfaEnabled(status.enabled);

      if (status.enabled) {
        const codesStatus = await mfaApi.getRecoveryCodesCount();
        setRecoveryCodesRemaining(codesStatus.remaining);
        // Load trusted devices
        await loadTrustedDevices();
      }
    } catch (error) {
      console.error('Failed to load MFA status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrustedDevices = async () => {
    try {
      setTrustedDevicesLoading(true);
      const response = await mfaApi.getTrustedDevices();
      setTrustedDevices(response.devices || []);
    } catch (error) {
      console.error('Failed to load trusted devices:', error);
    } finally {
      setTrustedDevicesLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      setRemovingDeviceId(deviceId);
      await mfaApi.removeTrustedDevice(deviceId);
      setTrustedDevices(prev => prev.filter(d => d.id !== deviceId));
    } catch (error) {
      console.error('Failed to remove device:', error);
    } finally {
      setRemovingDeviceId(null);
    }
  };

  const handleRemoveAllDevices = async () => {
    try {
      setTrustedDevicesLoading(true);
      await mfaApi.removeAllTrustedDevices();
      setTrustedDevices([]);
      // Also clear local device token
      localStorage.removeItem('device_token');
    } catch (error) {
      console.error('Failed to remove all devices:', error);
    } finally {
      setTrustedDevicesLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStartSetup = async () => {
    try {
      setSetupLoading(true);
      setSetupError('');
      const data = await mfaApi.setup();
      setSetupData({
        qrCode: data.qrCode,
        secret: data.manualEntryKey,
        recoveryCodes: data.recoveryCodes,
      });
      setSetupStep('qr');
      setSetupModalOpen(true);
    } catch (error: any) {
      setSetupError(error.message || 'Fehler beim Starten der MFA-Einrichtung');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleVerifySetup = async () => {
    if (verifyCode.length !== 6) {
      setSetupError('Bitte gib einen 6-stelligen Code ein');
      return;
    }

    try {
      setSetupLoading(true);
      setSetupError('');
      await mfaApi.verifySetup(verifyCode);
      setSetupStep('recovery');
    } catch (error: any) {
      setSetupError(error.message || 'Ungültiger Code');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleCompleteSetup = () => {
    setSetupModalOpen(false);
    setSetupData(null);
    setVerifyCode('');
    setSetupStep('qr');
    setMfaEnabled(true);
    setRecoveryCodesRemaining(8);
    onStatusChange?.(true);
  };

  const handleDisable = async () => {
    if (!disablePassword || disableCode.length !== 6) {
      setDisableError('Bitte Passwort und 6-stelligen Code eingeben');
      return;
    }

    try {
      setDisableLoading(true);
      setDisableError('');
      await mfaApi.disable(disablePassword, disableCode);
      setDisableModalOpen(false);
      setDisablePassword('');
      setDisableCode('');
      setMfaEnabled(false);
      setRecoveryCodesRemaining(null);
      onStatusChange?.(false);
    } catch (error: any) {
      setDisableError(error.message || 'Fehler beim Deaktivieren');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    if (!regeneratePassword || regenerateCode.length !== 6) {
      setRegenerateError('Bitte Passwort und 6-stelligen Code eingeben');
      return;
    }

    try {
      setRegenerateLoading(true);
      setRegenerateError('');
      const result = await mfaApi.regenerateRecoveryCodes(regeneratePassword, regenerateCode);
      setNewRecoveryCodes(result.recoveryCodes);
      setRecoveryCodesRemaining(8);
    } catch (error: any) {
      setRegenerateError(error.message || 'Fehler beim Generieren neuer Codes');
    } finally {
      setRegenerateLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyAllRecoveryCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join('\n'));
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-200 dark:bg-dark-200 rounded-xl"></div>
          <div className="space-y-2">
            <div className="h-5 bg-gray-200 dark:bg-dark-200 rounded w-48"></div>
            <div className="h-4 bg-gray-200 dark:bg-dark-200 rounded w-32"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-200 p-6 shadow-md">
        <div className="flex items-center gap-3 mb-5">
          <div className={`p-3 rounded-xl ${mfaEnabled ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-dark-200'}`}>
            <Shield size={24} className={mfaEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-dark-400'} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Zwei-Faktor-Authentifizierung (2FA)
            </h3>
            <p className="text-sm text-gray-500 dark:text-dark-400">
              {mfaEnabled ? 'Aktiv - Dein Konto ist zusätzlich geschützt' : 'Schütze dein Konto mit einem zweiten Faktor'}
            </p>
          </div>
        </div>

        {mfaEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-lg">
              <Check size={20} />
              <span className="font-medium">2FA ist aktiviert</span>
            </div>

            {recoveryCodesRemaining !== null && recoveryCodesRemaining < 4 && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-lg">
                <AlertTriangle size={20} />
                <span>Nur noch {recoveryCodesRemaining} Wiederherstellungscodes übrig</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setRegeneratePassword('');
                  setRegenerateCode('');
                  setRegenerateError('');
                  setNewRecoveryCodes(null);
                  setRegenerateModalOpen(true);
                }}
                variant="secondary"
                icon={<RefreshCw size={18} />}
              >
                Neue Wiederherstellungscodes
              </Button>
              <Button
                onClick={() => {
                  setDisablePassword('');
                  setDisableCode('');
                  setDisableError('');
                  setDisableModalOpen(true);
                }}
                variant="danger"
                icon={<X size={18} />}
              >
                2FA deaktivieren
              </Button>
            </div>

            {/* Trusted Devices Section */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Smartphone size={20} className="text-gray-500 dark:text-dark-400" />
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    Vertrauenswürdige Geräte
                  </h4>
                </div>
                {trustedDevices.length > 0 && (
                  <Button
                    onClick={handleRemoveAllDevices}
                    loading={trustedDevicesLoading}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 dark:text-red-400"
                  >
                    Alle entfernen
                  </Button>
                )}
              </div>

              {trustedDevicesLoading ? (
                <div className="text-center py-4 text-gray-500 dark:text-dark-400">
                  Lädt...
                </div>
              ) : trustedDevices.length === 0 ? (
                <div className="text-center py-4 text-gray-500 dark:text-dark-400 text-sm">
                  Keine vertrauenswürdigen Geräte registriert.
                  <br />
                  <span className="text-xs">
                    Aktiviere "Diesem Gerät vertrauen" beim nächsten Login.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {trustedDevices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Monitor size={20} className="text-gray-400 dark:text-dark-400" />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white text-sm">
                            {device.deviceName}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-dark-400">
                            {device.browser} · {device.os}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-dark-500">
                            Zuletzt: {formatDate(device.lastUsedAt)} · Gültig bis: {formatDate(device.expiresAt)}
                          </div>
                        </div>
                      </div>
                      <IconButton
                        onClick={() => handleRemoveDevice(device.id)}
                        disabled={removingDeviceId === device.id}
                        icon={<Trash2 size={18} />}
                        variant="danger"
                        tooltip="Gerät entfernen"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-dark-300">
              Aktiviere die Zwei-Faktor-Authentifizierung für zusätzliche Sicherheit.
              Du benötigst eine Authenticator-App wie:
            </p>
            <ul className="list-disc list-inside text-gray-600 dark:text-dark-300 ml-2 space-y-1">
              <li>Microsoft Authenticator</li>
              <li>Google Authenticator</li>
              <li>Authy</li>
            </ul>

            <Button
              onClick={handleStartSetup}
              loading={setupLoading}
              icon={<Key size={18} />}
              size="lg"
            >
              {setupLoading ? 'Wird eingerichtet...' : '2FA aktivieren'}
            </Button>

            {setupError && (
              <p className="text-red-600 dark:text-red-400 text-sm">{setupError}</p>
            )}
          </div>
        )}
      </div>

      {/* Setup Modal */}
      <Modal
        isOpen={setupModalOpen}
        onClose={() => {
          if (setupStep !== 'recovery') {
            setSetupModalOpen(false);
          }
        }}
        title={
          setupStep === 'qr' ? '2FA einrichten - Schritt 1' :
          setupStep === 'verify' ? '2FA einrichten - Schritt 2' :
          '2FA eingerichtet!'
        }
        maxWidth="lg"
      >
        <div className="space-y-6">
          {setupStep === 'qr' && setupData && (
            <>
              <p className="text-gray-600 dark:text-dark-300">
                Scanne den QR-Code mit deiner Authenticator-App:
              </p>

              <div className="flex justify-center p-4 bg-white rounded-xl">
                <img src={setupData.qrCode} alt="QR Code" className="w-48 h-48" />
              </div>

              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-dark-400 mb-2">
                  Oder gib diesen Code manuell ein:
                </p>
                <div className="flex items-center justify-center gap-2">
                  <code className="px-3 py-2 bg-gray-100 dark:bg-dark-200 rounded font-mono text-sm">
                    {setupData.secret}
                  </code>
                  <IconButton
                    onClick={() => copyToClipboard(setupData.secret)}
                    icon={<Copy size={16} />}
                    tooltip="Kopieren"
                  />
                </div>
              </div>

              <Button
                onClick={() => setSetupStep('verify')}
                fullWidth
                size="lg"
              >
                Weiter
              </Button>
            </>
          )}

          {setupStep === 'verify' && (
            <>
              <p className="text-gray-600 dark:text-dark-300">
                Gib den 6-stelligen Code aus deiner Authenticator-App ein:
              </p>

              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary"
                autoFocus
              />

              {setupError && (
                <p className="text-red-600 dark:text-red-400 text-sm text-center">{setupError}</p>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={() => setSetupStep('qr')}
                  variant="secondary"
                  size="lg"
                  fullWidth
                >
                  Zurück
                </Button>
                <Button
                  onClick={handleVerifySetup}
                  disabled={verifyCode.length !== 6}
                  loading={setupLoading}
                  size="lg"
                  fullWidth
                >
                  {setupLoading ? 'Wird überprüft...' : 'Bestätigen'}
                </Button>
              </div>
            </>
          )}

          {setupStep === 'recovery' && setupData && (
            <>
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-lg">
                <Check size={20} />
                <span className="font-medium">2FA wurde erfolgreich aktiviert!</span>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Speichere diese Wiederherstellungscodes!
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      Falls du keinen Zugriff auf deine Authenticator-App hast, kannst du diese Codes verwenden.
                      Jeder Code kann nur einmal verwendet werden.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-100 dark:bg-dark-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {setupData.recoveryCodes.map((code, index) => (
                    <div key={index} className="px-3 py-2 bg-white dark:bg-dark-100 rounded text-center">
                      {code}
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => copyAllRecoveryCodes(setupData.recoveryCodes)}
                  variant="secondary"
                  fullWidth
                  icon={<Copy size={16} />}
                  className="mt-3"
                >
                  Alle Codes kopieren
                </Button>
              </div>

              <Button
                onClick={handleCompleteSetup}
                fullWidth
                size="lg"
              >
                Fertig
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* Disable Modal */}
      <Modal
        isOpen={disableModalOpen}
        onClose={() => setDisableModalOpen(false)}
        title="2FA deaktivieren"
      >
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">
                Das Deaktivieren der 2FA macht dein Konto weniger sicher.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
              Passwort
            </label>
            <div className="relative">
              <input
                type={showDisablePassword ? 'text' : 'password'}
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Dein Passwort"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white pr-10"
              />
              <IconButton
                type="button"
                onClick={() => setShowDisablePassword(!showDisablePassword)}
                icon={showDisablePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
              Authenticator-Code
            </label>
            <input
              type="text"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-stelliger Code"
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white font-mono tracking-widest"
            />
          </div>

          {disableError && (
            <p className="text-red-600 dark:text-red-400 text-sm">{disableError}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setDisableModalOpen(false)}
              variant="secondary"
              fullWidth
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleDisable}
              loading={disableLoading}
              variant="danger"
              fullWidth
            >
              {disableLoading ? 'Wird deaktiviert...' : 'Deaktivieren'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Regenerate Recovery Codes Modal */}
      <Modal
        isOpen={regenerateModalOpen}
        onClose={() => {
          if (!newRecoveryCodes) {
            setRegenerateModalOpen(false);
          }
        }}
        title="Neue Wiederherstellungscodes"
      >
        <div className="space-y-4">
          {!newRecoveryCodes ? (
            <>
              <p className="text-gray-600 dark:text-dark-300">
                Generiere neue Wiederherstellungscodes. Die alten Codes werden ungültig.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                  Passwort
                </label>
                <div className="relative">
                  <input
                    type={showRegeneratePassword ? 'text' : 'password'}
                    value={regeneratePassword}
                    onChange={(e) => setRegeneratePassword(e.target.value)}
                    placeholder="Dein Passwort"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white pr-10"
                  />
                  <IconButton
                    type="button"
                    onClick={() => setShowRegeneratePassword(!showRegeneratePassword)}
                    icon={showRegeneratePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-300 mb-1">
                  Authenticator-Code
                </label>
                <input
                  type="text"
                  value={regenerateCode}
                  onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-stelliger Code"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-200 rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white font-mono tracking-widest"
                />
              </div>

              {regenerateError && (
                <p className="text-red-600 dark:text-red-400 text-sm">{regenerateError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setRegenerateModalOpen(false)}
                  variant="secondary"
                  fullWidth
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleRegenerateRecoveryCodes}
                  loading={regenerateLoading}
                  fullWidth
                >
                  {regenerateLoading ? 'Wird generiert...' : 'Generieren'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-lg">
                <Check size={20} />
                <span className="font-medium">Neue Codes wurden generiert!</span>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Speichere diese Codes sicher! Die alten Codes sind nicht mehr gültig.
                  </p>
                </div>
              </div>

              <div className="bg-gray-100 dark:bg-dark-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {newRecoveryCodes.map((code, index) => (
                    <div key={index} className="px-3 py-2 bg-white dark:bg-dark-100 rounded text-center">
                      {code}
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => copyAllRecoveryCodes(newRecoveryCodes)}
                  variant="secondary"
                  fullWidth
                  icon={<Copy size={16} />}
                  className="mt-3"
                >
                  Alle Codes kopieren
                </Button>
              </div>

              <Button
                onClick={() => {
                  setRegenerateModalOpen(false);
                  setNewRecoveryCodes(null);
                }}
                fullWidth
                size="lg"
              >
                Fertig
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};

export default MFASettings;
