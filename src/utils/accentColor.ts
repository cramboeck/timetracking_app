import { AccentColor } from '../types';

/**
 * Accent Color Management
 * Stores user's chosen accent color preference
 */

const STORAGE_KEY = 'timetracking_accent_color';

export const accentColor = {
  /**
   * Get current accent color from localStorage
   */
  get: (): AccentColor => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && ['blue', 'green', 'orange', 'purple', 'red', 'pink'].includes(stored)) {
        return stored as AccentColor;
      }
      return 'blue'; // Default
    } catch (error) {
      console.error('Error loading accent color:', error);
      return 'blue';
    }
  },

  /**
   * Set accent color in localStorage
   */
  set: (color: AccentColor): void => {
    try {
      localStorage.setItem(STORAGE_KEY, color);
    } catch (error) {
      console.error('Error saving accent color:', error);
    }
  },

  /**
   * Initialize accent color on app load
   */
  initialize: (): AccentColor => {
    return accentColor.get();
  },
};

/**
 * Get Tailwind classes for accent color
 */
export const getAccentClasses = (color: AccentColor) => {
  return {
    bg: `bg-accent-${color}-600`,
    bgHover: `hover:bg-accent-${color}-700`,
    text: `text-accent-${color}-600`,
    border: `border-accent-${color}-600`,
    ring: `focus:ring-accent-${color}-500`,
  };
};
