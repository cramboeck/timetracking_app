import { useState, useMemo, useCallback, useRef } from 'react';
import { LayoutDashboard, List, Keyboard } from 'lucide-react';
import { Ticket, Customer, Project } from '../types';
import { TicketList } from './TicketList';
import { TicketDetail } from './TicketDetail';
import { TicketDashboard } from './TicketDashboard';
import { CreateTicketDialog } from './CreateTicketDialog';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts, KeyboardShortcut } from '../hooks/useKeyboardShortcuts';

type ViewMode = 'dashboard' | 'list';

interface TicketsProps {
  customers: Customer[];
  projects: Project[];
  onStartTimer: (ticket: Ticket) => void;
}

export const Tickets = ({ customers, projects, onStartTimer }: TicketsProps) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem('ticketViewMode') as ViewMode) || 'dashboard';
  });

  // Reference to TicketList for keyboard navigation
  const ticketListRef = useRef<{
    selectNext: () => void;
    selectPrev: () => void;
    openSelected: () => void;
    focusSearch: () => void;
    getSelectedTicketId: () => string | null;
  } | null>(null);

  const handleTicketSelect = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
  };

  const handleTicketSelectById = (ticketId: string) => {
    setSelectedTicketId(ticketId);
  };

  const handleBack = useCallback(() => {
    setSelectedTicketId(null);
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleTicketCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleTicketDeleted = () => {
    setSelectedTicketId(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('ticketViewMode', mode);
  }, []);

  const handleViewAllTickets = () => {
    handleViewModeChange('list');
  };

  // Define keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = useMemo(() => [
    // Navigation
    {
      key: 'g+d',
      description: 'Zum Dashboard',
      category: 'Navigation',
      handler: () => handleViewModeChange('dashboard'),
      disabled: selectedTicketId !== null,
    },
    {
      key: 'g+l',
      description: 'Zur Liste',
      category: 'Navigation',
      handler: () => handleViewModeChange('list'),
      disabled: selectedTicketId !== null,
    },
    {
      key: 'j',
      description: 'Nächstes Ticket',
      category: 'Navigation',
      handler: () => ticketListRef.current?.selectNext(),
      disabled: viewMode !== 'list' || selectedTicketId !== null,
    },
    {
      key: 'arrowdown',
      description: 'Nächstes Ticket',
      category: 'Navigation',
      handler: () => ticketListRef.current?.selectNext(),
      disabled: viewMode !== 'list' || selectedTicketId !== null,
    },
    {
      key: 'k',
      description: 'Vorheriges Ticket',
      category: 'Navigation',
      handler: () => ticketListRef.current?.selectPrev(),
      disabled: viewMode !== 'list' || selectedTicketId !== null,
    },
    {
      key: 'arrowup',
      description: 'Vorheriges Ticket',
      category: 'Navigation',
      handler: () => ticketListRef.current?.selectPrev(),
      disabled: viewMode !== 'list' || selectedTicketId !== null,
    },
    {
      key: 'enter',
      description: 'Ticket öffnen',
      category: 'Navigation',
      handler: () => {
        const id = ticketListRef.current?.getSelectedTicketId();
        if (id) setSelectedTicketId(id);
      },
      disabled: viewMode !== 'list' || selectedTicketId !== null,
    },
    {
      key: 'escape',
      description: 'Zurück / Schließen',
      category: 'Navigation',
      handler: () => {
        if (showCreateDialog) {
          setShowCreateDialog(false);
        } else if (selectedTicketId) {
          handleBack();
        }
      },
    },
    // Actions
    {
      key: 'n',
      description: 'Neues Ticket',
      category: 'Aktionen',
      handler: () => setShowCreateDialog(true),
      disabled: selectedTicketId !== null,
    },
    {
      key: '/',
      description: 'Suche fokussieren',
      category: 'Aktionen',
      handler: () => ticketListRef.current?.focusSearch(),
      disabled: viewMode !== 'list' || selectedTicketId !== null,
    },
    {
      key: 'r',
      description: 'Aktualisieren',
      category: 'Aktionen',
      handler: () => setRefreshKey(prev => prev + 1),
      disabled: selectedTicketId !== null,
    },
  ], [viewMode, selectedTicketId, showCreateDialog, handleBack, handleViewModeChange]);

  const { showHelp, setShowHelp, shortcuts: activeShortcuts } = useKeyboardShortcuts(shortcuts);

  if (selectedTicketId) {
    return (
      <>
        <TicketDetail
          ticketId={selectedTicketId}
          customers={customers}
          projects={projects}
          onBack={handleBack}
          onStartTimer={onStartTimer}
          onTicketDeleted={handleTicketDeleted}
        />
        <KeyboardShortcutsHelp
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          shortcuts={activeShortcuts}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* View Mode Toggle */}
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => handleViewModeChange('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'dashboard'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <LayoutDashboard size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <List size={16} />
              <span className="hidden sm:inline">Liste</span>
            </button>
          </div>
          {/* Keyboard shortcuts hint */}
          <button
            onClick={() => setShowHelp(true)}
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="Tastenkürzel anzeigen"
          >
            <Keyboard size={14} />
            <span>?</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'dashboard' ? (
          <TicketDashboard
            key={refreshKey}
            onTicketSelect={handleTicketSelectById}
            onViewAll={handleViewAllTickets}
          />
        ) : (
          <TicketList
            ref={ticketListRef}
            key={refreshKey}
            customers={customers}
            projects={projects}
            onTicketSelect={handleTicketSelect}
            onCreateTicket={() => setShowCreateDialog(true)}
          />
        )}
      </div>

      <CreateTicketDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTicketCreated}
        customers={customers}
        projects={projects}
      />

      <KeyboardShortcutsHelp
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        shortcuts={activeShortcuts}
      />
    </div>
  );
};
