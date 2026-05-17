import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { passwordResetApi } from '../services/api';
import { Button } from './ui/Button';

interface ForgotPasswordProps {
  onBack: () => void;
}

export const ForgotPassword = ({ onBack }: ForgotPasswordProps) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setDevToken(null);

    try {
      console.log('🔑 [FORGOT-PASSWORD] Requesting reset for:', email);
      const result = await passwordResetApi.requestReset(email);

      console.log('✅ [FORGOT-PASSWORD] Request successful:', result);
      setMessage({ type: 'success', text: result.message });

      // In development, show the token
      if (result.devToken) {
        setDevToken(result.devToken);
      }

      setEmail('');
    } catch (error: any) {
      console.error('❌ [FORGOT-PASSWORD] Request failed:', error);
      setMessage({ type: 'error', text: error.message || 'Ein Fehler ist aufgetreten' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <Button
            onClick={onBack}
            variant="ghost"
            icon={<ArrowLeft size={20} />}
            className="mb-6"
          >
            Zurück zum Login
          </Button>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Passwort vergessen?
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen.
            </p>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
            }`}>
              <p className="text-sm">{message.text}</p>
            </div>
          )}

          {devToken && (
            <div className="mb-6 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                🔧 Development Mode - Reset Token:
              </p>
              <div className="bg-white dark:bg-gray-900 p-3 rounded border border-yellow-300 dark:border-yellow-700 font-mono text-xs break-all text-gray-800 dark:text-gray-200">
                {devToken}
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                Kopiere diesen Token und verwende ihn auf der Passwort-Zurücksetzen Seite.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-primary dark:focus:ring-blue-400 transition-colors"
              />
            </div>

            <Button
              type="submit"
              loading={isLoading}
              fullWidth
              size="lg"
            >
              {isLoading ? 'Wird gesendet...' : 'Reset-Link senden'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
