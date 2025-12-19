import { useState, useEffect } from 'react';
import {
  Clock, List, Calendar,
  Ticket, Monitor, Bell, Wrench,
  BarChart3, Wallet, FileText, FileSignature,
  Settings, Briefcase, HeadphonesIcon, TrendingUp, ListTodo,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { useFeatures } from '../contexts/FeaturesContext';
import { Area, SubView } from './AreaNavigation';

interface DesktopSidebarProps {
  currentArea: Area;
  currentSubView: SubView;
  onAreaChange: (area: Area) => void;
  onSubViewChange: (subView: SubView) => void;
}

const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed';

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
      { view: 'contracts' as SubView, icon: FileSignature, label: 'Verträge' },
      { view: 'billing' as SubView, icon: Wallet, label: 'Finanzen' },
      { view: 'reports' as SubView, icon: FileText, label: 'Berichte' },
    ],
  },
};

export const DesktopSidebar = ({
  currentArea,
  currentSubView,
  onAreaChange,
  onSubViewChange
}: DesktopSidebarProps) => {
  const { hasPackage } = useFeatures();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });

  // Save collapsed state to localStorage and notify App
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    // Dispatch custom event for App.tsx to listen to
    window.dispatchEvent(new Event('sidebar-toggle'));
  }, [collapsed]);

  // Keyboard shortcut to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setCollapsed(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Determine which areas to show
  const visibleAreas: Area[] = [
    'arbeiten',
    ...(hasPackage('support') ? ['support' as Area] : []),
    ...(hasPackage('business') ? ['business' as Area] : []),
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-40 flex flex-col overflow-hidden
        bg-white dark:bg-gray-900
        border-r border-gray-200 dark:border-gray-700
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-56'}
      `}
    >
      {/* Logo / Brand Area */}
      <div className={`h-14 flex items-center border-b border-gray-200 dark:border-gray-700 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
        ) : (
          <span className="text-lg font-bold text-gray-900 dark:text-white">Ramboflow</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-4">
        {visibleAreas.map((area, areaIndex) => {
          const config = areaConfig[area];
          const AreaIcon = config.icon;
          const isAreaActive = currentArea === area;

          return (
            <div key={area} className={areaIndex > 0 ? 'mt-4 pt-4 border-t border-gray-100 dark:border-gray-800' : ''}>
              {/* Area Header */}
              <button
                onClick={() => onAreaChange(area)}
                className={`w-full flex items-center gap-3 px-3 py-2 mx-1 rounded-lg transition-colors
                  ${collapsed ? 'justify-center' : ''}
                  ${isAreaActive
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}
                `}
                title={collapsed ? config.label : undefined}
              >
                <AreaIcon size={collapsed ? 22 : 18} strokeWidth={isAreaActive ? 2 : 1.5} />
                {!collapsed && (
                  <span className={`text-sm ${isAreaActive ? 'font-semibold' : 'font-medium'}`}>
                    {config.label}
                  </span>
                )}
              </button>

              {/* SubViews */}
              <div className={`mt-1 space-y-0.5 ${collapsed ? 'px-1' : 'px-2'}`}>
                {config.subViews.map(({ view, icon: Icon, label }) => {
                  const isActive = currentSubView === view;

                  return (
                    <button
                      key={view}
                      onClick={() => {
                        onAreaChange(area);
                        onSubViewChange(view);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all
                        ${collapsed ? 'justify-center' : ''}
                        ${isActive
                          ? 'bg-accent-primary text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}
                      `}
                      title={collapsed ? label : undefined}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                      {!collapsed && (
                        <span className={`text-sm ${isActive ? 'font-medium' : ''}`}>
                          {label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-2">
        {/* Settings */}
        <button
          onClick={() => onSubViewChange('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
            ${collapsed ? 'justify-center' : ''}
            ${currentSubView === 'settings'
              ? 'bg-accent-primary text-white'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}
          `}
          title={collapsed ? 'Einstellungen' : undefined}
        >
          <Settings size={18} />
          {!collapsed && <span className="text-sm">Einstellungen</span>}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg
            text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
            hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
            ${collapsed ? 'justify-center' : ''}
          `}
          title={collapsed ? 'Sidebar erweitern ([)' : 'Sidebar einklappen ([)'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span className="text-sm text-gray-400">Einklappen</span>}
        </button>
      </div>
    </aside>
  );
};

// Export sidebar width for layout calculations
export const SIDEBAR_WIDTH = 224; // 14rem = 56 * 4 = 224px
export const SIDEBAR_COLLAPSED_WIDTH = 64; // 4rem = 16 * 4 = 64px
