import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { customerPortalApi } from '../../services/api';

interface PortalResetPasswordProps {
  token: string;
  onDone: () => void;
}

/**
 * Passwort-Reset-Seite des Kundenportals (/portal/reset-password?token=…
 * bzw. /reset-password auf dem Portal-Host). Der Token kommt aus der
 * „Passwort vergessen"-E-Mail.
 */
export const PortalResetPassword = ({ token, onDone }: PortalResetPasswordProps) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }
    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein');
      return;
    }

    try {
      setLoading(true);
      await customerPortalApi.confirmPasswordReset(token, password);
      setSuccess(true);
      setTimeout(() => onDone(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zurücksetzen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-light to-indigo-100 dark:from-dark-50 dark:to-dark-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl p-8">
          {success ? (
            <div className="text-center">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Passwort geändert
              </h1>
              <p className="text-gray-600 dark:text-dark-400">
                Sie werden zur Anmeldung weitergeleitet …
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex p-3 bg-accent-lighter dark:bg-accent-primary/20 rounded-xl mb-4">
                  <Lock size={28} className="text-accent-primary" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Neues Passwort vergeben
                </h1>
                <p className="text-gray-600 dark:text-dark-400 text-sm">
                  Wählen Sie ein neues, sicheres Passwort für Ihr Kundenportal-Konto.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
                  <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Neues Passwort
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mindestens 8 Zeichen"
                      required
                      minLength={8}
                      className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-dark-400"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Passwort bestätigen
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Passwort wiederholen"
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || password.length < 8}
                  className="w-full py-3 rounded-lg bg-accent-primary text-white font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />}
                  {loading ? 'Wird gespeichert…' : 'Passwort speichern'}
                </button>

                <button
                  type="button"
                  onClick={onDone}
                  className="w-full text-sm text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-white"
                >
                  Zurück zur Anmeldung
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
