import { useState, useMemo, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { ticketIdFromPath, ticketPath } from './AreaNavigation';
import { LayoutDashboard, List, Keyboard, Columns } from 'lucide-react';
import { IconButton } from './ui';
import { Ticket, Customer, Project } from '../types';
import { TicketList } from './TicketList';
import { TicketDetail } from './TicketDetail';
import { TicketDashboard } from './TicketDashboard';
import { TicketKanban } from './TicketKanban';
import { CreateTicketDialog } from './CreateTicketDialog';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts, KeyboardShortcut } from '../hooks/useKeyboardShortcuts';

type ViewMode = 'dashboard' | 'list' | 'kanban';

interface TicketsProps {
  customers: Customer[];
  projects: Project[];
  onStartTimer: (ticket: Ticket) => void;
}

const isViewMode = (v: string | null): v is ViewMode => v === 'dashboard' || v === 'list' || v === 'kanban';

export const Tickets = ({ customers, projects, onStartTimer }: TicketsProps) => {
  const queryClient = useQueryClient();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // URL ist die Wahrheit: /support/tickets/<id> = Ticket geöffnet.
  // Browser-Zurück schließt damit das Ticket statt den Bereich zu verlassen,
  // Tickets sind verlinkbar (Mails, Push, Lesezeichen).
  const selectedTicketId = ticketIdFromPath(location.pathname);
  const openedFromList = (location.state as { fromList?: boolean } | null)?.fromList === true;
  const setSelectedTicketId = useCallback((id: string | null) => {
    if (id) {
      navigate(ticketPath(id), { state: { fromList: true } });
    } else if (openedFromList) {
      navigate(-1); // zurück zur Liste MIT Filter/Scroll-Zustand der History
    } else {
      navigate('/support/tickets');
    }
  }, [navigate, openedFromList]);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const refreshTickets = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
    [queryClient]
  );
  // Ansicht steht in der URL (?view=dashboard|kanban, Liste = Default),
  // zuletzt gewählte Ansicht als Fallback ohne Parameter. Start ist die
  // Liste — im Alltag zählen „Meine“/„Unzugewiesen“, nicht KPIs.
  const urlView = searchParams.get('view');
  const savedView = (() => {
    try { return localStorage.getItem('ticketViewMode'); } catch { return null; }
  })();
  const rawView: ViewMode = isViewMode(urlView) ? urlView : isViewMode(savedView) ? savedView : 'list';
  // Kanban is not usable on mobile – fall back to list
  const viewMode: ViewMode = isMobile && rawView === 'kanban' ? 'list' : rawView;

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
    refreshTickets();
  }, [refreshTickets]);

  const handleTicketCreated = () => {
    refreshTickets();
  };

  const handleTicketDeleted = () => {
    setSelectedTicketId(null);
    refreshTickets();
  };

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    try { localStorage.setItem('ticketViewMode', mode); } catch { /* privat */ }
    navigate(mode === 'list' ? '/support/tickets' : `/support/tickets?view=${mode}`, { replace: true });
  }, [navigate]);

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
      key: 'g+k',
      description: 'Zum Kanban',
      category: 'Navigation',
      handler: () => handleViewModeChange('kanban'),
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
      handler: () => refreshTickets(),
      disabled: selectedTicketId !== null,
    },
  ], [viewMode, selectedTicketId, showCreateDialog, handleBack, handleViewModeChange, refreshTickets]);

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
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-dark-100 rounded-lg overflow-x-auto">
            <button
              onClick={() => handleViewModeChange('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                viewMode === 'dashboard'
                  ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <LayoutDashboard size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => handleViewModeChange('list')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <List size={16} />
              <span className="hidden sm:inline">Liste</span>
            </button>
            {/* Kanban is hidden on mobile – not touch-friendly */}
            {!isMobile && <button
              onClick={() => handleViewModeChange('kanban')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Columns size={16} />
              <span className="hidden sm:inline">Kanban</span>
            </button>}
          </div>
          {/* Keyboard shortcuts hint */}
          <IconButton
            onClick={() => setShowHelp(true)}
            icon={<><Keyboard size={14} /><span className="text-xs">?</span></>}
            variant="default"
            size="sm"
            tooltip="Tastenkürzel anzeigen"
            className="hidden sm:flex items-center gap-1.5"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'dashboard' && (
          <TicketDashboard
            onTicketSelect={handleTicketSelectById}
            onViewAll={handleViewAllTickets}
          />
        )}
        {viewMode === 'list' && (
          <TicketList
            ref={ticketListRef}
            customers={customers}
            projects={projects}
            onTicketSelect={handleTicketSelect}
            onCreateTicket={() => setShowCreateDialog(true)}
          />
        )}
        {viewMode === 'kanban' && (
          <TicketKanban
            customers={customers}
            onTicketSelect={handleTicketSelectById}
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
