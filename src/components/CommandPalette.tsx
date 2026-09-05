import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Timer, PenLine, List, Calendar, LayoutDashboard,
  Ticket as TicketIcon, Monitor, Bell, Wrench, Mail, BarChart2,
  Handshake, Share2, Settings, X, ArrowRight, Clock,
  CheckSquare, FileInput, History, Building2, FolderKanban, Loader2
} from 'lucide-react';
import { SubView, isSubViewAllowed } from './AreaNavigation';
import { useAuth } from '../contexts/AuthContext';
import { useFeatures } from '../contexts/FeaturesContext';
import { ticketsApi } from '../services/api';
import { Ticket, TicketStatus, Customer, Project } from '../types';

// LocalStorage key for command history
const COMMAND_HISTORY_KEY = 'command_palette_history';
const MAX_HISTORY_ITEMS = 5;
// Ab so vielen Zeichen wird global gesucht (Tickets/Kunden/Projekte)
const MIN_SEARCH_CHARS = 2;
const MAX_RESULTS_PER_SECTION = 5;

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
    icon: <TicketIcon size={18} />,
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

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  resolved: 'Gelöst',
  closed: 'Geschlossen',
  archived: 'Archiviert',
};

interface CommandPaletteProps {
  onNavigate: (subView: SubView) => void;
  // Globale Suche: Stammdaten kommen aus dem App-State, Tickets vom Server
  customers?: Customer[];
  projects?: Project[];
  onOpenTicket?: (ticketId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}

// Eine Zeile in der Ergebnisliste — Befehl oder Suchtreffer
type PaletteEntry =
  | { kind: 'command'; cmd: CommandItem }
  | { kind: 'ticket'; ticket: Ticket }
  | { kind: 'customer'; customer: Customer }
  | { kind: 'project'; project: Project };

const entryKey = (entry: PaletteEntry, prefix = ''): string => {
  switch (entry.kind) {
    case 'command': return `${prefix}cmd-${entry.cmd.id}`;
    case 'ticket': return `ticket-${entry.ticket.id}`;
    case 'customer': return `customer-${entry.customer.id}`;
    case 'project': return `project-${entry.project.id}`;
  }
};

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

export const CommandPalette = ({
  onNavigate,
  customers = [],
  projects = [],
  onOpenTicket,
  onOpenCustomer,
}: CommandPaletteProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
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

  // Debounce fuer die Server-Suche (Tickets)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Rollen-Gating: nur Befehle anbieten, deren Ziel-View erlaubt ist
  const { currentUser } = useAuth();
  const { hasFeature } = useFeatures();
  const allowedCommands = COMMANDS.filter(cmd => isSubViewAllowed(cmd.subView, currentUser?.role));

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= MIN_SEARCH_CHARS;

  // ─── Globale Suche ─────────────────────────────────────────────────────────
  const ticketSearchEnabled =
    isOpen && isSearching && !!onOpenTicket &&
    hasFeature('tickets') && isSubViewAllowed('tickets', currentUser?.role) &&
    debouncedQuery.length >= MIN_SEARCH_CHARS;

  const { data: ticketData, isFetching: ticketsLoading } = useQuery({
    queryKey: ['tickets', 'palette-search', debouncedQuery],
    queryFn: () => ticketsApi.getAll({ searchText: debouncedQuery, limit: MAX_RESULTS_PER_SECTION }),
    enabled: ticketSearchEnabled,
    staleTime: 30_000,
  });
  const ticketResults: Ticket[] = ticketSearchEnabled ? (ticketData?.data ?? []).slice(0, MAX_RESULTS_PER_SECTION) : [];

  const customersAllowed = !!onOpenCustomer && isSubViewAllowed('customers', currentUser?.role);
  const customerById = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const customerResults: Customer[] = useMemo(() => {
    if (!isSearching || !customersAllowed) return [];
    const q = trimmedQuery.toLowerCase();
    return customers
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.contactPerson?.toLowerCase().includes(q) ||
        c.customerNumber?.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS_PER_SECTION);
  }, [isSearching, customersAllowed, trimmedQuery, customers]);

