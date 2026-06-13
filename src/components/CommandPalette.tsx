import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Timer, PenLine, List, Calendar, LayoutDashboard,
  Ticket, Monitor, Bell, Wrench, Mail, BarChart2,
  Handshake, Share2, Settings, X, ArrowRight, Clock,
  CheckSquare, FileInput, History
} from 'lucide-react';
import { SubView } from './AreaNavigation';

// LocalStorage key for command history
const COMMAND_HISTORY_KEY = 'command_palette_history';
const MAX_HISTORY_ITEMS = 5;

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  subView: SubView;
  keywords?: string[];
}

const COMMANDS: CommandItem[] = [
  // Arbeiten
  {
    id: 'stopwatch',
    label: 'Stoppuhr',
    description: 'Zeiterfassung starten',
    icon: <Timer size={18} />,
    subView: 'stopwatch',
    keywords: ['timer', 'starten', 'zeit', 'erfassen', 'stoppuhr'],
  },
  {
    id: 'manual',
    label: 'Manuelle Erfassung',
    description: 'Zeiteintrag manuell anlegen',
    icon: <PenLine size={18} />,
    subView: 'manual',
    keywords: ['manuell', 'eintrag', 'erfassen', 'neu', 'hinzufügen'],
  },
  {
    id: 'list',
    label: 'Zeiteinträge',
    description: 'Alle Zeiteinträge anzeigen',
    icon: <List size={18} />,
    subView: 'list',
    keywords: ['liste', 'einträge', 'übersicht', 'verlauf'],
  },
  {
    id: 'calendar',
    label: 'Kalender',
    description: 'Kalenderansicht',
    icon: <Calendar size={18} />,
    subView: 'calendar',
    keywords: ['kalender', 'woche', 'monat', 'agenda'],
  },
  {
    id: 'tasks',
    label: 'Aufgaben',
    description: 'Aufgaben und To-dos verwalten',
    icon: <CheckSquare size={18} />,
    subView: 'tasks',
    keywords: ['aufgaben', 'tasks', 'todo', 'to-do'],
  },
  // Support
  {
    id: 'tickets',
    label: 'Tickets',
    description: 'Support-Tickets verwalten',
    icon: <Ticket size={18} />,
    subView: 'tickets',
    keywords: ['support', 'ticket', 'anfrage', 'problem', 'issue'],
  },
  {
    id: 'devices',
    label: 'Geräte',
    description: 'NinjaRMM Geräte & Monitoring',
    icon: <Monitor size={18} />,
    subView: 'devices',
    keywords: ['geräte', 'devices', 'ninjarmm', 'monitoring', 'server'],
  },
  {
    id: 'alerts',
    label: 'Alerts',
    description: 'Systemwarnungen & Benachrichtigungen',
    icon: <Bell size={18} />,
    subView: 'alerts',
    keywords: ['alerts', 'warnungen', 'benachrichtigungen', 'alarm'],
  },
  {
    id: 'maintenance',
    label: 'Wartung',
    description: 'Wartungsankündigungen',
    icon: <Wrench size={18} />,
    subView: 'maintenance',
    keywords: ['wartung', 'maintenance', 'ankündigung', 'downtime'],
  },
  {
    id: 'inbox',
    label: 'Support-Posteingang',
    description: 'E-Mails und Nachrichten',
    icon: <Mail size={18} />,
    subView: 'inbox',
    keywords: ['posteingang', 'inbox', 'email', 'nachrichten'],
  },
  // Business
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Übersicht & Kennzahlen',
    icon: <LayoutDashboard size={18} />,
    subView: 'overview',
    keywords: ['dashboard', 'übersicht', 'kennzahlen', 'statistik'],
  },
  {
    id: 'billing',
    label: 'Abrechnung',
    description: 'Rechnungen & Abrechnung',
    icon: <Clock size={18} />,
    subView: 'billing',
    keywords: ['abrechnung', 'rechnung', 'billing', 'faktura'],
  },
  {
    id: 'invoices',
    label: 'Eingangsrechnungen',
    description: 'Lieferantenrechnungen verwalten',
    icon: <FileInput size={18} />,
    subView: 'invoices',
    keywords: ['eingangsrechnung', 'lieferant', 'vendor', 'invoice'],
  },
  {
    id: 'contracts',
    label: 'Verträge',
    description: 'Verträge & Vereinbarungen',
    icon: <Handshake size={18} />,
    subView: 'contracts',
    keywords: ['vertrag', 'contract', 'vereinbarung', 'sla'],
  },
  {
    id: 'reports',
    label: 'Berichte',
    description: 'Auswertungen & Reports',
    icon: <BarChart2 size={18} />,
    subView: 'reports',
    keywords: ['bericht', 'report', 'auswertung', 'analyse'],
  },
  {
    id: 'social-media',
    label: 'Social Media',
    description: 'Posts & Kampagnen',
    icon: <Share2 size={18} />,
    subView: 'social-media',
    keywords: ['social', 'media', 'instagram', 'linkedin', 'post'],
  },
  // Settings
  {
    id: 'settings',
    label: 'Einstellungen',
    description: 'App-Einstellungen',
    icon: <Settings size={18} />,
    subView: 'settings',
    keywords: ['einstellungen', 'settings', 'profil', 'konto', 'theme', 'farbe'],
  },
];

interface CommandPaletteProps {
  onNavigate: (subView: SubView) => void;
}

