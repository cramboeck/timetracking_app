import { ReactNode, useMemo } from 'react';
import { Ticket, LogOut, User, Settings, Book, Monitor, FileText } from 'lucide-react';
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
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-5xl mx-auto text-center text-sm text-gray-500 dark:text-gray-400">
          Support-Portal powered by RamboFlow
        </div>
      </footer>
    </div>
  );
};
