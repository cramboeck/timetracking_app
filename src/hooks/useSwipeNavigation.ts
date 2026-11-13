import { useCallback } from 'react';
import { Area, SubView, isAreaAllowed, isSubViewAllowed } from '../components/AreaNavigation';
import { useSwipeGesture } from './useSwipeGesture';
import { haptics } from '../utils/haptics';

// Mobile gesture targets — the order here defines what "next" / "previous"
// means for the user.
const VISIBLE_AREAS: Area[] = ['dashboard', 'arbeiten', 'personal', 'support', 'crm', 'finanzen'];

// Reihenfolge = sichtbare Navigation (areaConfig). Admin-only-SubViews
// werden zur Laufzeit per isSubViewAllowed gefiltert, damit Member nicht in
// den Deep-Link-Guard swipen.
const SUBVIEW_CONFIG: Record<Area, SubView[]> = {
  dashboard: ['overview'],
  arbeiten: ['stopwatch', 'tasks', 'zeiten'],
  personal: ['arbeitszeit', 'abwesenheit'],
  support: ['tickets', 'inbox', 'devices', 'alerts', 'vulnerabilities', 'maintenance'],
  crm: ['crm-dashboard', 'customers', 'pipeline', 'contracts'],
  finanzen: ['invoices', 'billing', 'orders', 'reports', 'documents-search'],
};

interface UseSwipeNavigationArgs {
  currentArea: Area;
  currentSubView: SubView;
  onAreaChange: (area: Area) => void;
  onSubViewChange: (subView: SubView) => void;
  /** users.role — filtert admin-only Ziele aus den Swipe-Ketten */
  role?: string;
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
  role,
}: UseSwipeNavigationArgs) {
  const visibleAreas = VISIBLE_AREAS.filter(a => isAreaAllowed(a, role));
  const visibleSubViews = SUBVIEW_CONFIG[currentArea].filter(v => isSubViewAllowed(v, role));

  const handleSwipeLeftArea = useCallback(() => {
    const currentIndex = visibleAreas.indexOf(currentArea);
    if (currentIndex >= 0 && currentIndex < visibleAreas.length - 1) {
      haptics.light();
      onAreaChange(visibleAreas[currentIndex + 1]);
    }
  }, [currentArea, onAreaChange, visibleAreas]);

  const handleSwipeRightArea = useCallback(() => {
    const currentIndex = visibleAreas.indexOf(currentArea);
    if (currentIndex > 0) {
      haptics.light();
      onAreaChange(visibleAreas[currentIndex - 1]);
    }
  }, [currentArea, onAreaChange, visibleAreas]);

  const handleSwipeLeftSubView = useCallback(() => {
    const currentIndex = visibleSubViews.indexOf(currentSubView);
    if (currentIndex >= 0 && currentIndex < visibleSubViews.length - 1) {
      haptics.light();
      onSubViewChange(visibleSubViews[currentIndex + 1]);
    }
  }, [currentSubView, onSubViewChange, visibleSubViews]);

  const handleSwipeRightSubView = useCallback(() => {
    const currentIndex = visibleSubViews.indexOf(currentSubView);
    if (currentIndex > 0) {
      haptics.light();
      onSubViewChange(visibleSubViews[currentIndex - 1]);
    }
  }, [currentSubView, onSubViewChange, visibleSubViews]);

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
