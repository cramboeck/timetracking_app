import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List as ListIcon, Calendar as CalendarIcon } from 'lucide-react';
import { TimeEntry, Customer, Project, Activity } from '../types';
import { WeeklyGridView } from './WeeklyGridView';
import { TimeEntriesList } from './TimeEntriesList';
import { CalendarView } from './CalendarView';

type ViewMode = 'grid' | 'list' | 'calendar';

const STORAGE_KEY = 'arbeiten_zeiten_view_mode';
const DEFAULT_MODE: ViewMode = 'grid';

interface TimeViewsProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onCreateEntry: (entry: TimeEntry) => void | Promise<boolean | void>;
  onEditEntry: (id: string, updates: Partial<TimeEntry>) => void | Promise<void>;
  onDeleteEntry: (id: string) => void | Promise<void>;
  onRepeatEntry: (entry: TimeEntry) => void;
  onBulkUpdate: (entryIds: string[], updates: { projectId?: string; description?: string; activityId?: string }) => Promise<void>;
  onCalendarCreate: (entry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
}

const isViewMode = (s: string | null): s is ViewMode =>
  s === 'grid' || s === 'list' || s === 'calendar';

export const TimeViews = (props: TimeViewsProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Lazy state init: legacy path > ?view= > localStorage > default.
  const [mode, setMode] = useState<ViewMode>(() => {
    const path = location.pathname;
    if (path === '/arbeiten/grid') return 'grid';
    if (path === '/arbeiten/list') return 'list';
    if (path === '/arbeiten/calendar') return 'calendar';
    const fromUrl = searchParams.get('view');
    if (isViewMode(fromUrl)) return fromUrl;
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (isViewMode(fromStorage)) return fromStorage;
    return DEFAULT_MODE;
  });

  // Keep URL and local mode in sync. Three cases:
  //   1. Legacy path → redirect to /arbeiten/zeiten?view=X
  //   2. ?view= valid and differs from mode → adopt URL
  //   3. ?view= missing/invalid → write current mode to URL (canonicalize)
  useEffect(() => {
    const path = location.pathname;
    if (path === '/arbeiten/grid' || path === '/arbeiten/list' || path === '/arbeiten/calendar') {
      const legacyMode = path.split('/')[2] as ViewMode;
      navigate(`/arbeiten/zeiten?view=${legacyMode}`, { replace: true });
      return;
    }
    if (path !== '/arbeiten/zeiten') return;
    const fromUrl = searchParams.get('view');
    if (isViewMode(fromUrl)) {
      if (fromUrl !== mode) setMode(fromUrl);
    } else {
      const params = new URLSearchParams(searchParams);
      params.set('view', mode);
      setSearchParams(params, { replace: true });
    }
  }, [location.pathname, searchParams, mode, navigate, setSearchParams]);

  const handleModeChange = (next: ViewMode) => {
    if (next === mode) return;
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-4">
      {/* View Switcher (segmented control) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex items-center bg-gray-100 dark:bg-dark-200 rounded-lg p-1 gap-1">
          {([
            { key: 'grid', label: 'Raster', icon: LayoutGrid },
            { key: 'list', label: 'Liste', icon: ListIcon },
            { key: 'calendar', label: 'Kalender', icon: CalendarIcon },
          ] as const).map(opt => {
            const isActive = mode === opt.key;
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => handleModeChange(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-dark-50 text-accent-primary shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon size={16} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active view */}
      {mode === 'grid' && (
        <WeeklyGridView
          entries={props.entries}
          projects={props.projects}
          customers={props.customers}
          activities={props.activities}
          onCreateEntry={props.onCreateEntry}
          onEditEntry={props.onEditEntry}
          onDeleteEntry={props.onDeleteEntry}
        />
      )}
      {mode === 'list' && (
        <TimeEntriesList
          projects={props.projects}
          customers={props.customers}
          activities={props.activities}
          onDelete={props.onDeleteEntry}
          onEdit={props.onEditEntry}
          onRepeatEntry={props.onRepeatEntry}
          onBulkUpdate={props.onBulkUpdate}
        />
      )}
      {mode === 'calendar' && (
        <CalendarView
          entries={props.entries}
          projects={props.projects}
          customers={props.customers}
          activities={props.activities}
          onEditEntry={(entry) => {
            console.log('Edit entry:', entry);
          }}
          onUpdateEntry={props.onEditEntry}
          onCreateEntry={props.onCalendarCreate}
        />
      )}
    </div>
  );
};
