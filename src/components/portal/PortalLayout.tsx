import { ReactNode } from 'react';
import { Ticket, LogOut, User } from 'lucide-react';
import { PortalContact, customerPortalApi } from '../../services/api';

interface PortalLayoutProps {
  contact: PortalContact;
  onLogout: () => void;
  children: ReactNode;
}

export const PortalLayout = ({ contact, onLogout, children }: PortalLayoutProps) => {
  const handleLogout = () => {
    customerPortalApi.logout();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Ticket size={22} />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-white">Kundenportal</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{contact.customerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <User size={18} />
              <span>{contact.name}</span>
            </div>
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
