import { ReactNode, useMemo, useState } from 'react';
import { Ticket, LogOut, User, Settings, Book, Monitor, FileText, Shield, Info, X, HelpCircle, Clock } from 'lucide-react';
import { PortalContact, customerPortalApi, PortalSettings } from '../../services/api';
import { Button, IconButton } from '../ui/Button';

interface PortalLayoutProps {
  contact: PortalContact;
  onLogout: () => void;
  onShowProfile?: () => void;
  onShowKnowledgeBase?: () => void;
  onShowDevices?: () => void;
  onShowInvoices?: () => void;
  onShowTickets?: () => void;
  onShowTimeReport?: () => void;
  onShowContract?: () => void;
  onShowHelp?: () => void;
  currentView?: string;
  portalSettings?: PortalSettings | null;
  children: ReactNode;
}

export const PortalLayout = ({ contact, onLogout, onShowProfile, onShowKnowledgeBase, onShowDevices, onShowInvoices, onShowTickets, onShowTimeReport, onShowContract, onShowHelp, currentView, portalSettings, children }: PortalLayoutProps) => {
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
    <div className="min-h-screen bg-gray-50 dark:bg-dark-50 flex flex-col" style={brandStyles}>
      {/* Header */}
      <header className="bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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
              <p className="text-sm text-gray-500 dark:text-dark-400">{contact.customerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onShowKnowledgeBase && (
              <Button
                onClick={onShowKnowledgeBase}
                variant={currentView === 'kb' ? 'primary' : 'ghost'}
                size="sm"
                icon={<Book size={18} />}
                className={currentView === 'kb' ? 'bg-accent-light dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary' : ''}
              >
                <span className="hidden sm:inline">Hilfe</span>
              </Button>
            )}
            {onShowProfile && (
              <Button
                onClick={onShowProfile}
                variant={currentView === 'profile' ? 'primary' : 'ghost'}
                size="sm"
                icon={<User size={18} />}
                className={`hidden sm:flex ${currentView === 'profile' ? 'bg-accent-light dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary' : ''}`}
              >
                <span>{contact.name}</span>
              </Button>
            )}
            {onShowProfile && (
              <IconButton
                icon={<Settings size={18} />}
                onClick={onShowProfile}
                variant={currentView === 'profile' ? 'primary' : 'default'}
                tooltip="Profil"
                className={`sm:hidden ${currentView === 'profile' ? 'bg-accent-light dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary' : ''}`}
              />
            )}
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              icon={<LogOut size={18} />}
            >
              <span className="hidden sm:inline">Abmelden</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      {(onShowTickets || onShowDevices || onShowInvoices || onShowTimeReport || onShowContract) && (
        <div className="bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border">
          <div className="max-w-6xl mx-auto px-4">
            <nav className="flex gap-1 overflow-x-auto">
              {onShowTickets && (
                <Button
                  onClick={onShowTickets}
                  variant="ghost"
                  size="sm"
                  icon={<Ticket size={18} />}
                  className={`px-4 py-3 rounded-none border-b-2 whitespace-nowrap ${
                    currentView === 'tickets' || currentView === 'ticket-detail'
                      ? 'border-accent-primary text-accent-primary dark:text-accent-primary'
                      : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
                  }`}
                >
                  Tickets
                </Button>
              )}
              {onShowDevices && (
                <Button
                  onClick={onShowDevices}
                  variant="ghost"
                  size="sm"
                  icon={<Monitor size={18} />}
                  className={`px-4 py-3 rounded-none border-b-2 whitespace-nowrap ${
                    currentView === 'devices'
                      ? 'border-accent-primary text-accent-primary dark:text-accent-primary'
                      : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
                  }`}
                >
                  Geräte
                </Button>
              )}
              {onShowTimeReport && (
                <Button
                  onClick={onShowTimeReport}
                  variant="ghost"
                  size="sm"
                  icon={<Clock size={18} />}
                  className={`px-4 py-3 rounded-none border-b-2 whitespace-nowrap ${
                    currentView === 'time-report'
                      ? 'border-accent-primary text-accent-primary dark:text-accent-primary'
                      : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
                  }`}
                >
                  Stunden
                </Button>
              )}
              {onShowContract && (
                <Button
                  onClick={onShowContract}
                  variant="ghost"
                  size="sm"
                  icon={<FileText size={18} />}
                  className={`px-4 py-3 rounded-none border-b-2 whitespace-nowrap ${
                    currentView === 'contract'
                      ? 'border-accent-primary text-accent-primary dark:text-accent-primary'
                      : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
                  }`}
                >
                  Vertrag
                </Button>
              )}
              {onShowInvoices && (
                <Button
                  onClick={onShowInvoices}
                  variant="ghost"
                  size="sm"
                  icon={<FileText size={18} />}
                  className={`px-4 py-3 rounded-none border-b-2 whitespace-nowrap ${
                    currentView === 'invoices'
                      ? 'border-accent-primary text-accent-primary dark:text-accent-primary'
                      : 'border-transparent text-gray-500 dark:text-dark-400 hover:text-gray-700 dark:hover:text-dark-500'
                  }`}
                >
                  Finanzen
                </Button>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-dark-100 border-t border-gray-200 dark:border-dark-border px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-sm text-gray-500 dark:text-dark-400">
              Support-Portal powered by RamboFlow
            </div>
            <div className="flex items-center gap-4 text-sm">
              {onShowHelp && (
                <Button
                  onClick={onShowHelp}
                  variant="ghost"
                  size="sm"
                  icon={<HelpCircle size={16} />}
                  className="text-accent-primary dark:text-accent-primary hover:text-accent-dark dark:hover:text-accent-primary"
                >
                  Einführung
                </Button>
              )}
              <Button
                onClick={() => setShowPrivacy(true)}
                variant="ghost"
                size="sm"
              >
                Datenschutz
              </Button>
              <Button
                onClick={() => setShowLegal(true)}
                variant="ghost"
                size="sm"
              >
                Impressum
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-100 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-accent-primary" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Datenschutzerklärung
                </h2>
              </div>
              <IconButton
                icon={<X size={20} />}
                onClick={() => setShowPrivacy(false)}
                tooltip="Schließen"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-gray-600 dark:text-dark-500 mb-4">
                  <strong>Stand:</strong> {new Date().toLocaleDateString('de-DE')}
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  1. Verantwortlicher
                </h3>
                <p className="text-gray-600 dark:text-dark-500">
                  Verantwortlich für die Datenverarbeitung auf diesem Portal ist:
                </p>
                <div className="bg-gray-50 dark:bg-dark-200/50 p-4 rounded-lg mt-2 mb-4">
                  <p className="text-gray-700 dark:text-dark-500">
                    {portalSettings?.companyName || 'Der Betreiber dieses Portals'}
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  2. Erhobene Daten
                </h3>
                <p className="text-gray-600 dark:text-dark-500 mb-2">
                  Im Rahmen der Nutzung dieses Kundenportals werden folgende Daten verarbeitet:
                </p>
                <ul className="list-disc list-inside text-gray-600 dark:text-dark-500 space-y-1">
                  <li>Name und E-Mail-Adresse (für Ihren Zugang)</li>
                  <li>Support-Tickets und deren Inhalte</li>
                  <li>Hochgeladene Dateien und Anhänge</li>
                  <li>Technische Zugriffsdaten (IP-Adresse, Browser)</li>
                </ul>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  3. Zweck der Verarbeitung
                </h3>
                <p className="text-gray-600 dark:text-dark-500">
                  Die Daten werden ausschließlich zur Erbringung von Support-Leistungen und zur
                  Kommunikation im Rahmen bestehender Geschäftsbeziehungen verwendet.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  4. Speicherdauer
                </h3>
                <p className="text-gray-600 dark:text-dark-500">
                  Ihre Daten werden so lange gespeichert, wie es für die Erbringung unserer
                  Dienstleistungen erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  5. Ihre Rechte
                </h3>
                <p className="text-gray-600 dark:text-dark-500 mb-2">
                  Sie haben das Recht auf:
                </p>
                <ul className="list-disc list-inside text-gray-600 dark:text-dark-500 space-y-1">
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
                <p className="text-gray-600 dark:text-dark-500">
                  Bei Fragen zum Datenschutz wenden Sie sich bitte an Ihren Ansprechpartner
                  oder nutzen Sie die Ticket-Funktion dieses Portals.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border">
              <Button
                onClick={() => setShowPrivacy(false)}
                variant="primary"
                fullWidth
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Legal/Impressum Modal */}
      {showLegal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-100 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Info className="w-6 h-6 text-accent-primary" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Impressum
                </h2>
              </div>
              <IconButton
                icon={<X size={20} />}
                onClick={() => setShowLegal(false)}
                tooltip="Schließen"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Angaben gemäß § 5 TMG
                </h3>

                <div className="bg-gray-50 dark:bg-dark-200/50 p-4 rounded-lg mb-6">
                  <p className="text-gray-700 dark:text-dark-500 font-medium mb-2">
                    {portalSettings?.companyName || 'Betreiber des Portals'}
                  </p>
                  <p className="text-gray-600 dark:text-dark-500 text-sm">
                    Dieses Kundenportal wird betrieben im Rahmen einer Geschäftsbeziehung.
                    Die vollständigen Kontaktdaten entnehmen Sie bitte Ihren Vertragsunterlagen
                    oder wenden Sie sich direkt an Ihren Ansprechpartner.
                  </p>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  Kontakt
                </h3>
                <p className="text-gray-600 dark:text-dark-500">
                  Für Anfragen nutzen Sie bitte die Ticket-Funktion dieses Portals oder
                  kontaktieren Sie Ihren zuständigen Ansprechpartner direkt.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  Haftung für Inhalte
                </h3>
                <p className="text-gray-600 dark:text-dark-500">
                  Die Inhalte dieses Portals wurden mit größter Sorgfalt erstellt. Für die
                  Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch
                  keine Gewähr übernehmen.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                  Urheberrecht
                </h3>
                <p className="text-gray-600 dark:text-dark-500">
                  Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
                  unterliegen dem deutschen Urheberrecht.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border">
              <Button
                onClick={() => setShowLegal(false)}
                variant="primary"
                fullWidth
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
