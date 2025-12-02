import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Clock, User, Building2, Play, Trash2, Edit2, Archive, RotateCcw, Tag, Plus, X, MessageSquare, ChevronDown, History, ChevronRight, Paperclip, Download, Image, File, FileText, Merge, CheckSquare, Square, GripVertical, Eye, EyeOff, Lightbulb } from 'lucide-react';
import { Ticket, TicketComment, TicketStatus, TicketPriority, TicketResolutionType, TicketTask, Customer, Project, TimeEntry } from '../types';
import { ticketsApi, TicketTag, CannedResponse, TicketActivity, TicketAttachment, getApiBaseUrl } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { SlaStatus } from './SlaStatus';
import { TicketMergeDialog } from './TicketMergeDialog';

// Resolution type labels
const resolutionTypeConfig: Record<TicketResolutionType, { label: string; description: string }> = {
  solved: { label: 'Gelöst', description: 'Problem wurde behoben' },
  not_reproducible: { label: 'Nicht reproduzierbar', description: 'Problem konnte nicht nachgestellt werden' },
  duplicate: { label: 'Duplikat', description: 'Bereits in einem anderen Ticket behandelt' },
  wont_fix: { label: 'Wird nicht behoben', description: 'Absichtlich nicht behoben' },
  resolved_itself: { label: 'Hat sich erledigt', description: 'Problem hat sich von selbst gelöst' },
  workaround: { label: 'Workaround', description: 'Umgehungslösung bereitgestellt' },
};

interface TicketDetailProps {
  ticketId: string;
  customers: Customer[];
  projects: Project[];
  onBack: () => void;
  onStartTimer: (ticket: Ticket) => void;
  onTicketDeleted: () => void;
}

const statusConfig: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  waiting: { label: 'Wartend', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-500' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  critical: { label: 'Kritisch', color: 'text-red-500' },
};

