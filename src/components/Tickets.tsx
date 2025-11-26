import { useState } from 'react';
import { Ticket, Customer, Project } from '../types';
import { TicketList } from './TicketList';
import { TicketDetail } from './TicketDetail';
import { CreateTicketDialog } from './CreateTicketDialog';

interface TicketsProps {
  customers: Customer[];
  projects: Project[];
  onStartTimer: (ticket: Ticket) => void;
}

export const Tickets = ({ customers, projects, onStartTimer }: TicketsProps) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTicketSelect = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
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
    <>
      <TicketList
        key={refreshKey}
        customers={customers}
        projects={projects}
        onTicketSelect={handleTicketSelect}
        onCreateTicket={() => setShowCreateDialog(true)}
      />
      <CreateTicketDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTicketCreated}
        customers={customers}
        projects={projects}
      />
    </>
  );
};
