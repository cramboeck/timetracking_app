import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  Circle,
  Clock,
  Plus,
  Calendar,
  AlertTriangle,
  Play,
  Pause,
  Filter,
  ChevronDown,
  ChevronRight,
  Building2,
  Folder,
  Ticket,
  Tag,
  Trash2,
  Edit,
  Timer,
  TrendingUp,
  ListTodo,
  CalendarDays,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import { tasksApi } from '../services/api';
import type { Task, TaskPriority, TaskStatus } from '../types';
import TaskModal from './TaskModal';
import { Button, IconButton } from './ui';
import { useToast, useConfirm } from '../contexts/UIContext';

type ViewKey = 'inbox' | 'my' | 'all' | 'today' | 'week' | 'overdue';
type GroupBy = 'date' | 'customer' | 'priority' | 'ticket';

const VIEW_STORAGE_KEY = 'taskhub_view';
const GROUPBY_STORAGE_KEY = 'taskhub_group_by';

const isViewKey = (s: string | null): s is ViewKey =>
  s === 'inbox' || s === 'my' || s === 'all' || s === 'today' || s === 'week' || s === 'overdue';
const isGroupBy = (s: string | null): s is GroupBy =>
  s === 'date' || s === 'customer' || s === 'priority' || s === 'ticket';