// Load command history from localStorage
const loadHistory = (): string[] => {
  try {
    const stored = localStorage.getItem(COMMAND_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save command to history
const saveToHistory = (commandId: string) => {
  try {
    const history = loadHistory();
    // Remove if already exists (to move to front)
    const filtered = history.filter(id => id !== commandId);
    // Add to front and limit
    const newHistory = [commandId, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(newHistory));
  } catch {
    // Ignore localStorage errors
  }
};

export const CommandPalette = ({ onNavigate }: CommandPaletteProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Load history when palette opens
  useEffect(() => {
    if (isOpen) {
      setHistory(loadHistory());
    }
  }, [isOpen]);

  // Get recent commands from history
  const recentCommands = history
    .map(id => COMMANDS.find(cmd => cmd.id === id))
    .filter((cmd): cmd is CommandItem => cmd !== undefined);

  // Filter commands based on query
  const filteredCommands = query.trim() === ''
    ? COMMANDS
    : COMMANDS.filter((cmd) => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q))
        );
      });

  // Combined list: show recent section when no query, otherwise just filtered
  const showRecent = query.trim() === '' && recentCommands.length > 0;
  const filtered = filteredCommands;

  // Open / close
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const execute = useCallback((cmd: CommandItem) => {
    saveToHistory(cmd.id);
    onNavigate(cmd.subView);
    close();
  }, [onNavigate, close]);

  // Global keyboard listener: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? close() : open();
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, open, close]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Total items for keyboard navigation (recent + all when showing recent)
  const totalItems = showRecent ? recentCommands.length + filtered.length : filtered.length;

  // Get command at index (accounting for recent section)
  const getCommandAtIndex = (index: number): CommandItem | undefined => {
    if (showRecent) {
      if (index < recentCommands.length) {
        return recentCommands[index];
      }
      return filtered[index - recentCommands.length];
    }
    return filtered[index];
  };

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = getCommandAtIndex(selectedIndex);
      if (cmd) execute(cmd);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4"
      onClick={close}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl bg-white dark:bg-dark-100 rounded-xl shadow-2xl border border-gray-200 dark:border-dark-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-dark-200">
          <Search size={18} className="text-gray-400 dark:text-dark-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Wohin möchtest du? (z.B. Tickets, Stoppuhr, Einstellungen…)"
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 outline-none text-sm"
          />
          <button
            onClick={close}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-200 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          className="max-h-72 overflow-y-auto py-2"
        >
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400 dark:text-dark-400">
              Keine Ergebnisse für „{query}"
            </li>
          )}

          {/* Recent commands section */}
          {showRecent && (
            <>
              <li className="px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-dark-400 flex items-center gap-2">
                <History size={12} />
                Zuletzt verwendet
              </li>
              {recentCommands.map((cmd, idx) => (
                <li key={`recent-${cmd.id}`}>
                  <button
                    onClick={() => execute(cmd)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      idx === selectedIndex
                        ? 'bg-accent-primary text-white'
                        : 'text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200'
                    }`}
                  >
                    <span className={idx === selectedIndex ? 'text-white' : 'text-gray-400 dark:text-dark-400'}>
                      {cmd.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{cmd.label}</span>
                      {cmd.description && (
                        <span className={`block text-xs truncate ${idx === selectedIndex ? 'text-white/70' : 'text-gray-400 dark:text-dark-400'}`}>
                          {cmd.description}
                        </span>
                      )}
                    </span>
                    <ArrowRight size={14} className={idx === selectedIndex ? 'text-white/70' : 'text-gray-300 dark:text-dark-300'} />
                  </button>
                </li>
              ))}
              <li className="px-4 py-1.5 mt-2 text-xs font-medium text-gray-400 dark:text-dark-400 border-t border-gray-100 dark:border-dark-200">
                Alle Befehle
              </li>
            </>
          )}

          {/* All commands */}
          {filtered.map((cmd, idx) => {
            const actualIndex = showRecent ? idx + recentCommands.length : idx;
            return (
              <li key={cmd.id}>
                <button
                  onClick={() => execute(cmd)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    actualIndex === selectedIndex
                      ? 'bg-accent-primary text-white'
                      : 'text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200'
                  }`}
                >
                  <span className={actualIndex === selectedIndex ? 'text-white' : 'text-gray-400 dark:text-dark-400'}>
                    {cmd.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{cmd.label}</span>
                    {cmd.description && (
                      <span className={`block text-xs truncate ${actualIndex === selectedIndex ? 'text-white/70' : 'text-gray-400 dark:text-dark-400'}`}>
                        {cmd.description}
                      </span>
                    )}
                  </span>
                  <ArrowRight size={14} className={actualIndex === selectedIndex ? 'text-white/70' : 'text-gray-300 dark:text-dark-300'} />
                </button>
              </li>
            );
          })}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 dark:border-dark-200 bg-gray-50 dark:bg-dark-50">
          <span className="text-xs text-gray-400 dark:text-dark-400 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400 font-mono text-[10px]">↑↓</kbd>
            Navigieren
          </span>
          <span className="text-xs text-gray-400 dark:text-dark-400 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400 font-mono text-[10px]">↵</kbd>
            Öffnen
          </span>
          <span className="text-xs text-gray-400 dark:text-dark-400 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400 font-mono text-[10px]">Esc</kbd>
            Schließen
          </span>
          <span className="ml-auto text-xs text-gray-400 dark:text-dark-400 flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-dark-200 text-gray-600 dark:text-dark-400 font-mono text-[10px]">⌘K</kbd>
            Öffnen / Schließen
          </span>
        </div>
      </div>
    </div>
  );
};
