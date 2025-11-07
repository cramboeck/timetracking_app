export const darkMode = {
  get: (): boolean => {
    try {
      const stored = localStorage.getItem('darkMode');
      if (stored !== null) {
        return stored === 'true';
      }
      // Check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  },

  set: (enabled: boolean): void => {
    try {
      localStorage.setItem('darkMode', enabled.toString());
      if (enabled) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error('Error setting dark mode:', error);
    }
  },

  initialize: (): boolean => {
    const isDark = darkMode.get();
    darkMode.set(isDark);
    return isDark;
  }
};
