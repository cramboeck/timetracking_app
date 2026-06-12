import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Square, Building2, Ticket, Filter, RefreshCw, ExternalLink, Eye } from 'lucide-react';
import { TicketTaskWithInfo, Customer, TicketStatus, TicketPriority } from '../types';
import { ticketsApi } from '../services/api';
import { IconButton } from './ui';

interface TasksOverviewProps {
  customers: Customer[];
  onTicketSelect: (ticketId: string) => void;
}

const priorityConfig: Record<TicketPriority, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500', bgColor: 'bg-gray-100 dark:bg-dark-200' },
  normal: { label: 'Normal', color: 'text-accent-primary', bgColor: 'bg-accent-lighter dark:bg-accent-primary/30' },
  high: { label: 'Hoch', color: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  critical: { label: 'Kritisch', color: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

const statusConfig: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Offen', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/40 dark:text-accent-primary' },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  waiting: { label: 'Wartend', color: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:text-accent-primary' },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-dark-200 dark:text-dark-500' },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-500 dark:bg-dark-100 dark:text-dark-400' },
};

export const TasksOverview = ({ customers, onTicketSelect }: TasksOverviewProps) => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'open' | 'completed' | 'all'>('open');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ['tasks', { status: statusFilter, customerId: customerFilter || null }],
    queryFn: async () => {
      const res = await ticketsApi.getAllTasks({
        status: statusFilter,
        customerId: customerFilter || undefined,
      });
      return res.data as TicketTaskWithInfo[];
    },
  });
  const tasks = tasksQuery.data ?? [];
  const loading = tasksQuery.isLoading;

  const toggleTaskMutation = useMutation({
    mutationFn: (task: TicketTaskWithInfo) =>
      ticketsApi.updateTask(task.ticketId, task.id, { completed: !task.completed }),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const prev = queryClient.getQueriesData<TicketTaskWithInfo[]>({ queryKey: ['tasks'] });
      queryClient.setQueriesData<TicketTaskWithInfo[]>({ queryKey: ['tasks'] }, (old) =>
        old?.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t))
      );
      return { prev };
    },
    onError: (err, _task, context) => {
      console.error('Failed to toggle task:', err);
      context?.prev?.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
  });

  const handleToggleTask = (task: TicketTaskWithInfo) => toggleTaskMutation.mutate(task);

  // Group tasks by customer
  const tasksByCustomer = tasks.reduce((acc, task) => {
    const customerId = task.customerId || 'uncategorized';
    if (!acc[customerId]) {
      acc[customerId] = {
        customerName: task.customerName || 'Ohne Kunde',
        tasks: [],
      };
    }
    acc[customerId].tasks.push(task);
    return acc;
  }, {} as Record<string, { customerName: string; tasks: TicketTaskWithInfo[] }>);

  const openTasksCount = tasks.filter(t => !t.completed).length;
  const completedTasksCount = tasks.filter(t => t.completed).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="text-accent-primary" size={24} />
              Aufgabenübersicht
            </h1>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              {openTasksCount} offen, {completedTasksCount} erledigt
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              onClick={() => setShowFilters(!showFilters)}
              variant={showFilters || customerFilter ? 'primary' : 'default'}
              size="lg"
              icon={<Filter size={20} />}
              tooltip="Filter"
            />
            <IconButton
              onClick={() => tasksQuery.refetch()}
              variant="default"
              size="lg"
              icon={<RefreshCw size={20} className={loading ? 'animate-spin' : ''} />}
              tooltip="Aktualisieren"
            />
          </div>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-dark-100 rounded-lg">
            {(['open', 'completed', 'all'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-white dark:bg-dark-200 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {status === 'open' ? 'Offen' : status === 'completed' ? 'Erledigt' : 'Alle'}
              </button>
            ))}
          </div>

          {/* Customer Filter */}
          {showFilters && (
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Alle Kunden</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-dark-400">
            <CheckSquare size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Keine Aufgaben gefunden</p>
            <p className="text-sm mt-1">
              {statusFilter === 'open'
                ? 'Alle Aufgaben sind erledigt!'
                : 'Erstelle Aufgaben in Tickets, um sie hier zu sehen.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(tasksByCustomer).map(([customerId, { customerName, tasks: customerTasks }]) => (
              <div key={customerId}>
                {/* Customer Header */}
                <div className="flex items-center gap-2 mb-3">
                  <Building2 size={16} className="text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-dark-500">
                    {customerName}
                  </h2>
                  <span className="text-xs text-gray-500 dark:text-dark-400">
                    ({customerTasks.filter(t => !t.completed).length} offen)
                  </span>
                </div>

                {/* Tasks */}
                <div className="space-y-2 ml-6">
                  {customerTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-start gap-3 p-3 bg-gray-50 dark:bg-dark-100 rounded-lg group transition-opacity ${
                        task.completed ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => handleToggleTask(task)}
                        className="flex-shrink-0 mt-0.5"
                      >
                        {task.completed ? (
                          <CheckSquare size={20} className="text-green-500" />
                        ) : (
                          <Square size={20} className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-500" />
                        )}
                      </button>

                      {/* Task Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <span
                            className={`text-sm ${
                              task.completed
                                ? 'text-gray-500 dark:text-dark-400 line-through'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {task.title}
                          </span>
                          {task.visibleToCustomer && (
                            <Eye size={14} className="text-accent-primary flex-shrink-0 mt-0.5" title="Für Kunden sichtbar" />
                          )}
                        </div>

                        {/* Ticket Info */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <button
                            onClick={() => onTicketSelect(task.ticketId)}
                            className="flex items-center gap-1 text-xs text-gray-500 dark:text-dark-400 hover:text-accent-primary transition-colors"
                          >
                            <Ticket size={12} />
                            <span className="font-mono">{task.ticketNumber}</span>
                            <span className="truncate max-w-[150px]">{task.ticketTitle}</span>
                            <ExternalLink size={10} />
                          </button>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${statusConfig[task.ticketStatus].color}`}>
                            {statusConfig[task.ticketStatus].label}
                          </span>
                          <span className={`text-xs ${priorityConfig[task.ticketPriority].color}`}>
                            {priorityConfig[task.ticketPriority].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
