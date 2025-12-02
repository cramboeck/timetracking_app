import { useState, useRef, useCallback } from 'react';
import { haptics } from '../utils/haptics';

interface PullToRefreshConfig {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
}: PullToRefreshConfig) => {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable pull-to-refresh when scrolled to top
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const distance = Math.max(0, currentY - startY.current);

    // Apply resistance (diminishing returns)
    const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
    setPullDistance(resistedDistance);

    // Haptic feedback when crossing threshold
    if (resistedDistance >= threshold && pullDistance < threshold) {
      haptics.light();
    }
  }, [isPulling, isRefreshing, pullDistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      haptics.medium();

      try {
        await onRefresh();
        haptics.success();
      } catch (error) {
        haptics.error();
      } finally {
        setIsRefreshing(false);
      }
    }

    setIsPulling(false);
    setPullDistance(0);
  }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isPulling,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
};
