import { User } from 'lucide-react';
import { Ticket, formatDate } from './types';

interface TicketMetaInfoProps {
  ticket: Ticket;
}

export const TicketMetaInfo = ({ ticket }: TicketMetaInfoProps) => {
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
      <div className="flex items-center gap-1">
        <User size={12} />
        <span>Erstellt von: <span className="text-gray-700 dark:text-gray-300">{ticket.creatorName || 'Unbekannt'}</span></span>
      </div>
      <div>Erstellt: {formatDate(ticket.createdAt)}</div>
      <div>Aktualisiert: {formatDate(ticket.updatedAt)}</div>
      {ticket.resolvedAt && <div>Gelost: {formatDate(ticket.resolvedAt)}</div>}
      {ticket.closedAt && <div>Geschlossen: {formatDate(ticket.closedAt)}</div>}
    </div>
  );
};
