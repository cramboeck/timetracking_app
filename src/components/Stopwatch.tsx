import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Square, Plus, Sparkles, Check, Briefcase, Coffee, Calendar } from 'lucide-react';
import { formatDuration } from '../utils/time';
import { TimeEntry, Project, Customer, Activity, EntryScope } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateUUID } from '../utils/uuid';
import { aiApi } from '../services/api';
import { SearchableSelect } from './SearchableSelect';
import { Button } from './ui';
import { useToast } from '../contexts/UIContext';

// Internal time categories
const INTERNAL_CATEGORIES = [
  { value: 'admin', label: 'Administration' },
  { value: 'sales', label: 'Vertrieb' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'training', label: 'Weiterbildung' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'internal_support', label: 'Interner Support' },
  { value: 'travel', label: 'Reise' },
] as const;

// Absence categories
const ABSENCE_CATEGORIES = [
  { value: 'vacation', label: 'Urlaub' },
  { value: 'sick', label: 'Krankheit' },
  { value: 'special_leave', label: 'Sonderurlaub' },
] as const;

interface StopwatchProps {
  onSave: (entry: TimeEntry) => Promise<boolean> | void;
  runningEntry: TimeEntry | null;
  onUpdateRunning: (entry: TimeEntry) => void;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  entries: TimeEntry[];
  onOpenManualEntry?: () => void;
  prefilledEntry?: { projectId: string; activityId?: string; description: string; ticketId?: string } | null;
  onPrefilledEntryUsed?: () => void;
}

const WEEKLY_GOAL_HOURS = 40;

