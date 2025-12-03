const STORAGE_KEY = 'timetracking_darkMode';

export const darkMode = {
  get: (): boolean => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
      // Check system preference as fallback
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  },

  set: (enabled: boolean): void => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled.toString());
      darkMode.apply(enabled);
    } catch (error) {
      console.error('Error setting dark mode:', error);
    }
  },

  // Apply dark mode class without saving to localStorage
  apply: (enabled: boolean): void => {
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },

  // Initialize dark mode - call this before React renders to prevent FOUC
  initialize: (): boolean => {
    const isDark = darkMode.get();
    darkMode.apply(isDark);
    return isDark;
  },

  // Sync dark mode from user preferences (when logged in)
  syncFromUser: (userDarkMode: boolean): void => {
    darkMode.set(userDarkMode);
  }
};
