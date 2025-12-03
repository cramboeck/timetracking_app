import { useState } from 'react';
import {
  Clock, List, Calendar,
  Ticket, Monitor, Bell, Wrench,
  BarChart3, Wallet, FileText,
  Settings, Briefcase, HeadphonesIcon, TrendingUp, ListTodo
} from 'lucide-react';
import { useFeatures } from '../contexts/FeaturesContext';

// Area definitions
export type Area = 'arbeiten' | 'support' | 'business';
export type SubView =
  // Arbeiten
  | 'stopwatch' | 'list' | 'calendar' | 'manual' | 'tasks'
  // Support
  | 'tickets' | 'devices' | 'alerts' | 'maintenance'
  // Business
  | 'dashboard' | 'billing' | 'reports'
  // Settings (special)
  | 'settings';

interface AreaNavigationProps {
  currentArea: Area;
  currentSubView: SubView;
  onAreaChange: (area: Area) => void;
  onSubViewChange: (subView: SubView) => void;
}

const areaConfig = {
  arbeiten: {
    icon: Briefcase,
    label: 'Arbeiten',
    subViews: [
      { view: 'stopwatch' as SubView, icon: Clock, label: 'Timer' },
      { view: 'tasks' as SubView, icon: ListTodo, label: 'Aufgaben' },
      { view: 'list' as SubView, icon: List, label: 'Einträge' },
      { view: 'calendar' as SubView, icon: Calendar, label: 'Kalender' },
    ],
  },
  support: {
    icon: HeadphonesIcon,
    label: 'Support',
    subViews: [
      { view: 'tickets' as SubView, icon: Ticket, label: 'Tickets' },
      { view: 'devices' as SubView, icon: Monitor, label: 'Geräte' },
      { view: 'alerts' as SubView, icon: Bell, label: 'Alerts' },
      { view: 'maintenance' as SubView, icon: Wrench, label: 'Wartung' },
    ],
  },
  business: {
    icon: TrendingUp,
    label: 'Business',
    subViews: [
      { view: 'dashboard' as SubView, icon: BarChart3, label: 'Dashboard' },
      { view: 'billing' as SubView, icon: Wallet, label: 'Finanzen' },
      { view: 'reports' as SubView, icon: FileText, label: 'Berichte' },
    ],
  },
};

export const AreaNavigation = ({
  currentArea,
  currentSubView,
  onAreaChange,
  onSubViewChange
}: AreaNavigationProps) => {
  const { hasPackage } = useFeatures();

  // Determine which areas to show
  const visibleAreas: Area[] = [
    'arbeiten', // Always visible
    ...(hasPackage('support') ? ['support' as Area] : []),
    ...(hasPackage('business') ? ['business' as Area] : []),
  ];

  const currentAreaConfig = areaConfig[currentArea];

  return (
    <>
      {/* Sub-Navigation (Top) - iOS Glassmorphism */}
      <div className="fixed top-0 left-0 right-0 z-30
        bg-white/70 dark:bg-gray-900/70
        backdrop-blur-xl
        border-b border-white/20 dark:border-gray-700/50
        shadow-sm
      ">
        <div className="flex items-center h-12 px-2">
          {/* Area Icon Only */}
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent-primary/10 mr-2">
            <currentAreaConfig.icon size={20} className="text-accent-primary" />
          </div>

          {/* Sub-View Tabs */}
          <div className="flex gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {currentAreaConfig.subViews.map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => onSubViewChange(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm whitespace-nowrap transition-all duration-200 ${
                  currentSubView === view
                    ? 'bg-accent-primary/20 text-accent-primary font-semibold shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 active:scale-95'
                }`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Settings Button */}
          <button
            onClick={() => onSubViewChange('settings')}
            className={`p-2 rounded-xl transition-all duration-200 ${
              currentSubView === 'settings'
                ? 'bg-accent-primary/20 text-accent-primary shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-800/50 active:scale-95'
            }`}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Navigation - iOS Glassmorphism with clear active state */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom
        bg-white/70 dark:bg-gray-900/70
        backdrop-blur-xl
        border-t border-white/20 dark:border-gray-700/50
      ">
        <div className="flex justify-around items-center h-16 px-2">
          {visibleAreas.map((area) => {
            const config = areaConfig[area];
            const Icon = config.icon;
            const isActive = currentArea === area;

            return (
              <button
                key={area}
                onClick={() => onAreaChange(area)}
                className={`relative flex flex-col items-center justify-center px-4 py-1 rounded-2xl touch-manipulation transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'text-accent-primary bg-accent-primary/15'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={`text-[10px] mt-0.5 ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}>
                  {config.label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-accent-primary" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

// Helper to get area from subView
export const getAreaFromSubView = (subView: SubView): Area => {
  if (['stopwatch', 'list', 'calendar', 'manual'].includes(subView)) return 'arbeiten';
  if (['tickets', 'devices', 'alerts', 'maintenance'].includes(subView)) return 'support';
  if (['dashboard', 'billing', 'reports'].includes(subView)) return 'business';
  return 'arbeiten'; // Default
};

// Helper to get default subView for area
export const getDefaultSubView = (area: Area): SubView => {
  switch (area) {
    case 'arbeiten': return 'stopwatch';
    case 'support': return 'tickets';
    case 'business': return 'dashboard';
    default: return 'stopwatch';
  }
};
