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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
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
