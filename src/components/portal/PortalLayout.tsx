import { ReactNode, useMemo, useState } from 'react';
import { Ticket, LogOut, User, Settings, Book, Monitor, FileText, Shield, Info, X } from 'lucide-react';
import { PortalContact, customerPortalApi, PortalSettings } from '../../services/api';

interface PortalLayoutProps {
  contact: PortalContact;
  onLogout: () => void;
  onShowProfile?: () => void;
  onShowKnowledgeBase?: () => void;
  onShowDevices?: () => void;
  onShowInvoices?: () => void;
  onShowTickets?: () => void;
  currentView?: string;
  portalSettings?: PortalSettings | null;
  children: ReactNode;
}

export const PortalLayout = ({ contact, onLogout, onShowProfile, onShowKnowledgeBase, onShowDevices, onShowInvoices, onShowTickets, currentView, portalSettings, children }: PortalLayoutProps) => {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLegal, setShowLegal] = useState(false);

  const handleLogout = () => {
    customerPortalApi.logout();
    onLogout();
  };

  // Apply custom primary color from branding
  const brandStyles = useMemo(() => {
    const primaryColor = portalSettings?.primaryColor || '#3b82f6';
    return {
      '--portal-primary': primaryColor,
      '--portal-primary-hover': primaryColor + 'dd',
    } as React.CSSProperties;
  }, [portalSettings?.primaryColor]);

  const primaryColor = portalSettings?.primaryColor || '#3b82f6';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col" style={brandStyles}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {portalSettings?.logoUrl ? (
              <img
                src={portalSettings.logoUrl}
                alt="Logo"
                className="w-10 h-10 rounded-xl object-contain"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl text-white flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <Ticket size={22} />
              </div>
            )}
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-white">
                {portalSettings?.companyName || 'Kundenportal'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{contact.customerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onShowKnowledgeBase && (
              <button
                onClick={onShowKnowledgeBase}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  currentView === 'kb'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Wissensdatenbank"
              >
                <Book size={18} />
                <span className="hidden sm:inline">Hilfe</span>
              </button>
            )}
            {onShowProfile && (
              <button
                onClick={onShowProfile}
                className={`hidden sm:flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  currentView === 'profile'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <User size={18} />
                <span>{contact.name}</span>
              </button>
            )}
            {onShowProfile && (
              <button
                onClick={onShowProfile}
                className={`sm:hidden flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  currentView === 'profile'
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title="Profil"
              >
                <Settings size={18} />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      {(onShowTickets || onShowDevices || onShowInvoices) && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-5xl mx-auto px-4">
            <nav className="flex gap-1 overflow-x-auto">
              {onShowTickets && (
                <button
                  onClick={onShowTickets}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    currentView === 'tickets' || currentView === 'ticket-detail'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Ticket size={18} />
                  Tickets
                </button>
              )}
              {onShowDevices && (
                <button
                  onClick={onShowDevices}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    currentView === 'devices'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Monitor size={18} />
                  Geräte
                </button>
              )}
              {onShowInvoices && (
                <button
                  onClick={onShowInvoices}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    currentView === 'invoices'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <FileText size={18} />
                  Finanzen
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Support-Portal powered by RamboFlow
            </div>
            <div className="flex items-center gap-4 text-sm">
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Datenschutz
              </button>
              <button
                onClick={() => setShowLegal(true)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                Impressum
              </button>
            </div>
          </div>
        </div>
      </footer>

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
                  Verantwortlich für die Datenverarbeitung auf diesem Portal ist:
                </p>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mt-2 mb-4">
                  <p className="text-gray-700 dark:text-gray-200">
                    {portalSettings?.companyName || 'Der Betreiber dieses Portals'}
                  </p>
                </div>

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
                  4. Speicherdauer
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Ihre Daten werden so lange gespeichert, wie es für die Erbringung unserer
                  Dienstleistungen erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  5. Ihre Rechte
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-2">
                  Sie haben das Recht auf:
                </p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                  <li>Auskunft über Ihre gespeicherten Daten</li>
                  <li>Berichtigung unrichtiger Daten</li>
                  <li>Löschung Ihrer Daten (soweit keine Aufbewahrungspflichten bestehen)</li>
                  <li>Einschränkung der Verarbeitung</li>
                  <li>Datenübertragbarkeit</li>
                  <li>Widerspruch gegen die Verarbeitung</li>
                </ul>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  6. Kontakt
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Bei Fragen zum Datenschutz wenden Sie sich bitte an Ihren Ansprechpartner
                  oder nutzen Sie die Ticket-Funktion dieses Portals.
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

                <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mb-6">
                  <p className="text-gray-700 dark:text-gray-200 font-medium mb-2">
                    {portalSettings?.companyName || 'Betreiber des Portals'}
                  </p>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
                    Dieses Kundenportal wird betrieben im Rahmen einer Geschäftsbeziehung.
                    Die vollständigen Kontaktdaten entnehmen Sie bitte Ihren Vertragsunterlagen
                    oder wenden Sie sich direkt an Ihren Ansprechpartner.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  Kontakt
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Für Anfragen nutzen Sie bitte die Ticket-Funktion dieses Portals oder
                  kontaktieren Sie Ihren zuständigen Ansprechpartner direkt.
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
