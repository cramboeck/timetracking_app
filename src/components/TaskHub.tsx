import { useState, useEffect, useCallback } from 'react';
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
  MoreVertical,
  Trash2,
  Edit,
  Timer,
  TrendingUp,
  ListTodo,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import { tasksApi } from '../services/api';
import type { Task, TaskDashboardData, TaskFilters, TaskPriority } from '../types';
import TaskModal from './TaskModal';

interface TaskHubProps {
  onTimerStart?: (taskId: string) => void;
  onTimerStop?: (taskId: string) => void;
  runningTimerTaskId?: string | null;
}

export default function TaskHub({ onTimerStart, onTimerStop, runningTimerTaskId }: TaskHubProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboard, setDashboard] = useState<TaskDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'my' | 'all' | 'today' | 'week' | 'overdue'>('my');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>({ view: 'my' });
  const [showCompleted, setShowCompleted] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ overdue: true, today: true, upcoming: true });

  // Modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    try {
      const response = await tasksApi.getDashboard();
      if (response.success) {
        setDashboard(response.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }, []);

  // Load tasks
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      console.log('📋 [TASKS] Loading tasks with filters:', { ...filters, view, includeCompleted: showCompleted });
      const response = await tasksApi.getAll({
        ...filters,
        view,
        includeCompleted: showCompleted,
      });
      console.log('📋 [TASKS] Response:', response);
      if (response.success) {
        console.log('📋 [TASKS] Loaded', response.data?.length || 0, 'tasks');
        setTasks(response.data || []);
      } else {
        console.error('📋 [TASKS] API returned success=false');
      }
    } catch (err) {
      console.error('📋 [TASKS] Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, view, showCompleted]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Toggle task completion
  const toggleTaskComplete = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      const response = await tasksApi.update(task.id, { status: newStatus });
      if (response.success) {
        setTasks(prev => prev.map(t => t.id === task.id ? response.data : t));
        loadDashboard();
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // Handle timer toggle
  const handleTimerToggle = async (task: Task) => {
    if (runningTimerTaskId === task.id) {
      try {
        await tasksApi.stopTimer(task.id);
        onTimerStop?.(task.id);
      } catch (err) {
        console.error('Failed to stop timer:', err);
      }
    } else {
      try {
        await tasksApi.startTimer(task.id);
        onTimerStart?.(task.id);
      } catch (err) {
        console.error('Failed to start timer:', err);
      }
    }
    loadTasks();
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    try {
      await tasksApi.delete(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      loadDashboard();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
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
      case 'normal': return 'text-blue-600 dark:text-blue-400';
      case 'low': return 'text-gray-500 dark:text-gray-400';
    }
  };

  // Get priority badge
  const getPriorityBadge = (priority: TaskPriority) => {
    const colors = {
      urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      normal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
    };
    const labels = { urgent: 'Dringend', high: 'Hoch', normal: 'Normal', low: 'Niedrig' };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[priority]}`}>
        {labels[priority]}
      </span>
    );
  };

  // Group tasks by date
  const groupedTasks = tasks.reduce((acc, task) => {
    const now = new Date();
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;

    let group = 'no_date';
    if (dueDate) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const taskDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        group = 'overdue';
      } else if (diffDays === 0) {
        group = 'today';
      } else if (diffDays <= 7) {
        group = 'upcoming';
      } else {
        group = 'later';
      }
    }

    if (!acc[group]) acc[group] = [];
    acc[group].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  // Toggle group expansion
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  // Render task item
  const renderTask = (task: Task) => {
    const isRunning = runningTimerTaskId === task.id;
    const isCompleted = task.status === 'completed';

    return (
      <div
        key={task.id}
        className={`group flex items-start gap-3 p-3 rounded-lg border transition-all ${
          isCompleted
            ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm'
        }`}
      >
        {/* Checkbox */}
        <button
          onClick={() => toggleTaskComplete(task)}
          className={`flex-shrink-0 mt-0.5 ${getPriorityColor(task.priority)} hover:opacity-70`}
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
              <h4 className={`font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                {task.title}
              </h4>
              {task.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                  {task.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {task.projectId && (
                <button
                  onClick={() => handleTimerToggle(task)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isRunning
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                  }`}
                  title={isRunning ? 'Timer stoppen' : 'Timer starten'}
                >
                  {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={() => {
                  setEditingTask(task);
                  setShowTaskModal(true);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="Bearbeiten"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteTask(task.id)}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                title="Löschen"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(task.dueDate)}
                {task.dueTime && ` ${task.dueTime.slice(0, 5)}`}
              </span>
            )}
            {task.customerName && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {task.customerName}
              </span>
            )}
            {task.projectName && (
              <span className="flex items-center gap-1">
                <Folder className="w-3.5 h-3.5" />
                {task.projectName}
              </span>
            )}
            {task.ticketNumber && (
              <span className="flex items-center gap-1">
                <Ticket className="w-3.5 h-3.5" />
                {task.ticketNumber}
              </span>
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
            {task.category && (
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
          className={`flex items-center gap-2 mb-3 text-sm font-semibold ${className || 'text-gray-700 dark:text-gray-300'}`}
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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meine Aufgaben</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Unified Task Hub - Alle Aufgaben an einem Ort
            </p>
          </div>
          <button
            onClick={() => {
              setEditingTask(null);
              setShowTaskModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Neue Aufgabe
          </button>
        </div>

        {/* Quick Stats */}
        {dashboard && (
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <ListTodo className="w-4 h-4" />
                <span className="text-xs font-medium">Offen</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {dashboard.myTasks.my_pending + dashboard.myTasks.my_in_progress}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <CalendarDays className="w-4 h-4" />
                <span className="text-xs font-medium">Heute</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {dashboard.myTasks.my_today}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-medium">Überfällig</span>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {dashboard.myTasks.my_overdue}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">In Arbeit</span>
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {dashboard.myTasks.my_in_progress}
              </p>
            </div>
          </div>
        )}

        {/* View Tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto">
          {[
            { key: 'my', label: 'Meine Aufgaben', icon: <ListTodo className="w-4 h-4" /> },
            { key: 'today', label: 'Heute', icon: <CalendarDays className="w-4 h-4" /> },
            { key: 'week', label: 'Diese Woche', icon: <Calendar className="w-4 h-4" /> },
            { key: 'overdue', label: 'Überfällig', icon: <AlertTriangle className="w-4 h-4" /> },
            { key: 'all', label: 'Alle', icon: <Filter className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                view === tab.key
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Erledigte anzeigen
            </label>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <ListTodo className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">Keine Aufgaben gefunden</p>
            <p className="text-sm mt-1">Erstelle eine neue Aufgabe, um loszulegen</p>
            <button
              onClick={() => {
                setEditingTask(null);
                setShowTaskModal(true);
              }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Neue Aufgabe
            </button>
          </div>
        ) : (
          <div>
            {renderGroup(
              'overdue',
              'Überfällig',
              <AlertTriangle className="w-4 h-4" />,
              groupedTasks.overdue || [],
              'text-red-600 dark:text-red-400'
            )}
            {renderGroup(
              'today',
              'Heute',
              <CalendarDays className="w-4 h-4" />,
              groupedTasks.today || [],
              'text-blue-600 dark:text-blue-400'
            )}
            {renderGroup(
              'upcoming',
              'Diese Woche',
              <Calendar className="w-4 h-4" />,
              groupedTasks.upcoming || []
            )}
            {renderGroup(
              'later',
              'Später',
              <Clock className="w-4 h-4" />,
              groupedTasks.later || []
            )}
            {renderGroup(
              'no_date',
              'Ohne Datum',
              <ListTodo className="w-4 h-4" />,
              groupedTasks.no_date || []
            )}
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
            loadTasks();
            loadDashboard();
          }}
        />
      )}
    </div>
  );
}
