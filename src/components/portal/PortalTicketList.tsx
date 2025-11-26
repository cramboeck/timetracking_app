import { useState, useEffect } from 'react';
import { Plus, AlertCircle, Clock, CheckCircle, Pause, X, ChevronRight, RefreshCw } from 'lucide-react';
import { customerPortalApi, PortalTicket, PortalContact } from '../../services/api';

interface PortalTicketListProps {
  contact: PortalContact;
  onTicketSelect: (ticket: PortalTicket) => void;
  onCreateTicket: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: AlertCircle },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
  waiting: { label: 'Wartend', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: Pause },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200', icon: X },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-500' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  critical: { label: 'Kritisch', color: 'text-red-500' },
};

export const PortalTicketList = ({ contact, onTicketSelect, onCreateTicket }: PortalTicketListProps) => {
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerPortalApi.getTickets(statusFilter || undefined);
      setTickets(data);
    } catch (err) {
      console.error('Failed to load tickets:', err);
      setError('Fehler beim Laden der Tickets');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Meine Tickets</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {tickets.length} {tickets.length === 1 ? 'Ticket' : 'Tickets'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadTickets}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            title="Aktualisieren"
          >
            <RefreshCw size={20} />
          </button>
          {contact.canCreateTickets && (
            <button
              onClick={onCreateTicket}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Neues Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="">Alle Status</option>
          {Object.entries(statusConfig).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="text-center text-red-500 py-8">
          <AlertCircle className="mx-auto mb-2" size={32} />
          <p>{error}</p>
          <button onClick={loadTickets} className="mt-2 text-blue-600 hover:underline">
            Erneut versuchen
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-12 bg-white dark:bg-gray-800 rounded-xl">
          <AlertCircle className="mx-auto mb-3" size={48} />
          <p className="text-lg font-medium mb-2">Keine Tickets vorhanden</p>
          <p className="text-sm mb-4">
            {statusFilter ? 'Keine Tickets mit diesem Status gefunden' : 'Sie haben noch keine Tickets erstellt'}
          </p>
          {contact.canCreateTickets && !statusFilter && (
            <button
              onClick={onCreateTicket}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus size={20} />
              Erstes Ticket erstellen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const status = statusConfig[ticket.status] || statusConfig.open;
            const priority = priorityConfig[ticket.priority] || priorityConfig.normal;
            const StatusIcon = status.icon;

            return (
              <button
                key={ticket.id}
                onClick={() => onTicketSelect(ticket)}
                className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                        {ticket.ticketNumber}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        <StatusIcon size={12} />
                        {status.label}
                      </span>
                      {ticket.priority !== 'normal' && (
                        <span className={`text-xs font-medium ${priority.color}`}>
                          {priority.label}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {ticket.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Erstellt: {formatDate(ticket.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="flex-shrink-0 text-gray-400" size={20} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
