import { useEffect, useRef, useState } from 'react';
import { Area, SubView, pathToAreaSubView } from '../components/AreaNavigation';
import { userApi } from '../services/api';

interface UseUserPreferencesArgs {
  currentUser: unknown | null;
  isAuthenticated: boolean;
  currentArea: Area;
  currentSubView: SubView;
  navigateTo: (area: Area, subView: SubView) => void;
}

/**
 * Loads the user's last-used (area, subView) from the server on login and
 * persists changes back (debounced + localStorage fallback). The server is
 * the source of truth across devices; localStorage is just the bootstrap
 * value for the very first render.
 *
 * Since Pass 4c, the URL is the source of truth — so applying a loaded
 * preference means calling `navigateTo` instead of mutating React state.
 *
 * Race-condition guard (Pass 4c hotfix): the preferences load is async,
 * so a user click landing between "load starts" and "load returns" used
 * to be silently overwritten — the click visibly happened, then the
 * URL snapped back to the saved view. Now we snapshot (area, subView)
 * at mount time and skip the navigateTo if the user has already moved
 * away from there.
 */
export function useUserPreferences({
  currentUser,
  isAuthenticated,
  currentArea,
  currentSubView,
  navigateTo,
}: UseUserPreferencesArgs): { preferencesLoaded: boolean } {
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const savingPreferencesRef = useRef(false);
  // What the URL parsed to at first render — used to detect whether the
  // user has navigated during the async preferences load.
  const mountSnapshotRef = useRef({ area: currentArea, subView: currentSubView });
  // Idempotency guard — load preferences once per authenticated session.
  // Without this, a stale currentUser reference change (refresh-token,
  // multi-device sync, etc.) could re-fire the loader and bounce the URL.
  const hasLoadedRef = useRef(false);

  // Load preferences from database on mount
  useEffect(() => {
    if (!currentUser || !isAuthenticated) {
      hasLoadedRef.current = false;
      return;
    }
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadPreferences = async () => {
      try {
        const response = await userApi.getPreferences();
        if (response.success && response.data) {
          const prefs = response.data;
          if (prefs.currentArea && prefs.currentSubView) {
            // If the user clicked anywhere during the load, their click wins.
            const nowParsed = pathToAreaSubView(window.location.pathname);
            const userNavigated =
              !nowParsed ||
              nowParsed.area !== mountSnapshotRef.current.area ||
              nowParsed.subView !== mountSnapshotRef.current.subView;
            if (userNavigated) {
              console.log('📋 [PREFS] User navigated during load, keeping current URL');
            } else {
              navigateTo(prefs.currentArea as Area, prefs.currentSubView as SubView);
            }
          }
          console.log('✅ [PREFS] Loaded user preferences from database:', prefs);
        }
      } catch (error) {
        console.log('📋 [PREFS] No saved preferences found, using defaults');
      } finally {
        setPreferencesLoaded(true);
      }
    };

    loadPreferences();
  }, [currentUser, isAuthenticated, navigateTo]);

  // Save preferences to database when they change (debounced)
  useEffect(() => {
    if (!preferencesLoaded || !currentUser || !isAuthenticated) return;
    if (savingPreferencesRef.current) return;

    const savePreferences = async () => {
      savingPreferencesRef.current = true;
      try {
        await userApi.updatePreferences({
          currentArea,
          currentSubView,
        });
        localStorage.setItem('currentArea', currentArea);
        localStorage.setItem('currentSubView', currentSubView);
      } catch (error) {
        console.error('❌ [PREFS] Failed to save preferences:', error);
      } finally {
        savingPreferencesRef.current = false;
      }
    };

    const timer = setTimeout(savePreferences, 500);
    return () => clearTimeout(timer);
  }, [currentArea, currentSubView, preferencesLoaded, currentUser, isAuthenticated]);

  return { preferencesLoaded };
}
