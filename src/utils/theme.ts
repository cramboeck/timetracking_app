import { GrayTone } from '../types';

const STORAGE_KEY_GRAY_TONE = 'timetracking_gray_tone';

export const grayTone = {
  get: (): GrayTone => {
    const stored = localStorage.getItem(STORAGE_KEY_GRAY_TONE);
    if (stored && ['light', 'medium', 'dark'].includes(stored)) {
      return stored as GrayTone;
    }
    return 'medium'; // Default
  },

  set: (tone: GrayTone): void => {
    localStorage.setItem(STORAGE_KEY_GRAY_TONE, tone);
    applyGrayTone(tone);
  },

  initialize: (): GrayTone => {
    const tone = grayTone.get();
    applyGrayTone(tone);
    return tone;
  },
};

// Apply gray tone to root element
const applyGrayTone = (tone: GrayTone): void => {
  const root = document.documentElement;

  // Remove all tone classes
  root.classList.remove('tone-light', 'tone-medium', 'tone-dark');

  // Add selected tone class
  root.classList.add(`tone-${tone}`);
};

// Get gray tone CSS classes for different levels
export const getGrayClasses = (tone: GrayTone) => {
  const tones = {
    light: {
      bg: 'bg-gray-50',
      bgDark: 'dark:bg-gray-800',
      border: 'border-gray-200',
      borderDark: 'dark:border-gray-700',
      text: 'text-gray-900',
      textDark: 'dark:text-gray-100',
      textMuted: 'text-gray-600',
      textMutedDark: 'dark:text-gray-400',
    },
    medium: {
      bg: 'bg-gray-50',
      bgDark: 'dark:bg-dark-100',
      border: 'border-gray-200',
      borderDark: 'dark:border-dark-200',
      text: 'text-gray-900',
      textDark: 'dark:text-white',
      textMuted: 'text-gray-600',
      textMutedDark: 'dark:text-dark-400',
    },
    dark: {
      bg: 'bg-gray-100',
      bgDark: 'dark:bg-dark-50',
      border: 'border-gray-300',
      borderDark: 'dark:border-dark-100',
      text: 'text-gray-900',
      textDark: 'dark:text-dark-900',
      textMuted: 'text-gray-700',
      textMutedDark: 'dark:text-dark-500',
    },
  };

  return tones[tone];
};
