import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square } from 'lucide-react';
import { formatDuration } from '../utils/time';
import { TimeEntry } from '../types';

interface StopwatchProps {
  onSave: (entry: TimeEntry) => void;
  runningEntry: TimeEntry | null;
  onUpdateRunning: (entry: TimeEntry) => void;
}

export const Stopwatch = ({ onSave, runningEntry, onUpdateRunning }: StopwatchProps) => {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [project, setProject] = useState('');
  const [description, setDescription] = useState('');
  const startTimeRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (runningEntry) {
      setIsRunning(true);
      startTimeRef.current = runningEntry.startTime;
      setProject(runningEntry.project);
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
    const now = new Date().toISOString();
    startTimeRef.current = now;
    setIsRunning(true);
    setElapsedSeconds(0);

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      startTime: now,
      duration: 0,
      project: project || 'Ohne Projekt',
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
    if (!startTimeRef.current) return;

    const endTime = new Date().toISOString();
    const entry: TimeEntry = {
      id: runningEntry?.id || crypto.randomUUID(),
      startTime: startTimeRef.current,
      endTime,
      duration: elapsedSeconds,
      project: project || 'Ohne Projekt',
      description: description || '',
      isRunning: false,
      createdAt: runningEntry?.createdAt || startTimeRef.current,
    };

    onSave(entry);
    setIsRunning(false);
    setElapsedSeconds(0);
    startTimeRef.current = null;
    setProject('');
    setDescription('');
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-2xl font-bold mb-8">Zeiterfassung</h1>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-7xl font-mono font-bold mb-12 tracking-wider">
          {formatDuration(elapsedSeconds)}
        </div>

        <div className="w-full max-w-md space-y-4 mb-8">
          <input
            type="text"
            placeholder="Projekt (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            disabled={isRunning}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <textarea
            placeholder="Beschreibung (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isRunning}
            rows={3}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-none"
          />
        </div>

        <div className="flex gap-4">
          {!isRunning && elapsedSeconds === 0 && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 active:bg-blue-800 touch-manipulation transition-colors shadow-lg"
            >
              <Play size={24} />
              Start
            </button>
          )}

          {isRunning && (
            <>
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-8 py-4 bg-yellow-500 text-white rounded-full font-semibold hover:bg-yellow-600 active:bg-yellow-700 touch-manipulation transition-colors shadow-lg"
              >
                <Pause size={24} />
                Pause
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 active:bg-red-800 touch-manipulation transition-colors shadow-lg"
              >
                <Square size={24} />
                Stop
              </button>
            </>
          )}

          {!isRunning && elapsedSeconds > 0 && (
            <>
              <button
                onClick={handleResume}
                className="flex items-center gap-2 px-8 py-4 bg-green-600 text-white rounded-full font-semibold hover:bg-green-700 active:bg-green-800 touch-manipulation transition-colors shadow-lg"
              >
                <Play size={24} />
                Weiter
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-8 py-4 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 active:bg-red-800 touch-manipulation transition-colors shadow-lg"
              >
                <Square size={24} />
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
