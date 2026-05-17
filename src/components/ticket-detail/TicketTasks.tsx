import { useState } from 'react';
import { CheckSquare, Square, GripVertical, Eye, EyeOff, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { TicketTask } from './types';

interface TicketTasksProps {
  ticketId: string;
  tasks: TicketTask[];
  loadingTasks: boolean;
  onAddTask: (title: string, visible: boolean) => Promise<void>;
  onToggleTask: (task: TicketTask) => Promise<void>;
  onToggleTaskVisibility: (task: TicketTask) => Promise<void>;
  onUpdateTask: (taskId: string, title: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onReorderTasks: (taskIds: string[]) => Promise<void>;
}

export const TicketTasks = ({
  ticketId,
  tasks,
  loadingTasks,
  onAddTask,
  onToggleTask,
  onToggleTaskVisibility,
  onUpdateTask,
  onDeleteTask,
  onReorderTasks,
}: TicketTasksProps) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskVisible, setNewTaskVisible] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [localTasks, setLocalTasks] = useState<TicketTask[]>(tasks);

  // Sync local tasks with props
  if (JSON.stringify(tasks) !== JSON.stringify(localTasks) && !draggedTaskId) {
    setLocalTasks(tasks);
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      setAddingTask(true);
      await onAddTask(newTaskTitle.trim(), newTaskVisible);
      setNewTaskTitle('');
      setNewTaskVisible(false);
    } finally {
      setAddingTask(false);
    }
  };

  const handleStartEditTask = (task: TicketTask) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  const handleSaveEditTask = async (taskId: string) => {
    if (!editingTaskTitle.trim()) {
      handleCancelEditTask();
      return;
    }
    await onUpdateTask(taskId, editingTaskTitle.trim());
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

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <CheckSquare size={16} />
          Aufgaben ({localTasks.filter(t => t.completed).length}/{localTasks.length})
        </h2>
      </div>

      {/* Task List */}
      {loadingTasks ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
        </div>
      ) : (
        <div className="space-y-2">
          {localTasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={() => handleDragStart(task.id)}
              onDragOver={(e) => handleDragOver(e, task.id)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group cursor-move transition-opacity ${
                draggedTaskId === task.id ? 'opacity-50' : ''
              }`}
            >
              {/* Drag Handle */}
              <GripVertical
                size={16}
                className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />

              {/* Checkbox */}
              <button
                onClick={() => onToggleTask(task)}
                className="flex-shrink-0"
              >
                {task.completed ? (
                  <CheckSquare size={20} className="text-green-500" />
                ) : (
                  <Square size={20} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                )}
              </button>

              {/* Task Title */}
              {editingTaskId === task.id ? (
                <div className="flex-1 flex items-center gap-2">
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
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                  />
                  <IconButton
                    onClick={() => handleSaveEditTask(task.id)}
                    icon={<Check size={16} />}
                    variant="success"
                    size="sm"
                    tooltip="Speichern"
                  />
                  <IconButton
                    onClick={handleCancelEditTask}
                    icon={<X size={16} />}
                    variant="default"
                    size="sm"
                    tooltip="Abbrechen"
                  />
                </div>
              ) : (
                <span
                  className={`flex-1 text-sm cursor-pointer hover:text-accent-primary ${
                    task.completed
                      ? 'text-gray-500 dark:text-gray-400 line-through'
                      : 'text-gray-900 dark:text-white'
                  }`}
                  onDoubleClick={() => handleStartEditTask(task)}
                  title="Doppelklicken zum Bearbeiten"
                >
                  {task.title}
                </span>
              )}

              {/* Edit Button - only show when not editing */}
              {editingTaskId !== task.id && (
                <IconButton
                  onClick={() => handleStartEditTask(task)}
                  icon={<Pencil size={16} />}
                  variant="primary"
                  size="sm"
                  tooltip="Aufgabe bearbeiten"
                  className="opacity-0 group-hover:opacity-100"
                />
              )}

              {/* Visibility Toggle */}
              <button
                onClick={() => onToggleTaskVisibility(task)}
                className={`p-1.5 rounded transition-colors ${
                  task.visibleToCustomer
                    ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={task.visibleToCustomer ? 'Für Kunden sichtbar' : 'Nur intern sichtbar'}
              >
                {task.visibleToCustomer ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>

              {/* Delete Button */}
              <IconButton
                onClick={() => onDeleteTask(task.id)}
                icon={<Trash2 size={16} />}
                variant="danger"
                size="sm"
                tooltip="Aufgabe löschen"
                className="opacity-0 group-hover:opacity-100"
              />
            </div>
          ))}

          {/* Add Task Form */}
          <div className="flex items-center gap-2 p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            <Square size={20} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
              placeholder="Neue Aufgabe hinzufügen..."
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
            />
            <button
              onClick={() => setNewTaskVisible(!newTaskVisible)}
              className={`p-1.5 rounded transition-colors ${
                newTaskVisible
                  ? 'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={newTaskVisible ? 'Für Kunden sichtbar' : 'Nur intern sichtbar'}
            >
              {newTaskVisible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <Button
              onClick={handleAddTask}
              disabled={!newTaskTitle.trim() || addingTask}
              variant="primary"
              size="sm"
              loading={addingTask}
            >
              Hinzufügen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
