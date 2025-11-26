import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Plus } from 'lucide-react';
import { formatDuration } from '../utils/time';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateUUID } from '../utils/uuid';

interface StopwatchProps {
  onSave: (entry: TimeEntry) => void;
  runningEntry: TimeEntry | null;
  onUpdateRunning: (entry: TimeEntry) => void;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onOpenManualEntry?: () => void;
  prefilledEntry?: { projectId: string; activityId?: string; description: string; ticketId?: string } | null;
  onPrefilledEntryUsed?: () => void;
}

export const Stopwatch = ({ onSave, runningEntry, onUpdateRunning, projects, customers, activities, onOpenManualEntry, prefilledEntry, onPrefilledEntryUsed }: StopwatchProps) => {
  const { currentUser } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [ticketId, setTicketId] = useState<string | undefined>(undefined);
  const [description, setDescription] = useState('');
  const startTimeRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  console.log('⏱️ [STOPWATCH] Received projects:', projects);
  console.log('⏱️ [STOPWATCH] Received customers:', customers);
  const activeProjects = projects.filter(p => p.isActive);
  console.log('⏱️ [STOPWATCH] Active projects after filter:', activeProjects);

  // Handle prefilled entry (from repeat action or ticket)
  useEffect(() => {
    if (prefilledEntry && !isRunning) {
      setProjectId(prefilledEntry.projectId);
      setActivityId(prefilledEntry.activityId || '');
      setDescription(prefilledEntry.description);
      setTicketId(prefilledEntry.ticketId);
      // Clear the prefilled entry
      onPrefilledEntryUsed?.();
    }
  }, [prefilledEntry, isRunning, onPrefilledEntryUsed]);

  useEffect(() => {
    if (runningEntry) {
      setIsRunning(true);
      startTimeRef.current = runningEntry.startTime;
      setProjectId(runningEntry.projectId);
      setActivityId(runningEntry.activityId || '');
      setTicketId(runningEntry.ticketId);
      setDescription(runningEntry.description);

      const elapsed = Math.floor((Date.now() - new Date(runningEntry.startTime).getTime()) / 1000);
      setElapsedSeconds(elapsed);
    }
  }, [runningEntry]);

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
    if (!projectId) {
      alert('Bitte wähle ein Projekt aus');
      return;
    }

    const now = new Date().toISOString();
    startTimeRef.current = now;
    setIsRunning(true);
    setElapsedSeconds(0);

    const entry: TimeEntry = {
      id: generateUUID(),
      userId: currentUser!.id,
      startTime: now,
      duration: 0,
      projectId,
      activityId: activityId || undefined,
      ticketId: ticketId || undefined,
      description: description || '',
      isRunning: true,
      createdAt: now,
    };

    onUpdateRunning(entry);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleResume = () => {
    setIsRunning(true);
  };

  const handleStop = () => {
    if (!startTimeRef.current || !currentUser) return;

    const endTime = new Date().toISOString();

    const entry: TimeEntry = {
      id: runningEntry?.id || generateUUID(),
      userId: currentUser.id,
      startTime: startTimeRef.current,
      endTime,
      duration: elapsedSeconds, // Exact duration - rounding happens in reports
      projectId,
      activityId: activityId || undefined,
      ticketId: ticketId || runningEntry?.ticketId || undefined,
      description: description || '',
      isRunning: false,
      createdAt: runningEntry?.createdAt || startTimeRef.current,
    };

    onSave(entry);
    setIsRunning(false);
    setElapsedSeconds(0);
    startTimeRef.current = null;
    setProjectId('');
    setActivityId('');
    setTicketId(undefined);
    setDescription('');
  };

  const getProjectDisplay = (project: Project) => {
    const customer = customers.find(c => c.id === project.customerId);
    return `${customer?.name} - ${project.name}`;
  };

  const selectedProject = projectId ? projects.find(p => p.id === projectId) : null;
  const selectedCustomer = selectedProject ? customers.find(c => c.id === selectedProject.customerId) : null;

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Zeiterfassung</h1>
          {onOpenManualEntry && (
            <button
              onClick={onOpenManualEntry}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-darker text-white rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
              title="Manuelle Erfassung"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Manuell</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6">
        {/* Timer Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 md:p-8 mb-8 w-full max-w-2xl">
          {/* Timer Display */}
          <div className="text-center mb-8">
            <div className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-mono font-bold tracking-tight sm:tracking-wider mb-4 transition-colors break-all ${
              isRunning
                ? 'text-blue-600 dark:text-blue-400 animate-pulse'
                : 'text-gray-800 dark:text-gray-100'
            }`}>
              {formatDuration(elapsedSeconds)}
            </div>

            {/* Active Project Info */}
            {isRunning && selectedProject && (
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-800 max-w-full">
                <div
                  className="w-3 h-3 rounded-full animate-pulse flex-shrink-0"
                  style={{ backgroundColor: selectedCustomer?.color || '#3B82F6' }}
                />
                <span className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                  {selectedCustomer?.name} - {selectedProject.name}
                </span>
              </div>
            )}
          </div>

          {/* Form */}
          <div className="space-y-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Projekt
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isRunning || activeProjects.length === 0}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors"
              >
                <option value="">
                  {activeProjects.length === 0 ? 'Keine Projekte vorhanden' : 'Projekt wählen...'}
                </option>
                {activeProjects.map(project => (
                  <option key={project.id} value={project.id}>
                    {getProjectDisplay(project)}
                  </option>
                ))}
              </select>
              {activeProjects.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Bitte füge erst Kunden und Projekte in den Einstellungen hinzu
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tätigkeit (optional)
              </label>
              <select
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
                disabled={isRunning}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors"
              >
                <option value="">Keine Tätigkeit</option>
                {activities.map(activity => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name} {activity.pricingType === 'flat' && activity.flatRate ? `(Pauschale: ${activity.flatRate.toFixed(2)}€)` : ''}
                  </option>
                ))}
              </select>
              {activityId && activities.find(a => a.id === activityId)?.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {activities.find(a => a.id === activityId)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Beschreibung (optional)
                {isRunning && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">
                    · editierbar während der Erfassung
                  </span>
                )}
              </label>
              <textarea
                placeholder="Was wurde gemacht?"
                value={description}
                onChange={(e) => {
                  const newDescription = e.target.value;
                  setDescription(newDescription);

                  // Update running entry if timer is running
                  if (isRunning && runningEntry) {
                    onUpdateRunning({
                      ...runningEntry,
                      description: newDescription
                    });
                  }
                }}
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
              />
              {isRunning && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Die Beschreibung wird automatisch gespeichert
                </p>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap gap-3 justify-center">
            {!isRunning && elapsedSeconds === 0 && (
              <button
                onClick={handleStart}
                className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-accent-primary text-white rounded-full font-semibold bg-accent-primary-hover active:scale-95 touch-manipulation transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                disabled={!projectId}
              >
                <Play size={20} className="sm:w-6 sm:h-6" />
                Start
              </button>
            )}

            {isRunning && (
              <>
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-yellow-500 text-white rounded-full font-semibold hover:bg-yellow-600 active:bg-yellow-700 touch-manipulation transition-all shadow-lg hover:shadow-xl text-sm sm:text-base"
                >
                  <Pause size={20} className="sm:w-6 sm:h-6" />
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 active:bg-red-800 touch-manipulation transition-all shadow-lg hover:shadow-xl text-sm sm:text-base"
                >
                  <Square size={20} className="sm:w-6 sm:h-6" />
                  Stop
                </button>
              </>
            )}

            {!isRunning && elapsedSeconds > 0 && (
              <>
                <button
                  onClick={handleResume}
                  className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-accent-primary text-white rounded-full font-semibold bg-accent-primary-hover active:scale-95 touch-manipulation transition-all shadow-lg hover:shadow-xl text-sm sm:text-base"
                >
                  <Play size={20} className="sm:w-6 sm:h-6" />
                  Weiter
                </button>
                <button
                  onClick={handleStop}
                  className="flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 active:bg-red-800 touch-manipulation transition-all shadow-lg hover:shadow-xl text-sm sm:text-base"
                >
                  <Square size={20} className="sm:w-6 sm:h-6" />
                  Stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* Helper Text */}
        {!isRunning && elapsedSeconds === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 text-sm max-w-md">
            <p>Wähle ein Projekt aus und starte die Zeiterfassung mit einem Klick auf Start</p>
          </div>
        )}
      </div>
    </div>
  );
};
