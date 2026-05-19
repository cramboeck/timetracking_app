import { useEffect, useRef, useState } from 'react';
import { Area, SubView } from '../components/AreaNavigation';
import { userApi } from '../services/api';

interface UseUserPreferencesArgs {
  currentUser: unknown | null;
  isAuthenticated: boolean;
  currentArea: Area;
  currentSubView: SubView;
  setCurrentArea: (area: Area) => void;
  setCurrentSubView: (subView: SubView) => void;
}

/**
 * Loads the user's last-used (area, subView) from the server on login and
 * persists changes back (debounced + localStorage fallback). The server is
 * the source of truth across devices; localStorage is just the bootstrap
 * value for the very first render.
 */
export function useUserPreferences({
  currentUser,
  isAuthenticated,
  currentArea,
  currentSubView,
  setCurrentArea,
  setCurrentSubView,
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
          if (prefs.currentArea) {
            setCurrentArea(prefs.currentArea as Area);
          }
          if (prefs.currentSubView) {
            setCurrentSubView(prefs.currentSubView as SubView);
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
  }, [currentUser, isAuthenticated, setCurrentArea, setCurrentSubView]);

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
