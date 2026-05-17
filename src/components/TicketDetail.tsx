import { useState, useEffect, useCallback } from 'react';
import { Bot } from 'lucide-react';
import { Ticket, TicketComment, TicketStatus, TicketPriority, TicketResolutionType, TicketTask, Customer, Project, TimeEntry } from '../types';
import { ticketsApi, TicketTag, CannedResponse, TicketActivity, TicketAttachment, organizationsApi, aiApi, AISuggestion, microsoft365Api, TicketEmail } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { TicketMergeDialog } from './TicketMergeDialog';
import { Button } from './ui/Button';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownRenderer } from './MarkdownRenderer';
import { sanitizeEmailHtml } from '../utils/sanitize';

// Import sub-components
import {
  TicketHeader,
  TicketMetadata,
  TicketDescription,
  TicketTasks,
  TicketAttachments,
  TicketComments,
  TicketTimeEntries,
  TicketTimeline,
  TicketEmailHistory,
  TicketAIPanel,
  TicketMetaInfo,
  SolutionModal,
} from './ticket-detail';

interface TicketDetailProps {
  ticketId: string;
  customers: Customer[];
  projects: Project[];
  onBack: () => void;
  onStartTimer: (ticket: Ticket) => void;
  onTicketDeleted: () => void;
}

