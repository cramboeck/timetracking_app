import { useState } from 'react';
import { LayoutDashboard, List } from 'lucide-react';
import { Ticket, Customer, Project } from '../types';
import { TicketList } from './TicketList';
import { TicketDetail } from './TicketDetail';
import { TicketDashboard } from './TicketDashboard';
import { CreateTicketDialog } from './CreateTicketDialog';

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
    // Remember user preference
    return (localStorage.getItem('ticketViewMode') as ViewMode) || 'dashboard';
  });

  const handleTicketSelect = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
  };

  const handleTicketSelectById = (ticketId: string) => {
    setSelectedTicketId(ticketId);
  };

  const handleBack = () => {
    setSelectedTicketId(null);
    // Refresh the list when returning
    setRefreshKey(prev => prev + 1);
  };

  const handleTicketCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleTicketDeleted = () => {
    setSelectedTicketId(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('ticketViewMode', mode);
  };

  const handleViewAllTickets = () => {
    handleViewModeChange('list');
  };

  if (selectedTicketId) {
    return (
      <TicketDetail
        ticketId={selectedTicketId}
        customers={customers}
        projects={projects}
        onBack={handleBack}
        onStartTimer={onStartTimer}
        onTicketDeleted={handleTicketDeleted}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* View Mode Toggle - Only show when in list view or dashboard */}
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
    </div>
  );
};
