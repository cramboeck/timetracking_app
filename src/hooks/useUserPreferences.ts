import { useEffect, useRef, useState } from 'react';
import { Area, SubView } from '../components/AreaNavigation';
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

  // Load preferences from database on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (!currentUser || !isAuthenticated) return;

      try {
        const response = await userApi.getPreferences();
        if (response.success && response.data) {
          const prefs = response.data;
          if (prefs.currentArea && prefs.currentSubView) {
            navigateTo(prefs.currentArea as Area, prefs.currentSubView as SubView);
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
