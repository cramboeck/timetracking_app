import {
  Clock, CalendarClock,
  Ticket, Monitor, Bell, Wrench, Mail, ShieldAlert,
  BarChart3, Wallet, FileText, FileSignature, FileInput,
  Settings, Briefcase, HeadphonesIcon, ListTodo,
  Target, Users, LayoutDashboard, Building2, Receipt, Search
} from 'lucide-react';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { DesktopSidebar } from './DesktopSidebar';

// Area definitions - New structure for market-ready product
export type Area = 'dashboard' | 'arbeiten' | 'support' | 'crm' | 'finanzen';

// Globale Command Palette öffnen (Cmd+K Event)
const openCommandPalette = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
};
export type SubView =
  // Dashboard (standalone)
  | 'overview'
  // Arbeiten
  | 'stopwatch' | 'list' | 'calendar' | 'manual' | 'tasks' | 'grid' | 'zeiten'
  // Support
  | 'tickets' | 'devices' | 'alerts' | 'vulnerabilities' | 'maintenance' | 'inbox'
  // CRM
  | 'crm-dashboard' | 'customers' | 'leads' | 'pipeline' | 'contracts'
  // Finanzen
  | 'invoices' | 'billing' | 'reports' | 'documents-search'
  // Settings & Admin (special)
  | 'settings' | 'admin' | 'social-media';

interface AreaNavigationProps {
  currentArea: Area;
  currentSubView: SubView;
  onAreaChange: (area: Area) => void;
  onSubViewChange: (subView: SubView) => void;
}

const areaConfig = {
  dashboard: {
    icon: LayoutDashboard,
    label: 'Dashboard',
    subViews: [
      { view: 'overview' as SubView, icon: BarChart3, label: 'Übersicht' },
    ],
  },
  arbeiten: {
    icon: Briefcase,
    label: 'Arbeiten',
    subViews: [
      { view: 'stopwatch' as SubView, icon: Clock, label: 'Timer' },
      { view: 'tasks' as SubView, icon: ListTodo, label: 'Aufgaben' },
      { view: 'zeiten' as SubView, icon: CalendarClock, label: 'Zeiten' },
    ],
  },
  support: {
    icon: HeadphonesIcon,
    label: 'Support',
    subViews: [
      { view: 'tickets' as SubView, icon: Ticket, label: 'Tickets' },
      { view: 'inbox' as SubView, icon: Mail, label: 'E-Mail' },
      { view: 'devices' as SubView, icon: Monitor, label: 'Geräte' },
      { view: 'alerts' as SubView, icon: Bell, label: 'Alerts' },
      { view: 'vulnerabilities' as SubView, icon: ShieldAlert, label: 'Schwachstellen' },
      { view: 'maintenance' as SubView, icon: Wrench, label: 'Wartung' },
    ],
  },
  crm: {
    icon: Building2,
    label: 'CRM',
    subViews: [
      { view: 'crm-dashboard' as SubView, icon: BarChart3, label: 'Dashboard' },
      { view: 'customers' as SubView, icon: Users, label: 'Kunden' },
      { view: 'leads' as SubView, icon: Target, label: 'Leads' },
      { view: 'pipeline' as SubView, icon: BarChart3, label: 'Pipeline' },
      { view: 'contracts' as SubView, icon: FileSignature, label: 'Verträge' },
    ],
  },
  finanzen: {
    icon: Receipt,
    label: 'Finanzen',
    subViews: [
      { view: 'invoices' as SubView, icon: FileInput, label: 'Rechnungen' },
      { view: 'billing' as SubView, icon: Wallet, label: 'Abrechnung' },
      { view: 'reports' as SubView, icon: FileText, label: 'Berichte' },
      { view: 'documents-search' as SubView, icon: Search, label: 'Suche' },
    ],
  },
};