interface TaskHubProps {
  onTimerStart?: (taskId: string) => void;
  onTimerStop?: (taskId: string) => void;
  runningTimerTaskId?: string | null;
  onOpenTicket?: (ticketId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
}

export default function TaskHub({ onTimerStart, onTimerStop, runningTimerTaskId, onOpenTicket, onOpenCustomer }: TaskHubProps) {
  const confirm = useConfirm();
  const showToast = useToast();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewKey>(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return isViewKey(stored) ? stored : 'inbox';
  });
  const [groupBy, setGroupBy] = useState<GroupBy>(() => {
    const stored = localStorage.getItem(GROUPBY_STORAGE_KEY);
    return isGroupBy(stored) ? stored : 'date';
  });
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ overdue: true, today: true, upcoming: true, no_date: true });

  // Quick-Add state
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Persist view + groupBy to localStorage
  const handleViewChange = (newView: ViewKey) => {
    setView(newView);
    localStorage.setItem(VIEW_STORAGE_KEY, newView);
  };
  const handleGroupByChange = (newGroupBy: GroupBy) => {
    setGroupBy(newGroupBy);
    localStorage.setItem(GROUPBY_STORAGE_KEY, newGroupBy);
  };

  // TanStack Query: Dashboard data
  const { data: dashboard } = useQuery({
    queryKey: ['tasks', 'dashboard'],
    queryFn: async () => {
      const response = await tasksApi.getDashboard();
      if (response.success) return response.data;
      throw new Error('Failed to load dashboard');
    },
    staleTime: 30_000,
  });

  // TanStack Query: Tasks list
  // 'inbox' is a frontend-derived view: we fetch 'my' from backend and filter client-side
  const backendView = view === 'inbox' ? 'my' : view;
  const { data: tasks = [], isLoading: loading } = useQuery({
    queryKey: ['tasks', 'list', backendView, showCompleted],
    queryFn: async () => {
      const response = await tasksApi.getAll({
        view: backendView,
        includeCompleted: showCompleted,
      });
      if (response.success) return response.data || [];
      throw new Error('Failed to load tasks');
    },
    staleTime: 30_000,
  });

  // Mutation: Toggle task completion
  const toggleCompleteMutation = useMutation({
    mutationFn: async ({ task, newStatus }: { task: Task; newStatus: TaskStatus }) => {
      const response = await tasksApi.update(task.id, { status: newStatus });
      if (!response.success) throw new Error('Failed to update task');
      return response.data;
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData(['tasks', 'list', backendView, showCompleted], (old: Task[] | undefined) =>
        old?.map(t => t.id === updatedTask.id ? updatedTask : t)
      );
      queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
    },
  });

  const toggleTaskComplete = (task: Task) => {
    if (task.taskSource === 'ticket') {
      showToast('TicketTasks werden im jeweiligen Ticket abgehakt', 'info');
      return;
    }
    const newStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    toggleCompleteMutation.mutate({ task, newStatus });
  };

  // Edit handler that routes ticket-source tasks back to the originating ticket.
  const handleEditClick = (task: Task) => {
    if (task.taskSource === 'ticket') {
      if (task.ticketId && onOpenTicket) {
        onOpenTicket(task.ticketId);
      } else {
        showToast('TicketTasks werden im Ticket bearbeitet', 'info');
      }
      return;
    }
    setEditingTask(task);
    setShowTaskModal(true);
  };

  // Mutation: Quick-Add task
  const quickAddMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await tasksApi.create({ title });
      if (!response.success) throw new Error('Failed to create task');
      return response.data;
    },
    onSuccess: () => {
      setQuickAddTitle('');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTimeout(() => quickAddInputRef.current?.focus(), 0);
    },
    onError: () => {
      showToast('Aufgabe konnte nicht erstellt werden', 'error');
    },
  });

  const handleQuickAdd = () => {
    const title = quickAddTitle.trim();
    if (!title || quickAddMutation.isPending) return;
    quickAddMutation.mutate(title);
  };

  // Mutation: Timer toggle
  const timerMutation = useMutation({
    mutationFn: async ({ task, action }: { task: Task; action: 'start' | 'stop' }) => {
      if (action === 'stop') {
        await tasksApi.stopTimer(task.id);
        onTimerStop?.(task.id);
      } else {
        await tasksApi.startTimer(task.id);
        onTimerStart?.(task.id);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] });
    },
  });

  const handleTimerToggle = (task: Task) => {
    const action = runningTimerTaskId === task.id ? 'stop' : 'start';
    timerMutation.mutate({ task, action });
  };

  // Mutation: Delete task
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await tasksApi.delete(taskId);
    },
    onSuccess: (_, taskId) => {
      queryClient.setQueryData(['tasks', 'list', backendView, showCompleted], (old: Task[] | undefined) =>
        old?.filter(t => t.id !== taskId)
      );
      queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard'] });
    },
  });

  const handleDeleteTask = async (task: Task) => {
    if (task.taskSource === 'ticket') {
      if (task.ticketId && onOpenTicket) onOpenTicket(task.ticketId);
      else showToast('TicketTasks werden im Ticket gelöscht', 'info');
      return;
    }
    const ok = await confirm({
      title: 'Aufgabe löschen?',
      message: 'Aufgabe wirklich löschen?',
      confirmText: 'Löschen',
      variant: 'danger',
    });
    if (!ok) return;
    deleteMutation.mutate(task.id);
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Heute';
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Morgen';
    }
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Get priority color
  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 dark:text-red-400';
      case 'high': return 'text-orange-600 dark:text-orange-400';
      case 'normal': return 'text-accent-primary dark:text-accent-primary';
      case 'low': return 'text-gray-500 dark:text-dark-400';
    }
  };

  // Get priority badge
  const getPriorityBadge = (priority: TaskPriority) => {
    const colors = {
      urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      normal: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary',
      low: 'bg-gray-100 text-gray-800 dark:bg-dark-200 dark:text-dark-400',
    };
    const labels = { urgent: 'Dringend', high: 'Hoch', normal: 'Normal', low: 'Niedrig' };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[priority]}`}>
        {labels[priority]}
      </span>
    );
  };

  // Compute date-bucket (overdue | today | upcoming | later | no_date) for a task.
  const dateBucket = (task: Task): 'overdue' | 'today' | 'upcoming' | 'later' | 'no_date' => {
    if (!task.dueDate) return 'no_date';
    const now = new Date();
    const dueDate = new Date(task.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    if (diffDays <= 7) return 'upcoming';
    return 'later';
  };

  // For view='inbox' (frontend-derived): keep only overdue + today + no_date,
  // and don't show completed ones.
  const visibleTasks: Task[] = view === 'inbox'
    ? tasks.filter(t => {
        if (t.status === 'completed' && !showCompleted) return false;
        const b = dateBucket(t);
        return b === 'overdue' || b === 'today' || b === 'no_date';
      })
    : tasks;

  // Group tasks by the active groupBy setting.
  const groupedTasks: Record<string, Task[]> = {};
  const groupOrder: string[] = [];
  const groupLabels: Record<string, string> = {};
  const groupTones: Record<string, string> = {};

  const ensureGroup = (key: string, label: string, tone?: string) => {
    if (!(key in groupedTasks)) {
      groupedTasks[key] = [];
      groupOrder.push(key);
      groupLabels[key] = label;
      if (tone) groupTones[key] = tone;
    }
  };

  if (groupBy === 'date') {
    // Pre-seed standard order so empty groups stay collapsed but order is stable
    const seed: { key: string; label: string; tone?: string }[] = [
      { key: 'overdue', label: 'Überfällig', tone: 'text-red-600 dark:text-red-400' },
      { key: 'today', label: 'Heute', tone: 'text-accent-primary dark:text-accent-primary' },
      { key: 'upcoming', label: 'Diese Woche' },
      { key: 'later', label: 'Später' },
      { key: 'no_date', label: 'Ohne Datum' },
    ];
    for (const s of seed) ensureGroup(s.key, s.label, s.tone);
    for (const task of visibleTasks) {
      groupedTasks[dateBucket(task)].push(task);
    }
  } else if (groupBy === 'customer') {
    for (const task of visibleTasks) {
      const key = task.customerName ?? '__no_customer__';
      ensureGroup(key, task.customerName ?? 'Ohne Kunde');
      groupedTasks[key].push(task);
    }
    // Sort groups: real customer names alphabetically, "Ohne Kunde" last
    groupOrder.sort((a, b) => {
      if (a === '__no_customer__') return 1;
      if (b === '__no_customer__') return -1;
      return groupLabels[a].localeCompare(groupLabels[b], 'de');
    });
  } else if (groupBy === 'priority') {
    const seed: { key: string; label: string; tone?: string }[] = [
      { key: 'urgent', label: 'Dringend', tone: 'text-red-600 dark:text-red-400' },
      { key: 'high', label: 'Hoch', tone: 'text-orange-600 dark:text-orange-400' },
      { key: 'normal', label: 'Normal' },
      { key: 'low', label: 'Niedrig' },
    ];
    for (const s of seed) ensureGroup(s.key, s.label, s.tone);
    for (const task of visibleTasks) {
      groupedTasks[task.priority].push(task);
    }
  } else if (groupBy === 'ticket') {
    for (const task of visibleTasks) {
      if (task.ticketNumber) {
        const key = `ticket:${task.ticketId ?? task.ticketNumber}`;
        ensureGroup(key, `Ticket ${task.ticketNumber}${task.ticketTitle ? ' · ' + task.ticketTitle : ''}`);
        groupedTasks[key].push(task);
      } else {
        ensureGroup('__no_ticket__', 'Ohne Ticket');
        groupedTasks['__no_ticket__'].push(task);
      }
    }
    groupOrder.sort((a, b) => {
      if (a === '__no_ticket__') return 1;
      if (b === '__no_ticket__') return -1;
      return groupLabels[a].localeCompare(groupLabels[b], 'de');
    });
  }

  // Toggle group expansion
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  // Render task item
  const renderTask = (task: Task) => {
    const isRunning = runningTimerTaskId === task.id;
    const isCompleted = task.status === 'completed';
    const isTicketSource = task.taskSource === 'ticket';

    return (
      <div
        key={task.id}
        className={`group flex items-start gap-3 p-3 rounded-lg border transition-all ${
          isCompleted
            ? 'bg-gray-50 dark:bg-dark-100/50 border-gray-200 dark:border-dark-border opacity-60'
            : 'bg-white dark:bg-dark-100 border-gray-200 dark:border-dark-border hover:border-accent-primary/40 dark:hover:border-accent-primary hover:shadow-sm'
        }`}
      >
        {/* Checkbox */}
        <button
          onClick={() => toggleTaskComplete(task)}
          className={`flex-shrink-0 mt-0.5 ${getPriorityColor(task.priority)} hover:opacity-70`}
          title={isTicketSource ? 'TicketTasks im Ticket abhaken' : (isCompleted ? 'Als offen markieren' : 'Als erledigt markieren')}
        >
          {isCompleted ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        {/* Task content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className={`font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                  {task.title}
                </h4>
                {isTicketSource && task.ticketNumber && (
                  <button
                    onClick={() => task.ticketId && onOpenTicket?.(task.ticketId)}
                    disabled={!task.ticketId || !onOpenTicket}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-accent-primary/10 dark:bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/20 dark:hover:bg-accent-primary/30 transition-colors disabled:cursor-default disabled:hover:bg-accent-primary/10"
                    title={task.ticketTitle ? `Ticket ${task.ticketNumber}: ${task.ticketTitle}` : `Ticket ${task.ticketNumber}`}
                  >
                    <Ticket className="w-3 h-3" />
                    {task.ticketNumber}
                  </button>
                )}
              </div>
              {task.description && (
                <p className="text-sm text-gray-500 dark:text-dark-400 line-clamp-1 mt-0.5">
                  {task.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {task.projectId && !isTicketSource && (
                <IconButton
                  onClick={() => handleTimerToggle(task)}
                  variant={isRunning ? 'danger' : 'default'}
                  size="md"
                  icon={isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  tooltip={isRunning ? 'Timer stoppen' : 'Timer starten'}
                />
              )}
              <IconButton
                onClick={() => handleEditClick(task)}
                variant="default"
                size="md"
                icon={<Edit className="w-4 h-4" />}
                tooltip={isTicketSource ? 'Im Ticket bearbeiten' : 'Bearbeiten'}
              />
              <IconButton
                onClick={() => handleDeleteTask(task)}
                variant="danger"
                size="md"
                icon={<Trash2 className="w-4 h-4" />}
                tooltip={isTicketSource ? 'Im Ticket löschen' : 'Löschen'}
              />
            </div>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500 dark:text-dark-400">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(task.dueDate)}
                {task.dueTime && ` ${task.dueTime.slice(0, 5)}`}
              </span>
            )}
            {task.customerName && (
              <button
                onClick={() => task.customerId && onOpenCustomer?.(task.customerId)}
                disabled={!task.customerId || !onOpenCustomer}
                className="flex items-center gap-1 hover:text-accent-primary transition-colors disabled:hover:text-gray-500 dark:disabled:hover:text-dark-400"
                title={task.customerId && onOpenCustomer ? 'Kunde öffnen' : undefined}
              >
                <Building2 className="w-3.5 h-3.5" />
                {task.customerName}
              </button>
            )}
            {task.projectName && (
              <span className="flex items-center gap-1">
                <Folder className="w-3.5 h-3.5" />
                {task.projectName}
              </span>
            )}
            {!isTicketSource && task.ticketNumber && (
              <button
                onClick={() => task.ticketId && onOpenTicket?.(task.ticketId)}
                disabled={!task.ticketId || !onOpenTicket}
                className="flex items-center gap-1 hover:text-accent-primary transition-colors disabled:hover:text-gray-500 dark:disabled:hover:text-dark-400"
              >
                <Ticket className="w-3.5 h-3.5" />
                {task.ticketNumber}
              </button>
            )}
            {task.estimatedMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                ~{formatDuration(task.estimatedMinutes * 60)}
              </span>
            )}
            {task.totalTrackedTime && task.totalTrackedTime > 0 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <Timer className="w-3.5 h-3.5" />
                {formatDuration(task.totalTrackedTime)}
              </span>
            )}
            {task.category && !isTicketSource && (
              <span className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                {task.category}
              </span>
            )}
            {task.checklistCount && task.checklistCount > 0 && (
              <span className="flex items-center gap-1">
                <ListTodo className="w-3.5 h-3.5" />
                {task.checklistCompleted}/{task.checklistCount}
              </span>
            )}
            {getPriorityBadge(task.priority)}
          </div>
        </div>
      </div>
    );
  };

  // Render task group
  const renderGroup = (key: string, label: string, icon: React.ReactNode, tasks: Task[], className?: string) => {
    if (!tasks || tasks.length === 0) return null;
    const isExpanded = expandedGroups[key] !== false;

    return (
      <div className="mb-6">
        <button
          onClick={() => toggleGroup(key)}
          className={`flex items-center gap-2 mb-3 text-sm font-semibold ${className || 'text-gray-700 dark:text-dark-500'}`}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {icon}
          {label}
          <span className="ml-1 text-gray-400">({tasks.length})</span>
        </button>
        {isExpanded && (
          <div className="space-y-2">
            {tasks.map(renderTask)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-dark-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-dark-100 border-b border-gray-200 dark:border-dark-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meine Aufgaben</h1>
            <p className="text-sm text-gray-500 dark:text-dark-400 mt-1">
              Unified Task Hub - Alle Aufgaben an einem Ort
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingTask(null);
              setShowTaskModal(true);
            }}
            variant="primary"
            size="md"
            icon={<Plus className="w-5 h-5" />}
          >
            Neue Aufgabe
          </Button>
        </div>

        {/* Quick Stats */}
        {dashboard && (
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 dark:bg-dark-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400">
                <ListTodo className="w-4 h-4" />
                <span className="text-xs font-medium">Offen</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {dashboard.myTasks.my_pending + dashboard.myTasks.my_in_progress}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400">
                <CalendarDays className="w-4 h-4" />
                <span className="text-xs font-medium">Heute</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {dashboard.myTasks.my_today}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-medium">Überfällig</span>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {dashboard.myTasks.my_overdue}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-dark-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">In Arbeit</span>
              </div>
              <p className="text-2xl font-bold text-accent-primary dark:text-accent-primary mt-1">
                {dashboard.myTasks.my_in_progress}
              </p>
            </div>
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto">
          {[
            { key: 'inbox' as ViewKey, label: 'Inbox', icon: <Inbox className="w-4 h-4" />, hint: 'Überfällig + Heute + Ohne Datum' },
            { key: 'my' as ViewKey, label: 'Meine Aufgaben', icon: <ListTodo className="w-4 h-4" /> },
            { key: 'today' as ViewKey, label: 'Heute', icon: <CalendarDays className="w-4 h-4" /> },
            { key: 'week' as ViewKey, label: 'Diese Woche', icon: <Calendar className="w-4 h-4" /> },
            { key: 'overdue' as ViewKey, label: 'Überfällig', icon: <AlertTriangle className="w-4 h-4" /> },
            { key: 'all' as ViewKey, label: 'Alle', icon: <Filter className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => handleViewChange(tab.key)}
              title={tab.hint}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                view === tab.key
                  ? 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary'
                  : 'text-gray-600 dark:text-dark-400 hover:bg-gray-100 dark:hover:bg-dark-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-dark-400">Gruppieren:</label>
              <select
                value={groupBy}
                onChange={(e) => handleGroupByChange(e.target.value as GroupBy)}
                className="text-sm px-2 py-1 rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
              >
                <option value="date">Datum</option>
                <option value="customer">Kunde</option>
                <option value="priority">Priorität</option>
                <option value="ticket">Ticket</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
              />
              Erledigte anzeigen
            </label>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Quick-Add */}
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-dark-border bg-white dark:bg-dark-100 focus-within:border-accent-primary dark:focus-within:border-accent-primary transition-colors">
          <Plus className="w-4 h-4 text-gray-400 dark:text-dark-400 flex-shrink-0" />
          <input
            ref={quickAddInputRef}
            type="text"
            value={quickAddTitle}
            onChange={(e) => setQuickAddTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleQuickAdd(); } }}
            placeholder="Was möchtest du heute nicht vergessen? Enter zum Anlegen."
            disabled={quickAddMutation.isPending}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none disabled:opacity-50"
          />
          {quickAddTitle.trim() && (
            <button
              onClick={() => void handleQuickAdd()}
              disabled={quickAddMutation.isPending}
              className="text-xs font-medium text-accent-primary hover:text-accent-dark transition-colors disabled:opacity-50"
            >
              Anlegen
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-dark-400">
            <ListTodo className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">Keine Aufgaben in dieser Sicht</p>
            <p className="text-sm mt-1">Tipp: Quick-Add oben oder „Neue Aufgabe" für die Details.</p>
          </div>
        ) : (
          <div>
            {groupOrder.map(key => renderGroup(
              key,
              groupLabels[key],
              <ListTodo className="w-4 h-4" />,
              groupedTasks[key] || [],
              groupTones[key]
            ))}
          </div>
        )}
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          task={editingTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          onSave={() => {
            setShowTaskModal(false);
            setEditingTask(null);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
    </div>
  );
}
