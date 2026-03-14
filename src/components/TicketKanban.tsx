import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { Clock, Building2, AlertCircle, RefreshCw, Filter, User, Layers, X, Calendar, ChevronDown } from 'lucide-react';
import { Ticket, TicketStatus, TicketPriority, Customer } from '../types';
import { ticketsApi, TicketTag, organizationsApi, OrganizationMember } from '../services/api';
import { Button, IconButton } from './ui';

// Konfiguration für Pagination - exportierbar für externe Konfiguration
export interface KanbanConfig {
  initialLimit: number;       // Initial angezeigte Tickets pro Spalte
  loadMoreIncrement: number;  // Anzahl zusätzlicher Tickets beim "Mehr laden"
  maxTagsToLoad: number;      // Maximale Tags die initial geladen werden
  enableInfiniteScroll: boolean; // Aktiviert Infinite Scroll statt "Mehr laden" Button
  infiniteScrollThreshold: number; // Pixel vom unteren Rand, ab dem nachgeladen wird
}

export const DEFAULT_KANBAN_CONFIG: KanbanConfig = {
  initialLimit: 50,           // Erhöht von 25 auf 50 für bessere Übersicht
  loadMoreIncrement: 50,      // Erhöht von 25 auf 50 für weniger Klicks
  maxTagsToLoad: 500,         // Erhöht von 200 auf 500 für größere Datenmengen
  enableInfiniteScroll: true, // Standardmäßig aktiviert
  infiniteScrollThreshold: 100, // 100px vor dem Ende
};


interface TicketKanbanProps {
  customers: Customer[];
  onTicketSelect: (ticketId: string) => void;
  refreshKey?: number;
  config?: Partial<KanbanConfig>; // Optionale Konfigurationsüberschreibung
}

