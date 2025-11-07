import { useState, useEffect } from 'react';
import { X, Settings, Shield, Check } from 'lucide-react';

interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // Always required
    functional: true,
    analytics: false,
    marketing: false
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
      // Show banner after a short delay
      setTimeout(() => setIsVisible(true), 1000);
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true
    };
    savePreferences(allAccepted);
  };

  const handleAcceptNecessary = () => {
    const necessaryOnly: CookiePreferences = {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false
    };
    savePreferences(necessaryOnly);
  };

  const handleSaveCustom = () => {
    savePreferences(preferences);
  };

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem('cookieConsent', JSON.stringify({
      preferences: prefs,
      timestamp: new Date().toISOString()
    }));
    setIsVisible(false);
    setShowSettings(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-4xl bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
        {!showSettings ? (
          // Simple consent banner
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  🍪 Cookie-Einstellungen
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Wir verwenden Cookies und ähnliche Technologien, um Ihre Erfahrung zu verbessern,
                  unsere Dienste zu personalisieren und unseren Datenverkehr zu analysieren.
                  Durch Klicken auf "Alle akzeptieren" stimmen Sie der Verwendung aller Cookies zu.
                  Sie können Ihre Einstellungen jederzeit in den Datenschutzeinstellungen ändern.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleAcceptAll}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Alle akzeptieren
                  </button>
                  <button
                    onClick={handleAcceptNecessary}
                    className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                  >
                    Nur notwendige
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Einstellungen
                  </button>
                </div>
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  Weitere Informationen finden Sie in unserer{' '}
                  <a href="#datenschutz" className="text-blue-600 hover:underline">
                    Datenschutzerklärung
                  </a>
                  .
                </p>
              </div>
              <button
                onClick={handleAcceptNecessary}
                className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Schließen"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        ) : (
          // Detailed settings
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Cookie-Einstellungen anpassen
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {/* Necessary cookies */}
              <div className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center h-6">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Notwendige Cookies
                    </h4>
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                      Erforderlich
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Diese Cookies sind für die Grundfunktionen der Website erforderlich und können nicht deaktiviert werden.
                    Sie speichern Ihre Login-Informationen, Spracheinstellungen und andere wesentliche Funktionen.
                  </p>
                </div>
              </div>

              {/* Functional cookies */}
              <div className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center h-6">
                  <input
                    type="checkbox"
                    checked={preferences.functional}
                    onChange={(e) => setPreferences({ ...preferences, functional: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                    Funktionale Cookies
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Diese Cookies ermöglichen erweiterte Funktionen wie Benachrichtigungen,
                    personalisierte Einstellungen und verbesserte Benutzererfahrung.
                  </p>
                </div>
              </div>

              {/* Analytics cookies */}
              <div className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center h-6">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                    Analyse-Cookies
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Diese Cookies helfen uns zu verstehen, wie Besucher mit unserer Website interagieren,
                    indem sie Informationen anonym sammeln und melden.
                  </p>
                </div>
              </div>

              {/* Marketing cookies */}
              <div className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center h-6">
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={(e) => setPreferences({ ...preferences, marketing: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1">
                    Marketing-Cookies
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Diese Cookies werden verwendet, um Besuchern relevante Werbung und Marketingkampagnen bereitzustellen.
                    Sie verfolgen Besucher über Websites hinweg.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSaveCustom}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Auswahl speichern
              </button>
              <button
                onClick={handleAcceptAll}
                className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
              >
                Alle akzeptieren
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
