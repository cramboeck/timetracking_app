import { useEffect, useState } from 'react';
import { AlertTriangle, Square, Clock } from 'lucide-react';
import { TimeEntry } from '../types';

interface ForgottenTimerBannerProps {
  runningEntry: TimeEntry | null;
  onGoToTimer: () => void;
  onStopTimer: () => void;
}

const FORGOTTEN_THRESHOLD_HOURS = 8;

// Banner that appears when a running timer has been active for more than
// 8 hours — surfaces a "did you forget?" prompt with quick actions to
// either jump to the stopwatch or stop the timer right from the banner.
export const ForgottenTimerBanner = ({ runningEntry, onGoToTimer, onStopTimer }: ForgottenTimerBannerProps) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!runningEntry?.isRunning) return;
    // Re-render once per minute so the banner appears as soon as the
    // threshold is crossed (and the elapsed-hours label stays current).
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [runningEntry?.isRunning]);

  if (!runningEntry?.isRunning || !runningEntry.startTime) return null;

  const elapsedMs = now - new Date(runningEntry.startTime).getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  if (elapsedHours < FORGOTTEN_THRESHOLD_HOURS) return null;

  const fullHours = Math.floor(elapsedHours);

  return (
    <div className="bg-orange-100 dark:bg-orange-900/40 border-b border-orange-300 dark:border-orange-700 px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle size={18} className="text-orange-600 dark:text-orange-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-orange-900 dark:text-orange-100">
          <strong>Vergessener Timer?</strong>
          <span className="hidden sm:inline"> Dein Timer läuft seit über {fullHours} Stunden.</span>
          <span className="sm:hidden"> Läuft seit {fullHours} h.</span>
        </span>
      </div>
      <button
        onClick={onGoToTimer}
        className="flex items-center gap-1.5 text-sm font-medium text-orange-900 dark:text-orange-100 hover:bg-orange-200 dark:hover:bg-orange-900/60 px-3 py-1.5 rounded-md transition-colors"
        aria-label="Zum Timer wechseln"
      >
        <Clock size={14} />
        <span className="hidden sm:inline">Anzeigen</span>
      </button>
      <button
        onClick={onStopTimer}
        className="flex items-center gap-1.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600 px-3 py-1.5 rounded-md transition-colors"
        aria-label="Timer stoppen"
      >
        <Square size={14} />
        <span className="hidden sm:inline">Stoppen</span>
      </button>
    </div>
  );
};
