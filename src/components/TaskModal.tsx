import { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  Building2,
  Folder,
  Tag,
  AlertCircle,
  Repeat,
  ListTodo,
  Plus,
  Trash2,
  CheckCircle,
  Circle,
  Sparkles,
} from 'lucide-react';
import { Button, IconButton, Input, Textarea, Select, Label, FormRow } from './ui';
import { tasksApi, customersApi, projectsApi } from '../services/api';
import type {
  Task,
  TaskPriority,
  TaskStatus,
  RecurrencePattern,
  Customer,
  Project,
} from '../types';

interface TaskModalProps {
  task?: Task | null;
  onClose: () => void;
  onSave: () => void;
  defaultTicketId?: string;
  defaultProjectId?: string;
  defaultCustomerId?: string;
}

export default function TaskModal({
  task,
  onClose,
  onSave,
  defaultTicketId,
  defaultProjectId,
  defaultCustomerId,
}: TaskModalProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'normal');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'pending');
  const [dueDate, setDueDate] = useState(task?.dueDate?.split('T')[0] || '');
  const [dueTime, setDueTime] = useState(task?.dueTime?.slice(0, 5) || '');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>(task?.estimatedMinutes || '');
  const [category, setCategory] = useState(task?.category || '');
  const [customerId, setCustomerId] = useState(task?.customerId || defaultCustomerId || '');
  const [projectId, setProjectId] = useState(task?.projectId || defaultProjectId || '');

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring || false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern | ''>(task?.recurrencePattern || '');
  const [recurrenceInterval, setRecurrenceInterval] = useState(task?.recurrenceInterval || 1);

  // Checklist
  const [checklistItems, setChecklistItems] = useState<{ title: string; completed: boolean }[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);

  // State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedMinutes, setSuggestedMinutes] = useState<number | null>(null);

  // Load customers and projects
  useEffect(() => {
    const loadData = async () => {
      try {
        const [customersRes, projectsRes] = await Promise.all([
          customersApi.getAll(),
          projectsApi.getAll(),
        ]);
        if (customersRes.success) setCustomers(customersRes.data);
        if (projectsRes.success) setProjects(projectsRes.data);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  // Load full task details (including checklist) when editing
  useEffect(() => {
    const loadTaskDetails = async () => {
      if (task?.id) {
        try {
          const response = await tasksApi.get(task.id);
          if (response.success && response.data?.checklistItems) {
            setChecklistItems(
              response.data.checklistItems.map((item: { title: string; completed?: boolean }) => ({
                title: item.title,
                completed: item.completed || false,
              }))
            );
          }
        } catch (err) {
          console.error('Failed to load task details:', err);
        }
      }
    };
    loadTaskDetails();
  }, [task?.id]);

  // Filter projects by customer
  useEffect(() => {
    if (customerId) {
      setFilteredProjects(projects.filter(p => p.customerId === customerId));
    } else {
      setFilteredProjects(projects);
    }
  }, [customerId, projects]);

  // Get time suggestion when title changes
  useEffect(() => {
    const getSuggestion = async () => {
      if (title.length >= 5) {
        try {
          const response = await tasksApi.getSimilarTasks(title, category || undefined);
          if (response.success && response.data.suggestedMinutes) {
            setSuggestedMinutes(response.data.suggestedMinutes);
          }
        } catch (err) {
          // Ignore errors for suggestions
        }
      }
    };

    const timeout = setTimeout(getSuggestion, 500);
    return () => clearTimeout(timeout);
  }, [title, category]);

  // Add checklist item
  const addChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems(prev => [...prev, { title: newChecklistItem.trim(), completed: false }]);
      setNewChecklistItem('');
    }
  };

  // Remove checklist item
  const removeChecklistItem = (index: number) => {
    setChecklistItems(prev => prev.filter((_, i) => i !== index));
  };

  // Toggle checklist item
  const toggleChecklistItem = (index: number) => {
    setChecklistItems(prev =>
      prev.map((item, i) => (i === index ? { ...item, completed: !item.completed } : item))
    );
  };

  // Handle save
  const handleSave = async () => {
    if (!title.trim()) {
      setError('Titel ist erforderlich');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        estimatedMinutes: estimatedMinutes || null,
        category: category.trim() || null,
        customerId: customerId || null,
        projectId: projectId || null,
        ticketId: defaultTicketId || task?.ticketId || null,
        isRecurring,
        recurrencePattern: isRecurring ? recurrencePattern || null : null,
        recurrenceInterval: isRecurring ? recurrenceInterval : 1,
        checklistItems: checklistItems.length > 0 ? checklistItems : undefined,
      };

      if (task) {
        await tasksApi.update(task.id, data);
      } else {
        await tasksApi.create(data);
      }

      onSave();
    } catch (err: any) {
      setError(err.message || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-dark-100 rounded-xl shadow-xl max-w-2xl w-full mx-auto transform transition-all text-left">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
            </h2>
            <IconButton
              onClick={onClose}
              icon={<X className="w-5 h-5" />}
              size="md"
            />
          </div>

          {/* Body */}
          <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Title */}
              <Input
                type="text"
                label="Titel"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Was muss erledigt werden?"
                autoFocus
              />

              {/* Description */}
              <Textarea
                label="Beschreibung"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Weitere Details..."
                rows={3}
              />

              {/* Priority & Status */}
              <FormRow>
                <Select
                  label="Priorität"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                >
                  <option value="low">Niedrig</option>
                  <option value="normal">Normal</option>
                  <option value="high">Hoch</option>
                  <option value="urgent">Dringend</option>
                </Select>
                <Select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  <option value="pending">Ausstehend</option>
                  <option value="in_progress">In Arbeit</option>
                  <option value="completed">Erledigt</option>
                  <option value="cancelled">Abgebrochen</option>
                </Select>
              </FormRow>

              {/* Due Date & Time */}
              <FormRow className="!grid-cols-2">
                <Input
                  type="date"
                  label={<><Calendar className="w-4 h-4 inline mr-1" />Fällig am</>}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <Input
                  type="time"
                  label={<><Clock className="w-4 h-4 inline mr-1" />Uhrzeit</>}
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </FormRow>

              {/* Estimated Time */}
              <div>
                <Label>
                  <Clock className="w-4 h-4 inline mr-1" />
                  Geschätzte Zeit (Minuten)
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="number"
                      min="0"
                      value={estimatedMinutes}
                      onChange={(e) => setEstimatedMinutes(e.target.value ? parseInt(e.target.value) : '')}
                      placeholder="z.B. 30"
                    />
                  </div>
                  {suggestedMinutes && !estimatedMinutes && (
                    <Button
                      onClick={() => setEstimatedMinutes(suggestedMinutes)}
                      variant="secondary"
                      size="sm"
                      icon={<Sparkles className="w-4 h-4" />}
                      title="Basierend auf ähnlichen Aufgaben"
                      className="bg-accent-lighter text-accent-dark dark:bg-accent-primary/20 dark:text-accent-primary hover:bg-accent-lighter dark:hover:bg-accent-primary/30"
                    >
                      ~{suggestedMinutes}min
                    </Button>
                  )}
                </div>
              </div>

              {/* Customer & Project */}
              <FormRow>
                <Select
                  label={<><Building2 className="w-4 h-4 inline mr-1" />Kunde</>}
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setProjectId(''); // Reset project when customer changes
                  }}
                >
                  <option value="">Kein Kunde</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <Select
                  label={<><Folder className="w-4 h-4 inline mr-1" />Projekt</>}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={filteredProjects.length === 0}
                >
                  <option value="">Kein Projekt</option>
                  {filteredProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </FormRow>

              {/* Category */}
              <Input
                type="text"
                label={<><Tag className="w-4 h-4 inline mr-1" />Kategorie</>}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z.B. Entwicklung, Support, Admin"
              />

              {/* Recurrence */}
              <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary"
                  />
                  <Repeat className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-500">
                    Wiederkehrende Aufgabe
                  </span>
                </label>

                {isRecurring && (
                  <FormRow className="mt-3">
                    <Select
                      label="Wiederholung"
                      value={recurrencePattern}
                      onChange={(e) => setRecurrencePattern(e.target.value as RecurrencePattern)}
                    >
                      <option value="">Auswählen...</option>
                      <option value="daily">Täglich</option>
                      <option value="weekly">Wöchentlich</option>
                      <option value="monthly">Monatlich</option>
                      <option value="yearly">Jährlich</option>
                    </Select>
                    <Input
                      type="number"
                      label="Intervall"
                      min="1"
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(parseInt(e.target.value) || 1)}
                    />
                  </FormRow>
                )}
              </div>

              {/* Checklist */}
              <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                  <ListTodo className="w-4 h-4" />
                  Checkliste
                </label>

                {checklistItems.length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {checklistItems.map((item, index) => (
                      <li key={index} className="flex items-center gap-2 group">
                        <button
                          onClick={() => toggleChecklistItem(index)}
                          className="text-gray-400 hover:text-accent-primary"
                        >
                          {item.completed ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                        </button>
                        <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-dark-500'}`}>
                          {item.title}
                        </span>
                        <IconButton
                          onClick={() => removeChecklistItem(index)}
                          icon={<Trash2 className="w-4 h-4" />}
                          variant="danger"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100"
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      type="text"
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addChecklistItem()}
                      placeholder="Neuer Punkt..."
                    />
                  </div>
                  <IconButton
                    onClick={addChecklistItem}
                    disabled={!newChecklistItem.trim()}
                    icon={<Plus className="w-5 h-5" />}
                    size="md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border">
            <Button
              onClick={onClose}
              variant="secondary"
              size="md"
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              variant="primary"
              size="md"
              loading={saving}
            >
              {task ? 'Speichern' : 'Erstellen'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