export const TicketDetail = ({ ticketId, customers, projects, onBack, onStartTimer, onTicketDeleted }: TicketDetailProps) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<TicketStatus>('open');
  const [editPriority, setEditPriority] = useState<TicketPriority>('normal');

  // Comment
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Archive
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Merge
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Tags
  const [ticketTags, setTicketTags] = useState<TicketTag[]>([]);
  const [allTags, setAllTags] = useState<TicketTag[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Canned Responses
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [showCannedDropdown, setShowCannedDropdown] = useState(false);
  const cannedDropdownRef = useRef<HTMLDivElement>(null);

  // Activities (Timeline)
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [showActivities, setShowActivities] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Solution Modal
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [resolutionType, setResolutionType] = useState<TicketResolutionType>('solved');
  const [pendingStatusChange, setPendingStatusChange] = useState<TicketStatus | null>(null);
  const [savingSolution, setSavingSolution] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<TicketTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskVisible, setNewTaskVisible] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  useEffect(() => {
    loadTicket();
    loadTags();
    loadAttachments();
    loadCannedResponses();
    loadTasks();
  }, [ticketId]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
      if (cannedDropdownRef.current && !cannedDropdownRef.current.contains(event.target as Node)) {
        setShowCannedDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadTicket = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ticketsApi.getById(ticketId);
      setTicket(response.data);
      setComments(response.data.comments || []);
      setTimeEntries(response.data.timeEntries || []);

      // Initialize edit fields
      setEditTitle(response.data.title);
      setEditDescription(response.data.description || '');
      setEditStatus(response.data.status);
      setEditPriority(response.data.priority);

      // Load ticket tags
      const tagsResponse = await ticketsApi.getTicketTags(ticketId);
      setTicketTags(tagsResponse.data);
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Fehler beim Laden des Tickets');
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const response = await ticketsApi.getTags();
      setAllTags(response.data);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const loadCannedResponses = async () => {
    try {
      const response = await ticketsApi.getCannedResponses();
      setCannedResponses(response.data);
    } catch (err) {
      console.error('Failed to load canned responses:', err);
    }
  };

  const loadAttachments = async () => {
    try {
      const response = await ticketsApi.getAttachments(ticketId);
      setAttachments(response.data);
    } catch (err) {
      console.error('Failed to load attachments:', err);
    }
  };

  const loadTasks = async () => {
    try {
      setLoadingTasks(true);
      const response = await ticketsApi.getTasks(ticketId);
      setTasks(response.data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      setAddingTask(true);
      const response = await ticketsApi.createTask(ticketId, {
        title: newTaskTitle.trim(),
        visibleToCustomer: newTaskVisible,
      });
      setTasks(prev => [...prev, response.data]);
      setNewTaskTitle('');
      setNewTaskVisible(false);
    } catch (err) {
      console.error('Failed to add task:', err);
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (task: TicketTask) => {
    try {
      const response = await ticketsApi.updateTask(ticketId, task.id, {
        completed: !task.completed,
      });
      setTasks(prev => prev.map(t => t.id === task.id ? response.data : t));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleToggleTaskVisibility = async (task: TicketTask) => {
    try {
      const response = await ticketsApi.updateTask(ticketId, task.id, {
        visibleToCustomer: !task.visibleToCustomer,
      });
      setTasks(prev => prev.map(t => t.id === task.id ? response.data : t));
    } catch (err) {
      console.error('Failed to update task visibility:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await ticketsApi.deleteTask(ticketId, taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleDragStart = (taskId: string) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;

    const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
    const targetIndex = tasks.findIndex(t => t.id === targetTaskId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTasks = [...tasks];
    const [draggedTask] = newTasks.splice(draggedIndex, 1);
    newTasks.splice(targetIndex, 0, draggedTask);
    setTasks(newTasks);
  };

  const handleDragEnd = async () => {
    if (!draggedTaskId) return;

    try {
      await ticketsApi.reorderTasks(ticketId, tasks.map(t => t.id));
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
      // Reload to get correct order
      loadTasks();
    }
    setDraggedTaskId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploadingFiles(true);
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const result = await ticketsApi.uploadAttachments(ticketId, formData);
      setAttachments(prev => [...prev, ...result.data]);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Failed to upload files:', err);
      alert('Fehler beim Hochladen der Dateien');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Anhang wirklich löschen?')) return;

    try {
      await ticketsApi.deleteAttachment(ticketId, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (err) {
      console.error('Failed to delete attachment:', err);
      alert('Fehler beim Löschen des Anhangs');
    }
  };

  const getAbsoluteFileUrl = (fileUrl: string): string => {
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl;
    }
    const apiBase = getApiBaseUrl();
    const relativePath = fileUrl.startsWith('/api') ? fileUrl.substring(4) : fileUrl;
    return `${apiBase}${relativePath}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.startsWith('image/')) return Image;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  };

  const loadActivities = async () => {
    try {
      setLoadingActivities(true);
      const response = await ticketsApi.getActivities(ticketId);
      setActivities(response.data);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const toggleActivities = () => {
    if (!showActivities && activities.length === 0) {
      loadActivities();
    }
    setShowActivities(!showActivities);
  };

  const getActivityLabel = (activity: TicketActivity): string => {
    const actor = activity.userName || activity.contactName || 'System';
    switch (activity.actionType) {
      case 'created':
        return `${actor} hat das Ticket erstellt`;
      case 'status_changed':
        return `${actor} hat den Status von "${statusConfig[activity.oldValue as TicketStatus]?.label || activity.oldValue}" auf "${statusConfig[activity.newValue as TicketStatus]?.label || activity.newValue}" geändert`;
      case 'priority_changed':
        return `${actor} hat die Priorität von "${priorityConfig[activity.oldValue as TicketPriority]?.label || activity.oldValue}" auf "${priorityConfig[activity.newValue as TicketPriority]?.label || activity.newValue}" geändert`;
      case 'assigned':
        return `${actor} hat das Ticket zugewiesen`;
      case 'unassigned':
        return `${actor} hat die Zuweisung entfernt`;
      case 'comment_added':
        return `${actor} hat einen Kommentar hinzugefügt`;
      case 'internal_comment_added':
        return `${actor} hat eine interne Notiz hinzugefügt`;
      case 'attachment_added':
        return `${actor} hat einen Anhang hinzugefügt`;
      case 'tag_added':
        return `${actor} hat den Tag "${activity.newValue}" hinzugefügt`;
      case 'tag_removed':
        return `${actor} hat den Tag "${activity.oldValue}" entfernt`;
      case 'title_changed':
        return `${actor} hat den Titel geändert`;
      case 'description_changed':
        return `${actor} hat die Beschreibung geändert`;
      case 'resolved':
        return `${actor} hat das Ticket als gelöst markiert`;
      case 'closed':
        return `${actor} hat das Ticket geschlossen`;
      case 'reopened':
        return `${actor} hat das Ticket wieder geöffnet`;
      case 'archived':
        return `${actor} hat das Ticket archiviert`;
      case 'rating_added':
        return `${actor} hat eine Bewertung abgegeben`;
      case 'time_logged':
        return `${actor} hat ${activity.newValue} Zeit erfasst`;
      default:
        return `${actor} hat eine Aktion durchgeführt`;
    }
  };

  const getActivityIcon = (actionType: TicketActivity['actionType']) => {
    switch (actionType) {
      case 'created':
        return <Plus size={12} />;
      case 'status_changed':
      case 'resolved':
      case 'closed':
      case 'reopened':
      case 'archived':
        return <RotateCcw size={12} />;
      case 'priority_changed':
        return <ChevronDown size={12} />;
      case 'comment_added':
      case 'internal_comment_added':
        return <MessageSquare size={12} />;
      case 'tag_added':
      case 'tag_removed':
        return <Tag size={12} />;
      case 'time_logged':
        return <Clock size={12} />;
      default:
        return <Clock size={12} />;
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!ticket) return;
    try {
      const response = await ticketsApi.addTagToTicket(ticket.id, tagId);
      setTicketTags(response.data);
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!ticket) return;
    try {
      const response = await ticketsApi.removeTagFromTicket(ticket.id, tagId);
      setTicketTags(response.data);
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const response = await ticketsApi.createTag({ name: newTagName.trim(), color: randomColor });
      setAllTags(prev => [...prev, response.data]);
      setNewTagName('');
      // Automatically add the new tag to the ticket
      if (ticket) {
        await handleAddTag(response.data.id);
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
  };

  // Process template variables in canned response content
  const processTemplateVariables = (content: string): string => {
    if (!ticket) return content;

    const customer = customers.find(c => c.id === ticket.customerId);
    const now = new Date();

    const variables: Record<string, string> = {
      '{{customer_name}}': customer?.name || 'Kunde',
      '{{ticket_number}}': ticket.ticketNumber || '',
      '{{ticket_title}}': ticket.title || '',
      '{{current_date}}': now.toLocaleDateString('de-DE'),
      '{{current_time}}': now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      '{{status}}': statusConfig[ticket.status]?.label || ticket.status,
      '{{priority}}': priorityConfig[ticket.priority]?.label || ticket.priority,
    };

    let processed = content;
    for (const [variable, value] of Object.entries(variables)) {
      processed = processed.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return processed;
  };

  const handleUseCannedResponse = async (response: CannedResponse) => {
    const processedContent = processTemplateVariables(response.content);
    setNewComment(prev => prev + (prev ? '\n' : '') + processedContent);
    setShowCannedDropdown(false);
    // Increment usage count
    try {
      await ticketsApi.useCannedResponse(response.id);
    } catch (err) {
      // Silent fail for usage tracking
    }
  };

  const handleSaveEdit = async () => {
    if (!ticket) return;

    // Check if we're closing the ticket and need solution
    if (editStatus === 'closed' && ticket.status !== 'closed') {
      setPendingStatusChange(editStatus);
      setSolutionText(ticket.solution || '');
      setResolutionType(ticket.resolutionType || 'solved');
      setShowSolutionModal(true);
      return;
    }

    try {
      const response = await ticketsApi.update(ticket.id, {
        title: editTitle,
        description: editDescription,
        status: editStatus,
        priority: editPriority,
      });
      setTicket(response.data);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update ticket:', err);
      alert('Fehler beim Speichern des Tickets');
    }
  };

  const handleSaveSolution = async () => {
    if (!ticket || !solutionText.trim()) return;

    try {
      setSavingSolution(true);
      const response = await ticketsApi.update(ticket.id, {
        title: editTitle,
        description: editDescription,
        status: 'closed',
        priority: editPriority,
        solution: solutionText.trim(),
        resolutionType: resolutionType,
      });
      setTicket(response.data);
      setIsEditing(false);
      setShowSolutionModal(false);
      setPendingStatusChange(null);
      setSolutionText('');
    } catch (err) {
      console.error('Failed to save solution:', err);
      alert('Fehler beim Speichern der Lösung');
    } finally {
      setSavingSolution(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !ticket) return;

    try {
      setSubmittingComment(true);
      const wasInternal = isInternal;
      const response = await ticketsApi.addComment(ticket.id, newComment, isInternal);
      setComments(prev => [...prev, response.data]);
      setNewComment('');
      setIsInternal(false);

      // Reload ticket to get updated first_response_at for SLA tracking (only for non-internal comments)
      if (!wasInternal) {
        await loadTicket();
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
      alert('Fehler beim Hinzufügen des Kommentars');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!ticket) return;

    try {
      setDeleting(true);
      await ticketsApi.delete(ticket.id);
      onTicketDeleted();
    } catch (err) {
      console.error('Failed to delete ticket:', err);
      alert('Fehler beim Löschen des Tickets');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleArchive = async () => {
    if (!ticket) return;

    try {
      setArchiving(true);
      const response = await ticketsApi.update(ticket.id, {
        status: 'archived',
      });
      setTicket(response.data);
      setEditStatus('archived');
      setShowArchiveConfirm(false);
    } catch (err) {
      console.error('Failed to archive ticket:', err);
      alert('Fehler beim Archivieren des Tickets');
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async () => {
    if (!ticket) return;

    try {
      setArchiving(true);
      const response = await ticketsApi.update(ticket.id, {
        status: 'open',
      });
      setTicket(response.data);
      setEditStatus('open');
    } catch (err) {
      console.error('Failed to restore ticket:', err);
      alert('Fehler beim Wiederherstellen des Tickets');
    } finally {
      setArchiving(false);
    }
  };

  const getCustomerName = (customerId: string) => {
    return customers.find(c => c.id === customerId)?.name || 'Unbekannt';
  };

  const getProjectName = (projectId?: string) => {
    if (!projectId) return null;
    return projects.find(p => p.id === projectId)?.name;
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

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}:${String(minutes).padStart(2, '0')} Std`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p>{error || 'Ticket nicht gefunden'}</p>
        <button onClick={onBack} className="mt-4 text-accent-primary hover:underline">
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const totalTime = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1">
            <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
              {ticket.ticketNumber}
            </span>
          </div>
          {ticket.status !== 'archived' && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              title="Bearbeiten"
            >
              <Edit2 size={20} />
            </button>
          )}
          {ticket.status === 'archived' ? (
            <button
              onClick={handleRestore}
              disabled={archiving}
              className="p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 disabled:opacity-50"
              title="Wiederherstellen"
            >
              <RotateCcw size={20} />
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowMergeDialog(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="Tickets zusammenführen"
              >
                <Merge size={20} />
              </button>
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="Archivieren"
              >
                <Archive size={20} />
              </button>
            </>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
            title="Löschen"
          >
            <Trash2 size={20} />
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-4 py-2 text-xl font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as TicketStatus)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(statusConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priorität</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value as TicketPriority)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(priorityConfig).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 btn-accent rounded-lg"
              >
                Speichern
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditTitle(ticket.title);
                  setEditDescription(ticket.description || '');
                  setEditStatus(ticket.status);
                  setEditPriority(ticket.priority);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {ticket.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig[ticket.status].color}`}>
                {statusConfig[ticket.status].label}
              </span>
              <span className={`text-sm font-medium ${priorityConfig[ticket.priority].color}`}>
                {priorityConfig[ticket.priority].label}
              </span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {ticketTags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  <Tag size={10} />
                  {tag.name}
                  <button
                    onClick={() => handleRemoveTag(tag.id)}
                    className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <div className="relative" ref={tagDropdownRef}>
                <button
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <Plus size={12} />
                  Tag
                </button>
                {showTagDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleCreateTag()}
                          placeholder="Neuer Tag..."
                          className="flex-1 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <button
                          onClick={handleCreateTag}
                          disabled={!newTagName.trim()}
                          className="p-1 rounded bg-accent-primary text-white disabled:opacity-50"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto p-1">
                      {allTags
                        .filter(tag => !ticketTags.find(t => t.id === tag.id))
                        .map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => {
                              handleAddTag(tag.id);
                              setShowTagDropdown(false);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                          </button>
                        ))}
                      {allTags.filter(tag => !ticketTags.find(t => t.id === tag.id)).length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                          {allTags.length === 0 ? 'Keine Tags vorhanden' : 'Alle Tags zugewiesen'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Building2 className="text-gray-400" size={20} />
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Kunde</div>
              <div className="font-medium text-gray-900 dark:text-white">
                {getCustomerName(ticket.customerId)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Clock className="text-gray-400" size={20} />
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Erfasste Zeit</div>
              <div className="font-medium text-gray-900 dark:text-white">
                {formatDuration(totalTime)}
              </div>
            </div>
          </div>
        </div>

        {/* SLA Status */}
        <SlaStatus
          firstResponseDueAt={ticket.firstResponseDueAt}
          resolutionDueAt={ticket.resolutionDueAt}
          firstResponseAt={ticket.firstResponseAt}
          slaFirstResponseBreached={ticket.slaFirstResponseBreached}
          slaResolutionBreached={ticket.slaResolutionBreached}
          status={ticket.status}
        />

        {/* Start Timer Button */}
        <button
          onClick={() => onStartTimer(ticket)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
        >
          <Play size={20} />
          Timer für dieses Ticket starten
        </button>

        {/* Description */}
        {isEditing ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Beschreibung
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            />
          </div>
        ) : ticket.description && (
          <div>
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Beschreibung</h2>
            <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
              {ticket.description}
            </p>
          </div>
        )}

        {/* Solution (shown when ticket is closed) */}
        {(ticket.status === 'closed' || ticket.status === 'resolved') && ticket.solution && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="text-green-600 dark:text-green-400" size={18} />
              <h3 className="text-sm font-medium text-green-800 dark:text-green-300">
                Lösung
                {ticket.resolutionType && (
                  <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                    ({resolutionTypeConfig[ticket.resolutionType]?.label || ticket.resolutionType})
                  </span>
                )}
              </h3>
            </div>
            <p className="text-green-900 dark:text-green-100 whitespace-pre-wrap">
              {ticket.solution}
            </p>
          </div>
        )}

        {/* Tasks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <CheckSquare size={16} />
              Aufgaben ({tasks.filter(t => t.completed).length}/{tasks.length})
            </h2>
          </div>

          {/* Task List */}
          {loadingTasks ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
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
                    onClick={() => handleToggleTask(task)}
                    className="flex-shrink-0"
                  >
                    {task.completed ? (
                      <CheckSquare size={20} className="text-green-500" />
                    ) : (
                      <Square size={20} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                    )}
                  </button>

                  {/* Task Title */}
                  <span
                    className={`flex-1 text-sm ${
                      task.completed
                        ? 'text-gray-500 dark:text-gray-400 line-through'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {task.title}
                  </span>

                  {/* Visibility Toggle */}
                  <button
                    onClick={() => handleToggleTaskVisibility(task)}
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
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Aufgabe löschen"
                  >
                    <Trash2 size={16} />
                  </button>
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
                <button
                  onClick={handleAddTask}
                  disabled={!newTaskTitle.trim() || addingTask}
                  className="px-3 py-1.5 text-sm btn-accent rounded disabled:opacity-50"
                >
                  {addingTask ? '...' : 'Hinzufügen'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Attachments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Anhänge ({attachments.length})
            </h2>
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 rounded-lg cursor-pointer transition-colors">
              <Paperclip size={16} />
              {uploadingFiles ? 'Lädt...' : 'Datei hinzufügen'}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                disabled={uploadingFiles}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
              />
            </label>
          </div>

          {attachments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              Keine Anhänge vorhanden
            </p>
          ) : (
            <div className="space-y-3">
              {/* Image attachments with preview */}
              {attachments.filter(a => a.mimeType?.startsWith('image/')).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Bilder</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {attachments.filter(a => a.mimeType?.startsWith('image/')).map((attachment) => (
                      <div key={attachment.id} className="relative group">
                        <a
                          href={getAbsoluteFileUrl(attachment.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700"
                        >
                          <img
                            src={getAbsoluteFileUrl(attachment.fileUrl)}
                            alt={attachment.filename}
                            className="w-full h-full object-cover hover:scale-105 transition-transform"
                          />
                        </a>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                          <a
                            href={getAbsoluteFileUrl(attachment.fileUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
                            title="Öffnen"
                          >
                            <Download size={16} />
                          </a>
                          <button
                            onClick={() => handleDeleteAttachment(attachment.id)}
                            className="p-2 bg-white/20 hover:bg-red-500/50 rounded-full text-white transition-colors"
                            title="Löschen"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                          {attachment.filename}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other file attachments */}
              {attachments.filter(a => !a.mimeType?.startsWith('image/')).length > 0 && (
                <div>
                  {attachments.filter(a => a.mimeType?.startsWith('image/')).length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Dokumente</p>
                  )}
                  <div className="space-y-2">
                    {attachments.filter(a => !a.mimeType?.startsWith('image/')).map((attachment) => {
                      const FileIcon = getFileIcon(attachment.mimeType);
                      return (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group"
                        >
                          <FileIcon size={20} className="text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(attachment.fileSize)} • {attachment.uploadedByName}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <a
                              href={getAbsoluteFileUrl(attachment.fileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-gray-500 hover:text-accent-primary hover:bg-accent-primary/10 rounded transition-colors"
                              title="Herunterladen"
                            >
                              <Download size={16} />
                            </a>
                            <button
                              onClick={() => handleDeleteAttachment(attachment.id)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                              title="Löschen"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Time Entries */}
        {timeEntries.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Zeiteinträge ({timeEntries.length})
            </h2>
            <div className="space-y-2">
              {timeEntries.map(entry => (
                <div
                  key={entry.id}
                  className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-gray-900 dark:text-white">
                      {entry.description || 'Keine Beschreibung'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(entry.startTime)}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-gray-900 dark:text-white">
                    {formatDuration(entry.duration || 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Kommentare ({comments.length})
          </h2>
          <div className="space-y-3">
            {comments.map(comment => (
              <div
                key={comment.id}
                className={`p-3 rounded-lg ${
                  comment.isInternal
                    ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800'
                    : 'bg-gray-50 dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <User size={14} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {comment.authorName || 'Unbekannt'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(comment.createdAt)}
                  </span>
                  {comment.isInternal && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                      Intern
                    </span>
                  )}
                </div>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))}

            {/* Add Comment */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Kommentar hinzufügen..."
                rows={3}
                className="w-full px-0 py-0 bg-transparent text-gray-900 dark:text-white resize-none focus:outline-none"
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Interne Notiz
                  </label>
                  {/* Canned Responses Dropdown */}
                  {cannedResponses.length > 0 && (
                    <div className="relative" ref={cannedDropdownRef}>
                      <button
                        onClick={() => setShowCannedDropdown(!showCannedDropdown)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        title="Textbaustein einfügen"
                      >
                        <MessageSquare size={14} />
                        Textbausteine
                        <ChevronDown size={12} />
                      </button>
                      {showCannedDropdown && (
                        <div className="absolute left-0 bottom-full mb-1 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-60 overflow-y-auto">
                          {cannedResponses.map(response => (
                            <button
                              key={response.id}
                              onClick={() => handleUseCannedResponse(response)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  {response.title}
                                </span>
                                {response.shortcut && (
                                  <span className="text-xs text-gray-400 font-mono">
                                    /{response.shortcut}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                {response.content}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="flex items-center gap-2 px-4 py-2 btn-accent rounded-lg disabled:opacity-50"
                >
                  <Send size={16} />
                  Senden
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Meta Info */}
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div>Erstellt: {formatDate(ticket.createdAt)}</div>
          <div>Aktualisiert: {formatDate(ticket.updatedAt)}</div>
          {ticket.resolvedAt && <div>Gelöst: {formatDate(ticket.resolvedAt)}</div>}
          {ticket.closedAt && <div>Geschlossen: {formatDate(ticket.closedAt)}</div>}
        </div>

        {/* Activity Timeline */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            onClick={toggleActivities}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <History size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Aktivitätsverlauf
              </span>
            </div>
            <ChevronRight
              size={16}
              className={`text-gray-400 transition-transform ${showActivities ? 'rotate-90' : ''}`}
            />
          </button>
          {showActivities && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
              {loadingActivities ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  Keine Aktivitäten vorhanden
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-3">
                    {activities.map((activity) => (
                      <div key={activity.id} className="relative flex items-start gap-3 pl-6">
                        {/* Timeline dot */}
                        <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                          {getActivityIcon(activity.actionType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white">
                            {getActivityLabel(activity)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(activity.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Archive Confirmation */}
      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchive}
        title="Ticket archivieren"
        message={`Möchtest du das Ticket "${ticket.ticketNumber}" archivieren? Du kannst es jederzeit wiederherstellen.`}
        confirmText={archiving ? 'Archivieren...' : 'Archivieren'}
        variant="info"
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Ticket löschen"
        message={`Möchtest du das Ticket "${ticket.ticketNumber}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText={deleting ? 'Löschen...' : 'Löschen'}
        variant="danger"
      />

      {/* Merge Dialog */}
      <TicketMergeDialog
        isOpen={showMergeDialog}
        targetTicket={ticket}
        onClose={() => setShowMergeDialog(false)}
        onMerged={(mergedTicket) => {
          setTicket(mergedTicket);
          setShowMergeDialog(false);
          loadTicket(); // Reload to get updated comments etc.
        }}
      />

      {/* Solution Modal */}
      {showSolutionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Lightbulb className="text-green-600 dark:text-green-400" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Ticket schließen
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Bitte dokumentiere die Lösung für dieses Ticket
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Lösungstyp *
                </label>
                <select
                  value={resolutionType}
                  onChange={(e) => setResolutionType(e.target.value as TicketResolutionType)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(resolutionTypeConfig).map(([key, { label, description }]) => (
                    <option key={key} value={key}>
                      {label} - {description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Lösung / Beschreibung *
                </label>
                <textarea
                  value={solutionText}
                  onChange={(e) => setSolutionText(e.target.value)}
                  rows={5}
                  placeholder="Beschreibe, wie das Problem gelöst wurde oder warum es geschlossen wird..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSolutionModal(false);
                  setPendingStatusChange(null);
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveSolution}
                disabled={!solutionText.trim() || savingSolution}
                className="px-4 py-2 btn-accent rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {savingSolution ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Speichern...
                  </>
                ) : (
                  <>
                    <CheckSquare size={16} />
                    Ticket schließen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
