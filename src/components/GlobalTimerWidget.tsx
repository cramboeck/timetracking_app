import { useEffect, useState } from 'react';
import { Square, Clock } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { formatDuration } from '../utils/time';

interface GlobalTimerWidgetProps {
  runningEntry: TimeEntry | null;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  currentSubView: string;
  onGoToTimer: () => void;
  onStopTimer: () => void;
}

// Bar that appears above the bottom navigation whenever a timer is running,
// regardless of which area the user is currently in. Hidden on the
// stopwatch view itself (that page already shows the timer prominently).
//
// Layout vs. existing fixed elements:
//   bottom-0  ← AreaNavigation (h-16, z-40)
//   bottom-16 ← this widget (z-30)
//   bottom-20 ← FloatingActionButton, but ONLY when no timer is running —
//               see FAB.tsx; widget and FAB never appear together.
export const GlobalTimerWidget = ({
  runningEntry,
  projects,
  customers,
  activities,
  currentSubView,
  onGoToTimer,
  onStopTimer,
}: GlobalTimerWidgetProps) => {
  // Re-render every second so the counter ticks live. Hook is unconditional
  // (React rules-of-hooks) — the actual render bails out below.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!runningEntry?.isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningEntry?.isRunning]);

  if (!runningEntry?.isRunning || !runningEntry.startTime) return null;
  if (currentSubView === 'stopwatch') return null;

  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(runningEntry.startTime).getTime()) / 1000));

  const project = projects.find(p => p.id === runningEntry.projectId);
  const customer = project ? customers.find(c => c.id === project.customerId) : undefined;
  const activity = runningEntry.activityId ? activities.find(a => a.id === runningEntry.activityId) : undefined;

  // Build the headline. Fall back gracefully if metadata is missing.
  const headline = project?.name ?? 'Laufender Timer';
  const sublineParts = [customer?.name, activity?.name].filter(Boolean) as string[];
  const subline = sublineParts.join(' · ');

  return (
    <div
      // Mobile-only: sits above the bottom navigation (h-16). On desktop the
      // DesktopSidebar already keeps the stopwatch one click away, so the
      // floating widget would just fight with the sidebar for space.
      className="md:hidden fixed bottom-16 left-0 right-0 z-30 safe-area-bottom-offset
        bg-accent-primary text-white
        border-t border-accent-dark/40
        shadow-[0_-2px_8px_rgba(0,0,0,0.15)]
        flex items-center
      "
      role="region"
      aria-label="Laufender Timer"
    >
      {/* Tappable area — navigates to the stopwatch view */}
      <button
        type="button"
        onClick={onGoToTimer}
        className="flex-1 flex items-center gap-3 px-4 py-2.5 min-w-0 active:bg-accent-dark/30 transition-colors"
      >
        <div className="relative flex-shrink-0">
          <Clock size={20} />
          {/* Pulse dot to make the running state obvious */}
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white animate-pulse" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold truncate">{headline}</div>
          {subline && (
            <div className="text-xs text-white/80 truncate">{subline}</div>
          )}
        </div>
        <div className="font-mono font-bold text-base tabular-nums whitespace-nowrap pr-1">
          {formatDuration(elapsedSeconds)}
        </div>
      </button>

      {/* Stop button — separate target to avoid accidental stops while
          trying to tap into the view. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStopTimer();
        }}
        className="flex-shrink-0 h-full px-4 flex items-center justify-center
          bg-accent-dark/40 hover:bg-accent-dark/60 active:bg-accent-dark/80
          transition-colors
        "
        aria-label="Timer stoppen"
      >
        <Square size={18} className="fill-white" />
      </button>
    </div>
  );
};
