import { useState } from 'react';
import {
  Clock, List, Calendar,
  Ticket, Monitor, Bell,
  BarChart3, Wallet, FileText,
  Settings, Briefcase, HeadphonesIcon, TrendingUp
} from 'lucide-react';
import { useFeatures } from '../contexts/FeaturesContext';

// Area definitions
export type Area = 'arbeiten' | 'support' | 'business';
export type SubView =
  // Arbeiten
  | 'stopwatch' | 'list' | 'calendar' | 'manual'
  // Support
  | 'tickets' | 'devices' | 'alerts'
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
          {/* Area Title */}
          <div className="flex items-center gap-2 px-3 py-1 mr-2">
            <currentAreaConfig.icon size={18} className="text-accent-primary" />
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {currentAreaConfig.label}
            </span>
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

      {/* Bottom Navigation - iOS Glassmorphism */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom
        bg-white/70 dark:bg-gray-900/70
        backdrop-blur-xl
        border-t border-white/20 dark:border-gray-700/50
      ">
        <div className="flex justify-around items-center h-16">
          {visibleAreas.map((area) => {
            const config = areaConfig[area];
            const Icon = config.icon;
            const isActive = currentArea === area;

            return (
              <button
                key={area}
                onClick={() => onAreaChange(area)}
                className={`flex flex-col items-center justify-center flex-1 h-full touch-manipulation transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'text-accent-primary'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all duration-200 ${
                  isActive ? 'bg-accent-primary/15' : ''
                }`}>
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-xs mt-0.5 transition-all duration-200 ${
                  isActive ? 'font-semibold' : 'font-medium'
                }`}>
                  {config.label}
                </span>
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
  if (['tickets', 'devices', 'alerts'].includes(subView)) return 'support';
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
