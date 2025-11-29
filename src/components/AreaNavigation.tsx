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
      {/* Sub-Navigation (Top) */}
      <div className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-30">
        <div className="flex items-center h-12 px-2">
          {/* Area Title */}
          <div className="flex items-center gap-2 px-3 py-1 mr-2">
            <currentAreaConfig.icon size={18} className="text-accent-primary" />
            <span className="font-medium text-gray-900 dark:text-white text-sm">
              {currentAreaConfig.label}
            </span>
          </div>

          {/* Sub-View Tabs */}
          <div className="flex gap-1 flex-1 overflow-x-auto">
            {currentAreaConfig.subViews.map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => onSubViewChange(view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  currentSubView === view
                    ? 'bg-accent-primary/10 text-accent-primary font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
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
            className={`p-2 rounded-lg transition-colors ${
              currentSubView === 'settings'
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom z-40">
        <div className="flex justify-around items-center h-16">
          {visibleAreas.map((area) => {
            const config = areaConfig[area];
            const Icon = config.icon;
            const isActive = currentArea === area;

            return (
              <button
                key={area}
                onClick={() => onAreaChange(area)}
                className={`flex flex-col items-center justify-center flex-1 h-full touch-manipulation transition-colors ${
                  isActive
                    ? 'text-accent-primary'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Icon size={24} />
                <span className="text-xs mt-1">{config.label}</span>
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
