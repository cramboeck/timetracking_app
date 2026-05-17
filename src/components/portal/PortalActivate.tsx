import { useState, useEffect } from 'react';
import { Ticket, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { customerPortalApi } from '../../services/api';

interface PortalActivateProps {
  token: string;
  onActivated: () => void;
}

interface InvitationInfo {
  email: string;
  name: string;
  customerName: string;
}

export const PortalActivate = ({ token, onActivated }: PortalActivateProps) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const result = await customerPortalApi.verifyInvitation(token);
        if (result.valid) {
          setInvitationInfo({
            email: result.email || '',
            name: result.name || '',
            customerName: result.customerName || '',
          });
        } else {
          setTokenInvalid(true);
          setError(result.error || 'Ungültiger Einladungslink');
        }
      } catch (err) {
        setTokenInvalid(true);
        setError(err instanceof Error ? err.message : 'Fehler bei der Überprüfung des Links');
      } finally {
        setVerifying(false);
      }
    };
    verifyToken();
  }, [token]);

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

  // Loading state while verifying token
  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-light to-indigo-100 dark:from-dark-50 dark:to-dark-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-primary text-white mb-4">
            <Loader2 size={32} className="animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Link wird überprüft...
          </h1>
          <p className="text-gray-600 dark:text-dark-400">
            Bitte warten Sie einen Moment.
          </p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (tokenInvalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-light to-indigo-100 dark:from-dark-50 dark:to-dark-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Ungültiger Link
          </h1>
          <p className="text-gray-600 dark:text-dark-400">
            {error || 'Der Aktivierungslink ist ungültig oder abgelaufen.'}
          </p>
          <button
            onClick={onActivated}
            className="mt-6 px-6 py-3 bg-accent-primary hover:bg-accent-primary text-white font-medium rounded-lg transition-colors"
          >
            Zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-light to-indigo-100 dark:from-dark-50 dark:to-dark-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
            <CheckCircle size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Konto aktiviert!
          </h1>
          <p className="text-gray-600 dark:text-dark-400">
            Sie werden zur Anmeldeseite weitergeleitet...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-light to-indigo-100 dark:from-dark-50 dark:to-dark-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-primary text-white mb-4">
            <Ticket size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Konto aktivieren
          </h1>
          <p className="text-gray-600 dark:text-dark-400 mt-2">
            {invitationInfo?.name ? `Willkommen, ${invitationInfo.name}!` : 'Legen Sie ein Passwort fest, um Ihr Konto zu aktivieren'}
          </p>
          {invitationInfo?.customerName && (
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              Unternehmen: {invitationInfo.customerName}
            </p>
          )}
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
                  className="w-full pl-10 pr-12 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
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
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-accent-primary hover:bg-accent-dark disabled:bg-accent-primary/40 text-white font-medium rounded-lg transition-colors"
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
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-dark-400">
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
