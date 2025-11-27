import { useState, useEffect } from 'react';
import { Plus, Filter, AlertCircle, Clock, CheckCircle, Pause, X, ChevronRight, Search, Archive } from 'lucide-react';
import { Ticket, TicketStatus, TicketPriority, Customer, Project } from '../types';
import { ticketsApi } from '../services/api';
import { SlaStatus } from './SlaStatus';

interface TicketListProps {
  customers: Customer[];
  projects: Project[];
  onTicketSelect: (ticket: Ticket) => void;
  onCreateTicket: () => void;
}

interface TicketStats {
  open_count: number;
  in_progress_count: number;
  waiting_count: number;
  resolved_count: number;
  closed_count: number;
  critical_count: number;
  high_priority_count: number;
  total_count: number;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: AlertCircle },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
  waiting: { label: 'Wartend', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: Pause },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200', icon: X },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: Archive },
};

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-500' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  critical: { label: 'Kritisch', color: 'text-red-500' },
};

export const TicketList = ({ customers, projects, onTicketSelect, onCreateTicket }: TicketListProps) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Ticket[] | null>(null);

  // Load tickets and stats
  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter, customerFilter]);

  // Debounced server-side search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const response = await ticketsApi.search(searchQuery, {
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          customerId: customerFilter || undefined,
        });
        setSearchResults(response.data);
      } catch (err) {
        console.error('Search failed:', err);
        // Fall back to local search
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, priorityFilter, customerFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const filters: { status?: TicketStatus; customerId?: string; priority?: TicketPriority } = {};
      if (statusFilter) filters.status = statusFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (customerFilter) filters.customerId = customerFilter;

      const [ticketsResponse, statsResponse] = await Promise.all([
        ticketsApi.getAll(filters),
        ticketsApi.getStats()
      ]);

      setTickets(ticketsResponse.data || []);
      setStats(statsResponse.data || null);
    } catch (err) {
      console.error('Failed to load tickets:', err);
      setError('Fehler beim Laden der Tickets');
    } finally {
      setLoading(false);
    }
  };

  // Filter tickets by search query and archived status
  const filteredTickets = (searchResults || tickets).filter(ticket => {
    // Filter out archived tickets unless showArchived is true or statusFilter is 'archived'
    if (ticket.status === 'archived' && !showArchived && statusFilter !== 'archived') {
      return false;
    }

    // If server search is active and returned results, don't filter locally
    if (searchResults) return true;

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.title.toLowerCase().includes(query) ||
      ticket.ticketNumber.toLowerCase().includes(query) ||
      ticket.description?.toLowerCase().includes(query)
    );
  });

  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || 'Unbekannt';
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

  const clearFilters = () => {
    setStatusFilter('');
    setPriorityFilter('');
    setCustomerFilter('');
    setSearchQuery('');
    setShowArchived(false);
    setSearchResults(null);
  };

  const hasActiveFilters = statusFilter || priorityFilter || customerFilter || searchQuery || showArchived;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Tickets</h1>
          <button
            onClick={onCreateTicket}
            className="flex items-center gap-2 px-4 py-2 btn-accent rounded-lg"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Neues Ticket</span>
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.open_count}</div>
              <div className="text-sm text-blue-600 dark:text-blue-400">Offen</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.in_progress_count}</div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">In Bearbeitung</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.critical_count}</div>
              <div className="text-sm text-red-600 dark:text-red-400">Kritisch</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.resolved_count}</div>
              <div className="text-sm text-green-600 dark:text-green-400">Gelöst</div>
            </div>
          </div>
        )}

        {/* Search and Filter */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            {isSearching ? (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
              </div>
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            )}
            <input
              type="text"
              placeholder="Tickets durchsuchen (auch in Kommentaren und Tags)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
            />
            {searchQuery.length >= 2 && searchResults && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                {searchResults.length} Ergebnis{searchResults.length !== 1 ? 'se' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
              hasActiveFilters
                ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Filter size={20} />
            <span className="hidden sm:inline">Filter</span>
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Status</option>
                  {Object.entries(statusConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priorität</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | '')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Prioritäten</option>
                  {Object.entries(priorityConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kunde</label>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Kunden</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Archivierte Tickets anzeigen
              </label>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-accent-primary hover:underline"
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ticket List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
          </div>
        ) : error ? (
          <div className="text-center text-red-500 py-8">
            <AlertCircle className="mx-auto mb-2" size={32} />
            <p>{error}</p>
            <button onClick={loadData} className="mt-2 text-accent-primary hover:underline">
              Erneut versuchen
            </button>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p className="mb-2">
              {hasActiveFilters
                ? 'Keine Tickets mit diesen Filtern gefunden'
                : 'Noch keine Tickets vorhanden'}
            </p>
            {!hasActiveFilters && (
              <button
                onClick={onCreateTicket}
                className="text-accent-primary hover:underline"
              >
                Erstes Ticket erstellen
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map(ticket => {
              const status = statusConfig[ticket.status];
              const priority = priorityConfig[ticket.priority];
              const StatusIcon = status.icon;

              const isArchived = ticket.status === 'archived';

              return (
                <button
                  key={ticket.id}
                  onClick={() => onTicketSelect(ticket)}
                  className={`w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-accent-primary transition-colors ${isArchived ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                        <SlaStatus
                          firstResponseDueAt={ticket.firstResponseDueAt}
                          resolutionDueAt={ticket.resolutionDueAt}
                          firstResponseAt={ticket.firstResponseAt}
                          slaFirstResponseBreached={ticket.slaFirstResponseBreached}
                          slaResolutionBreached={ticket.slaResolutionBreached}
                          status={ticket.status}
                          compact
                        />
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {ticket.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{getCustomerName(ticket.customerId)}</span>
                        <span>•</span>
                        <span>{formatDate(ticket.createdAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="flex-shrink-0 text-gray-400" size={20} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
