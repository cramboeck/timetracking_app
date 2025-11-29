// Haptic feedback utilities for mobile devices

export const haptics = {
  // Light tap feedback (button press)
  light: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  // Medium feedback (selection change)
  medium: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },

  // Strong feedback (important action like timer start/stop)
  heavy: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }
  },

  // Success pattern (double tap)
  success: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 50, 10]);
    }
  },

  // Error pattern (triple short)
  error: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([20, 30, 20, 30, 20]);
    }
  },

  // Check if haptics are supported
  isSupported: () => {
    return 'vibrate' in navigator;
  },
};
