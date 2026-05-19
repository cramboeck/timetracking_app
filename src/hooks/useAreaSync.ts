import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Area,
  SubView,
  pathToAreaSubView,
  areaSubViewToPath,
} from '../components/AreaNavigation';

/**
 * Keeps the React-Router URL and the (currentArea, currentSubView) React
 * state in sync, in both directions:
 *
 *   URL → state   when the user uses Browser-Back / Forward or hits a
 *                 deep-link directly.
 *   state → URL   when application code calls setCurrentArea or
 *                 setCurrentSubView (sidebar clicks, bottom-nav, etc.).
 *
 * The initial sync uses `replace` so users who land on "/" or an unknown
 * path don't end up with a phantom history entry that immediately re-routes
 * them forward when they press Back.
 *
 * Initial values are derived from the URL first, with localStorage as a
 * fallback and `defaultArea`/`defaultSubView` as the last resort.
 */
export function useAreaSync(defaultArea: Area, defaultSubView: SubView) {
  const location = useLocation();
  const navigate = useNavigate();

  const initialNav = (() => {
    const fromUrl = pathToAreaSubView(location.pathname);
    if (fromUrl) return fromUrl;
    const savedArea = localStorage.getItem('currentArea') as Area | null;
    const savedSubView = localStorage.getItem('currentSubView') as SubView | null;
    return {
      area: savedArea || defaultArea,
      subView: savedSubView || defaultSubView,
    };
  })();

  const [currentArea, setCurrentArea] = useState<Area>(initialNav.area);
  const [currentSubView, setCurrentSubView] = useState<SubView>(initialNav.subView);

  // URL → State (Browser-Back/Forward, deep links)
  useEffect(() => {
    const parsed = pathToAreaSubView(location.pathname);
    if (!parsed) return;
    if (parsed.area !== currentArea) setCurrentArea(parsed.area);
    if (parsed.subView !== currentSubView) setCurrentSubView(parsed.subView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // State → URL (UI clicks, programmatic setCurrentArea/SubView)
  const initialUrlSyncedRef = useRef(false);
  useEffect(() => {
    const expected = areaSubViewToPath(currentArea, currentSubView);
    if (location.pathname !== expected) {
      navigate(expected, { replace: !initialUrlSyncedRef.current });
    }
    initialUrlSyncedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentArea, currentSubView]);

  return { currentArea, setCurrentArea, currentSubView, setCurrentSubView };
}
