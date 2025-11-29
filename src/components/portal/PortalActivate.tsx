import { useState, useEffect } from 'react';
import { Ticket, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { customerPortalApi } from '../../services/api';

interface PortalActivateProps {
  token: string;
  onActivated: () => void;
}

export const PortalActivate = ({ token, onActivated }: PortalActivateProps) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
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
      await customerPortalApi.setPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        onActivated();
      }, 2000);
    } catch (err) {
      console.error('Activation error:', err);
      setError(err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
            <CheckCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Konto aktiviert!
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Sie werden zur Anmeldeseite weitergeleitet...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4">
            <Ticket size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Konto aktivieren
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Legen Sie ein Passwort fest, um Ihr Konto zu aktivieren
          </p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Neues Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Mindestens 8 Zeichen"
                  className="w-full pl-10 pr-12 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Passwort bestätigen
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Passwort wiederholen"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Aktivieren...
                </span>
              ) : (
                'Konto aktivieren'
              )}
            </button>
          </form>
        </div>

        {/* Password requirements */}
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Passwortanforderungen:</p>
          <ul className="mt-2 space-y-1">
            <li className={password.length >= 8 ? 'text-green-600 dark:text-green-400' : ''}>
              Mindestens 8 Zeichen
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
