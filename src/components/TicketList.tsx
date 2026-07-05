import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, Filter, AlertCircle, Clock, CheckCircle, Pause, X, ChevronRight, Search, Archive, Trash2, Square, CheckSquare, MinusSquare, Mail, Globe, Smartphone, Monitor } from 'lucide-react';
import { Ticket, TicketStatus, TicketPriority, TicketSource, Customer, Project } from '../types';
import { ticketsApi, organizationsApi } from '../services/api';
import { SlaStatus } from './SlaStatus';
import { Button } from './ui';
import { SkeletonListItem } from './Skeleton';
import { useToast, useConfirm } from '../contexts/UIContext';

export interface TicketListHandle {
  selectNext: () => void;
  selectPrev: () => void;
  openSelected: () => void;
  focusSearch: () => void;
  getSelectedTicketId: () => string | null;
}

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
  open: { label: 'Offen', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/40 dark:text-accent-primary', icon: AlertCircle },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
  waiting: { label: 'Wartend', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:text-accent-primary', icon: Pause },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-dark-200 dark:text-dark-500', icon: X },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-500 dark:bg-dark-100 dark:text-dark-400', icon: Archive },
};

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-accent-primary' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  critical: { label: 'Kritisch', color: 'text-red-500' },
};

const sourceConfig: Record<TicketSource, { label: string; icon: typeof Mail; color: string }> = {
  manual: { label: 'Manuell', icon: Globe, color: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400' },
  email: { label: 'E-Mail', icon: Mail, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  ninja_alert: { label: 'NinjaRMM', icon: AlertCircle, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  portal: { label: 'Portal', icon: Smartphone, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
};

export const TicketList = forwardRef<TicketListHandle, TicketListProps>(
  ({ customers, projects, onTicketSelect, onCreateTicket }, ref) => {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();

  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Bulk selection state
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());

  // Organization members for assignment dropdown
  const membersQuery = useQuery({
    queryKey: ['organization', 'current', 'members'],
    queryFn: async () => {
      // First get current organization
      const orgRes = await organizationsApi.getCurrent();
      if (!orgRes.success || !orgRes.data?.id) return [];
      // Then get members
      const membersRes = await organizationsApi.getMembers(orgRes.data.id);
      return membersRes.data || [];
    },
    enabled: selectedTicketIds.size > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Bulk action mutations
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ticketIds, status }: { ticketIds: string[]; status: TicketStatus }) => {
      return ticketsApi.bulkUpdateStatus(ticketIds, status);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast(`${data.count} Tickets aktualisiert`, 'success');
      setSelectedTicketIds(new Set());
    },
    onError: () => {
      showToast('Fehler beim Aktualisieren der Tickets', 'error');
    },
  });

  const bulkPriorityMutation = useMutation({
    mutationFn: async ({ ticketIds, priority }: { ticketIds: string[]; priority: TicketPriority }) => {
      return ticketsApi.bulkUpdatePriority(ticketIds, priority);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast(`${data.count} Tickets aktualisiert`, 'success');
      setSelectedTicketIds(new Set());
    },
    onError: () => {
      showToast('Fehler beim Aktualisieren der Tickets', 'error');
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ticketIds, assignedToUserId }: { ticketIds: string[]; assignedToUserId: string | null }) => {
      return ticketsApi.bulkAssign(ticketIds, assignedToUserId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast(`${data.count} Tickets zugewiesen`, 'success');
      setSelectedTicketIds(new Set());
    },
    onError: () => {
      showToast('Fehler beim Zuweisen der Tickets', 'error');
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async (ticketIds: string[]) => {
      return ticketsApi.bulkArchive(ticketIds);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast(`${data.count} Tickets archiviert`, 'success');
      setSelectedTicketIds(new Set());
    },
    onError: () => {
      showToast('Fehler beim Archivieren der Tickets', 'error');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ticketIds: string[]) => {
      return ticketsApi.bulkDelete(ticketIds);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      showToast(`${data.count} Tickets geloescht`, 'success');
      setSelectedTicketIds(new Set());
    },
    onError: () => {
      showToast('Fehler beim Loeschen der Tickets', 'error');
    },
  });

  const isBulkActionPending = bulkStatusMutation.isPending || bulkPriorityMutation.isPending ||
    bulkAssignMutation.isPending || bulkArchiveMutation.isPending || bulkDeleteMutation.isPending;

  // Bulk action handlers
  const handleBulkStatusChange = (status: TicketStatus) => {
    const ticketIds = Array.from(selectedTicketIds);
    bulkStatusMutation.mutate({ ticketIds, status });
  };

  const handleBulkPriorityChange = (priority: TicketPriority) => {
    const ticketIds = Array.from(selectedTicketIds);
    bulkPriorityMutation.mutate({ ticketIds, priority });
  };

  const handleBulkAssign = (assignedToUserId: string | null) => {
    const ticketIds = Array.from(selectedTicketIds);
    bulkAssignMutation.mutate({ ticketIds, assignedToUserId });
  };

  const handleBulkArchive = async () => {
    const ok = await confirm({
      title: 'Tickets archivieren',
      message: `Möchten Sie ${selectedTicketIds.size} Ticket${selectedTicketIds.size > 1 ? 's' : ''} wirklich archivieren?`,
      confirmText: 'Archivieren',
      variant: 'warning',
    });
    if (!ok) return;
    const ticketIds = Array.from(selectedTicketIds);
    bulkArchiveMutation.mutate(ticketIds);
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Tickets löschen',
      message: `Möchten Sie ${selectedTicketIds.size} Ticket${selectedTicketIds.size > 1 ? 's' : ''} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;
    const ticketIds = Array.from(selectedTicketIds);
    bulkDeleteMutation.mutate(ticketIds);
  };

  // Toggle selection for a single ticket
  const toggleTicketSelection = (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTicketIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ticketId)) {
        newSet.delete(ticketId);
      } else {
        newSet.add(ticketId);
      }
      return newSet;
    });
  };

  // Select/deselect all filtered tickets
  const toggleSelectAll = () => {
    if (selectedTicketIds.size === filteredTickets.length) {
      setSelectedTicketIds(new Set());
    } else {
      setSelectedTicketIds(new Set(filteredTickets.map(t => t.id)));
    }
  };

  // Get selection state for header checkbox
  const getSelectAllState = (): 'none' | 'some' | 'all' => {
    if (selectedTicketIds.size === 0) return 'none';
    if (selectedTicketIds.size === filteredTickets.length) return 'all';
    return 'some';
  };

  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const ticketListContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    if (searchQuery.length < 2) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filters = {
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    customerId: customerFilter || undefined,
  };

  const ticketsQuery = useQuery({
    queryKey: ['tickets', 'list', filters],
    queryFn: async () => {
      const res = await ticketsApi.getAll(filters);
      return (res.data || []) as Ticket[];
    },
  });

  const statsQuery = useQuery({
    queryKey: ['tickets', 'stats'],
    queryFn: async () => {
      const res = await ticketsApi.getStats();
      return (res.data || null) as TicketStats | null;
    },
  });

  const searchQueryResult = useQuery({
    queryKey: ['tickets', 'search', debouncedSearch, filters],
    queryFn: async () => {
      const res = await ticketsApi.search(debouncedSearch, filters);
      return (res.data || []) as Ticket[];
    },
    enabled: debouncedSearch.length >= 2,
    placeholderData: keepPreviousData,
  });

  const tickets = ticketsQuery.data ?? [];
  const stats = statsQuery.data ?? null;
  const loading = ticketsQuery.isLoading;
  const error = ticketsQuery.error ? 'Fehler beim Laden der Tickets' : null;
  const searchResults = debouncedSearch.length >= 2 ? searchQueryResult.data ?? null : null;
  const isSearching = searchQueryResult.isFetching && debouncedSearch.length >= 2;
  const loadData = () => {
    ticketsQuery.refetch();
    statsQuery.refetch();
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
    setDebouncedSearch('');
    setShowArchived(false);
  };

  const hasActiveFilters = statusFilter || priorityFilter || customerFilter || searchQuery || showArchived;

  // Expose keyboard navigation methods via ref
  useImperativeHandle(ref, () => ({
    selectNext: () => {
      setSelectedIndex(prev => {
        const newIndex = Math.min(prev + 1, filteredTickets.length - 1);
        // Scroll selected ticket into view
        setTimeout(() => {
          const container = ticketListContainerRef.current;
          const selected = container?.querySelector(`[data-ticket-index="${newIndex}"]`);
          selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);
        return newIndex;
      });
    },
    selectPrev: () => {
      setSelectedIndex(prev => {
        const newIndex = Math.max(prev - 1, 0);
        setTimeout(() => {
          const container = ticketListContainerRef.current;
          const selected = container?.querySelector(`[data-ticket-index="${newIndex}"]`);
          selected?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 0);
        return newIndex;
      });
    },
    openSelected: () => {
      if (selectedIndex >= 0 && selectedIndex < filteredTickets.length) {
        onTicketSelect(filteredTickets[selectedIndex]);
      }
    },
    focusSearch: () => {
      searchInputRef.current?.focus();
    },
    getSelectedTicketId: () => {
      if (selectedIndex >= 0 && selectedIndex < filteredTickets.length) {
        return filteredTickets[selectedIndex].id;
      }
      return null;
    },
  }), [filteredTickets, selectedIndex, onTicketSelect]);

  // Reset selection when tickets change
  useEffect(() => {
    setSelectedIndex(-1);
    // Also clear bulk selection when filters change
    setSelectedTicketIds(new Set());
  }, [tickets, searchResults, statusFilter, priorityFilter, customerFilter]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Tickets</h1>
          <Button
            onClick={onCreateTicket}
            variant="primary"
            icon={<Plus size={20} />}
          >
            <span className="hidden sm:inline">Neues Ticket</span>
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4">
            <div className="bg-accent-light dark:bg-accent-primary/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-accent-primary dark:text-accent-primary">{stats.open_count}</div>
              <div className="text-sm text-accent-primary dark:text-accent-primary">Offen</div>
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
              ref={searchInputRef}
              type="text"
              placeholder="Tickets durchsuchen (auch in Kommentaren und Tags)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
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
                : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-500'
            }`}
          >
            <Filter size={20} />
            <span className="hidden sm:inline">Filter</span>
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-dark-100 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Status</option>
                  {Object.entries(statusConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Priorität</label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | '')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Prioritäten</option>
                  {Object.entries(priorityConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-1">Kunde</label>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-200 text-gray-900 dark:text-white"
                >
                  <option value="">Alle Kunden</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-gray-300 dark:border-dark-border"
                />
                Archivierte Tickets anzeigen
              </label>
              {hasActiveFilters && (
                <Button
                  onClick={clearFilters}
                  variant="ghost"
                  size="sm"
                >
                  Filter zurücksetzen
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar - Sticky at top when tickets are selected */}
      {selectedTicketIds.size > 0 && (
        <div className="flex-shrink-0 sticky top-0 z-10 bg-accent-primary/10 dark:bg-accent-primary/20 border-b border-accent-primary/30 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Selection info */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="p-1 rounded hover:bg-accent-primary/20 transition-colors"
                title="Alle abwählen"
              >
                <X size={18} className="text-accent-primary" />
              </button>
              <span className="text-sm font-medium text-accent-primary">
                {selectedTicketIds.size} ausgewählt
              </span>
            </div>

            <div className="h-5 w-px bg-accent-primary/30 hidden sm:block" />

            {/* Status dropdown */}
            <select
              onChange={(e) => {
                if (e.target.value) handleBulkStatusChange(e.target.value as TicketStatus);
                e.target.value = '';
              }}
              disabled={isBulkActionPending}
              className="px-2 py-1 text-sm rounded-lg border border-accent-primary/30 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              defaultValue=""
            >
              <option value="" disabled>Status ändern</option>
              {Object.entries(statusConfig).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Priority dropdown */}
            <select
              onChange={(e) => {
                if (e.target.value) handleBulkPriorityChange(e.target.value as TicketPriority);
                e.target.value = '';
              }}
              disabled={isBulkActionPending}
              className="px-2 py-1 text-sm rounded-lg border border-accent-primary/30 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              defaultValue=""
            >
              <option value="" disabled>Priorität ändern</option>
              {Object.entries(priorityConfig).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Assign dropdown */}
            <select
              onChange={(e) => {
                if (e.target.value === 'unassign') {
                  handleBulkAssign(null);
                } else if (e.target.value) {
                  handleBulkAssign(e.target.value);
                }
                e.target.value = '';
              }}
              disabled={isBulkActionPending}
              className="px-2 py-1 text-sm rounded-lg border border-accent-primary/30 bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              defaultValue=""
            >
              <option value="" disabled>Zuweisen</option>
              <option value="unassign">Zuweisung entfernen</option>
              {membersQuery.data?.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name || member.username}
                </option>
              ))}
            </select>

            <div className="h-5 w-px bg-accent-primary/30 hidden sm:block" />

            {/* Archive button */}
            <Button
              onClick={handleBulkArchive}
              variant="ghost"
              size="sm"
              disabled={isBulkActionPending}
              icon={<Archive size={16} />}
              className="text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
            >
              <span className="hidden sm:inline">Archivieren</span>
            </Button>

            {/* Delete button */}
            <Button
              onClick={handleBulkDelete}
              variant="ghost"
              size="sm"
              disabled={isBulkActionPending}
              icon={<Trash2 size={16} />}
              className="text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
            >
              <span className="hidden sm:inline">Löschen</span>
            </Button>

            {isBulkActionPending && (
              <div className="ml-auto">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ticket List */}
      <div ref={ticketListContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="space-y-2 sm:space-y-3" aria-busy="true" aria-label="Tickets werden geladen">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonListItem key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center text-red-500 py-8">
            <AlertCircle className="mx-auto mb-2" size={32} />
            <p>{error}</p>
            <Button onClick={loadData} variant="ghost" size="sm" className="mt-2">
              Erneut versuchen
            </Button>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-dark-400 py-8">
            <p className="mb-2">
              {hasActiveFilters
                ? 'Keine Tickets mit diesen Filtern gefunden'
                : 'Noch keine Tickets vorhanden'}
            </p>
            {!hasActiveFilters && (
              <Button
                onClick={onCreateTicket}
                variant="ghost"
              >
                Erstes Ticket erstellen
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Select All Header */}
            {filteredTickets.length > 0 && (
              <div className="flex items-center gap-3 px-2 py-1">
                <button
                  onClick={toggleSelectAll}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-200 transition-colors"
                  title={getSelectAllState() === 'all' ? 'Alle abwählen' : 'Alle auswählen'}
                >
                  {getSelectAllState() === 'none' && (
                    <Square size={18} className="text-gray-400" />
                  )}
                  {getSelectAllState() === 'some' && (
                    <MinusSquare size={18} className="text-accent-primary" />
                  )}
                  {getSelectAllState() === 'all' && (
                    <CheckSquare size={18} className="text-accent-primary" />
                  )}
                </button>
                <span className="text-sm text-gray-500 dark:text-dark-400">
                  {filteredTickets.length} Ticket{filteredTickets.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {filteredTickets.map((ticket, index) => {
              const status = statusConfig[ticket.status];
              const priority = priorityConfig[ticket.priority];
              const StatusIcon = status.icon;
              const source = ticket.source || 'manual';
              const sourceInfo = sourceConfig[source] || sourceConfig.manual;
              const SourceIcon = sourceInfo.icon;

              const isArchived = ticket.status === 'archived';
              const isKeyboardSelected = index === selectedIndex;
              const isChecked = selectedTicketIds.has(ticket.id);

              return (
                <div
                  key={ticket.id}
                  data-ticket-index={index}
                  className={`flex items-start gap-3 bg-white dark:bg-dark-100 rounded-lg border p-4 transition-colors ${
                    isKeyboardSelected
                      ? 'border-accent-primary ring-2 ring-accent-primary/30 bg-accent-primary/5'
                      : isChecked
                        ? 'border-accent-primary/50 bg-accent-primary/5'
                        : 'border-gray-200 dark:border-dark-border hover:border-accent-primary'
                  } ${isArchived ? 'opacity-60' : ''}`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => toggleTicketSelection(ticket.id, e)}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-200 transition-colors mt-0.5"
                  >
                    {isChecked ? (
                      <CheckSquare size={18} className="text-accent-primary" />
                    ) : (
                      <Square size={18} className="text-gray-400" />
                    )}
                  </button>

                  {/* Ticket content - clickable to open */}
                  <button
                    onClick={() => onTicketSelect(ticket)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-mono text-gray-500 dark:text-dark-400">
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
                          {source !== 'manual' && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${sourceInfo.color}`}>
                              <SourceIcon size={10} />
                              {sourceInfo.label}
                            </span>
                          )}
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                          {ticket.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-dark-400">
                          <span>{getCustomerName(ticket.customerId)}</span>
                          <span>•</span>
                          <span>{formatDate(ticket.createdAt)}</span>
                          {ticket.deviceName && (
                            <>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1">
                                <Monitor size={12} />
                                {ticket.deviceName}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="flex-shrink-0 text-gray-400" size={20} />
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

TicketList.displayName = 'TicketList';
