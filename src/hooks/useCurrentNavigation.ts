import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Area,
  SubView,
  areaSubViewToPath,
  getAreaFromSubView,
  getDefaultSubView,
  pathToAreaSubView,
} from '../components/AreaNavigation';

interface UseCurrentNavigationReturn {
  /** Derived from the URL — no local state. */
  currentArea: Area;
  /** Derived from the URL — no local state. */
  currentSubView: SubView;
  /** Navigate to an area's default subView. */
  navigateToArea: (area: Area) => void;
  /** Navigate to a subView (area inferred from subView). */
  navigateToSubView: (subView: SubView) => void;
  /** Navigate to an explicit (area, subView) pair — useful when an action
   *  needs to change both simultaneously without two history entries. */
  navigateTo: (area: Area, subView: SubView) => void;
}

/**
 * URL-as-state navigation: derives `currentArea` and `currentSubView`
 * directly from `useLocation().pathname` instead of keeping React state in
 * sync with the URL. Replaces `useAreaSync` from Pass 4a — that hook owned
 * a mirrored state pair and ran two bidirectional `useEffect`s; this one
 * just reads.
 *
 * On the very first render, if the user landed on "/" or an unparseable
 * path, we issue a single `navigate(..., { replace: true })` to canonicalize
 * the URL to `/area/subView` — without that initial replace, Browser-Back
 * would land back on the unknown path and immediately re-route forward.
 */
export function useCurrentNavigation(
  defaultArea: Area,
  defaultSubView: SubView,
): UseCurrentNavigationReturn {
  const location = useLocation();
  const navigate = useNavigate();

  const parsed = pathToAreaSubView(location.pathname);
  const currentArea = parsed?.area ?? defaultArea;
  const currentSubView = parsed?.subView ?? defaultSubView;

  const initialSyncedRef = useRef(false);
  useEffect(() => {
    if (initialSyncedRef.current) return;
    const canonical = areaSubViewToPath(currentArea, currentSubView);
    if (location.pathname !== canonical) {
      navigate(canonical, { replace: true });
    }
    initialSyncedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToArea = useCallback((area: Area) => {
    navigate(areaSubViewToPath(area, getDefaultSubView(area)));
  }, [navigate]);

  const navigateToSubView = useCallback((subView: SubView) => {
    navigate(areaSubViewToPath(getAreaFromSubView(subView), subView));
  }, [navigate]);

  const navigateTo = useCallback((area: Area, subView: SubView) => {
    navigate(areaSubViewToPath(area, subView));
  }, [navigate]);

  return {
    currentArea,
    currentSubView,
    navigateToArea,
    navigateToSubView,
    navigateTo,
  };
}
