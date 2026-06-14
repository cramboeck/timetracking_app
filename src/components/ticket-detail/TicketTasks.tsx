import { useState, useMemo } from 'react';
import { CheckSquare, Square, GripVertical, Eye, EyeOff, Trash2, Pencil, Check, X, ChevronRight, Calendar, User, AlertCircle } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { TicketTask } from './types';

interface TicketTasksProps {
  ticketId: string;
  tasks: TicketTask[];
  loadingTasks: boolean;
  onAddTask: (title: string, visible: boolean, dueDate?: string | null) => Promise<void>;
  onToggleTask: (task: TicketTask) => Promise<void>;
  onToggleTaskVisibility: (task: TicketTask) => Promise<void>;
  onUpdateTask: (taskId: string, title: string, dueDate?: string | null) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
}

// Helper to check if a date is today
const isToday = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

// Helper to check if a date is overdue (before today)
const isOverdue = (dateStr: string): boolean => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
};

// Format date for display (compact)
const formatDueDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

export const TicketTasks = ({
  tasks,
  loadingTasks,
  onAddTask,
  onToggleTask,
  onToggleTaskVisibility,
  onUpdateTask,
  onDeleteTask,
  onReorderTasks,
}: TicketTasksProps) => {
  const [expanded, setExpanded] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskVisible, setNewTaskVisible] = useState(false);
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDueDate, setEditingTaskDueDate] = useState('');
  const [localTasks, setLocalTasks] = useState<TicketTask[]>(tasks);

  // Sync local tasks with props
  if (JSON.stringify(tasks) !== JSON.stringify(localTasks) && !draggedTaskId) {
    setLocalTasks(tasks);
  }

  // Count completed and overdue tasks
  const taskStats = useMemo(() => {
    const completed = localTasks.filter(t => t.completed).length;
    const overdue = localTasks.filter(t => !t.completed && t.dueDate && isOverdue(t.dueDate)).length;
    return { completed, overdue, total: localTasks.length };
  }, [localTasks]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      setAddingTask(true);
      await onAddTask(newTaskTitle.trim(), newTaskVisible, newTaskDueDate || null);
      setNewTaskTitle('');
      setNewTaskVisible(false);
      setNewTaskDueDate('');
    } finally {
      setAddingTask(false);
    }
  };

  const handleStartEditTask = (task: TicketTask) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
    setEditingTaskDueDate('');
  };

  const handleSaveEditTask = async (taskId: string) => {
    if (!editingTaskTitle.trim()) {
      handleCancelEditTask();
      return;
    }
    await onUpdateTask(taskId, editingTaskTitle.trim(), editingTaskDueDate || null);
    handleCancelEditTask();
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;

    const draggedIndex = localTasks.findIndex(t => t.id === draggedTaskId);
    const targetIndex = localTasks.findIndex(t => t.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTasks = [...localTasks];
    const [draggedTask] = newTasks.splice(draggedIndex, 1);
    newTasks.splice(targetIndex, 0, draggedTask);
    setLocalTasks(newTasks);
  };

  const handleDragEnd = async () => {
    if (!draggedTaskId) return;

    try {
      await onReorderTasks(localTasks.map(t => t.id));
    } catch {
      // Reset to original order on error
      setLocalTasks(tasks);
    }
    setDraggedTaskId(null);
  };

  // Get due date styling
  const getDueDateStyle = (task: TicketTask): string => {
    if (!task.dueDate || task.completed) return 'text-gray-400 dark:text-dark-400';
    if (isOverdue(task.dueDate)) return 'text-red-500';
    if (isToday(task.dueDate)) return 'text-orange-500';
    return 'text-gray-500 dark:text-dark-400';
  };

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-lg">
      {/* Collapsible Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-dark-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckSquare size={14} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-dark-500">
            Aufgaben ({taskStats.completed}/{taskStats.total})
          </span>
          {taskStats.overdue > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle size={12} />
              {taskStats.overdue} überfällig
            </span>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-dark-border px-3 py-2">
          {/* Task List */}
          {loadingTasks ? (
            <div className="flex items-center justify-center py-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent-primary"></div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {localTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-start gap-2 p-2 bg-gray-50 dark:bg-dark-100 rounded group cursor-move transition-opacity ${
                    draggedTaskId === task.id ? 'opacity-50' : ''
                  }`}
                >
                  {/* Drag Handle */}
                  <GripVertical
                    size={14}
                    className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                  />

                  {/* Checkbox */}
                  <button
                    onClick={() => onToggleTask(task)}
                    className="flex-shrink-0 mt-0.5"
                  >
                    {task.completed ? (
                      <CheckSquare size={16} className="text-green-500" />
                    ) : (
                      <Square size={16} className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-500" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    {editingTaskId === task.id ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editingTaskTitle}
                          onChange={(e) => setEditingTaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEditTask(task.id);
                            } else if (e.key === 'Escape') {
                              handleCancelEditTask();
                            }
                          }}
                          autoFocus
                          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={editingTaskDueDate}
                            onChange={(e) => setEditingTaskDueDate(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent-primary"
                          />
                          <IconButton
                            onClick={() => handleSaveEditTask(task.id)}
                            icon={<Check size={14} />}
                            variant="success"
                            size="sm"
                            tooltip="Speichern"
                          />
                          <IconButton
                            onClick={handleCancelEditTask}
                            icon={<X size={14} />}
                            variant="default"
                            size="sm"
                            tooltip="Abbrechen"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <span
                          className={`block text-xs cursor-pointer hover:text-accent-primary ${
                            task.completed
                              ? 'text-gray-500 dark:text-dark-400 line-through'
                              : 'text-gray-900 dark:text-white'
                          }`}
                          onDoubleClick={() => handleStartEditTask(task)}
                          title="Doppelklicken zum Bearbeiten"
                        >
                          {task.title}
                        </span>
                        {/* Due date and assigned user row */}
                        {(task.dueDate || task.assignedToName) && (
                          <div className="flex items-center gap-2 mt-0.5">
                            {task.dueDate && (
                              <span className={`flex items-center gap-0.5 text-[10px] ${getDueDateStyle(task)}`}>
                                <Calendar size={10} />
                                {formatDueDate(task.dueDate)}
                                {!task.completed && isOverdue(task.dueDate) && (
                                  <span className="font-medium ml-0.5">überfällig</span>
                                )}
                                {!task.completed && isToday(task.dueDate) && (
                                  <span className="font-medium ml-0.5">heute</span>
                                )}
                              </span>
                            )}
                            {task.assignedToName && (
                              <span className="flex items-center gap-0.5 text-[10px] text-gray-500 dark:text-dark-400">
                                <User size={10} />
                                {task.assignedToName}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions - only show when not editing */}
                  {editingTaskId !== task.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconButton
                        onClick={() => handleStartEditTask(task)}
                        icon={<Pencil size={12} />}
                        variant="primary"
                        size="sm"
                        tooltip="Bearbeiten"
                      />
                      <button
                        onClick={() => onToggleTaskVisibility(task)}
                        className={`p-1 rounded transition-colors ${
                          task.visibleToCustomer
                            ? 'text-accent-primary hover:bg-accent-light dark:hover:bg-accent-primary/30'
                            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-200'
                        }`}
                        title={task.visibleToCustomer ? 'Für Kunden sichtbar' : 'Nur intern sichtbar'}
                      >
                        {task.visibleToCustomer ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <IconButton
                        onClick={() => onDeleteTask(task.id)}
                        icon={<Trash2 size={12} />}
                        variant="danger"
                        size="sm"
                        tooltip="Löschen"
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Add Task Form */}
              <div className="space-y-1.5 p-2 border border-dashed border-gray-300 dark:border-dark-border rounded">
                <div className="flex items-center gap-2">
                  <Square size={14} className="text-gray-300 dark:text-dark-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
                    placeholder="Neue Aufgabe..."
                    className="flex-1 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 pl-5">
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-200 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    placeholder="Fällig am"
                  />
                  <button
                    onClick={() => setNewTaskVisible(!newTaskVisible)}
                    className={`p-1 rounded transition-colors ${
                      newTaskVisible
                        ? 'text-accent-primary hover:bg-accent-light dark:hover:bg-accent-primary/30'
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-200'
                    }`}
                    title={newTaskVisible ? 'Für Kunden sichtbar' : 'Nur intern sichtbar'}
                  >
                    {newTaskVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <Button
                    onClick={handleAddTask}
                    disabled={!newTaskTitle.trim() || addingTask}
                    variant="primary"
                    size="sm"
                    loading={addingTask}
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
