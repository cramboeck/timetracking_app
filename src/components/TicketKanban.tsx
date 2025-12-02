import { useState, useEffect, useCallback } from 'react';
import { Clock, Building2, AlertCircle, Tag, RefreshCw, Filter, User, Users, Layers, X, Calendar } from 'lucide-react';
import { Ticket, TicketStatus, TicketPriority, Customer } from '../types';
import { ticketsApi, TicketTag, organizationsApi, OrganizationMember } from '../services/api';

interface TicketKanbanProps {
  customers: Customer[];
  onTicketSelect: (ticketId: string) => void;
  refreshKey?: number;
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

export const TicketKanban = ({ customers, onTicketSelect, refreshKey = 0 }: TicketKanbanProps) => {
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

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const response = await ticketsApi.getAll();
      // Filter out archived and closed tickets
      const activeTickets = response.data.filter(
        (t: Ticket) => t.status !== 'archived' && t.status !== 'closed'
      );
      setTickets(activeTickets);

      // Load tags for all tickets
      const tagsMap: Record<string, TicketTag[]> = {};
      await Promise.all(
        activeTickets.slice(0, 50).map(async (ticket: Ticket) => {
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
  }, []);

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

  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || 'Unbekannt';
  };

  const getCustomerColor = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.color || '#6B7280';
  };

  const getAssigneeName = (assignedTo: string | null) => {
    if (!assignedTo) return null;
    const member = teamMembers.find(m => m.user_id === assignedTo);
    return member?.display_name || member?.username || null;
  };

  const getAssigneeInitials = (assignedTo: string | null) => {
    const name = getAssigneeName(assignedTo);
    if (!name) return null;
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  // Apply filters
  const filteredTickets = tickets.filter(t => {
    if (customerFilter && t.customerId !== customerFilter) return false;
    if (assigneeFilter && t.assignedTo !== assigneeFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    return true;
  });

  const getColumnTickets = (status: TicketStatus, priority?: TicketPriority) => {
    return filteredTickets
      .filter(t => t.status === status && (!priority || t.priority === priority))
      .sort((a, b) => {
        // Sort by priority (critical first)
        const pOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return pOrder[a.priority] - pOrder[b.priority];
      });
  };

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

  const renderTicketCard = (ticket: Ticket) => {
    const tags = ticketTags[ticket.id] || [];
    const isDragging = draggedTicket?.id === ticket.id;
    const assigneeInitials = getAssigneeInitials(ticket.assignedTo);
    const assigneeName = getAssigneeName(ticket.assignedTo);
    const isDueToday = ticket.dueDate && new Date(ticket.dueDate).toDateString() === new Date().toDateString();
    const isOverdue = ticket.dueDate && new Date(ticket.dueDate) < new Date();

    return (
      <div
        key={ticket.id}
        draggable
        onDragStart={() => handleDragStart(ticket)}
        onDragEnd={handleDragEnd}
        onClick={() => onTicketSelect(ticket.id)}
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
              style={{ backgroundColor: getCustomerColor(ticket.customerId) }}
            />
            <span className="truncate max-w-[80px]">
              {getCustomerName(ticket.customerId)}
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
  };

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
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-accent-primary hover:bg-accent-primary/10 rounded transition-colors"
              >
                <X size={12} />
                Filter löschen
              </button>
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
            <button
              onClick={loadTickets}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw size={18} />
            </button>
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
                  className={`flex-1 overflow-y-auto p-2 rounded-b-lg border border-t-0 border-gray-200 dark:border-gray-700 transition-colors ${
                    isDropTarget
                      ? 'bg-accent-primary/10 border-accent-primary ring-2 ring-accent-primary/20'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  {groupByPriority ? (
                    // Grouped by priority (swimlanes)
                    <div className="space-y-4">
                      {priorityOrder.map((priority) => {
                        const priorityTickets = getColumnTickets(column.status, priority);
                        if (priorityTickets.length === 0) return null;

                        return (
                          <div key={priority}>
                            <div className={`text-xs font-medium px-2 py-1 mb-2 rounded ${priorityConfig[priority].bgColor} ${priorityConfig[priority].color}`}>
                              {priorityConfig[priority].label} ({priorityTickets.length})
                            </div>
                            <div className="space-y-2">
                              {priorityTickets.map(renderTicketCard)}
                            </div>
                          </div>
                        );
                      })}
                      {getColumnTickets(column.status).length === 0 && (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                          Keine Tickets
                        </div>
                      )}
                    </div>
                  ) : (
                    // Flat list
                    <div className="space-y-2">
                      {getColumnTickets(column.status).map(renderTicketCard)}
                      {getColumnTickets(column.status).length === 0 && (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                          Keine Tickets
                        </div>
                      )}
                    </div>
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
