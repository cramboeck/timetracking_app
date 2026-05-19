import { useCallback } from 'react';
import { Area, SubView } from '../components/AreaNavigation';
import { useSwipeGesture } from './useSwipeGesture';
import { haptics } from '../utils/haptics';

// Mobile gesture targets — the order here defines what "next" / "previous"
// means for the user.
const VISIBLE_AREAS: Area[] = ['dashboard', 'arbeiten', 'support', 'crm', 'finanzen'];

const SUBVIEW_CONFIG: Record<Area, SubView[]> = {
  dashboard: ['overview'],
  arbeiten: ['stopwatch', 'tasks', 'list', 'calendar'],
  support: ['tickets', 'inbox', 'devices', 'alerts', 'maintenance'],
  crm: ['customers', 'leads', 'pipeline', 'contracts'],
  finanzen: ['invoices', 'billing', 'reports'],
};

interface UseSwipeNavigationArgs {
  currentArea: Area;
  currentSubView: SubView;
  onAreaChange: (area: Area) => void;
  onSubViewChange: (subView: SubView) => void;
}

/**
 * Returns swipe handlers for the mobile app shell:
 *   - Bottom 30% of the screen swipes between areas (dashboard ↔ arbeiten ↔ ...)
 *   - Top 30% of the screen swipes between subViews within the current area
 *   - The middle 40% is left untouched so normal page scrolling still works.
 *
 * `useSwipeGesture` handles the zone math; this hook just wires up which
 * direction means which area/subView jump.
 */
export function useSwipeNavigation({
  currentArea,
  currentSubView,
  onAreaChange,
  onSubViewChange,
}: UseSwipeNavigationArgs) {
  const handleSwipeLeftArea = useCallback(() => {
    const currentIndex = VISIBLE_AREAS.indexOf(currentArea);
    if (currentIndex < VISIBLE_AREAS.length - 1) {
      haptics.light();
      onAreaChange(VISIBLE_AREAS[currentIndex + 1]);
    }
  }, [currentArea, onAreaChange]);

  const handleSwipeRightArea = useCallback(() => {
    const currentIndex = VISIBLE_AREAS.indexOf(currentArea);
    if (currentIndex > 0) {
      haptics.light();
      onAreaChange(VISIBLE_AREAS[currentIndex - 1]);
    }
  }, [currentArea, onAreaChange]);

  const handleSwipeLeftSubView = useCallback(() => {
    const subViews = SUBVIEW_CONFIG[currentArea];
    const currentIndex = subViews.indexOf(currentSubView);
    if (currentIndex < subViews.length - 1) {
      haptics.light();
      onSubViewChange(subViews[currentIndex + 1]);
    }
  }, [currentArea, currentSubView, onSubViewChange]);

  const handleSwipeRightSubView = useCallback(() => {
    const subViews = SUBVIEW_CONFIG[currentArea];
    const currentIndex = subViews.indexOf(currentSubView);
    if (currentIndex > 0) {
      haptics.light();
      onSubViewChange(subViews[currentIndex - 1]);
    }
  }, [currentArea, currentSubView, onSubViewChange]);

  return useSwipeGesture({
    onSwipeLeftTop: handleSwipeLeftSubView,
    onSwipeRightTop: handleSwipeRightSubView,
    onSwipeLeftBottom: handleSwipeLeftArea,
    onSwipeRightBottom: handleSwipeRightArea,
    // App-shell swipes need a longer travel than the default to avoid
    // accidentally triggering navigation during normal scroll-y motion.
    minSwipeDistance: 75,
    topZoneThreshold: 0.30,
    bottomZoneThreshold: 0.30,
  });
}
