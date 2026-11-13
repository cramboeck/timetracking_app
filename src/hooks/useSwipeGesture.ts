import { useRef, useCallback } from 'react';

// Zone type for touch position detection
export type SwipeZone = 'top' | 'middle' | 'bottom';

interface SwipeConfig {
  // Legacy: single handlers for all zones (backward compatibility)
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  // Zone-based handlers
  onSwipeLeftTop?: () => void;
  onSwipeRightTop?: () => void;
  onSwipeLeftBottom?: () => void;
  onSwipeRightBottom?: () => void;
  onSwipeLeftMiddle?: () => void;
  onSwipeRightMiddle?: () => void;
  minSwipeDistance?: number;
  maxSwipeTime?: number;
  // Zone thresholds (percentage of screen height)
  topZoneThreshold?: number;  // Default: 0.30 (top 30%)
  bottomZoneThreshold?: number;  // Default: 0.30 (bottom 30%)
}

/**
 * Determines which zone a Y position falls into
 */
// Gesten, die in einer horizontal scrollbaren Leiste (Sub-Tabs, Bottom-Nav,
// Tabellen, Kanban-Boards) oder einem [data-no-swipe]-Element starten, sind
// SCROLLEN, keine Navigation — sonst springt beim Schieben der Finanzen-
// Subnavi plötzlich der Bereich (Prod-Feedback 13.11.2026).
const startsInScrollableOrOptOut = (target: EventTarget | null): boolean => {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.hasAttribute('data-no-swipe')) return true;
    const style = window.getComputedStyle(el);
    const overflowX = style.overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
};

const getZone = (
  y: number,
  screenHeight: number,
  topThreshold: number,
  bottomThreshold: number
): SwipeZone => {
  const topBoundary = screenHeight * topThreshold;
  const bottomBoundary = screenHeight * (1 - bottomThreshold);

  if (y <= topBoundary) return 'top';
  if (y >= bottomBoundary) return 'bottom';
  return 'middle';
};

export const useSwipeGesture = ({
  onSwipeLeft,
  onSwipeRight,
  onSwipeLeftTop,
  onSwipeRightTop,
  onSwipeLeftBottom,
  onSwipeRightBottom,
  onSwipeLeftMiddle,
  onSwipeRightMiddle,
  minSwipeDistance = 50,
  maxSwipeTime = 300,
  topZoneThreshold = 0.30,
  bottomZoneThreshold = 0.30,
}: SwipeConfig) => {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const touchStartZone = useRef<SwipeZone>('middle');
  const ignoreGesture = useRef<boolean>(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    ignoreGesture.current = startsInScrollableOrOptOut(e.target);
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();

    // Determine which zone the touch started in
    const screenHeight = window.innerHeight;
    touchStartZone.current = getZone(
      touchStartY.current,
      screenHeight,
      topZoneThreshold,
      bottomZoneThreshold
    );
  }, [topZoneThreshold, bottomZoneThreshold]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (ignoreGesture.current) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();

    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;
    const deltaTime = touchEndTime - touchStartTime.current;

    // Check if it's a horizontal swipe (more horizontal than vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < maxSwipeTime) {
      const zone = touchStartZone.current;
      const isSwipeRight = deltaX > minSwipeDistance;
      const isSwipeLeft = deltaX < -minSwipeDistance;

      if (isSwipeRight) {
        // Try zone-specific handler first, then fall back to generic
        if (zone === 'top' && onSwipeRightTop) {
          onSwipeRightTop();
        } else if (zone === 'bottom' && onSwipeRightBottom) {
          onSwipeRightBottom();
        } else if (zone === 'middle' && onSwipeRightMiddle) {
          onSwipeRightMiddle();
        } else if (onSwipeRight) {
          onSwipeRight();
        }
      } else if (isSwipeLeft) {
        // Try zone-specific handler first, then fall back to generic
        if (zone === 'top' && onSwipeLeftTop) {
          onSwipeLeftTop();
        } else if (zone === 'bottom' && onSwipeLeftBottom) {
          onSwipeLeftBottom();
        } else if (zone === 'middle' && onSwipeLeftMiddle) {
          onSwipeLeftMiddle();
        } else if (onSwipeLeft) {
          onSwipeLeft();
        }
      }
    }
  }, [
    onSwipeLeft, onSwipeRight,
    onSwipeLeftTop, onSwipeRightTop,
    onSwipeLeftBottom, onSwipeRightBottom,
    onSwipeLeftMiddle, onSwipeRightMiddle,
    minSwipeDistance, maxSwipeTime
  ]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
};