const statusColumns: { status: TicketStatus; label: string; color: string; bgColor: string }[] = [
  { status: 'open', label: 'Offen', color: 'border-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
  { status: 'in_progress', label: 'In Bearbeitung', color: 'border-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { status: 'waiting', label: 'Wartend', color: 'border-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20' },
  { status: 'resolved', label: 'Gelöst', color: 'border-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20' },
];

const priorityConfig: Record<TicketPriority, { label: string; color: string; borderColor: string; bgColor: string }> = {
  critical: { label: 'Kritisch', color: 'text-red-600', borderColor: 'border-l-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20' },
  high: { label: 'Hoch', color: 'text-orange-500', borderColor: 'border-l-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20' },
  normal: { label: 'Normal', color: 'text-blue-500', borderColor: 'border-l-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
  low: { label: 'Niedrig', color: 'text-gray-500', borderColor: 'border-l-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-800/50' },
};

const priorityOrder: TicketPriority[] = ['critical', 'high', 'normal', 'low'];

// Memoized Ticket Card Component für bessere Performance
interface TicketCardProps {
  ticket: Ticket;
  tags: TicketTag[];
  isDragging: boolean;
  assigneeInitials: string | null;
  assigneeName: string | null;
  customerName: string;
  customerColor: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}

const TicketCard = memo(({
  ticket,
  tags,
  isDragging,
  assigneeInitials,
  assigneeName,
  customerName,
  customerColor,
  onDragStart,
  onDragEnd,
  onClick
}: TicketCardProps) => {
  const isDueToday = ticket.dueDate && new Date(ticket.dueDate).toDateString() === new Date().toDateString();
  const isOverdue = ticket.dueDate && new Date(ticket.dueDate) < new Date();

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return 'neu';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`p-3 bg-white dark:bg-gray-800 rounded-lg border-l-4 ${
        priorityConfig[ticket.priority].borderColor
      } shadow-sm hover:shadow-md cursor-pointer transition-all ${
        isDragging ? 'opacity-50 scale-95 rotate-2' : ''
      }`}
    >
      {/* Header: Ticket Number, Priority Icon, Assignee */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {ticket.ticketNumber}
        </span>
        <div className="flex items-center gap-1.5">
          {ticket.priority === 'critical' && (
            <AlertCircle size={14} className="text-red-500" />
          )}
          {ticket.priority === 'high' && (
            <AlertCircle size={14} className="text-orange-500" />
          )}
          {assigneeInitials && (
            <div
              className="w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center text-white text-[10px] font-medium"
              title={assigneeName || ''}
            >
              {assigneeInitials}
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 mb-2">
        {ticket.title}
      </h3>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {tags.length > 2 && (
            <span className="text-[10px] text-gray-500 px-1">+{tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: customerColor }}
          />
          <span className="truncate max-w-[80px]">
            {customerName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {ticket.dueDate && (
            <div className={`flex items-center gap-0.5 ${isOverdue ? 'text-red-500' : isDueToday ? 'text-orange-500' : ''}`}>
              <Calendar size={10} />
              {new Date(ticket.dueDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
            </div>
          )}
          <div className="flex items-center gap-0.5">
            <Clock size={10} />
            {formatTimeAgo(ticket.updatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
});

TicketCard.displayName = 'TicketCard';

export const TicketKanban = ({ customers, onTicketSelect, refreshKey = 0, config }: TicketKanbanProps) => {
  // Merge custom config with defaults
  const activeConfig = useMemo(() => ({
    ...DEFAULT_KANBAN_CONFIG,
    ...config,
  }), [config]);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketTags, setTicketTags] = useState<Record<string, TicketTag[]>>({});
  const [loading, setLoading] = useState(true);
  const [draggedTicket, setDraggedTicket] = useState<Ticket | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TicketStatus | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  // View options
  const [groupByPriority, setGroupByPriority] = useState(false);

  // Team members
  const [teamMembers, setTeamMembers] = useState<OrganizationMember[]>([]);

  // Refs für Infinite Scroll
  const columnRefs = useRef<Record<TicketStatus, HTMLDivElement | null>>({
    open: null,
    in_progress: null,
    waiting: null,
    resolved: null,
    closed: null,
    archived: null,
  });

  // Pagination state pro Spalte
  const [columnLimits, setColumnLimits] = useState<Record<TicketStatus, number>>({
    open: activeConfig.initialLimit,
    in_progress: activeConfig.initialLimit,
    waiting: activeConfig.initialLimit,
    resolved: activeConfig.initialLimit,
    closed: activeConfig.initialLimit,
    archived: activeConfig.initialLimit,
  });

  // Loading state für Infinite Scroll pro Spalte
  const [loadingMore, setLoadingMore] = useState<Record<TicketStatus, boolean>>({
    open: false,
    in_progress: false,
    waiting: false,
    resolved: false,
    closed: false,
    archived: false,
  });

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const response = await ticketsApi.getAll();
      // Filter out archived and closed tickets
      const activeTickets = response.data.filter(
        (t: Ticket) => t.status !== 'archived' && t.status !== 'closed'
      );
      setTickets(activeTickets);

      // Load tags for all tickets (mit konfigurierbarem Limit)
      const tagsMap: Record<string, TicketTag[]> = {};
      await Promise.all(
        activeTickets.slice(0, activeConfig.maxTagsToLoad).map(async (ticket: Ticket) => {
          try {
            const tagsResponse = await ticketsApi.getTicketTags(ticket.id);
            tagsMap[ticket.id] = tagsResponse.data;
          } catch {
            tagsMap[ticket.id] = [];
          }
        })
      );
      setTicketTags(tagsMap);
    } catch (error) {
      console.error('Failed to load tickets:', error);
    } finally {
      setLoading(false);
    }
  }, [activeConfig.maxTagsToLoad]);

  const loadTeamMembers = useCallback(async () => {
    try {
      const orgResponse = await organizationsApi.getCurrent();
      if (orgResponse.success && orgResponse.data) {
        const membersResponse = await organizationsApi.getMembers(orgResponse.data.id);
        if (membersResponse.success) {
          setTeamMembers(membersResponse.data);
        }
      }
    } catch (error) {
      console.error('Failed to load team members:', error);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    loadTeamMembers();
  }, [loadTickets, loadTeamMembers, refreshKey]);

  const handleDragStart = (ticket: Ticket) => {
    setDraggedTicket(ticket);
  };

  const handleDragOver = (e: React.DragEvent, status: TicketStatus) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (status: TicketStatus) => {
    if (!draggedTicket || draggedTicket.status === status) {
      setDraggedTicket(null);
      setDragOverColumn(null);
      return;
    }

    try {
      // Optimistic update
      setTickets(prev =>
        prev.map(t =>
          t.id === draggedTicket.id ? { ...t, status } : t
        )
      );

      // API update
      await ticketsApi.update(draggedTicket.id, { status });
    } catch (error) {
      console.error('Failed to update ticket status:', error);
      // Revert on error
      loadTickets();
    } finally {
      setDraggedTicket(null);
      setDragOverColumn(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedTicket(null);
    setDragOverColumn(null);
  };

  // Memoized Maps für schnellen Lookup - verbesserte Performance bei vielen Tickets
  const customerMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    customers.forEach(c => map.set(c.id, { name: c.name, color: c.color || '#6B7280' }));
    return map;
  }, [customers]);

  const teamMemberMap = useMemo(() => {
    const map = new Map<string, { name: string; initials: string }>();
    teamMembers.forEach(m => {
      const name = m.display_name || m.username || '';
      const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      map.set(m.user_id, { name, initials });
    });
    return map;
  }, [teamMembers]);

  const getCustomerName = useCallback((customerId: string) => {
    return customerMap.get(customerId)?.name || 'Unbekannt';
  }, [customerMap]);

  const getCustomerColor = useCallback((customerId: string) => {
    return customerMap.get(customerId)?.color || '#6B7280';
  }, [customerMap]);

  const getAssigneeName = useCallback((assignedTo: string | null) => {
    if (!assignedTo) return null;
    return teamMemberMap.get(assignedTo)?.name || null;
  }, [teamMemberMap]);

  const getAssigneeInitials = useCallback((assignedTo: string | null) => {
    if (!assignedTo) return null;
    return teamMemberMap.get(assignedTo)?.initials || null;
  }, [teamMemberMap]);

  // Apply filters - memoized für bessere Performance
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (customerFilter && t.customerId !== customerFilter) return false;
      if (assigneeFilter && t.assignedTo !== assigneeFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      return true;
    });
  }, [tickets, customerFilter, assigneeFilter, priorityFilter]);

  // Memoized Ticket-Gruppierung nach Status
  const ticketsByStatus = useMemo(() => {
    const byStatus: Record<TicketStatus, Ticket[]> = {
      open: [],
      in_progress: [],
      waiting: [],
      resolved: [],
      closed: [],
      archived: [],
    };

    filteredTickets.forEach(ticket => {
      if (byStatus[ticket.status]) {
        byStatus[ticket.status].push(ticket);
      }
    });

    // Sort each status by priority
    const pOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    Object.keys(byStatus).forEach(status => {
      byStatus[status as TicketStatus].sort((a, b) => pOrder[a.priority] - pOrder[b.priority]);
    });

    return byStatus;
  }, [filteredTickets]);

  const getColumnTickets = useCallback((status: TicketStatus, priority?: TicketPriority) => {
    const statusTickets = ticketsByStatus[status] || [];
    if (!priority) return statusTickets;
    return statusTickets.filter(t => t.priority === priority);
  }, [ticketsByStatus]);

  // Funktion zum Laden weiterer Tickets pro Spalte
  const loadMoreTickets = useCallback((status: TicketStatus) => {
    // Verhindere mehrfaches Laden
    if (loadingMore[status]) return;

    setLoadingMore(prev => ({ ...prev, [status]: true }));

    // Kurze Verzögerung für visuelles Feedback
    setTimeout(() => {
      setColumnLimits(prev => ({
        ...prev,
        [status]: prev[status] + activeConfig.loadMoreIncrement,
      }));
      setLoadingMore(prev => ({ ...prev, [status]: false }));
    }, 100);
  }, [activeConfig.loadMoreIncrement, loadingMore]);

  // Begrenzte Tickets für die Anzeige mit Pagination-Info
  const getVisibleColumnTickets = useCallback((status: TicketStatus, priority?: TicketPriority) => {
    const allTickets = getColumnTickets(status, priority);
    const limit = columnLimits[status];
    return {
      tickets: allTickets.slice(0, limit),
      total: allTickets.length,
      hasMore: allTickets.length > limit,
      remaining: Math.max(0, allTickets.length - limit),
    };
  }, [getColumnTickets, columnLimits]);

  // Infinite Scroll Handler pro Spalte
  const handleColumnScroll = useCallback((status: TicketStatus, e: React.UIEvent<HTMLDivElement>) => {
    if (!activeConfig.enableInfiniteScroll) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < activeConfig.infiniteScrollThreshold;

    if (isNearBottom) {
      const visibleData = getVisibleColumnTickets(status);
      if (visibleData.hasMore && !loadingMore[status]) {
        loadMoreTickets(status);
      }
    }
  }, [activeConfig.enableInfiniteScroll, activeConfig.infiniteScrollThreshold, getVisibleColumnTickets, loadingMore, loadMoreTickets]);

  // Ref-Setter für Spalten (für potenzielle IntersectionObserver-Nutzung)
  const setColumnRef = useCallback((status: TicketStatus, el: HTMLDivElement | null) => {
    columnRefs.current[status] = el;
  }, []);

  const hasActiveFilters = customerFilter || assigneeFilter || priorityFilter;

  const clearFilters = () => {
    setCustomerFilter('');
    setAssigneeFilter('');
    setPriorityFilter('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  // Render function using memoized TicketCard component
  const renderTicketCard = useCallback((ticket: Ticket) => {
    const tags = ticketTags[ticket.id] || [];
    const isDragging = draggedTicket?.id === ticket.id;
    const assigneeInitials = getAssigneeInitials(ticket.assignedTo);
    const assigneeName = getAssigneeName(ticket.assignedTo);

    return (
      <TicketCard
        key={ticket.id}
        ticket={ticket}
        tags={tags}
        isDragging={isDragging}
        assigneeInitials={assigneeInitials}
        assigneeName={assigneeName}
        customerName={getCustomerName(ticket.customerId)}
        customerColor={getCustomerColor(ticket.customerId)}
        onDragStart={() => handleDragStart(ticket)}
        onDragEnd={handleDragEnd}
        onClick={() => onTicketSelect(ticket.id)}
      />
    );
  }, [ticketTags, draggedTicket, getAssigneeInitials, getAssigneeName, getCustomerName, getCustomerColor, handleDragStart, handleDragEnd, onTicketSelect]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredTickets.length} Tickets
            </span>
            {hasActiveFilters && (
              <Button
                onClick={clearFilters}
                variant="ghost"
                size="sm"
                icon={<X size={12} />}
              >
                Filter löschen
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroupByPriority(!groupByPriority)}
              className={`p-2 rounded-lg transition-colors ${
                groupByPriority
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="Nach Priorität gruppieren"
            >
              <Layers size={18} />
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters || hasActiveFilters
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title="Filter"
            >
              <Filter size={18} />
            </button>
            <IconButton
              onClick={loadTickets}
              icon={<RefreshCw size={18} />}
              size="lg"
              tooltip="Aktualisieren"
            />
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" />
              <select
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
              >
                <option value="">Alle Kunden</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <User size={14} className="text-gray-400" />
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
              >
                <option value="">Alle Bearbeiter</option>
                {teamMembers.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name || member.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-gray-400" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
              >
                <option value="">Alle Prioritäten</option>
                {priorityOrder.map((p) => (
                  <option key={p} value={p}>
                    {priorityConfig[p].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
        <div className="flex gap-4 h-full min-w-max">
          {statusColumns.map((column) => {
            const isDropTarget = dragOverColumn === column.status;

            return (
              <div
                key={column.status}
                className="flex flex-col w-72 flex-shrink-0"
                onDragOver={(e) => handleDragOver(e, column.status)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(column.status)}
              >
                {/* Column Header */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg border-t-4 ${column.color} ${column.bgColor}`}>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {column.label}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {getColumnTickets(column.status).length}
                  </span>
                </div>

                {/* Column Content */}
                <div
                  ref={(el) => setColumnRef(column.status, el)}
                  onScroll={(e) => handleColumnScroll(column.status, e)}
                  className={`flex-1 overflow-y-auto p-2 rounded-b-lg border border-t-0 border-gray-200 dark:border-gray-700 transition-colors ${
                    isDropTarget
                      ? 'bg-accent-primary/10 border-accent-primary ring-2 ring-accent-primary/20'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  {groupByPriority ? (
                    // Grouped by priority (swimlanes)
                    (() => {
                      const visibleData = getVisibleColumnTickets(column.status);
                      return (
                        <div className="space-y-4">
                          {priorityOrder.map((priority) => {
                            const priorityTickets = getColumnTickets(column.status, priority);
                            if (priorityTickets.length === 0) return null;

                            // Apply pagination per priority within the column limit
                            const visiblePriorityTickets = priorityTickets.slice(0, columnLimits[column.status]);

                            return (
                              <div key={priority}>
                                <div className={`text-xs font-medium px-2 py-1 mb-2 rounded ${priorityConfig[priority].bgColor} ${priorityConfig[priority].color}`}>
                                  {priorityConfig[priority].label} ({priorityTickets.length})
                                </div>
                                <div className="space-y-2">
                                  {visiblePriorityTickets.map(renderTicketCard)}
                                </div>
                              </div>
                            );
                          })}
                          {visibleData.total === 0 && (
                            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                              Keine Tickets
                            </div>
                          )}
                          {/* Loading Indicator für Infinite Scroll */}
                          {loadingMore[column.status] && (
                            <div className="flex items-center justify-center py-3">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
                            </div>
                          )}
                          {/* "Mehr laden" Button - nur wenn Infinite Scroll deaktiviert ist */}
                          {visibleData.hasMore && !activeConfig.enableInfiniteScroll && !loadingMore[column.status] && (
                            <button
                              onClick={() => loadMoreTickets(column.status)}
                              className="w-full py-2 px-3 mt-2 text-xs font-medium text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              <ChevronDown size={14} />
                              {visibleData.remaining} weitere laden
                            </button>
                          )}
                          {/* Info-Anzeige bei Infinite Scroll */}
                          {visibleData.hasMore && activeConfig.enableInfiniteScroll && !loadingMore[column.status] && (
                            <div className="text-center py-2 text-[10px] text-gray-400">
                              Scrolle nach unten um {Math.min(visibleData.remaining, activeConfig.loadMoreIncrement)} weitere zu laden
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    // Flat list with pagination
                    (() => {
                      const visibleData = getVisibleColumnTickets(column.status);
                      return (
                        <div className="space-y-2">
                          {visibleData.tickets.map(renderTicketCard)}
                          {visibleData.total === 0 && (
                            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                              Keine Tickets
                            </div>
                          )}
                          {/* Loading Indicator für Infinite Scroll */}
                          {loadingMore[column.status] && (
                            <div className="flex items-center justify-center py-3">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
                            </div>
                          )}
                          {/* "Mehr laden" Button - nur wenn Infinite Scroll deaktiviert ist */}
                          {visibleData.hasMore && !activeConfig.enableInfiniteScroll && !loadingMore[column.status] && (
                            <button
                              onClick={() => loadMoreTickets(column.status)}
                              className="w-full py-2 px-3 mt-2 text-xs font-medium text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              <ChevronDown size={14} />
                              {visibleData.remaining} weitere laden
                            </button>
                          )}
                          {/* Info-Anzeige bei Infinite Scroll */}
                          {visibleData.hasMore && activeConfig.enableInfiniteScroll && !loadingMore[column.status] && (
                            <div className="text-center py-2 text-[10px] text-gray-400">
                              Scrolle nach unten um {Math.min(visibleData.remaining, activeConfig.loadMoreIncrement)} weitere zu laden
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
