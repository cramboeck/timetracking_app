import { useState } from 'react';
import { Ticket, Lock, Mail, AlertCircle, ArrowRight, Shield, Info, X } from 'lucide-react';
import { customerPortalApi, PortalContact } from '../../services/api';

interface PortalLoginProps {
  onLoginSuccess: (contact: PortalContact) => void;
}

export const PortalLogin = ({ onLoginSuccess }: PortalLoginProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLegal, setShowLegal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await customerPortalApi.login(email, password);
      if (result.success && result.contact) {
        onLoginSuccess(result.contact);
      } else {
        setError('Anmeldung fehlgeschlagen');
      }
    } catch (err) {
      console.error('Portal login error:', err);
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4">
            <Ticket size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kundenportal
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Melden Sie sich an, um Ihre Tickets zu verwalten
          </p>
        </div>

        {/* Login Form */}
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
                E-Mail-Adresse
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ihre@email.de"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Ihr Passwort"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Anmelden...
                </>
              ) : (
                <>
                  Anmelden
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Probleme beim Anmelden? Kontaktieren Sie Ihren Dienstleister.
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Datenschutz
            </button>
            <button
              type="button"
              onClick={() => setShowLegal(true)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Impressum
            </button>
          </div>
        </div>
      </div>

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Datenschutzerklärung
                </h2>
              </div>
              <button
                onClick={() => setShowPrivacy(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  <strong>Stand:</strong> {new Date().toLocaleDateString('de-DE')}
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  1. Verantwortlicher
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Verantwortlich für die Datenverarbeitung auf diesem Portal ist der Betreiber
                  dieses Kundenportals.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  2. Erhobene Daten
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Im Rahmen der Nutzung dieses Kundenportals werden folgende Daten verarbeitet:
                </p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                  <li>Name und E-Mail-Adresse (für Ihren Zugang)</li>
                  <li>Support-Tickets und deren Inhalte</li>
                  <li>Hochgeladene Dateien und Anhänge</li>
                  <li>Technische Zugriffsdaten (IP-Adresse, Browser)</li>
                </ul>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  3. Zweck der Verarbeitung
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Die Daten werden ausschließlich zur Erbringung von Support-Leistungen und zur
                  Kommunikation im Rahmen bestehender Geschäftsbeziehungen verwendet.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  4. Ihre Rechte
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung
                  der Verarbeitung Ihrer personenbezogenen Daten.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  5. Kontakt
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Bei Fragen zum Datenschutz wenden Sie sich bitte an Ihren Dienstleister.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowPrivacy(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal/Impressum Modal */}
      {showLegal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Impressum
                </h2>
              </div>
              <button
                onClick={() => setShowLegal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Angaben gemäß § 5 TMG
                </h3>

                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Dieses Kundenportal wird betrieben im Rahmen einer Geschäftsbeziehung.
                  Die vollständigen Kontaktdaten entnehmen Sie bitte Ihren Vertragsunterlagen
                  oder wenden Sie sich direkt an Ihren Ansprechpartner.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  Haftung für Inhalte
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Die Inhalte dieses Portals wurden mit größter Sorgfalt erstellt. Für die
                  Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch
                  keine Gewähr übernehmen.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  Urheberrecht
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
                  unterliegen dem deutschen Urheberrecht.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowLegal(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
