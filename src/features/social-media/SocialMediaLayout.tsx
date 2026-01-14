import { useMemo } from 'react';
import {
  LayoutDashboard,
  Calendar,
  PenTool,
  Library,
  BarChart3,
  Bot,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useSocialMedia } from './context';
import type { ViewMode } from './types';

// Import pages (will be created next)
import DashboardPage from './pages/Dashboard';
import CalendarPage from './pages/Calendar';
import ContentStudioPage from './pages/ContentStudio';
import LibraryPage from './pages/Library';
import InsightsPage from './pages/Insights';
import AutomationPage from './pages/Automation';

interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
    description: 'Übersicht & Quick Actions',
  },
  {
    id: 'calendar',
    label: 'Kalender',
    icon: <Calendar size={20} />,
    description: 'Content-Planung',
  },
  {
    id: 'content-studio',
    label: 'Content Studio',
    icon: <PenTool size={20} />,
    description: 'Erstellen & Wizard',
  },
  {
    id: 'library',
    label: 'Bibliothek',
    icon: <Library size={20} />,
    description: 'Posts, Templates, Hashtags',
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: <BarChart3 size={20} />,
    description: 'Analytics & Trends',
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: <Bot size={20} />,
    description: 'Autopilot & Bot',
  },
];

export default function SocialMediaLayout() {
  const { viewMode, setViewMode, loading, error, setError } = useSocialMedia();

  // Render current page
  const currentPage = useMemo(() => {
    switch (viewMode) {
      case 'dashboard':
        return <DashboardPage />;
      case 'calendar':
        return <CalendarPage />;
      case 'content-studio':
        return <ContentStudioPage />;
      case 'library':
        return <LibraryPage />;
      case 'insights':
        return <InsightsPage />;
      case 'automation':
        return <AutomationPage />;
      default:
        return <DashboardPage />;
    }
  }, [viewMode]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-pink-600" size={48} />
          <p className="text-gray-600 dark:text-gray-400">Social Media Manager wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300 text-sm flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800 dark:text-red-400 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setViewMode(item.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                viewMode === item.id
                  ? 'border-pink-600 text-pink-600'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300'
              }`}
              title={item.description}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Page Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {currentPage}
      </div>
    </div>
  );
}