export const AreaNavigation = ({
  currentArea,
  currentSubView,
  onAreaChange,
  onSubViewChange
}: AreaNavigationProps) => {
  const isDesktop = useIsDesktop();

  // Show areas based on packages - dashboard always visible as entry point
  const visibleAreas: Area[] = ['dashboard', 'arbeiten', 'support', 'crm', 'finanzen'];

  const currentAreaConfig = areaConfig[currentArea];

  // Desktop: Show sidebar instead of mobile navigation
  if (isDesktop) {
    return (
      <DesktopSidebar
        currentArea={currentArea}
        currentSubView={currentSubView}
        onAreaChange={onAreaChange}
        onSubViewChange={onSubViewChange}
      />
    );
  }

  // Mobile: Show original navigation
  return (
    <>
      {/* Sub-Navigation (Top) - iOS Glassmorphism */}
      <div className="fixed top-0 left-0 right-0 z-30
        bg-white/70 dark:bg-dark-50/70
        backdrop-blur-xl
        border-b border-white/20 dark:border-dark-border/50
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
                    : 'text-gray-600 dark:text-dark-400 hover:bg-white/50 dark:hover:bg-dark-100/50 active:scale-95'
                }`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Suche-Button (öffnet Command Palette) */}
          <button
            onClick={openCommandPalette}
            aria-label="Suche öffnen (Cmd+K)"
            className="p-2 rounded-xl text-gray-600 dark:text-dark-400 hover:bg-white/50 dark:hover:bg-dark-100/50 active:scale-95 transition-all duration-200"
          >
            <Search size={20} />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => onSubViewChange('settings')}
            className={`p-2 rounded-xl transition-all duration-200 ${
              currentSubView === 'settings'
                ? 'bg-accent-primary/20 text-accent-primary shadow-sm'
                : 'text-gray-600 dark:text-dark-400 hover:bg-white/50 dark:hover:bg-dark-100/50 active:scale-95'
            }`}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Bottom Navigation - iOS Glassmorphism with clear active state */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 safe-area-bottom
        bg-white/70 dark:bg-dark-50/70
        backdrop-blur-xl
        border-t border-white/20 dark:border-dark-border/50
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
                    : 'text-gray-500 dark:text-dark-400'
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
  if (['overview'].includes(subView)) return 'dashboard';
  if (['stopwatch', 'list', 'calendar', 'manual', 'tasks', 'grid', 'zeiten'].includes(subView)) return 'arbeiten';
  if (['tickets', 'devices', 'alerts', 'vulnerabilities', 'maintenance', 'inbox'].includes(subView)) return 'support';
  if (['crm-dashboard', 'customers', 'leads', 'pipeline', 'contracts'].includes(subView)) return 'crm';
  if (['invoices', 'billing', 'reports', 'documents-search'].includes(subView)) return 'finanzen';
  return 'dashboard'; // Default to dashboard
};

// Helper to get default subView for area
export const getDefaultSubView = (area: Area): SubView => {
  switch (area) {
    case 'dashboard': return 'overview';
    case 'arbeiten': return 'stopwatch';
    case 'support': return 'tickets';
    case 'crm': return 'crm-dashboard';
    case 'finanzen': return 'invoices';
    default: return 'overview';
  }
};

// ─── URL routing helpers ─────────────────────────────────────────────────────
// Standalone subViews live at their own path (no area prefix), regular ones
// live under /:area/:subView. This way bookmarks and Browser-Back work the
// way users expect.

const STANDALONE_SUBVIEWS: SubView[] = ['settings', 'social-media'];

const ALL_SUBVIEWS: SubView[] = [
  'overview',
  'stopwatch', 'list', 'calendar', 'manual', 'tasks', 'grid', 'zeiten',
  'tickets', 'devices', 'alerts', 'vulnerabilities', 'maintenance', 'inbox',
  'crm-dashboard', 'customers', 'leads', 'pipeline', 'contracts',
  'invoices', 'billing', 'reports', 'documents-search',
  'settings', 'admin', 'social-media',
];

const ALL_AREAS: Area[] = ['dashboard', 'arbeiten', 'support', 'crm', 'finanzen'];

const isSubView = (s: string): s is SubView => (ALL_SUBVIEWS as string[]).includes(s);
const isArea = (s: string): s is Area => (ALL_AREAS as string[]).includes(s);

/**
 * Parse `/`, `/<subView>` (standalone), or `/<area>/<subView>` into
 * { area, subView }. Returns null for unknown paths so callers can fall back.
 */
export const pathToAreaSubView = (pathname: string): { area: Area; subView: SubView } | null => {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (parts.length === 0) return null;

  // Standalone single-segment paths: /settings, /social-media
  if (parts.length === 1 && isSubView(parts[0]) && STANDALONE_SUBVIEWS.includes(parts[0])) {
    return { area: getAreaFromSubView(parts[0]), subView: parts[0] };
  }

  // /:area or /:area/:subView
  if (isArea(parts[0])) {
    const area = parts[0];
    const subView = parts[1] && isSubView(parts[1]) && getAreaFromSubView(parts[1]) === area
      ? parts[1]
      : getDefaultSubView(area);
    return { area, subView };
  }

  return null;
};

/**
 * Build the canonical URL path for an (area, subView) pair.
 * Standalone subViews skip the area prefix.
 */
export const areaSubViewToPath = (area: Area, subView: SubView): string => {
  if (STANDALONE_SUBVIEWS.includes(subView)) {
    return `/${subView}`;
  }
  return `/${area}/${subView}`;
};
