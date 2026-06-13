import { useState, useEffect } from 'react';
import { Plus, AlertCircle, Clock, CheckCircle, Pause, X, ChevronRight, RefreshCw, User, AlertTriangle } from 'lucide-react';
import { customerPortalApi, PortalTicket, PortalContact } from '../../services/api';

interface PortalTicketListProps {
  contact: PortalContact;
  onTicketSelect: (ticket: PortalTicket) => void;
  onCreateTicket: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Offen', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/40 dark:text-accent-primary', icon: AlertCircle },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
  waiting: { label: 'Wartend', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:text-accent-primary', icon: Pause },
  waiting_for_customer: { label: 'Ihre Rückmeldung', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200', icon: AlertTriangle },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-dark-200 dark:text-dark-500', icon: X },
};

const priorityConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-dark-200' },
  normal: { label: 'Normal', color: 'text-accent-primary', bgColor: 'bg-accent-lighter dark:bg-accent-primary/20' },
  high: { label: 'Hoch', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  critical: { label: 'Kritisch', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

const slaConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  ok: { label: 'SLA OK', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  warning: { label: 'SLA kritisch', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  breached: { label: 'SLA überschritten', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' },
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

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays === 1) return 'gestern';
    if (diffDays < 7) return `vor ${diffDays} Tagen`;
    return formatDate(dateString);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Meine Tickets</h2>
          <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
            {tickets.length} {tickets.length === 1 ? 'Ticket' : 'Tickets'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadTickets}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
            title="Aktualisieren"
          >
            <RefreshCw size={20} />
          </button>
          {contact.canCreateTickets && (
            <button
              onClick={onCreateTicket}
              className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary text-white rounded-lg font-medium transition-colors"
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
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white text-sm"
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
        </div>
      ) : error ? (
        <div className="text-center text-red-500 py-8">
          <AlertCircle className="mx-auto mb-2" size={32} />
          <p>{error}</p>
          <button onClick={loadTickets} className="mt-2 text-accent-primary hover:underline">
            Erneut versuchen
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-dark-400 py-12 bg-white dark:bg-dark-100 rounded-xl">
          <AlertCircle className="mx-auto mb-3" size={48} />
          <p className="text-lg font-medium mb-2">Keine Tickets vorhanden</p>
          <p className="text-sm mb-4">
            {statusFilter ? 'Keine Tickets mit diesem Status gefunden' : 'Sie haben noch keine Tickets erstellt'}
          </p>
          {contact.canCreateTickets && !statusFilter && (
            <button
              onClick={onCreateTicket}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary text-white rounded-lg font-medium transition-colors"
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
            const sla = ticket.slaStatus ? slaConfig[ticket.slaStatus] : null;
            const StatusIcon = status.icon;

            return (
              <button
                key={ticket.id}
                onClick={() => onTicketSelect(ticket)}
                className="w-full text-left bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:border-accent-primary dark:hover:border-accent-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Top row: Ticket number, Status, Priority, SLA */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-gray-500 dark:text-dark-400">
                        {ticket.ticketNumber}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        <StatusIcon size={12} />
                        {status.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priority.bgColor} ${priority.color}`}>
                        {priority.label}
                      </span>
                      {sla && ticket.slaStatus !== 'ok' && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sla.bgColor} ${sla.color}`}>
                          {sla.label}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="font-medium text-gray-900 dark:text-white truncate mb-2">
                      {ticket.title}
                    </h3>

                    {/* Bottom row: Assigned user, Last update */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-dark-400">
                      {ticket.assignedToName && (
                        <span className="inline-flex items-center gap-1">
                          <User size={14} />
                          {ticket.assignedToName}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={14} />
                        {formatRelativeTime(ticket.updatedAt)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="flex-shrink-0 text-gray-400 mt-1" size={20} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
