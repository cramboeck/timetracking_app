import { User, Calendar, RefreshCw, CheckCircle, Archive } from 'lucide-react';
import { Ticket, formatDate } from './types';

interface TicketMetaInfoProps {
  ticket: Ticket;
}

export const TicketMetaInfo = ({ ticket }: TicketMetaInfoProps) => {
  return (
    <div className="bg-white dark:bg-dark-50 rounded-lg border border-gray-200 dark:border-dark-border p-4">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase tracking-wide mb-3">
        Details
      </h4>
      <div className="space-y-2.5 text-sm">
        <div className="flex items-center gap-2 text-gray-600 dark:text-dark-400">
          <User size={14} className="flex-shrink-0" />
          <span className="truncate">
            <span className="text-gray-500 dark:text-dark-400">Erstellt von </span>
            <span className="text-gray-900 dark:text-white font-medium">{ticket.creatorName || 'Unbekannt'}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-600 dark:text-dark-400">
          <Calendar size={14} className="flex-shrink-0" />
          <span>{formatDate(ticket.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600 dark:text-dark-400">
          <RefreshCw size={14} className="flex-shrink-0" />
          <span>Aktualisiert {formatDate(ticket.updatedAt)}</span>
        </div>
        {ticket.resolvedAt && (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle size={14} className="flex-shrink-0" />
            <span>Gelöst {formatDate(ticket.resolvedAt)}</span>
          </div>
        )}
        {ticket.closedAt && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400">
            <Archive size={14} className="flex-shrink-0" />
            <span>Geschlossen {formatDate(ticket.closedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
