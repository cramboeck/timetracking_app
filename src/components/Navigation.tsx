import { useState, useEffect } from 'react';
import { Clock, Edit, List, Calendar, Settings, BarChart3, Ticket, Wallet, Star, MoreHorizontal } from 'lucide-react';
import { ViewMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { sevdeskApi } from '../services/api';

interface NavigationProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const { currentUser } = useAuth();
  const hasTicketAccess = currentUser?.hasTicketAccess ?? false;
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Check billing feature status
  useEffect(() => {
    const checkBilling = async () => {
      try {
        const response = await sevdeskApi.getFeatureStatus();
        setBillingEnabled(response.data.billingEnabled);
      } catch {
        setBillingEnabled(false);
      }
    };
    checkBilling();
  }, []);

  // Primary nav items (always visible)
  const primaryNavItems: { view: ViewMode; icon: typeof Clock; label: string; premium?: boolean }[] = [
    { view: 'stopwatch', icon: Clock, label: 'Timer' },
    { view: 'list', icon: List, label: 'Liste' },
    ...(hasTicketAccess ? [{ view: 'tickets' as ViewMode, icon: Ticket, label: 'Tickets' }] : []),
    { view: 'billing', icon: Wallet, label: 'Finanzen', premium: !billingEnabled },
  ];

  // Secondary nav items (in "More" menu on mobile)
  const secondaryNavItems: { view: ViewMode; icon: typeof Clock; label: string }[] = [
    { view: 'calendar', icon: Calendar, label: 'Kalender' },
    { view: 'dashboard', icon: BarChart3, label: 'Dashboard' },
    { view: 'settings', icon: Settings, label: 'Einstellungen' },
  ];

  // Check if any secondary item is active
  const secondaryActive = secondaryNavItems.some(item => item.view === currentView);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom z-40">
      <div className="flex justify-around items-center h-16">
        {/* Primary Nav Items */}
        {primaryNavItems.map(({ view, icon: Icon, label, premium }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`relative flex flex-col items-center justify-center flex-1 h-full touch-manipulation transition-colors ${
              currentView === view
                ? 'text-accent-primary'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <div className="relative">
              <Icon size={24} />
              {premium && (
                <Star size={10} className="absolute -top-1 -right-1 text-amber-500 fill-amber-500" />
              )}
            </div>
            <span className="text-xs mt-1">{label}</span>
          </button>
        ))}

        {/* More Menu Button */}
        <div className="relative flex-1">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`flex flex-col items-center justify-center w-full h-16 touch-manipulation transition-colors ${
              secondaryActive || showMoreMenu
                ? 'text-accent-primary'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <MoreHorizontal size={24} />
            <span className="text-xs mt-1">Mehr</span>
          </button>

          {/* Dropdown Menu */}
          {showMoreMenu && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMoreMenu(false)}
              />
              {/* Menu */}
              <div className="absolute bottom-full right-0 mb-2 mr-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[160px]">
                {secondaryNavItems.map(({ view, icon: Icon, label }) => (
                  <button
                    key={view}
                    onClick={() => {
                      onViewChange(view);
                      setShowMoreMenu(false);
                    }}
                    className={`flex items-center gap-3 w-full px-4 py-3 text-left transition-colors ${
                      currentView === view
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
