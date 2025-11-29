import { X, Keyboard } from 'lucide-react';
import { KeyboardShortcut, groupShortcutsByCategory } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
}

const formatKey = (key: string): string => {
  const keyMap: Record<string, string> = {
    'arrowdown': '↓',
    'arrowup': '↑',
    'arrowleft': '←',
    'arrowright': '→',
    'enter': '↵',
    'escape': 'Esc',
    'ctrl': 'Ctrl',
    'cmd': '⌘',
    'meta': '⌘',
    'shift': '⇧',
    'alt': 'Alt',
    '/': '/',
  };
  return keyMap[key.toLowerCase()] || key.toUpperCase();
};

export const KeyboardShortcutsHelp = ({ isOpen, onClose, shortcuts }: KeyboardShortcutsHelpProps) => {
  if (!isOpen) return null;

  const groupedShortcuts = groupShortcutsByCategory(shortcuts);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard className="text-accent-primary" size={24} />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Tastenkürzel
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-gray-700 dark:text-gray-300">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.key.split('+').map((key, index) => (
                          <span key={index}>
                            {index > 0 && (
                              <span className="text-gray-400 mx-1">+</span>
                            )}
                            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">
                              {formatKey(key)}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Drücke <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-gray-200 dark:bg-gray-700 rounded">?</kbd> um diese Hilfe zu öffnen/schließen
          </p>
        </div>
      </div>
    </div>
  );
};