export const TicketDetail = ({ ticketId, customers, projects, onBack, onStartTimer, onTicketDeleted }: TicketDetailProps) => {
  // Core state
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

  // Delete/Archive
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Merge
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // User role
  const [userRole, setUserRole] = useState<string | null>(null);

  // Tags
  const [ticketTags, setTicketTags] = useState<TicketTag[]>([]);
  const [allTags, setAllTags] = useState<TicketTag[]>([]);

  // Canned Responses
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);

  // Activities
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Email History
  const [ticketEmails, setTicketEmails] = useState<TicketEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Solution Modal
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [resolutionType, setResolutionType] = useState<TicketResolutionType>('solved');
  const [savingSolution, setSavingSolution] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<TicketTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // AI Assistant
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [loadingAiSuggestion, setLoadingAiSuggestion] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);

  // Load initial data
  useEffect(() => {
    loadTicket();
    loadTags();
    loadAttachments();
    loadCannedResponses();
    loadTasks();
    loadUserRole();
    checkAiConfig();
  }, [ticketId]);

  // Auto-load emails for email-source tickets
  useEffect(() => {
    if (ticket?.source === 'email' && ticketEmails.length === 0 && !loadingEmails) {
      loadTicketEmails();
    }
  }, [ticket?.source]);

  // Load functions
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

  const loadUserRole = async () => {
    try {
      const response = await organizationsApi.getCurrent();
      if (response.data) {
        setUserRole(response.data.user_role);
      }
    } catch (err) {
      console.error('Failed to load user role:', err);
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

  const loadTicketEmails = async () => {
    try {
      setLoadingEmails(true);
      const response = await microsoft365Api.getTicketEmails(ticketId);
      if (response.success) {
        setTicketEmails(response.data || []);
      }
    } catch (err) {
      console.error('Failed to load ticket emails:', err);
    } finally {
      setLoadingEmails(false);
    }
  };

  const checkAiConfig = async () => {
    try {
      const response = await aiApi.getConfig();
      setAiConfigured(response.data?.enabled && response.data?.hasApiKey);
    } catch (err) {
      console.error('Failed to check AI config:', err);
      setAiConfigured(false);
    }
  };

  const loadAiSuggestions = async () => {
    try {
      const response = await aiApi.getSuggestions(ticketId);
      setAiSuggestions(response.data || []);
    } catch (err) {
      console.error('Failed to load AI suggestions:', err);
    }
  };

  // Action handlers
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

  const handleCreateTag = async (name: string) => {
    try {
      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const response = await ticketsApi.createTag({ name, color: randomColor });
      setAllTags(prev => [...prev, response.data]);
      if (ticket) {
        await handleAddTag(response.data.id);
      }
    } catch (err) {
      console.error('Failed to create tag:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!ticket) return;

    // Check if we're closing the ticket and need solution
    if (editStatus === 'closed' && ticket.status !== 'closed') {
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

  const handleCancelEdit = () => {
    if (ticket) {
      setIsEditing(false);
      setEditTitle(ticket.title);
      setEditDescription(ticket.description || '');
      setEditStatus(ticket.status);
      setEditPriority(ticket.priority);
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
      setSolutionText('');
    } catch (err) {
      console.error('Failed to save solution:', err);
      alert('Fehler beim Speichern der Loesung');
    } finally {
      setSavingSolution(false);
    }
  };

  const handleAddComment = async (content: string, isInternal: boolean, notifyCustomer: boolean, replyViaEmail: boolean) => {
    if (!ticket) return;

    const response = await ticketsApi.addComment(ticket.id, content, {
      isInternal,
      notifyCustomer,
      replyViaEmail,
    });
    setComments(prev => [...prev, response.data]);

    // Reload ticket to get updated first_response_at for SLA tracking
    if (!isInternal) {
      await loadTicket();
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
      alert('Fehler beim Loeschen des Tickets');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleArchive = async () => {
    if (!ticket) return;

    try {
      setArchiving(true);
      const response = await ticketsApi.update(ticket.id, { status: 'archived' });
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
      const response = await ticketsApi.update(ticket.id, { status: 'open' });
      setTicket(response.data);
      setEditStatus('open');
    } catch (err) {
      console.error('Failed to restore ticket:', err);
      alert('Fehler beim Wiederherstellen des Tickets');
    } finally {
      setArchiving(false);
    }
  };

  // Task handlers
  const handleAddTask = async (title: string, visible: boolean) => {
    const response = await ticketsApi.createTask(ticketId, {
      title,
      visibleToCustomer: visible,
    });
    setTasks(prev => [...prev, response.data]);
  };

  const handleToggleTask = async (task: TicketTask) => {
    const response = await ticketsApi.updateTask(ticketId, task.id, {
      completed: !task.completed,
    });
    setTasks(prev => prev.map(t => t.id === task.id ? response.data : t));
  };

  const handleToggleTaskVisibility = async (task: TicketTask) => {
    const response = await ticketsApi.updateTask(ticketId, task.id, {
      visibleToCustomer: !task.visibleToCustomer,
    });
    setTasks(prev => prev.map(t => t.id === task.id ? response.data : t));
  };

  const handleUpdateTask = async (taskId: string, title: string) => {
    const response = await ticketsApi.updateTask(ticketId, taskId, { title });
    setTasks(prev => prev.map(t => t.id === taskId ? response.data : t));
  };

  const handleDeleteTask = async (taskId: string) => {
    await ticketsApi.deleteTask(ticketId, taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleReorderTasks = async (taskIds: string[]) => {
    await ticketsApi.reorderTasks(ticketId, taskIds);
  };

  // Attachment handlers
  const handleUploadFiles = async (files: FileList) => {
    try {
      setUploadingFiles(true);
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const result = await ticketsApi.uploadAttachments(ticketId, formData);
      setAttachments(prev => [...prev, ...result.data]);
    } catch (err) {
      console.error('Failed to upload files:', err);
      alert('Fehler beim Hochladen der Dateien');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm('Anhang wirklich loeschen?')) return;

    try {
      await ticketsApi.deleteAttachment(ticketId, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (err) {
      console.error('Failed to delete attachment:', err);
      alert('Fehler beim Loeschen des Anhangs');
    }
  };

  // AI handlers
  const generateAiSuggestion = async (suggestionType: 'solution' | 'category' | 'priority' | 'response') => {
    setLoadingAiSuggestion(true);
    setAiError(null);
    try {
      const response = await aiApi.generateSuggestion(ticketId, suggestionType);
      if (response.success && response.data) {
        setAiSuggestions(prev => [response.data, ...prev]);
      }
    } catch (err: any) {
      setAiError(err.message || 'Fehler beim Generieren des Vorschlags');
    } finally {
      setLoadingAiSuggestion(false);
    }
  };

  const handleSuggestionFeedback = async (suggestionId: string, isHelpful: boolean) => {
    try {
      await aiApi.markSuggestionFeedback(suggestionId, isHelpful);
      loadAiSuggestions();
    } catch (err) {
      console.error('Failed to mark feedback:', err);
    }
  };

  const applyResponseSuggestion = (content: string) => {
    // This will be handled via the comment component's internal state
    // We trigger this by scrolling to the comment area
    document.querySelector('textarea[placeholder*="Kommentar"]')?.scrollIntoView({ behavior: 'smooth' });
  };

  const applyPrioritySuggestion = async (content: string) => {
    if (!ticket) return;

    const priorities: Record<string, TicketPriority> = {
      'kritisch': 'critical',
      'critical': 'critical',
      'hoch': 'high',
      'high': 'high',
      'normal': 'normal',
      'medium': 'normal',
      'mittel': 'normal',
      'niedrig': 'low',
      'low': 'low',
      'gering': 'low',
    };

    const lowerContent = content.toLowerCase();
    let detectedPriority: TicketPriority | null = null;

    for (const [keyword, priority] of Object.entries(priorities)) {
      if (lowerContent.includes(keyword)) {
        detectedPriority = priority;
        break;
      }
    }

    if (detectedPriority) {
      try {
        const response = await ticketsApi.update(ticket.id, { priority: detectedPriority });
        setTicket(response.data);
        setEditPriority(detectedPriority);
      } catch (err) {
        console.error('Failed to update priority:', err);
      }
    }
  };

  const copySuggestionToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
      </div>
    );
  }

  // Error state
  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <p>{error || 'Ticket nicht gefunden'}</p>
        <button onClick={onBack} className="mt-2 text-accent-primary hover:underline">
          Zurueck zur Liste
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <TicketHeader
        ticket={ticket}
        ticketTags={ticketTags}
        allTags={allTags}
        userRole={userRole}
        isEditing={isEditing}
        editTitle={editTitle}
        editDescription={editDescription}
        editStatus={editStatus}
        editPriority={editPriority}
        archiving={archiving}
        onBack={onBack}
        onToggleEdit={() => setIsEditing(!isEditing)}
        onEditTitleChange={setEditTitle}
        onEditDescriptionChange={setEditDescription}
        onEditStatusChange={setEditStatus}
        onEditPriorityChange={setEditPriority}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onRestore={handleRestore}
        onShowArchiveConfirm={() => setShowArchiveConfirm(true)}
        onShowDeleteConfirm={() => setShowDeleteConfirm(true)}
        onShowMergeDialog={() => setShowMergeDialog(true)}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onCreateTag={handleCreateTag}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Metadata (info cards, SLA, timer button) */}
        <TicketMetadata
          ticket={ticket}
          customers={customers}
          timeEntries={timeEntries}
          onStartTimer={onStartTimer}
        />

        {/* AI Assistant Button */}
        {aiConfigured && (
          <button
            onClick={() => {
              if (!showAiPanel) {
                loadAiSuggestions();
              }
              setShowAiPanel(!showAiPanel);
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
              showAiPanel
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 dark:text-purple-300'
            }`}
          >
            <Bot size={20} />
            KI-Assistent {showAiPanel ? 'ausblenden' : 'anzeigen'}
          </button>
        )}

        {/* AI Assistant Panel */}
        {showAiPanel && aiConfigured && (
          <TicketAIPanel
            suggestions={aiSuggestions}
            loading={loadingAiSuggestion}
            error={aiError}
            onGenerateSuggestion={generateAiSuggestion}
            onFeedback={handleSuggestionFeedback}
            onApplyResponse={applyResponseSuggestion}
            onApplyPriority={applyPrioritySuggestion}
            onApplySolution={(content) => {
              setSolutionText(content);
              setShowSolutionModal(true);
            }}
            onCopy={copySuggestionToClipboard}
          />
        )}

        {/* Description and Solution */}
        <TicketDescription
          ticket={ticket}
          isEditing={isEditing}
          editDescription={editDescription}
          onEditDescriptionChange={setEditDescription}
        />

        {/* Tasks */}
        <TicketTasks
          ticketId={ticketId}
          tasks={tasks}
          loadingTasks={loadingTasks}
          onAddTask={handleAddTask}
          onToggleTask={handleToggleTask}
          onToggleTaskVisibility={handleToggleTaskVisibility}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onReorderTasks={handleReorderTasks}
        />

        {/* Attachments */}
        <TicketAttachments
          attachments={attachments}
          uploadingFiles={uploadingFiles}
          onUploadFiles={handleUploadFiles}
          onDeleteAttachment={handleDeleteAttachment}
        />

        {/* Time Entries */}
        <TicketTimeEntries timeEntries={timeEntries} />

        {/* Comments */}
        <TicketComments
          ticket={ticket}
          comments={comments}
          customers={customers}
          cannedResponses={cannedResponses}
          onAddComment={handleAddComment}
        />

        {/* Meta Info */}
        <TicketMetaInfo ticket={ticket} />

        {/* Activity Timeline */}
        <TicketTimeline
          activities={activities}
          loading={loadingActivities}
          onLoad={loadActivities}
        />

        {/* Email History */}
        {ticket.source === 'email' && (
          <TicketEmailHistory
            emails={ticketEmails}
            loading={loadingEmails}
            onLoad={loadTicketEmails}
          />
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleArchive}
        title="Ticket archivieren"
        message={`Moechtest du das Ticket "${ticket.ticketNumber}" archivieren? Du kannst es jederzeit wiederherstellen.`}
        confirmText={archiving ? 'Archivieren...' : 'Archivieren'}
        variant="info"
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Ticket loeschen"
        message={`Moechtest du das Ticket "${ticket.ticketNumber}" wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`}
        confirmText={deleting ? 'Loeschen...' : 'Loeschen'}
        variant="danger"
      />

      <TicketMergeDialog
        isOpen={showMergeDialog}
        targetTicket={ticket}
        onClose={() => setShowMergeDialog(false)}
        onMerged={(mergedTicket) => {
          setTicket(mergedTicket);
          setShowMergeDialog(false);
          loadTicket();
        }}
      />

      <SolutionModal
        isOpen={showSolutionModal}
        solutionText={solutionText}
        resolutionType={resolutionType}
        saving={savingSolution}
        onSolutionTextChange={setSolutionText}
        onResolutionTypeChange={setResolutionType}
        onSave={handleSaveSolution}
        onClose={() => {
          setShowSolutionModal(false);
          setSolutionText('');
        }}
      />
    </div>
  );
};
