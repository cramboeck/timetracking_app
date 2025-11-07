import { Clock, Edit, List, Settings, BarChart3 } from 'lucide-react';
import { ViewMode } from '../types';

interface NavigationProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const navItems: { view: ViewMode; icon: typeof Clock; label: string }[] = [
    { view: 'stopwatch', icon: Clock, label: 'Stoppuhr' },
    { view: 'manual', icon: Edit, label: 'Manuell' },
    { view: 'list', icon: List, label: 'Übersicht' },
    { view: 'dashboard', icon: BarChart3, label: 'Dashboard' },
    { view: 'settings', icon: Settings, label: 'Einstellungen' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex justify-around items-center h-16">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`flex flex-col items-center justify-center flex-1 h-full touch-manipulation transition-colors ${
              currentView === view
                ? 'text-accent-primary'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            <Icon size={24} />
            <span className="text-xs mt-1">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
