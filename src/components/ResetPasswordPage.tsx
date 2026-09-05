import { useNavigate, useSearchParams } from 'react-router';
import { ResetPassword } from './ResetPassword';
import { Button } from './ui';

/**
 * Standalone-Seite für /reset-password?token=…
 *
 * Muss als eigene Route VOR der Catch-all-App-Route registriert sein: die
 * Haupt-App kanonisiert unbekannte Pfade beim Mount per navigate(replace)
 * auf die Default-Ansicht und verwirft dabei die Query — der Reset-Token
 * ging verloren, bevor der Auth-Screen ihn lesen konnte. Als eigene Route
 * funktioniert der Link unabhängig davon, ob im Browser noch eine gültige
 * Session liegt.
 */
export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const goToLogin = () => navigate('/', { replace: true });

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-light to-indigo-100 dark:from-dark-50 dark:to-dark-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl p-8 text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Ungültiger Link
            </h1>
            <p className="text-gray-600 dark:text-dark-400 mb-6">
              Der Link enthält keinen Reset-Token. Bitte fordere über
              „Passwort vergessen" einen neuen Link an.
            </p>
            <Button onClick={goToLogin} variant="primary" fullWidth>
              Zurück zum Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <ResetPassword token={token} onSuccess={goToLogin} onBack={goToLogin} />;
};