// Monday 00:00 of the current local week
const getStartOfWeek = (): Date => {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const Stopwatch = ({ onSave, runningEntry, onUpdateRunning, projects, customers, activities, entries, onOpenManualEntry, prefilledEntry, onPrefilledEntryUsed }: StopwatchProps) => {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [entryScope, setEntryScope] = useState<EntryScope>('customer_project');
  const [internalCategory, setInternalCategory] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [ticketId, setTicketId] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState('');
  const startTimeRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const descriptionUpdateTimeoutRef = useRef<number | null>(null);
  // Ref to track if timer has been stopped - used to prevent stale debounced updates
  const isStoppedRef = useRef(false);

  // Stop/Save state
  const [isStopping, setIsStopping] = useState(false);
  const [showStopSuccess, setShowStopSuccess] = useState(false);

  // AI state
  const [aiConfigured, setAiConfigured] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  const activeProjects = projects.filter(p => p.isActive);

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

  // Generate AI description
  const generateAiDescription = async () => {
    console.log('🤖 [STOPWATCH] generateAiDescription called', { aiConfigured, projectId, activityId, customerId });

    if (!aiConfigured) {
      console.warn('🤖 [STOPWATCH] AI not configured');
      return;
    }

    // Check if we have enough context
    if (!projectId && !activityId) {
      console.warn('🤖 [STOPWATCH] No project or activity selected');
      showToast('Bitte wähle zuerst ein Projekt oder eine Tätigkeit aus', 'warning');
      return;
    }

    setGeneratingDescription(true);
    try {
      const selectedProject = projects.find(p => p.id === projectId);
      const selectedCustomer = customers.find(c => c.id === customerId);
      const selectedActivity = activities.find(a => a.id === activityId);

      console.log('🤖 [STOPWATCH] Calling AI with context:', {
        projectName: selectedProject?.name,
        customerName: selectedCustomer?.name,
        activityName: selectedActivity?.name,
        existingDescription: description || undefined,
      });

      const response = await aiApi.suggestTimeEntryDescription({
        projectName: selectedProject?.name,
        customerName: selectedCustomer?.name,
        activityName: selectedActivity?.name,
        existingDescription: description || undefined,
      });

      console.log('🤖 [STOPWATCH] AI response:', response);

      if (response.success && response.data.suggestion) {
        setDescription(response.data.suggestion);
      } else {
        console.warn('🤖 [STOPWATCH] No suggestion in response:', response);
        showToast('KI konnte keinen Vorschlag generieren. Bitte versuche es später erneut.', 'error', 5000);
      }
    } catch (err: any) {
      console.error('🤖 [STOPWATCH] Failed to generate description:', err);
      showToast(`Fehler beim Generieren: ${err.message || 'Unbekannter Fehler'}`, 'error', 5000);
    } finally {
      setGeneratingDescription(false);
    }
  };

  // Get customers that have active projects
  const customersWithProjects = customers.filter(c =>
    activeProjects.some(p => p.customerId === c.id)
  );

  // Get projects for selected customer
  const projectsForCustomer = customerId
    ? activeProjects.filter(p => p.customerId === customerId)
    : [];

  // Options for SearchableSelect components
  const customerOptions = useMemo(() => {
    return customersWithProjects.map(c => ({
      value: c.id,
      label: c.name,
    }));
  }, [customersWithProjects]);

  const projectOptions = useMemo(() => {
    return projectsForCustomer.map(p => ({
      value: p.id,
      label: p.name,
    }));
  }, [projectsForCustomer]);

  const activityOptions = useMemo(() => {
    return activities.map(a => ({
      value: a.id,
      label: a.pricingType === 'flat' && a.flatRate
        ? `${a.name} (Pauschale: ${a.flatRate.toFixed(2)}€)`
        : a.name,
    }));
  }, [activities]);

  // Sum of all closed time entries in the current (Monday-based) week.
  // Excludes the running entry — its live elapsed seconds are added below.
  const closedWeekSeconds = useMemo(() => {
    const weekStart = getStartOfWeek();
    return entries.reduce((sum, e) => {
      if (e.isRunning) return sum;
      if (new Date(e.startTime) < weekStart) return sum;
      return sum + (e.duration || 0);
    }, 0);
  }, [entries]);

  const runningWeekSeconds = (runningEntry && new Date(runningEntry.startTime) >= getStartOfWeek())
    ? elapsedSeconds
    : 0;

  const weekSeconds = closedWeekSeconds + runningWeekSeconds;
  const weekGoalSeconds = WEEKLY_GOAL_HOURS * 3600;
  const weekPercent = Math.min(100, (weekSeconds / weekGoalSeconds) * 100);
  const weekHours = Math.floor(weekSeconds / 3600);
  const weekMinutes = Math.floor((weekSeconds % 3600) / 60);

  // Handle prefilled entry (from repeat action or ticket)
  useEffect(() => {
    if (prefilledEntry && !isRunning) {
      // Find the customer for this project
      const project = projects.find(p => p.id === prefilledEntry.projectId);
      if (project) {
        setCustomerId(project.customerId);
      }
      setProjectId(prefilledEntry.projectId);
      setActivityId(prefilledEntry.activityId || '');
      setDescription(prefilledEntry.description);
      setTicketId(prefilledEntry.ticketId);
      // Clear the prefilled entry
      onPrefilledEntryUsed?.();
    }
  }, [prefilledEntry, isRunning, onPrefilledEntryUsed, projects]);

  useEffect(() => {
    if (runningEntry) {
      setIsRunning(true);
      startTimeRef.current = runningEntry.startTime;
      // Find the customer for this project
      const project = projects.find(p => p.id === runningEntry.projectId);
      if (project) {
        setCustomerId(project.customerId);
      }
      setProjectId(runningEntry.projectId);
      setActivityId(runningEntry.activityId || '');
      setTicketId(runningEntry.ticketId);
      setDescription(runningEntry.description);

      const elapsed = Math.floor((Date.now() - new Date(runningEntry.startTime).getTime()) / 1000);
      setElapsedSeconds(elapsed);
    }
  }, [runningEntry, projects]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const handleStart = () => {
    // Validate based on entry scope
    if (entryScope === 'customer_project') {
      if (!projectId) {
        showToast('Bitte wähle ein Projekt aus', 'warning');
        return;
      }
    } else {
      if (!internalCategory) {
        showToast('Bitte wähle eine Kategorie aus', 'warning');
        return;
      }
    }

    // Reset stopped flag
    isStoppedRef.current = false;

    const now = new Date().toISOString();
    startTimeRef.current = now;
    setIsRunning(true);
    setElapsedSeconds(0);

    const entry: TimeEntry = {
      id: generateUUID(),
      userId: currentUser!.id,
      startTime: now,
      duration: 0,
      projectId: entryScope === 'customer_project' ? projectId : undefined,
      activityId: entryScope === 'customer_project' && activityId ? activityId : undefined,
      ticketId: entryScope === 'customer_project' && ticketId ? ticketId : undefined,
      description: description || '',
      isRunning: true,
      isBillable: entryScope !== 'absence',
      createdAt: now,
      entryScope,
      internalCategory: entryScope !== 'customer_project' ? internalCategory : undefined,
      customerVisibility: 'hidden',
    };

    onUpdateRunning(entry);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleResume = () => {
    setIsRunning(true);
  };

  const handleStop = async () => {
    if (!startTimeRef.current || !currentUser || isStopping) return;

    // IMPORTANT: Mark as stopped FIRST to prevent any pending updates
    isStoppedRef.current = true;
    setIsStopping(true);

    // Clear any pending description updates to prevent race conditions
    if (descriptionUpdateTimeoutRef.current) {
      clearTimeout(descriptionUpdateTimeoutRef.current);
      descriptionUpdateTimeoutRef.current = null;
    }

    // Stop the timer interval immediately for visual feedback
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const endTime = new Date().toISOString();
    const finalDuration = elapsedSeconds;

    const entry: TimeEntry = {
      id: runningEntry?.id || generateUUID(),
      userId: currentUser.id,
      startTime: startTimeRef.current,
      endTime,
      duration: finalDuration, // Exact duration - rounding happens in reports
      projectId: entryScope === 'customer_project' ? projectId : undefined,
      activityId: entryScope === 'customer_project' && activityId ? activityId : undefined,
      ticketId: entryScope === 'customer_project' && (ticketId || runningEntry?.ticketId) ? (ticketId || runningEntry?.ticketId) : undefined,
      description: description || '',
      isRunning: false,
      isBillable: entryScope !== 'absence',
      createdAt: runningEntry?.createdAt || startTimeRef.current,
      entryScope,
      internalCategory: entryScope !== 'customer_project' ? internalCategory : undefined,
      customerVisibility: runningEntry?.customerVisibility || 'hidden',
    };

    try {
      console.log('🛑 [STOPWATCH] Stopping timer, saving entry:', entry.id);
      const result = await onSave(entry);

      // Check if save was successful (if onSave returns a boolean)
      if (result === false) {
        console.error('❌ [STOPWATCH] Save returned false, keeping timer state');
        isStoppedRef.current = false;
        setIsStopping(false);
        // Restart the interval since save failed
        if (!intervalRef.current) {
          intervalRef.current = window.setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
          }, 1000);
        }
        return;
      }

      console.log('✅ [STOPWATCH] Timer stopped and saved successfully');

      // Show success feedback
      setShowStopSuccess(true);
      setTimeout(() => setShowStopSuccess(false), 2000);

      // Reset all state after successful save
      setIsRunning(false);
      setElapsedSeconds(0);
      startTimeRef.current = null;
      setCustomerId('');
      setProjectId('');
      setActivityId('');
      setTicketId(undefined);
      setDescription('');
    } catch (error) {
      console.error('❌ [STOPWATCH] Error stopping timer:', error);
      // Reset stopped flag on error
      isStoppedRef.current = false;
      // Restart the interval since save failed
      if (!intervalRef.current) {
        intervalRef.current = window.setInterval(() => {
          setElapsedSeconds(prev => prev + 1);
        }, 1000);
      }
      showToast('Fehler beim Speichern. Bitte versuche es erneut.', 'error', 5000);
    } finally {
      setIsStopping(false);
    }
  };

  const getProjectDisplay = (project: Project) => {
    const customer = customers.find(c => c.id === project.customerId);
    return `${customer?.name} - ${project.name}`;
  };

  const selectedProject = projectId ? projects.find(p => p.id === projectId) : null;
  const selectedCustomer = selectedProject ? customers.find(c => c.id === selectedProject.customerId) : null;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-accent-light dark:from-dark-50 dark:to-dark-100">
      {/* Header */}
      <div className="bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Zeiterfassung</h1>
          {onOpenManualEntry && (
            <Button
              onClick={onOpenManualEntry}
              icon={<Plus size={20} />}
            >
              <span className="hidden sm:inline">Manuell</span>
            </Button>
          )}
        </div>

        {/* Weekly goal progress: live total of this week (Mo–So) vs. 40h target */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs sm:text-sm mb-1.5">
            <span className="text-gray-500 dark:text-dark-400">Wochenziel</span>
            <span className="font-medium text-gray-700 dark:text-dark-500 tabular-nums">
              {weekHours}h {String(weekMinutes).padStart(2, '0')}min
              <span className="text-gray-400 dark:text-dark-400"> / {WEEKLY_GOAL_HOURS}h</span>
              <span className="ml-2 text-accent-primary">{Math.round(weekPercent)}%</span>
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-dark-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                weekPercent >= 100
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-accent-primary to-accent-dark'
              }`}
              style={{ width: `${weekPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6">
        {/* Timer Card */}
        <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl border border-gray-200 dark:border-dark-border p-4 sm:p-6 md:p-8 mb-8 w-full max-w-2xl">
          {/* Timer Display */}
          <div className="text-center mb-8">
            <div className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-mono font-bold tracking-tight sm:tracking-wider mb-4 transition-colors break-all ${
              isRunning
                ? 'text-accent-primary dark:text-accent-primary animate-pulse'
                : 'text-gray-800 dark:text-dark-500'
            }`}>
              {formatDuration(elapsedSeconds)}
            </div>

            {/* Active Entry Info */}
            {isRunning && (
              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border max-w-full ${
                entryScope === 'customer_project'
                  ? 'bg-accent-light dark:bg-accent-primary/30 border-accent-primary/30 dark:border-accent-primary/40'
                  : entryScope === 'internal'
                  ? 'bg-gray-100 dark:bg-dark-200 border-gray-300 dark:border-dark-border'
                  : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
              }`}>
                <div
                  className="w-3 h-3 rounded-full animate-pulse flex-shrink-0"
                  style={{
                    backgroundColor: entryScope === 'customer_project'
                      ? (selectedCustomer?.color || '#3B82F6')
                      : entryScope === 'internal'
                      ? '#6B7280'
                      : '#F97316'
                  }}
                />
                <span className={`text-xs sm:text-sm font-medium truncate ${
                  entryScope === 'customer_project'
                    ? 'text-accent-dark dark:text-accent-primary'
                    : entryScope === 'internal'
                    ? 'text-gray-700 dark:text-gray-300'
                    : 'text-orange-700 dark:text-orange-400'
                }`}>
                  {entryScope === 'customer_project' && selectedProject
                    ? `${selectedCustomer?.name} - ${selectedProject.name}`
                    : entryScope === 'internal'
                    ? INTERNAL_CATEGORIES.find(c => c.value === internalCategory)?.label || 'Interne Zeit'
                    : ABSENCE_CATEGORIES.find(c => c.value === internalCategory)?.label || 'Abwesenheit'}
                </span>
              </div>
            )}
          </div>

          {/* Form */}
          <div className="space-y-4 mb-8">
            {/* Entry Scope Selector */}
            <div className="flex rounded-xl bg-gray-100 dark:bg-dark-200 p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setEntryScope('customer_project');
                  setInternalCategory('');
                }}
                disabled={isRunning}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  entryScope === 'customer_project'
                    ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Briefcase size={18} />
                <span className="hidden sm:inline">Projekt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryScope('internal');
                  setInternalCategory('');
                  setCustomerId('');
                  setProjectId('');
                }}
                disabled={isRunning}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  entryScope === 'internal'
                    ? 'bg-white dark:bg-dark-100 text-gray-700 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Coffee size={18} />
                <span className="hidden sm:inline">Intern</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryScope('absence');
                  setInternalCategory('');
                  setCustomerId('');
                  setProjectId('');
                }}
                disabled={isRunning}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  entryScope === 'absence'
                    ? 'bg-white dark:bg-dark-100 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Calendar size={18} />
                <span className="hidden sm:inline">Abwesend</span>
              </button>
            </div>

            {/* Customer/Project Selection (for customer_project scope) */}
            {entryScope === 'customer_project' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Kunde
                  </label>
                  <SearchableSelect
                    options={customerOptions}
                    value={customerId}
                    onChange={(value) => {
                      setCustomerId(value);
                      setProjectId(''); // Reset project when customer changes
                    }}
                    placeholder={customersWithProjects.length === 0 ? 'Keine Kunden vorhanden' : 'Kunde suchen...'}
                    emptyMessage="Keine Kunden gefunden"
                    disabled={isRunning || customersWithProjects.length === 0}
                  />
                  {customersWithProjects.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-dark-400 mt-2">
                      Bitte füge erst Kunden und Projekte in den Einstellungen hinzu
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  {entryScope === 'internal' ? 'Kategorie' : 'Abwesenheitsgrund'}
                </label>
                <select
                  value={internalCategory}
                  onChange={(e) => setInternalCategory(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Bitte wählen...</option>
                  {(entryScope === 'internal' ? INTERNAL_CATEGORIES : ABSENCE_CATEGORIES).map(cat => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Project Selection (only for customer_project scope) */}
            {entryScope === 'customer_project' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Projekt
                  </label>
                  <SearchableSelect
                    options={projectOptions}
                    value={projectId}
                    onChange={(value) => setProjectId(value)}
                    placeholder={!customerId ? 'Erst Kunde wählen...' : projectsForCustomer.length === 0 ? 'Keine Projekte vorhanden' : 'Projekt suchen...'}
                    emptyMessage="Keine Projekte gefunden"
                    disabled={isRunning || !customerId || projectsForCustomer.length === 0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Tätigkeit (optional)
                  </label>
                  <SearchableSelect
                    options={activityOptions}
                    value={activityId}
                    onChange={(value) => setActivityId(value)}
                    placeholder="Tätigkeit suchen..."
                    emptyMessage="Keine Tätigkeiten gefunden"
                    disabled={isRunning}
                    allowClear={true}
                  />
                  {activityId && activities.find(a => a.id === activityId)?.description && (
                    <p className="text-sm text-gray-500 dark:text-dark-400 mt-2">
                      {activities.find(a => a.id === activityId)?.description}
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-dark-500">
                  Beschreibung (optional)
                  {isRunning && (
                    <span className="ml-2 text-xs text-accent-primary dark:text-accent-primary">
                      · editierbar während der Erfassung
                    </span>
                  )}
                </label>
                {aiConfigured && entryScope === 'customer_project' && (projectId || activityId) && (
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      generateAiDescription();
                    }}
                    loading={generatingDescription}
                    size="sm"
                    variant="ghost"
                    icon={!generatingDescription ? <Sparkles size={12} /> : undefined}
                    className="text-accent-dark dark:text-accent-primary bg-accent-lighter dark:bg-accent-primary/20 hover:bg-accent-lighter dark:hover:bg-accent-primary/30"
                  >
                    KI-Vorschlag
                  </Button>
                )}
              </div>
              <textarea
                placeholder={entryScope === 'customer_project' ? 'Was wurde gemacht?' : entryScope === 'internal' ? 'Details zur internen Tätigkeit...' : 'Anmerkungen (optional)...'}
                value={description}
                onChange={(e) => {
                  const newDescription = e.target.value;
                  setDescription(newDescription);

                  // Debounced update of running entry (wait 1 second after typing stops)
                  if (isRunning && runningEntry) {
                    if (descriptionUpdateTimeoutRef.current) {
                      clearTimeout(descriptionUpdateTimeoutRef.current);
                    }
                    // Capture the entry ID to check later
                    const entryId = runningEntry.id;
                    descriptionUpdateTimeoutRef.current = window.setTimeout(() => {
                      // IMPORTANT: Check ref to see if timer was stopped since this was queued
                      if (isStoppedRef.current) {
                        console.log('⚠️ [STOPWATCH] Skipping stale description update - timer was stopped');
                        return;
                      }
                      onUpdateRunning({
                        ...runningEntry,
                        description: newDescription
                      });
                    }, 1000);
                  }
                }}
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none transition-colors"
              />
              {isRunning && (
                <p className="text-xs text-gray-500 dark:text-dark-400 mt-1">
                  Die Beschreibung wird automatisch gespeichert
                </p>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            {/* Success feedback message */}
            {showStopSuccess && (
              <div className="w-full flex justify-center mb-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium animate-fade-in">
                  <Check size={16} />
                  Zeit erfolgreich gespeichert!
                </div>
              </div>
            )}

            {!isRunning && elapsedSeconds === 0 && !isStopping && (
              <Button
                onClick={handleStart}
                variant="primary"
                size="lg"
                icon={<Play size={20} className="sm:w-6 sm:h-6" />}
                disabled={entryScope === 'customer_project' ? !projectId : !internalCategory}
                className="rounded-full px-6 sm:px-8 py-3 sm:py-4 shadow-lg hover:shadow-xl active:scale-95 touch-manipulation"
              >
                Start
              </Button>
            )}

            {(isRunning || isStopping) && (
              <>
                <Button
                  onClick={handlePause}
                  disabled={isStopping}
                  variant="warning"
                  size="lg"
                  icon={<Pause size={20} className="sm:w-6 sm:h-6" />}
                  className="rounded-full px-6 sm:px-8 py-3 sm:py-4 shadow-lg hover:shadow-xl touch-manipulation"
                >
                  Pause
                </Button>
                <Button
                  onClick={handleStop}
                  disabled={isStopping}
                  variant="danger"
                  size="lg"
                  loading={isStopping}
                  icon={!isStopping ? <Square size={20} className="sm:w-6 sm:h-6" /> : undefined}
                  className="rounded-full px-6 sm:px-8 py-3 sm:py-4 shadow-lg hover:shadow-xl touch-manipulation"
                >
                  {isStopping ? 'Speichere...' : 'Stop'}
                </Button>
              </>
            )}

            {!isRunning && elapsedSeconds > 0 && !isStopping && (
              <>
                <Button
                  onClick={handleResume}
                  variant="primary"
                  size="lg"
                  icon={<Play size={20} className="sm:w-6 sm:h-6" />}
                  className="rounded-full px-6 sm:px-8 py-3 sm:py-4 shadow-lg hover:shadow-xl active:scale-95 touch-manipulation"
                >
                  Weiter
                </Button>
                <Button
                  onClick={handleStop}
                  disabled={isStopping}
                  variant="danger"
                  size="lg"
                  loading={isStopping}
                  icon={!isStopping ? <Square size={20} className="sm:w-6 sm:h-6" /> : undefined}
                  className="rounded-full px-6 sm:px-8 py-3 sm:py-4 shadow-lg hover:shadow-xl touch-manipulation"
                >
                  {isStopping ? 'Speichere...' : 'Stop'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Helper Text */}
        {!isRunning && elapsedSeconds === 0 && (
          <div className="text-center text-gray-500 dark:text-dark-400 text-sm max-w-md">
            <p>Wähle einen Kunden und ein Projekt aus, dann starte die Zeiterfassung mit einem Klick auf Start</p>
          </div>
        )}
      </div>
    </div>
  );
};
