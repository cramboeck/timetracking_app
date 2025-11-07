import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { formatDuration } from '../utils/time';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { roundTimeUp } from '../utils/timeRounding';

interface StopwatchProps {
  onSave: (entry: TimeEntry) => void;
  runningEntry: TimeEntry | null;
  onUpdateRunning: (entry: TimeEntry) => void;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
}

export const Stopwatch = ({ onSave, runningEntry, onUpdateRunning, projects, customers, activities }: StopwatchProps) => {
  const { currentUser } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [description, setDescription] = useState('');
  const startTimeRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const activeProjects = projects.filter(p => p.isActive);

  useEffect(() => {
    if (runningEntry) {
      setIsRunning(true);
      startTimeRef.current = runningEntry.startTime;
      setProjectId(runningEntry.projectId);
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
      id: crypto.randomUUID(),
      userId: currentUser!.id,
      startTime: now,
      duration: 0,
      projectId,
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

    // Apply time rounding based on user preference
    const roundedDuration = roundTimeUp(elapsedSeconds, currentUser.timeRoundingInterval);

    const entry: TimeEntry = {
      id: runningEntry?.id || crypto.randomUUID(),
      userId: currentUser.id,
      startTime: startTimeRef.current,
      endTime,
      duration: roundedDuration, // Use rounded duration
      projectId,
      description: description || '',
      isRunning: false,
      createdAt: runningEntry?.createdAt || startTimeRef.current,
    };

    onSave(entry);
    setIsRunning(false);
    setElapsedSeconds(0);
    startTimeRef.current = null;
    setProjectId('');
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
        <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Zeiterfassung</h1>
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
                Beschreibung (optional)
              </label>
              <textarea
                placeholder="Was wurde gemacht?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isRunning}
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed resize-none transition-colors"
              />
              {activities.length > 0 && !isRunning && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {activities.map(activity => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setDescription(activity.name)}
                      className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                      title={activity.description}
                    >
                      {activity.name}
                    </button>
                  ))}
                </div>
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
