import { Plus, Play, Square } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface FloatingActionButtonProps {
  isTimerRunning: boolean;
  onStartTimer: () => void;
  onStopTimer: () => void;
  showOnViews?: string[];
  currentView: string;
}

export const FloatingActionButton = ({
  isTimerRunning,
  onStartTimer,
  onStopTimer,
  showOnViews = ['list', 'calendar', 'dashboard', 'tickets'],
  currentView,
}: FloatingActionButtonProps) => {
  // Only show on specified views
  if (!showOnViews.includes(currentView)) {
    return null;
  }

  const handleClick = () => {
    haptics.heavy();
    if (isTimerRunning) {
      onStopTimer();
    } else {
      onStartTimer();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        fixed bottom-20 right-4 z-30
        w-14 h-14 rounded-full
        flex items-center justify-center
        shadow-lg shadow-accent-primary/30
        transition-all duration-200
        active:scale-90
        ${isTimerRunning
          ? 'bg-red-500 hover:bg-red-600'
          : 'bg-accent-primary hover:bg-accent-600'
        }
      `}
      aria-label={isTimerRunning ? 'Timer stoppen' : 'Timer starten'}
    >
      {isTimerRunning ? (
        <Square size={24} className="text-white fill-white" />
      ) : (
        <Play size={24} className="text-white ml-1" />
      )}

      {/* Pulse animation when timer is running */}
      {isTimerRunning && (
        <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
      )}
    </button>
  );
};
