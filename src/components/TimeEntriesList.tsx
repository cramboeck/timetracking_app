import { useState, useMemo, useEffect } from 'react';
import { Trash2, Clock, Edit2, Download, RotateCcw, Filter, X, CheckSquare, Square, Loader2, Sparkles, LayoutGrid, List } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { formatDuration, formatTime, formatDate, calculateDuration } from '../utils/time';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { TimePicker } from './TimePicker';
import { useAuth } from '../contexts/AuthContext';
import { aiApi } from '../services/api';

interface TimeEntriesListProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<TimeEntry>) => void;
  onRepeatEntry?: (entry: TimeEntry) => void;
  onBulkUpdate?: (entryIds: string[], updates: { projectId?: string; description?: string }) => Promise<void>;
}

export const TimeEntriesList = ({ entries, projects, customers, activities, onDelete, onEdit, onRepeatEntry, onBulkUpdate }: TimeEntriesListProps) => {
  const { currentUser } = useAuth();
  const use24Hour = (currentUser?.timeFormat || '24h') === '24h';

  // Edit modal state
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editProjectId, setEditProjectId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

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
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterDescription, setFilterDescription] = useState<string>('');

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
        setAiConfigured(response.data?.enabled && response.data?.hasApiKey);
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

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      // Customer filter
      if (filterCustomerId) {
        const project = getProjectById(entry.projectId);
        if (!project || project.customerId !== filterCustomerId) return false;
      }

      // Project filter
      if (filterProjectId && entry.projectId !== filterProjectId) return false;

      // Date range filter
      const entryDate = new Date(entry.startTime).toISOString().split('T')[0];
      if (filterDateFrom && entryDate < filterDateFrom) return false;
      if (filterDateTo && entryDate > filterDateTo) return false;

      // Description filter
      if (filterDescription) {
        const searchLower = filterDescription.toLowerCase();
        const descMatch = entry.description?.toLowerCase().includes(searchLower);
        const projectMatch = getProjectDisplay(entry).toLowerCase().includes(searchLower);
        if (!descMatch && !projectMatch) return false;
      }

      return true;
    });
  }, [entries, filterCustomerId, filterProjectId, filterDateFrom, filterDateTo, filterDescription]);

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
  const hasActiveFilters = filterCustomerId || filterProjectId || filterDateFrom || filterDateTo || filterDescription;

  const clearFilters = () => {
    setFilterCustomerId('');
    setFilterProjectId('');
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
    setBulkEditModal(true);
  };

  const handleBulkEdit = async () => {
    if (!onBulkUpdate || selectedEntries.size === 0) return;

    setBulkProcessing(true);
    try {
      const updates: { projectId?: string; description?: string } = {};

      if (bulkProjectId) {
        updates.projectId = bulkProjectId;
      }

      if (bulkDescriptionMode === 'replace' && bulkDescription !== undefined) {
        updates.description = bulkDescription;
      }
      // For 'append' mode, we handle it differently - we need to update each entry individually
      // For now, we'll just support replace mode in bulk

      await onBulkUpdate(Array.from(selectedEntries), updates);

      setBulkEditModal(false);
      setSelectedEntries(new Set());
      setSelectionMode(false);
    } catch (error) {
      console.error('Bulk update error:', error);
      alert('Fehler beim Aktualisieren der Einträge');
    } finally {
      setBulkProcessing(false);
    }
  };

  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditProjectId(entry.projectId);
    setEditDescription(entry.description);

    // Extract date and times
    const startDate = new Date(entry.startTime);
    const endDate = entry.endTime ? new Date(entry.endTime) : new Date();

    setEditDate(startDate.toISOString().split('T')[0]);
    setEditStartTime(startDate.toTimeString().slice(0, 5)); // HH:MM
    setEditEndTime(endDate.toTimeString().slice(0, 5)); // HH:MM
  };

  const handleSaveEdit = () => {
    if (!editingEntry || !editProjectId || !editDate || !editStartTime || !editEndTime) return;

    const startDateTime = new Date(`${editDate}T${editStartTime}`).toISOString();
    const endDateTime = new Date(`${editDate}T${editEndTime}`).toISOString();
    const duration = calculateDuration(startDateTime, endDateTime);

    if (duration <= 0) {
      alert('Die Endzeit muss nach der Startzeit liegen!');
      return;
    }

    onEdit(editingEntry.id, {
      projectId: editProjectId,
      description: editDescription,
      startTime: startDateTime,
      endTime: endDateTime,
      duration
    });

    setEditingEntry(null);
  };

  const handleDeleteClick = (entry: TimeEntry) => {
    setDeleteConfirm({
      isOpen: true,
      id: entry.id,
      name: getProjectDisplay(entry)
    });
  };

  const confirmDelete = () => {
    onDelete(deleteConfirm.id);
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

  if (entries.length === 0) {
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
      <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-6 pb-4 z-10">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold mb-2 dark:text-white">Übersicht</h1>
            <div className="text-lg font-semibold text-accent-primary">
              Gesamt: {formatDuration(totalHours)}
              {hasActiveFilters && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({filteredEntries.length} von {entries.length} Einträgen)
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {/* View Toggle */}
            <button
              onClick={() => setCompactView(!compactView)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              title={compactView ? 'Normale Ansicht' : 'Kompakte Ansicht'}
            >
              {compactView ? <LayoutGrid size={18} /> : <List size={18} />}
            </button>
            <button
              onClick={toggleSelectionMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                selectionMode
                  ? 'bg-accent-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title={selectionMode ? 'Auswahl beenden' : 'Mehrfachauswahl'}
            >
              <CheckSquare size={18} />
              <span className="hidden sm:inline">{selectionMode ? 'Auswahl aktiv' : 'Auswählen'}</span>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-accent-primary text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Filter size={18} />
              <span className="hidden sm:inline">Filter</span>
              {hasActiveFilters && <span className="w-2 h-2 bg-white rounded-full" />}
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download size={18} />
              <span className="hidden sm:inline">CSV Export</span>
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700 dark:text-gray-300">Filter</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-accent-primary hover:underline flex items-center gap-1"
                >
                  <X size={14} />
                  Filter zurücksetzen
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Customer Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Kunde</label>
                <select
                  value={filterCustomerId}
                  onChange={(e) => {
                    setFilterCustomerId(e.target.value);
                    setFilterProjectId(''); // Reset project when customer changes
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Kunden</option>
                  {uniqueCustomers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>

              {/* Project Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Projekt</label>
                <select
                  value={filterProjectId}
                  onChange={(e) => setFilterProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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

              {/* Date From Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Von</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              {/* Date To Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bis</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                />
              </div>

              {/* Description Search */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Suche</label>
                <input
                  type="text"
                  value={filterDescription}
                  onChange={(e) => setFilterDescription(e.target.value)}
                  placeholder="Beschreibung..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
              <button
                onClick={selectAllVisible}
                className="text-sm text-accent-primary hover:underline"
              >
                Alle auswählen ({filteredEntries.length})
              </button>
              {selectedEntries.size > 0 && (
                <button
                  onClick={deselectAll}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Auswahl aufheben
                </button>
              )}
            </div>
            {selectedEntries.size > 0 && onBulkUpdate && (
              <button
                onClick={openBulkEditModal}
                className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 text-sm font-medium"
              >
                <Edit2 size={16} />
                Massenbearbeitung
              </button>
            )}
          </div>
        )}
      </div>

      {/* Entry List */}
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Filter size={48} className="mx-auto mb-4 opacity-50" />
            <p>Keine Einträge für die gewählten Filter gefunden</p>
            <button
              onClick={clearFilters}
              className="mt-2 text-accent-primary hover:underline"
            >
              Filter zurücksetzen
            </button>
          </div>
        ) : (
          Object.entries(groupedEntries).map(([date, dateEntries]) => (
            <div key={date} className={compactView ? 'mb-3' : 'mb-6'}>
              <h2 className={`font-semibold text-gray-600 dark:text-gray-400 ${compactView ? 'text-xs mb-1.5' : 'text-sm mb-3'}`}>{date}</h2>
              <div className={compactView ? 'space-y-1' : 'space-y-3'}>
                {dateEntries.map((entry) => {
                  const project = getProjectById(entry.projectId);
                  const customer = project ? getCustomerById(project.customerId) : null;

                  // Compact View
                  if (compactView) {
                    return (
                      <div
                        key={entry.id}
                        className={`bg-white dark:bg-gray-800 rounded border px-3 py-1.5 transition-colors flex items-center gap-2 ${
                          selectedEntries.has(entry.id)
                            ? 'border-accent-primary ring-1 ring-accent-primary/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {selectionMode && (
                          <button
                            onClick={() => toggleEntrySelection(entry.id)}
                            className="text-gray-400 hover:text-accent-primary transition-colors flex-shrink-0"
                          >
                            {selectedEntries.has(entry.id) ? (
                              <CheckSquare size={16} className="text-accent-primary" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        )}
                        {customer && (
                          <div
                            className="w-3 h-3 rounded flex-shrink-0"
                            style={{ backgroundColor: customer.color }}
                          />
                        )}
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate flex-shrink-0 max-w-[200px]">
                          {getProjectDisplay(entry)}
                        </span>
                        {entry.description && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">
                            {entry.description}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-auto">
                          {formatTime(entry.startTime, use24Hour)} - {entry.endTime ? formatTime(entry.endTime, use24Hour) : ''}
                        </span>
                        <span className="font-semibold text-sm text-accent-primary flex-shrink-0 w-16 text-right">
                          {formatDuration(entry.duration)}
                        </span>
                        {!selectionMode && (
                          <div className="flex gap-0.5 flex-shrink-0">
                            {onRepeatEntry && !entry.isRunning && (
                              <button
                                onClick={() => setRepeatConfirm({ isOpen: true, entry })}
                                className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                title="Wiederholen"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(entry)}
                              className="p-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                              title="Bearbeiten"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(entry)}
                              className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Löschen"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Normal View
                  return (
                    <div
                      key={entry.id}
                      className={`bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm transition-colors ${
                        selectedEntries.has(entry.id)
                          ? 'border-accent-primary ring-2 ring-accent-primary/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-start gap-3 flex-1">
                          {selectionMode && (
                            <button
                              onClick={() => toggleEntrySelection(entry.id)}
                              className="mt-1 text-gray-400 hover:text-accent-primary transition-colors"
                            >
                              {selectedEntries.has(entry.id) ? (
                                <CheckSquare size={20} className="text-accent-primary" />
                              ) : (
                                <Square size={20} />
                              )}
                            </button>
                          )}
                          {customer && (
                            <div
                              className="w-10 h-10 rounded-lg flex-shrink-0"
                              style={{ backgroundColor: customer.color }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 dark:text-white">{getProjectDisplay(entry)}</h3>
                            {entry.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{entry.description}</p>
                            )}
                          </div>
                        </div>
                        {!selectionMode && (
                          <div className="flex gap-2">
                            {onRepeatEntry && !entry.isRunning && (
                              <button
                                onClick={() => setRepeatConfirm({ isOpen: true, entry })}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors touch-manipulation"
                                aria-label="Wiederholen"
                                title="Eintrag wiederholen"
                              >
                                <RotateCcw size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(entry)}
                              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors touch-manipulation"
                              aria-label="Bearbeiten"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(entry)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors touch-manipulation"
                              aria-label="Löschen"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>
                          {formatTime(entry.startTime, use24Hour)}
                          {entry.endTime && ` - ${formatTime(entry.endTime, use24Hour)}`}
                        </span>
                        <span className="font-semibold text-accent-primary">
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
            <button
              onClick={() => setEditingEntry(null)}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editProjectId || !editDate || !editStartTime || !editEndTime}
              className="flex-1 px-4 py-2 btn-accent"
            >
              Speichern
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Projekt *
            </label>
            <select
              value={editProjectId}
              onChange={(e) => setEditProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Datum *
            </label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Von *
              </label>
              <TimePicker
                value={editStartTime}
                onChange={setEditStartTime}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Beschreibung
              </label>
              {aiConfigured && editProjectId && (
                <button
                  onClick={generateEditAiDescription}
                  disabled={generatingDescription}
                  className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-400 rounded transition-colors disabled:opacity-50"
                  title="KI-Vorschlag generieren"
                >
                  {generatingDescription ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  KI-Vorschlag
                </button>
              )}
            </div>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
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
            <button
              onClick={() => setBulkEditModal(false)}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleBulkEdit}
              disabled={bulkProcessing || (!bulkProjectId && bulkDescriptionMode === 'keep')}
              className="flex-1 px-4 py-2 btn-accent flex items-center justify-center gap-2"
            >
              {bulkProcessing && <Loader2 size={16} className="animate-spin" />}
              {selectedEntries.size} Einträge aktualisieren
            </button>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Neues Projekt zuweisen
            </label>
            <select
              value={bulkProjectId}
              onChange={(e) => setBulkProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                <span className="text-sm text-gray-700 dark:text-gray-300">Nicht ändern</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="descriptionMode"
                  checked={bulkDescriptionMode === 'replace'}
                  onChange={() => setBulkDescriptionMode('replace')}
                  className="text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Ersetzen durch:</span>
              </label>
              {bulkDescriptionMode === 'replace' && (
                <textarea
                  value={bulkDescription}
                  onChange={(e) => setBulkDescription(e.target.value)}
                  rows={2}
                  placeholder="Neue Beschreibung..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                />
              )}
            </div>
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
          title="Eintrag wiederholen?"
          message={`Möchtest du einen neuen Zeiteintrag mit denselben Daten starten?\n\nProjekt: ${getProjectById(repeatConfirm.entry.projectId)?.name || 'Unbekannt'}\n${repeatConfirm.entry.description ? `Beschreibung: ${repeatConfirm.entry.description}` : ''}`}
          confirmText="Stoppuhr starten"
          variant="info"
        />
      )}
    </div>
  );
};