  const projectResults: Project[] = useMemo(() => {
    if (!isSearching || !customersAllowed) return [];
    const q = trimmedQuery.toLowerCase();
    return projects
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_SECTION);
  }, [isSearching, customersAllowed, trimmedQuery, projects]);

  // Get recent commands from history
  const recentCommands = history
    .map(id => allowedCommands.find(cmd => cmd.id === id))
    .filter((cmd): cmd is CommandItem => cmd !== undefined);

  // Filter commands based on query
  const filteredCommands = trimmedQuery === ''
    ? allowedCommands
    : allowedCommands.filter((cmd) => {
        const q = trimmedQuery.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q))
        );
      });

  // Combined list: show recent section when no query, otherwise just filtered
  const showRecent = trimmedQuery === '' && recentCommands.length > 0;

  // Flache Liste in Anzeige-Reihenfolge — Grundlage der Tastatur-Navigation
  const flatItems: PaletteEntry[] = [
    ...(showRecent ? recentCommands.map(cmd => ({ kind: 'command' as const, cmd })) : []),
    ...filteredCommands.map(cmd => ({ kind: 'command' as const, cmd })),
    ...ticketResults.map(ticket => ({ kind: 'ticket' as const, ticket })),
    ...customerResults.map(customer => ({ kind: 'customer' as const, customer })),
    ...projectResults.map(project => ({ kind: 'project' as const, project })),
  ];

  const hasAnyResult = flatItems.length > 0;

  // Open / close
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setDebouncedQuery('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setDebouncedQuery('');
  }, []);

  const execute = useCallback((entry: PaletteEntry) => {
    switch (entry.kind) {
      case 'command':
        saveToHistory(entry.cmd.id);
        onNavigate(entry.cmd.subView);
        break;
      case 'ticket':
        onOpenTicket?.(entry.ticket.id);
        break;
      case 'customer':
        onOpenCustomer?.(entry.customer.id);
        break;
      case 'project':
        // Projekt hat keine eigene Detailseite — öffnet den Kunden (360°-Sicht)
        if (entry.project.customerId && onOpenCustomer) {
          onOpenCustomer(entry.project.customerId);
        } else {
          onNavigate('zeiten');
        }
        break;
    }
    close();
  }, [onNavigate, onOpenTicket, onOpenCustomer, close]);

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

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = flatItems[selectedIndex];
      if (entry) execute(entry);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  // ─── Rendering ─────────────────────────────────────────────────────────────

  const renderEntryContent = (entry: PaletteEntry, isSelected: boolean) => {
    let icon: React.ReactNode;
    let label: string;
    let description: string | undefined;

    switch (entry.kind) {
      case 'command':
        icon = entry.cmd.icon;
        label = entry.cmd.label;
        description = entry.cmd.description;
        break;
      case 'ticket': {
        const t = entry.ticket;
        icon = <TicketIcon size={18} />;
        label = `${t.ticketNumber} · ${t.title}`;
        const customerName = t.customerId
          ? (t.customerName || customerById.get(t.customerId)?.name || 'Unbekannt')
          : 'Intern';
        description = `${customerName} · ${TICKET_STATUS_LABELS[t.status] || t.status}`;
        break;
      }
      case 'customer': {
        const c = entry.customer;
        icon = <Building2 size={18} />;
        label = c.name;
        description = [c.customerNumber, c.contactPerson].filter(Boolean).join(' · ') || 'Kunde';
        break;
      }
      case 'project': {
        const p = entry.project;
        icon = <FolderKanban size={18} />;
        label = p.name;
        const customerName = customerById.get(p.customerId)?.name;
        description = customerName ? `Projekt bei ${customerName}` : 'Projekt';
        break;
      }
    }

    return (
      <>
        <span className={isSelected ? 'text-white' : 'text-gray-400 dark:text-dark-400'}>
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{label}</span>
          {description && (
            <span className={`block text-xs truncate ${isSelected ? 'text-white/70' : 'text-gray-400 dark:text-dark-400'}`}>
              {description}
            </span>
          )}
        </span>
        <ArrowRight size={14} className={isSelected ? 'text-white/70' : 'text-gray-300 dark:text-dark-300'} />
      </>
    );
  };

  const renderEntryRow = (entry: PaletteEntry, flatIndex: number, keyPrefix = '') => {
    const isSelected = flatIndex === selectedIndex;
    return (
      <li key={entryKey(entry, keyPrefix)}>
        <button
          data-selected={isSelected || undefined}
          onClick={() => execute(entry)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            isSelected
              ? 'bg-accent-primary text-white'
              : 'text-gray-700 dark:text-dark-500 hover:bg-gray-100 dark:hover:bg-dark-200'
          }`}
        >
          {renderEntryContent(entry, isSelected)}
        </button>
      </li>
    );
  };

  const sectionHeader = (label: string, icon?: React.ReactNode, withBorder = false) => (
    <li className={`px-4 py-1.5 text-xs font-medium text-gray-400 dark:text-dark-400 flex items-center gap-2 ${withBorder ? 'mt-2 border-t border-gray-100 dark:border-dark-200' : ''}`}>
      {icon}
      {label}
    </li>
  );

  // Abschnitts-Offsets in der flachen Liste
  const recentCount = showRecent ? recentCommands.length : 0;
  const commandsOffset = recentCount;
  const ticketsOffset = commandsOffset + filteredCommands.length;
  const customersOffset = ticketsOffset + ticketResults.length;
  const projectsOffset = customersOffset + customerResults.length;

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
            placeholder="Suchen oder springen… (Tickets, Kunden, Projekte, Befehle)"
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
          {!hasAnyResult && !ticketsLoading && (
            <li className="px-4 py-6 text-center text-sm text-gray-400 dark:text-dark-400">
              Keine Ergebnisse für „{trimmedQuery}"
            </li>
          )}

          {/* Recent commands section */}
          {showRecent && (
            <>
              {sectionHeader('Zuletzt verwendet', <History size={12} />)}
              {recentCommands.map((cmd, idx) =>
                renderEntryRow({ kind: 'command', cmd }, idx, 'recent-')
              )}
              {sectionHeader('Alle Befehle', undefined, true)}
            </>
          )}

          {/* Commands */}
          {filteredCommands.map((cmd, idx) =>
            renderEntryRow({ kind: 'command', cmd }, commandsOffset + idx)
          )}

          {/* Tickets */}
          {(ticketResults.length > 0 || (ticketSearchEnabled && ticketsLoading)) && (
            <>
              {sectionHeader('Tickets', <TicketIcon size={12} />, filteredCommands.length > 0)}
              {ticketResults.map((ticket, idx) =>
                renderEntryRow({ kind: 'ticket', ticket }, ticketsOffset + idx)
              )}
              {ticketSearchEnabled && ticketsLoading && ticketResults.length === 0 && (
                <li className="px-4 py-2 text-xs text-gray-400 dark:text-dark-400 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" />
                  Tickets werden durchsucht…
                </li>
              )}
            </>
          )}

          {/* Kunden */}
          {customerResults.length > 0 && (
            <>
              {sectionHeader('Kunden', <Building2 size={12} />, true)}
              {customerResults.map((customer, idx) =>
                renderEntryRow({ kind: 'customer', customer }, customersOffset + idx)
              )}
            </>
          )}

          {/* Projekte */}
          {projectResults.length > 0 && (
            <>
              {sectionHeader('Projekte', <FolderKanban size={12} />, true)}
              {projectResults.map((project, idx) =>
                renderEntryRow({ kind: 'project', project }, projectsOffset + idx)
              )}
            </>
          )}
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
