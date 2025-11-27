import { useEffect, useCallback, useState } from 'react';

export interface KeyboardShortcut {
  key: string;
  description: string;
  category: string;
  handler: () => void;
  disabled?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

export const useKeyboardShortcuts = (
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) => {
  const { enabled = true } = options;
  const [showHelp, setShowHelp] = useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs
        if (event.key !== 'Escape') {
          return;
        }
      }

      // Show help with ?
      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setShowHelp(prev => !prev);
        return;
      }

      // Find matching shortcut
      const matchingShortcut = shortcuts.find((shortcut) => {
        if (shortcut.disabled) return false;

        const keys = shortcut.key.toLowerCase().split('+');
        const requiresCtrl = keys.includes('ctrl');
        const requiresMeta = keys.includes('cmd') || keys.includes('meta');
        const requiresShift = keys.includes('shift');
        const requiresAlt = keys.includes('alt');

        const mainKey = keys.filter(
          (k) => !['ctrl', 'cmd', 'meta', 'shift', 'alt'].includes(k)
        )[0];

        const keyMatches =
          event.key.toLowerCase() === mainKey ||
          event.code.toLowerCase() === `key${mainKey}` ||
          (mainKey === 'escape' && event.key === 'Escape') ||
          (mainKey === 'enter' && event.key === 'Enter') ||
          (mainKey === 'arrowdown' && event.key === 'ArrowDown') ||
          (mainKey === 'arrowup' && event.key === 'ArrowUp') ||
          (mainKey === '/' && event.key === '/');

        const modifiersMatch =
          event.ctrlKey === requiresCtrl &&
          event.metaKey === requiresMeta &&
          event.shiftKey === requiresShift &&
          event.altKey === requiresAlt;

        return keyMatches && modifiersMatch;
      });

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.handler();
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    showHelp,
    setShowHelp,
    shortcuts: shortcuts.filter((s) => !s.disabled),
  };
};

// Group shortcuts by category for display
export const groupShortcutsByCategory = (shortcuts: KeyboardShortcut[]) => {
  const groups: Record<string, KeyboardShortcut[]> = {};
  shortcuts.forEach((shortcut) => {
    if (!groups[shortcut.category]) {
      groups[shortcut.category] = [];
    }
    groups[shortcut.category].push(shortcut);
  });
  return groups;
};
