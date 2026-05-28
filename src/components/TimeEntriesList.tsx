import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Clock, Edit2, Download, RotateCcw, Filter, X, CheckSquare, Square, Sparkles, LayoutGrid, List, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { formatDuration, formatTime, formatDate, calculateDuration } from '../utils/time';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TimePicker } from './TimePicker';
import { useAuth } from '../contexts/AuthContext';
import { aiApi, entriesApi, PaginationMeta } from '../services/api';
import { Button, IconButton } from './ui/Button';
import { SkeletonTimeEntry } from './Skeleton';
import { useToast } from '../contexts/UIContext';

interface TimeEntriesListProps {
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onDelete: (id: string) => void | Promise<void>;
  onEdit: (id: string, updates: Partial<TimeEntry>) => void | Promise<void>;
  onRepeatEntry?: (entry: TimeEntry) => void;
  onBulkUpdate?: (entryIds: string[], updates: { projectId?: string; description?: string; activityId?: string }) => Promise<void>;
}

const PAGE_SIZE = 500;

// Convert the filter UI state to a {startDate, endDate} pair that the backend
// understands. The backend filters with startDate <= entry.start_time <= endDate.
const filterToDateRange = (
  type: 'month' | 'quarter' | 'year' | 'custom',
  month: string,
  quarter: string,
  year: string,
  dateFrom: string,
  dateTo: string,
): { startDate?: string; endDate?: string } => {
  if (type === 'month') {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return {};
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999); // last day of month
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (type === 'quarter') {
    const match = quarter.match(/^(\d{4})-Q(\d)$/);
    if (!match) return {};
    const y = parseInt(match[1], 10);
    const q = parseInt(match[2], 10);
    const startMonth = (q - 1) * 3;
    const start = new Date(y, startMonth, 1);
    const end = new Date(y, startMonth + 3, 0, 23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (type === 'year') {
    const y = parseInt(year, 10);
    if (!y) return {};
    return {
      startDate: new Date(y, 0, 1).toISOString(),
      endDate: new Date(y, 11, 31, 23, 59, 59, 999).toISOString(),
    };
  }
  if (type === 'custom') {
    const out: { startDate?: string; endDate?: string } = {};
    if (dateFrom) out.startDate = new Date(`${dateFrom}T00:00:00`).toISOString();
    if (dateTo) out.endDate = new Date(`${dateTo}T23:59:59.999`).toISOString();
    return out;
  }
  return {};
};

export const TimeEntriesList = ({ projects, customers, activities, onDelete, onEdit, onRepeatEntry, onBulkUpdate }: TimeEntriesListProps) => {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const use24Hour = (currentUser?.timeFormat || '24h') === '24h';

  // Edit modal state
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editProjectId, setEditProjectId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editIsBillable, setEditIsBillable] = useState(true);
  const [editActivityId, setEditActivityId] = useState('');

  // Inline editing for running entries
  const [inlineEditDescriptions, setInlineEditDescriptions] = useState<Record<string, string>>({});
  const descriptionUpdateTimeoutRef = useRef<Record<string, number>>({});

  // Debounced description update for running entries
  const handleInlineDescriptionChange = useCallback((entryId: string, newDescription: string) => {
    // Update local state immediately for responsive UI
    setInlineEditDescriptions(prev => ({ ...prev, [entryId]: newDescription }));

    // Clear existing timeout for this entry
    if (descriptionUpdateTimeoutRef.current[entryId]) {
      clearTimeout(descriptionUpdateTimeoutRef.current[entryId]);
    }

    // Debounced API update
    descriptionUpdateTimeoutRef.current[entryId] = window.setTimeout(() => {
      onEdit(entryId, { description: newDescription });
      delete descriptionUpdateTimeoutRef.current[entryId];
    }, 800);
  }, [onEdit]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(descriptionUpdateTimeoutRef.current).forEach(clearTimeout);
    };
  }, []);

  // Server-side pagination state (declared early so the inline-edit-sync
  // useEffect below — which depends on `entries` — can see it). Backend
  // filters startDate/endDate/projectId; customer and description filters
  // are applied client-side on the loaded page.
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  const triggerRefetch = useCallback(() => setRefetchToken((t) => t + 1), []);

  // Sync inline edit state when entries change
  useEffect(() => {
    setInlineEditDescriptions(prev => {
      const newState: Record<string, string> = {};
      entries.forEach(entry => {
        if (entry.isRunning) {
          // Keep existing inline edit value or use entry description
          newState[entry.id] = prev[entry.id] ?? entry.description;
        }
      });
      return newState;
    });
  }, [entries]);

  // Confirm dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: ''
  });
  const [repeatConfirm, setRepeatConfirm] = useState<{ isOpen: boolean; entry: TimeEntry | null }>({
    isOpen: false,
    entry: null
  });

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [filterTimeframeType, setFilterTimeframeType] = useState<'month' | 'quarter' | 'year' | 'custom'>('month');
  const [filterMonth, setFilterMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterQuarter, setFilterQuarter] = useState(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${quarter}`;
  });
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()));
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterDescription, setFilterDescription] = useState<string>('');

  // Reset to page 1 whenever any backend-relevant filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterTimeframeType, filterMonth, filterQuarter, filterYear, filterDateFrom, filterDateTo, filterProjectId, filterCustomerId, filterDescription]);

  // Fetch entries when filters/page change. ALL filters now go to the
  // backend (since the entries endpoint learned customerId + searchText
  // support) — no client-side narrowing of the loaded page anymore.
  useEffect(() => {
    let cancelled = false;
    const dateRange = filterToDateRange(
      filterTimeframeType,
      filterMonth,
      filterQuarter,
      filterYear,
      filterDateFrom,
      filterDateTo,
    );
    setLoading(true);
    setFetchError(null);
    entriesApi
      .getPaginated({
        page: currentPage,
        limit: PAGE_SIZE,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        projectId: filterProjectId || undefined,
        customerId: filterCustomerId || undefined,
        searchText: filterDescription || undefined,
      })
      .then((response) => {
        if (cancelled) return;
        setEntries(response.data);
        setPagination(response.pagination);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'Fehler beim Laden');
        setEntries([]);
        setPagination(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage, filterTimeframeType, filterMonth, filterQuarter, filterYear, filterDateFrom, filterDateTo, filterProjectId, filterCustomerId, filterDescription, refetchToken]);

  // View mode state
  const [compactView, setCompactView] = useState<boolean>(() => {
    const saved = localStorage.getItem('timeEntriesCompactView');
    return saved === 'true';
  });

  // Persist compact view preference
  useEffect(() => {
    localStorage.setItem('timeEntriesCompactView', String(compactView));
  }, [compactView]);

  // AI state
  const [aiConfigured, setAiConfigured] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  // Check AI config on mount
  useEffect(() => {
    const checkAiConfig = async () => {
      try {
        const response = await aiApi.getConfig();
        setAiConfigured(!!(response.data?.enabled && response.data?.hasApiKey));
      } catch (err) {
        setAiConfigured(false);
      }
    };
    checkAiConfig();
  }, []);

  // Generate AI description for edit modal
  const generateEditAiDescription = async () => {
    if (!aiConfigured || !editingEntry) return;
    setGeneratingDescription(true);
    try {
      const project = projects.find(p => p.id === editProjectId);
      const customer = project ? customers.find(c => c.id === project.customerId) : null;
      const activity = editingEntry.activityId ? activities.find(a => a.id === editingEntry.activityId) : null;

      const response = await aiApi.suggestTimeEntryDescription({
        projectName: project?.name,
        customerName: customer?.name,
        activityName: activity?.name,
        existingDescription: editDescription || undefined,
      });

      if (response.success && response.data.suggestion) {
        setEditDescription(response.data.suggestion);
      }
    } catch (err) {
      console.error('Failed to generate description:', err);
    } finally {
      setGeneratingDescription(false);
    }
  };

  // Selection state
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Bulk edit state
  const [bulkEditModal, setBulkEditModal] = useState(false);
  const [bulkProjectId, setBulkProjectId] = useState<string>('');
  const [bulkDescription, setBulkDescription] = useState<string>('');
  const [bulkDescriptionMode, setBulkDescriptionMode] = useState<'keep' | 'replace' | 'append'>('keep');
  const [bulkActivityId, setBulkActivityId] = useState<string>('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const getProjectById = (id: string) => projects.find(p => p.id === id);
  const getCustomerById = (id: string) => customers.find(c => c.id === id);
  const getActivityById = (id: string) => activities.find(a => a.id === id);

  const getProjectDisplay = (entry: TimeEntry) => {
    const project = getProjectById(entry.projectId);
    const customer = project ? getCustomerById(project.customerId) : null;
    return project && customer ? `${customer.name} - ${project.name}` : 'Unbekanntes Projekt';
  };

  const calculateAmount = (entry: TimeEntry): number => {
    const hours = entry.duration / 3600;
    const project = getProjectById(entry.projectId);

    // Check if entry has an activity with flat rate
    if (entry.activityId) {
      const activity = getActivityById(entry.activityId);
      if (activity && activity.pricingType === 'flat' && activity.flatRate) {
        return activity.flatRate;
      }
    }

    // Otherwise use hourly rate
    return project ? hours * project.hourlyRate : 0;
  };

  // Get unique customers from entries
  const uniqueCustomers = useMemo(() => {
    const customerIds = new Set<string>();
    entries.forEach(entry => {
      const project = getProjectById(entry.projectId);
      if (project) {
        customerIds.add(project.customerId);
      }
    });
    return customers.filter(c => customerIds.has(c.id));
  }, [entries, projects, customers]);

  // Get projects for selected customer
  const projectsForFilter = useMemo(() => {
    if (!filterCustomerId) return projects;
    return projects.filter(p => p.customerId === filterCustomerId);
  }, [filterCustomerId, projects]);

  // Filter dropdowns need ALL (year, month) pairs the organization ever
  // tracked time for — not just the currently-paginated page. Pulled from a
  // dedicated endpoint so the options stay populated even when the active
  // filter narrows entries to a single month.
  const timeframesQuery = useQuery({
    queryKey: ['entries', 'timeframes'],
    queryFn: async () => (await entriesApi.getTimeframes()).data,
    staleTime: 60_000,
  });
  const timeframes = timeframesQuery.data ?? [];

  const availableMonths = useMemo(
    () =>
      timeframes
        .map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`)
        .sort()
        .reverse(),
    [timeframes]
  );

  const availableQuarters = useMemo(() => {
    const quarters = new Set<string>();
    timeframes.forEach(({ year, month }) => {
      const quarter = Math.floor((month - 1) / 3) + 1;
      quarters.add(`${year}-Q${quarter}`);
    });
    return Array.from(quarters).sort().reverse();
  }, [timeframes]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    timeframes.forEach(({ year }) => years.add(String(year)));
    return Array.from(years).sort().reverse();
  }, [timeframes]);

  // Filter entries
  // All filters (timeframe, projectId, customerId, searchText) are applied
  // server-side now — see the fetch useEffect above. The current page is
  // already correctly filtered; no client-side narrowing needed.
  const filteredEntries = entries;

  const sortedEntries = useMemo(() =>
    [...filteredEntries].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    ),
    [filteredEntries]
  );

  const groupedEntries = useMemo(() =>
    sortedEntries.reduce((groups, entry) => {
      const date = formatDate(entry.startTime);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(entry);
      return groups;
    }, {} as Record<string, TimeEntry[]>),
    [sortedEntries]
  );

  const totalHours = filteredEntries.reduce((sum, entry) => sum + entry.duration, 0);
  const hasActiveFilters = filterCustomerId || filterProjectId || (filterTimeframeType === 'custom' && (filterDateFrom || filterDateTo)) || filterDescription;

  const clearFilters = () => {
    setFilterCustomerId('');
    setFilterProjectId('');
    setFilterTimeframeType('month');
    const now = new Date();
    setFilterMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setFilterQuarter(`${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`);
    setFilterYear(String(now.getFullYear()));
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterDescription('');
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectedEntries(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  const toggleEntrySelection = (entryId: string) => {
    const newSelection = new Set(selectedEntries);
    if (newSelection.has(entryId)) {
      newSelection.delete(entryId);
    } else {
      newSelection.add(entryId);
    }
    setSelectedEntries(newSelection);
  };

  const selectAllVisible = () => {
    const allIds = new Set(filteredEntries.map(e => e.id));
    setSelectedEntries(allIds);
  };

  const deselectAll = () => {
    setSelectedEntries(new Set());
  };

  const openBulkEditModal = () => {
    setBulkProjectId('');
    setBulkDescription('');
    setBulkDescriptionMode('keep');
    setBulkActivityId('');
    setBulkEditModal(true);
  };

  const handleBulkEdit = async () => {
    if (!onBulkUpdate || selectedEntries.size === 0) return;

    setBulkProcessing(true);
    try {
      const updates: { projectId?: string; description?: string; activityId?: string } = {};

      if (bulkProjectId) {
        updates.projectId = bulkProjectId;
      }

      if (bulkDescriptionMode === 'replace' && bulkDescription !== undefined) {
        updates.description = bulkDescription;
      }
      // For 'append' mode, we handle it differently - we need to update each entry individually
      // For now, we'll just support replace mode in bulk

      if (bulkActivityId) {
        // Special value '__remove__' means remove the activity
        updates.activityId = bulkActivityId === '__remove__' ? '' : bulkActivityId;
      }

      console.log('🔄 [BULK] Sending updates:', updates, 'for entries:', Array.from(selectedEntries));
      await onBulkUpdate(Array.from(selectedEntries), updates);

      setBulkEditModal(false);
      setSelectedEntries(new Set());
      setSelectionMode(false);
      triggerRefetch();
    } catch (error) {
      console.error('Bulk update error:', error);
      showToast('Fehler beim Aktualisieren der Einträge', 'error');
    } finally {
      setBulkProcessing(false);
    }
  };

  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditProjectId(entry.projectId);
    setEditDescription(entry.description);
    setEditIsBillable(entry.isBillable ?? true);
    setEditActivityId(entry.activityId || '');

    // Extract date and times
    const startDate = new Date(entry.startTime);
    const endDate = entry.endTime ? new Date(entry.endTime) : new Date();

    setEditDate(startDate.toISOString().split('T')[0]);
    setEditStartTime(startDate.toTimeString().slice(0, 5)); // HH:MM
    setEditEndTime(endDate.toTimeString().slice(0, 5)); // HH:MM
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !editProjectId || !editDate || !editStartTime || !editEndTime) return;

    const startDateTime = new Date(`${editDate}T${editStartTime}`).toISOString();
    const endDateTime = new Date(`${editDate}T${editEndTime}`).toISOString();
    const duration = calculateDuration(startDateTime, endDateTime);

    if (duration <= 0) {
      showToast('Die Endzeit muss nach der Startzeit liegen!', 'warning');
      return;
    }

    // Await the update so the subsequent refetch reads the new value —
    // otherwise the parallel GET races the PUT and may show stale data
    // until the user manually refreshes.
    await onEdit(editingEntry.id, {
      projectId: editProjectId,
      description: editDescription,
      startTime: startDateTime,
      endTime: endDateTime,
      duration,
      isBillable: editIsBillable,
      activityId: editActivityId === '' ? null : editActivityId
    });

    setEditingEntry(null);
    triggerRefetch();
  };

  const handleDeleteClick = (entry: TimeEntry) => {
    setDeleteConfirm({
      isOpen: true,
      id: entry.id,
      name: getProjectDisplay(entry)
    });
  };

  const confirmDelete = async () => {
    await onDelete(deleteConfirm.id);
    triggerRefetch();
  };

  const exportToCSV = () => {
    const headers = ['Datum', 'Start', 'Ende', 'Dauer (Std)', 'Kunde', 'Projekt', 'Tätigkeit', 'Beschreibung', 'Stundensatz/Pauschale', 'Betrag'];
    const rows = filteredEntries.map(entry => {
      const project = getProjectById(entry.projectId);
      const customer = project ? getCustomerById(project.customerId) : null;
      const activity = entry.activityId ? getActivityById(entry.activityId) : null;
      const hours = entry.duration / 3600;
      const amount = calculateAmount(entry);

      // Determine rate display
      let rateDisplay = '-';
      if (activity && activity.pricingType === 'flat' && activity.flatRate) {
        rateDisplay = `Pauschale: ${(activity.flatRate || 0).toFixed(2)}€`;
      } else if (project && project.hourlyRate) {
        rateDisplay = `${(project.hourlyRate || 0).toFixed(2)}€/Std`;
      }

      return [
        formatDate(entry.startTime),
        formatTime(entry.startTime, use24Hour),
        entry.endTime ? formatTime(entry.endTime, use24Hour) : '-',
        hours.toFixed(2),
        customer?.name || '-',
        project?.name || '-',
        activity?.name || '-',
        entry.description || '-',
        rateDisplay,
        amount.toFixed(2)
      ];
    });

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zeiterfassung_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Empty state: no entries on this page AND nothing loading AND no
  // filter that could be narrowing the result. If filters are active,
  // we fall through to the list view (which then shows its own empty
  // hint inside the table area).
  const hasActiveBackendFilter =
    !!filterProjectId || filterTimeframeType !== 'month' || !!filterDateFrom || !!filterDateTo;
  if (entries.length === 0 && !loading && !fetchError && !hasActiveBackendFilter && pagination?.total === 0) {
    return (
      <div className="flex flex-col h-full p-6">
        <h1 className="text-2xl font-bold mb-6">Übersicht</h1>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <Clock size={48} className="mx-auto mb-4 opacity-50" />
            <p>Noch keine Zeiteinträge vorhanden</p>
            <p className="text-sm mt-2">Starte die Stoppuhr oder erfasse Zeit manuell</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-dark-50 border-b border-gray-200 dark:border-dark-border p-3 sm:p-6 pb-3 sm:pb-4 z-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-0 mb-3 sm:mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Übersicht</h1>
            <div className="text-base sm:text-lg font-semibold text-accent-primary">
              Gesamt: {formatDuration(totalHours)}
              {hasActiveFilters && (
                <span className="text-xs sm:text-sm font-normal text-gray-500 ml-2">
                  ({filteredEntries.length}/{pagination?.total ?? entries.length})
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            {/* View Toggle */}
            <IconButton
              onClick={() => setCompactView(!compactView)}
              icon={compactView ? <LayoutGrid size={18} /> : <List size={18} />}
              tooltip={compactView ? 'Normale Ansicht' : 'Kompakte Ansicht'}
              size="md"
            />
            <Button
              onClick={toggleSelectionMode}
              variant={selectionMode ? 'primary' : 'secondary'}
              size="md"
              icon={<CheckSquare size={18} />}
              title={selectionMode ? 'Auswahl beenden' : 'Mehrfachauswahl'}
            >
              <span className="hidden sm:inline">{selectionMode ? 'Auswahl aktiv' : 'Auswählen'}</span>
            </Button>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={showFilters || hasActiveFilters ? 'primary' : 'secondary'}
              size="md"
              icon={<Filter size={18} />}
            >
              <span className="hidden sm:inline">Filter</span>
              {hasActiveFilters && <span className="w-2 h-2 bg-white rounded-full" />}
            </Button>
            <Button
              onClick={exportToCSV}
              variant="success"
              size="md"
              icon={<Download size={18} />}
            >
              <span className="hidden sm:inline">CSV Export</span>
            </Button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-dark-100 rounded-lg p-4 mb-4 border border-gray-200 dark:border-dark-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700 dark:text-dark-500">Filter</h3>
              {hasActiveFilters && (
                <Button
                  onClick={clearFilters}
                  variant="ghost"
                  size="sm"
                  icon={<X size={14} />}
                >
                  Filter zurücksetzen
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Customer Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Kunde</label>
                <select
                  value={filterCustomerId}
                  onChange={(e) => {
                    setFilterCustomerId(e.target.value);
                    setFilterProjectId(''); // Reset project when customer changes
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Kunden</option>
                  {uniqueCustomers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>

              {/* Project Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Projekt</label>
                <select
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Projekte</option>
                  {projectsForFilter.filter(p => p.isActive).map(project => {
                    const customer = getCustomerById(project.customerId);
                    return (
                      <option key={project.id} value={project.id}>
                        {filterCustomerId ? project.name : `${customer?.name} - ${project.name}`}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Timeframe Type Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Zeitraum</label>
                <select
                  value={filterTimeframeType}
                  onChange={(e) => setFilterTimeframeType(e.target.value as 'month' | 'quarter' | 'year' | 'custom')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                >
                  <option value="month">Monat</option>
                  <option value="quarter">Quartal</option>
                  <option value="year">Jahr</option>
                  <option value="custom">Benutzerdefiniert</option>
                </select>
              </div>

              {/* Month Selector */}
              {filterTimeframeType === 'month' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Monat/Jahr</label>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  >
                    {availableMonths.map(month => {
                      const [year, m] = month.split('-');
                      const date = new Date(parseInt(year), parseInt(m) - 1);
                      return (
                        <option key={month} value={month}>
                          {date.toLocaleString('de-DE', { month: 'long', year: 'numeric' })}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Quarter Selector */}
              {filterTimeframeType === 'quarter' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Quartal</label>
                  <select
                    value={filterQuarter}
                    onChange={(e) => setFilterQuarter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  >
                    {availableQuarters.map(q => {
                      const match = q.match(/^(\d{4})-Q(\d)$/);
                      const label = match ? `Q${match[2]} ${match[1]}` : q;
                      return (
                        <option key={q} value={q}>{label}</option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Year Selector */}
              {filterTimeframeType === 'year' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Jahr</label>
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom Date From Filter */}
              {filterTimeframeType === 'custom' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Von</label>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              {/* Custom Date To Filter */}
              {filterTimeframeType === 'custom' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Bis</label>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                  />
                </div>
              )}

              {/* Description Search */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-dark-400 mb-1">Suche</label>
                <input
                  type="text"
                  value={filterDescription}
                  onChange={(e) => setFilterDescription(e.target.value)}
                  placeholder="Beschreibung..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Selection Toolbar */}
        {selectionMode && (
          <div className="bg-accent-primary/10 dark:bg-accent-primary/20 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-accent-primary">
                {selectedEntries.size} ausgewählt
              </span>
              <Button
                onClick={selectAllVisible}
                variant="ghost"
                size="sm"
              >
                Alle auswählen ({filteredEntries.length})
              </Button>
              {selectedEntries.size > 0 && (
                <Button
                  onClick={deselectAll}
                  variant="ghost"
                  size="sm"
                >
                  Auswahl aufheben
                </Button>
              )}
            </div>
            {selectedEntries.size > 0 && onBulkUpdate && (
              <Button
                onClick={openBulkEditModal}
                variant="primary"
                size="md"
                icon={<Edit2 size={16} />}
              >
                Massenbearbeitung
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Entry List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 pt-3 sm:pt-4">
        {loading && filteredEntries.length === 0 ? (
          // Initial / page-switch load — show skeleton rows instead of the
          // misleading "Keine Einträge gefunden" empty state.
          <div className="space-y-2 sm:space-y-3" aria-busy="true" aria-label="Zeiteinträge werden geladen">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonTimeEntry key={i} />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-dark-400">
            <Filter size={48} className="mx-auto mb-4 opacity-50" />
            <p>Keine Einträge für die gewählten Filter gefunden</p>
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="mt-2"
            >
              Filter zurücksetzen
            </Button>
          </div>
        ) : (
          Object.entries(groupedEntries).map(([date, dateEntries]) => (
            <div key={date} className={compactView ? 'mb-2 sm:mb-3' : 'mb-4 sm:mb-6'}>
              <h2 className={`font-semibold text-gray-600 dark:text-dark-400 ${compactView ? 'text-xs mb-1' : 'text-sm mb-2 sm:mb-3'}`}>{date}</h2>
              <div className={compactView ? 'space-y-1' : 'space-y-2 sm:space-y-3'}>
                {dateEntries.map((entry) => {
                  const project = getProjectById(entry.projectId);
                  const customer = project ? getCustomerById(project.customerId) : null;
                  const activity = entry.activityId ? getActivityById(entry.activityId) : null;

                  // Compact View
                  if (compactView) {
                    const isRunning = entry.isRunning;
                    return (
                      <div
                        key={entry.id}
                        className={`bg-white dark:bg-dark-100 rounded border px-3 py-1.5 sm:py-1.5 transition-colors ${
                          selectedEntries.has(entry.id)
                            ? 'border-accent-primary ring-1 ring-accent-primary/20'
                            : isRunning
                              ? 'border-green-400 dark:border-green-500 ring-1 ring-green-400/30 dark:ring-green-500/30 bg-green-50/50 dark:bg-green-900/10'
                              : 'border-gray-200 dark:border-dark-border'
                        }`}
                      >
                        {/* Mobile: Two rows layout */}
                        <div className="flex sm:hidden flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {selectionMode && (
                              <IconButton
                                onClick={() => toggleEntrySelection(entry.id)}
                                icon={selectedEntries.has(entry.id) ? (
                                  <CheckSquare size={16} className="text-accent-primary" />
                                ) : (
                                  <Square size={16} />
                                )}
                                variant={selectedEntries.has(entry.id) ? 'primary' : 'default'}
                                size="sm"
                              />
                            )}
                            {/* Running indicator */}
                            {isRunning && (
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                            )}
                            {customer && (
                              <div
                                className="w-3 h-3 rounded flex-shrink-0"
                                style={{ backgroundColor: customer.color }}
                              />
                            )}
                            <span className="font-medium text-sm text-gray-900 dark:text-white truncate min-w-0">
                              {getProjectDisplay(entry)}
                            </span>
                            {activity && (
                              <span className="text-xs font-medium text-accent-primary bg-accent-primary/10 dark:bg-accent-primary/20 px-1.5 py-0.5 rounded flex-shrink-0 max-w-[40%] truncate">
                                {activity.name}
                              </span>
                            )}
                            <div className="flex-1" />
                            {!selectionMode && (
                              <div className="flex gap-0.5 flex-shrink-0">
                                {onRepeatEntry && !isRunning && (
                                  <IconButton
                                    onClick={() => setRepeatConfirm({ isOpen: true, entry })}
                                    icon={<RotateCcw size={14} />}
                                    variant="primary"
                                    size="sm"
                                    tooltip="Wiederholen"
                                  />
                                )}
                                <IconButton
                                  onClick={() => openEditModal(entry)}
                                  icon={<Edit2 size={14} />}
                                  variant="default"
                                  size="sm"
                                  tooltip="Bearbeiten"
                                />
                                <IconButton
                                  onClick={() => handleDeleteClick(entry)}
                                  icon={<Trash2 size={14} />}
                                  variant="danger"
                                  size="sm"
                                  tooltip="Löschen"
                                />
                              </div>
                            )}
                          </div>
                          {/* Time and duration row */}
                          <div className={`flex items-center justify-between ${isRunning ? 'pl-7' : 'pl-5'}`}>
                            <span className="text-xs text-gray-400 dark:text-dark-400">
                              {formatTime(entry.startTime, use24Hour)} - {entry.endTime ? formatTime(entry.endTime, use24Hour) : ''}
                            </span>
                            <span className={`font-semibold text-sm ${isRunning ? 'text-green-600 dark:text-green-400' : 'text-accent-primary'}`}>
                              {formatDuration(entry.duration)}
                            </span>
                          </div>
                          {/* Description row */}
                          {(isRunning || entry.description) && (
                            <div className={`${isRunning ? 'pl-7' : 'pl-5'}`}>
                              {isRunning ? (
                                <input
                                  type="text"
                                  value={inlineEditDescriptions[entry.id] ?? entry.description}
                                  onChange={(e) => handleInlineDescriptionChange(entry.id, e.target.value)}
                                  placeholder="Beschreibung eingeben..."
                                  className="text-xs text-gray-700 dark:text-dark-500 w-full bg-transparent border-b border-dashed border-green-400 dark:border-green-500 focus:outline-none focus:border-green-600 dark:focus:border-green-400 placeholder-gray-400 dark:placeholder-dark-400 py-0.5"
                                />
                              ) : (
                                <p className="text-xs text-gray-500 dark:text-dark-400 line-clamp-2 whitespace-pre-wrap">
                                  {entry.description}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Desktop: Two row layout for better description visibility */}
                        <div className="hidden sm:flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {selectionMode && (
                              <IconButton
                                onClick={() => toggleEntrySelection(entry.id)}
                                icon={selectedEntries.has(entry.id) ? (
                                  <CheckSquare size={16} className="text-accent-primary" />
                                ) : (
                                  <Square size={16} />
                                )}
                                variant={selectedEntries.has(entry.id) ? 'primary' : 'default'}
                                size="sm"
                              />
                            )}
                            {/* Running indicator */}
                            {isRunning && (
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                            )}
                            {customer && (
                              <div
                                className="w-3 h-3 rounded flex-shrink-0"
                                style={{ backgroundColor: customer.color }}
                              />
                            )}
                            <span className="font-medium text-sm text-gray-900 dark:text-white truncate min-w-0">
                              {getProjectDisplay(entry)}
                            </span>
                            {activity && (
                              <span className="text-xs font-medium text-accent-primary bg-accent-primary/10 dark:bg-accent-primary/20 px-1.5 py-0.5 rounded flex-shrink-0 max-w-[180px] truncate">
                                {activity.name}
                              </span>
                            )}
                            <div className="flex-1" />
                            <span className="text-xs text-gray-400 dark:text-dark-400 flex-shrink-0">
                              {formatTime(entry.startTime, use24Hour)} - {entry.endTime ? formatTime(entry.endTime, use24Hour) : ''}
                            </span>
                            <span className={`font-semibold text-sm flex-shrink-0 w-16 text-right ${isRunning ? 'text-green-600 dark:text-green-400' : 'text-accent-primary'}`}>
                              {formatDuration(entry.duration)}
                            </span>
                            {!selectionMode && (
                            <div className="flex gap-0.5 flex-shrink-0">
                              {onRepeatEntry && !entry.isRunning && (
                                <IconButton
                                  onClick={() => setRepeatConfirm({ isOpen: true, entry })}
                                  icon={<RotateCcw size={14} />}
                                  variant="primary"
                                  size="sm"
                                  tooltip="Wiederholen"
                                />
                              )}
                              <IconButton
                                onClick={() => openEditModal(entry)}
                                icon={<Edit2 size={14} />}
                                variant="default"
                                size="sm"
                                tooltip="Bearbeiten"
                              />
                              <IconButton
                                onClick={() => handleDeleteClick(entry)}
                                icon={<Trash2 size={14} />}
                                variant="danger"
                                size="sm"
                                tooltip="Löschen"
                              />
                            </div>
                          )}
                          </div>
                          {/* Description row */}
                          {(isRunning || entry.description) && (
                            <div className="pl-5">
                              {isRunning ? (
                                <input
                                  type="text"
                                  value={inlineEditDescriptions[entry.id] ?? entry.description}
                                  onChange={(e) => handleInlineDescriptionChange(entry.id, e.target.value)}
                                  placeholder="Beschreibung eingeben..."
                                  className="text-xs text-gray-700 dark:text-dark-500 w-full bg-transparent border-b border-dashed border-green-400 dark:border-green-500 focus:outline-none focus:border-green-600 dark:focus:border-green-400 placeholder-gray-400 dark:placeholder-dark-400 py-0.5"
                                />
                              ) : (
                                <p className="text-xs text-gray-500 dark:text-dark-400 line-clamp-2 whitespace-pre-wrap">
                                  {entry.description}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Normal View
                  const isRunningNormal = entry.isRunning;
                  return (
                    <div
                      key={entry.id}
                      className={`bg-white dark:bg-dark-100 rounded-lg border p-4 shadow-sm transition-colors ${
                        selectedEntries.has(entry.id)
                          ? 'border-accent-primary ring-2 ring-accent-primary/20'
                          : isRunningNormal
                            ? 'border-green-400 dark:border-green-500 ring-2 ring-green-400/30 dark:ring-green-500/30 bg-green-50/50 dark:bg-green-900/10'
                            : 'border-gray-200 dark:border-dark-border'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-3 flex-1">
                          {selectionMode && (
                            <IconButton
                              onClick={() => toggleEntrySelection(entry.id)}
                              icon={selectedEntries.has(entry.id) ? (
                                <CheckSquare size={20} className="text-accent-primary" />
                              ) : (
                                <Square size={20} />
                              )}
                              variant={selectedEntries.has(entry.id) ? 'primary' : 'default'}
                              size="md"
                              className="mt-1"
                            />
                          )}
                          {/* Running indicator for normal view */}
                          {isRunningNormal && (
                            <div className="w-10 h-10 rounded-lg flex-shrink-0 bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                            </div>
                          )}
                          {!isRunningNormal && customer && (
                            <div
                              className="w-10 h-10 rounded-lg flex-shrink-0"
                              style={{ backgroundColor: customer.color }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{getProjectDisplay(entry)}</h3>
                              {activity && (
                                <span className="text-xs font-medium text-accent-primary bg-accent-primary/10 dark:bg-accent-primary/20 px-2 py-0.5 rounded-full">
                                  {activity.name}
                                </span>
                              )}
                              {isRunningNormal && (
                                <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                  Läuft
                                </span>
                              )}
                            </div>
                            {isRunningNormal ? (
                              <input
                                type="text"
                                value={inlineEditDescriptions[entry.id] ?? entry.description}
                                onChange={(e) => handleInlineDescriptionChange(entry.id, e.target.value)}
                                placeholder="Beschreibung eingeben..."
                                className="w-full text-sm text-gray-700 dark:text-dark-500 mt-1 bg-transparent border-b border-dashed border-green-400 dark:border-green-500 focus:outline-none focus:border-green-600 dark:focus:border-green-400 placeholder-gray-400 dark:placeholder-dark-400 py-0.5"
                              />
                            ) : entry.description ? (
                              <p className="text-sm text-gray-600 dark:text-dark-400 mt-1 whitespace-pre-wrap">{entry.description}</p>
                            ) : null}
                          </div>
                        </div>
                        {!selectionMode && (
                          <div className="flex gap-2">
                            {onRepeatEntry && !isRunningNormal && (
                              <IconButton
                                onClick={() => setRepeatConfirm({ isOpen: true, entry })}
                                icon={<RotateCcw size={18} />}
                                variant="primary"
                                size="lg"
                                tooltip="Eintrag wiederholen"
                                aria-label="Wiederholen"
                              />
                            )}
                            <IconButton
                              onClick={() => openEditModal(entry)}
                              icon={<Edit2 size={18} />}
                              variant="default"
                              size="lg"
                              tooltip="Bearbeiten"
                              aria-label="Bearbeiten"
                            />
                            <IconButton
                              onClick={() => handleDeleteClick(entry)}
                              icon={<Trash2 size={18} />}
                              variant="danger"
                              size="lg"
                              tooltip="Löschen"
                              aria-label="Löschen"
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-dark-400">
                        <span>
                          {formatTime(entry.startTime, use24Hour)}
                          {entry.endTime && ` - ${formatTime(entry.endTime, use24Hour)}`}
                        </span>
                        <span className={`font-semibold ${isRunningNormal ? 'text-green-600 dark:text-green-400' : 'text-accent-primary'}`}>
                          {formatDuration(entry.duration)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        title="Eintrag bearbeiten"
        footer={
          <div className="flex gap-3">
            <Button
              onClick={() => setEditingEntry(null)}
              variant="secondary"
              fullWidth
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editProjectId || !editDate || !editStartTime || !editEndTime}
              variant="primary"
              fullWidth
            >
              Speichern
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Projekt *
            </label>
            <select
              value={editProjectId}
              onChange={(e) => setEditProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              {projects.filter(p => p.isActive).map(project => {
                const customer = getCustomerById(project.customerId);
                return (
                  <option key={project.id} value={project.id}>
                    {customer?.name} - {project.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Tätigkeit
            </label>
            <select
              value={editActivityId}
              onChange={(e) => setEditActivityId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <option value="">— Keine Tätigkeit —</option>
              {activities.map(activity => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Datum *
            </label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Von *
              </label>
              <TimePicker
                value={editStartTime}
                onChange={setEditStartTime}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                Bis *
              </label>
              <TimePicker
                value={editEndTime}
                onChange={setEditEndTime}
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-dark-500">
                Beschreibung
              </label>
              {aiConfigured && editProjectId && (
                <Button
                  onClick={generateEditAiDescription}
                  disabled={generatingDescription}
                  loading={generatingDescription}
                  variant="ghost"
                  size="sm"
                  icon={!generatingDescription ? <Sparkles size={12} /> : undefined}
                  title="KI-Vorschlag generieren"
                  className="text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                >
                  KI-Vorschlag
                </Button>
              )}
            </div>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border">
            <label className="text-sm font-medium text-gray-700 dark:text-dark-500">
              Abrechenbar
            </label>
            <IconButton
              type="button"
              onClick={() => setEditIsBillable(!editIsBillable)}
              icon={
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    editIsBillable ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              }
              variant={editIsBillable ? 'success' : 'default'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                editIsBillable ? 'bg-green-500' : 'bg-gray-300 dark:bg-dark-300'
              }`}
              tooltip={editIsBillable ? 'Als nicht abrechenbar markieren' : 'Als abrechenbar markieren'}
            />
          </div>
        </div>
      </Modal>

      {/* Bulk Edit Modal */}
      <Modal
        isOpen={bulkEditModal}
        onClose={() => setBulkEditModal(false)}
        title={`Massenbearbeitung (${selectedEntries.size} Einträge)`}
        footer={
          <div className="flex gap-3">
            <Button
              onClick={() => setBulkEditModal(false)}
              variant="secondary"
              fullWidth
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleBulkEdit}
              disabled={bulkProcessing || (!bulkProjectId && bulkDescriptionMode === 'keep' && !bulkActivityId)}
              loading={bulkProcessing}
              variant="primary"
              fullWidth
            >
              {selectedEntries.size} Einträge aktualisieren
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Änderungen werden auf alle {selectedEntries.size} ausgewählten Einträge angewendet.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Neues Projekt zuweisen
            </label>
            <select
              value={bulkProjectId}
              onChange={(e) => setBulkProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <option value="">— Nicht ändern —</option>
              {projects.filter(p => p.isActive).map(project => {
                const customer = getCustomerById(project.customerId);
                return (
                  <option key={project.id} value={project.id}>
                    {customer?.name} - {project.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Beschreibung
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="descriptionMode"
                  checked={bulkDescriptionMode === 'keep'}
                  onChange={() => setBulkDescriptionMode('keep')}
                  className="text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-sm text-gray-700 dark:text-dark-500">Nicht ändern</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="descriptionMode"
                  checked={bulkDescriptionMode === 'replace'}
                  onChange={() => setBulkDescriptionMode('replace')}
                  className="text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-sm text-gray-700 dark:text-dark-500">Ersetzen durch:</span>
              </label>
              {bulkDescriptionMode === 'replace' && (
                <textarea
                  value={bulkDescription}
                  onChange={(e) => setBulkDescription(e.target.value)}
                  rows={2}
                  placeholder="Neue Beschreibung..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
              Tätigkeit zuweisen
            </label>
            <select
              value={bulkActivityId}
              onChange={(e) => setBulkActivityId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              <option value="">— Nicht ändern —</option>
              <option value="__remove__">— Tätigkeit entfernen —</option>
              {activities.map(activity => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })}
        onConfirm={confirmDelete}
        title="Eintrag löschen?"
        message={`Möchtest du den Eintrag "${deleteConfirm.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        variant="danger"
      />

      {/* Repeat Confirmation */}
      {repeatConfirm.entry && (
        <ConfirmDialog
          isOpen={repeatConfirm.isOpen}
          onClose={() => setRepeatConfirm({ isOpen: false, entry: null })}
          onConfirm={() => {
            if (repeatConfirm.entry) {
              onRepeatEntry?.(repeatConfirm.entry);
              setRepeatConfirm({ isOpen: false, entry: null });
            }
          }}
          title="Timer wiederholen?"
          message={`Es wird sofort ein neuer Timer mit denselben Daten gestartet. Ein bereits laufender Timer wird dabei automatisch gestoppt.\n\nProjekt: ${getProjectById(repeatConfirm.entry.projectId)?.name || 'Unbekannt'}\n${repeatConfirm.entry.description ? `Beschreibung: ${repeatConfirm.entry.description}` : ''}`}
          confirmText="Timer starten"
          variant="info"
        />
      )}

      {/* Pagination controls — only shown when the backend reports more than
          one page for the active filter. Currently-loaded page can be empty
          and still display these (e.g. after deleting the last entry). */}
      {pagination && pagination.totalPages > 1 && (
        <div className="sticky bottom-0 bg-white dark:bg-dark-50 border-t border-gray-200 dark:border-dark-border px-4 py-2 flex items-center justify-between gap-3 z-10">
          <div className="text-xs text-gray-500 dark:text-dark-400 tabular-nums">
            Seite <span className="font-semibold text-gray-700 dark:text-dark-500">{pagination.page}</span> von{' '}
            <span className="font-semibold text-gray-700 dark:text-dark-500">{pagination.totalPages}</span>
            <span className="hidden sm:inline"> · {pagination.total} Einträge</span>
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Vorherige Seite"
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Zurück</span>
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasMore || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Nächste Seite"
            >
              <span className="hidden sm:inline">Weiter</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {fetchError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-100 px-4 py-2 rounded-md shadow-md z-20">
          {fetchError}
        </div>
      )}
    </div>
  );
};
