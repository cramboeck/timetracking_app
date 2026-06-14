import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import { Ticket, TicketComment, TicketStatus, TicketPriority, TicketResolutionType, TicketTask, Customer, Project, TimeEntry } from '../types';
import { ticketsApi, TicketTag, CannedResponse, TicketActivity, TicketAttachment, organizationsApi, aiApi, AISuggestion, microsoft365Api, TicketEmail, contractsApi, Contract } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { TicketMergeDialog } from './TicketMergeDialog';
import { useToast, useConfirm } from '../contexts/UIContext';

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
  const queryClient = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<TicketStatus>('open');
  const [editPriority, setEditPriority] = useState<TicketPriority>('normal');

  // Delete/Archive dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Merge
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // Solution Modal
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [resolutionType, setResolutionType] = useState<TicketResolutionType>('solved');

  // AI Assistant — UI toggles. Data flows via useQuery.
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Lazy-load gates for sections that fetch on demand
  const [activitiesEnabled, setActivitiesEnabled] = useState(false);

  // Local upload state (mutation isPending isn't quite right while reading FormData)
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // ─── Reads ─────────────────────────────────────────────────────────────────

  type TicketWithRelations = Ticket & {
    comments?: TicketComment[];
    timeEntries?: TimeEntry[];
  };

  const ticketQuery = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const res = await ticketsApi.getById(ticketId);
      const data = res.data as TicketWithRelations;
      // Seed edit fields whenever we load fresh ticket data
      setEditTitle(data.title);
      setEditDescription(data.description || '');
      setEditStatus(data.status);
      setEditPriority(data.priority);
      return data;
    },
  });
  const ticket = ticketQuery.data ?? null;
  const comments: TicketComment[] = ticket?.comments ?? [];
  const timeEntries: TimeEntry[] = ticket?.timeEntries ?? [];
  const loading = ticketQuery.isLoading;
  const error = ticketQuery.error ? 'Fehler beim Laden des Tickets' : null;
  const loadTicket = () => ticketQuery.refetch();

  const ticketTagsQuery = useQuery({
    queryKey: ['ticket', ticketId, 'tags'],
    queryFn: async () => (await ticketsApi.getTicketTags(ticketId)).data as TicketTag[],
  });
  const ticketTags = ticketTagsQuery.data ?? [];

  // Fetch customer contracts (for maintenance contract display)
  const customerContractsQuery = useQuery({
    queryKey: ['contracts', 'customer', ticket?.customerId],
    queryFn: async () => {
      if (!ticket?.customerId) return [];
      const res = await contractsApi.getContractsByCustomer(ticket.customerId);
      return res.success ? res.data : [];
    },
    enabled: !!ticket?.customerId,
    staleTime: 5 * 60_000,
  });
  const activeContract = (customerContractsQuery.data ?? []).find(
    (c: Contract) => c.status === 'active'
  );

  const userRoleQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: async () => (await organizationsApi.getCurrent()).data,
    staleTime: 5 * 60_000,
  });
  const userRole: string | null = userRoleQuery.data?.user_role ?? null;

  const allTagsQuery = useQuery({
    queryKey: ['tickets', 'allTags'],
    queryFn: async () => (await ticketsApi.getTags()).data as TicketTag[],
  });
  const allTags = allTagsQuery.data ?? [];

  const cannedResponsesQuery = useQuery({
    queryKey: ['tickets', 'cannedResponses'],
    queryFn: async () => (await ticketsApi.getCannedResponses()).data as CannedResponse[],
    staleTime: 5 * 60_000,
  });
  const cannedResponses = cannedResponsesQuery.data ?? [];

  const attachmentsQuery = useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: async () => (await ticketsApi.getAttachments(ticketId)).data as TicketAttachment[],
  });
  const attachments = attachmentsQuery.data ?? [];

  const tasksQuery = useQuery({
    queryKey: ['ticket', ticketId, 'tasks'],
    queryFn: async () => (await ticketsApi.getTasks(ticketId)).data as TicketTask[],
  });
  const tasks = tasksQuery.data ?? [];
  const loadingTasks = tasksQuery.isLoading;

  const activitiesQuery = useQuery({
    queryKey: ['ticket', ticketId, 'activities'],
    queryFn: async () => (await ticketsApi.getActivities(ticketId)).data as TicketActivity[],
    enabled: activitiesEnabled,
  });
  const activities = activitiesQuery.data ?? [];
  const loadingActivities = activitiesQuery.isFetching;
  const loadActivities = () => setActivitiesEnabled(true);

  const ticketEmailsQuery = useQuery({
    queryKey: ['ticket', ticketId, 'emails'],
    queryFn: async () => {
      const res = await microsoft365Api.getTicketEmails(ticketId);
      return (res.success ? res.data || [] : []) as TicketEmail[];
    },
    enabled: ticket?.source === 'email',
  });
  const ticketEmails = ticketEmailsQuery.data ?? [];
  const loadingEmails = ticketEmailsQuery.isFetching;
  const loadTicketEmails = () => ticketEmailsQuery.refetch();

  const aiConfigQuery = useQuery({
    queryKey: ['ai', 'config'],
    queryFn: async () => (await aiApi.getConfig()).data,
    staleTime: 5 * 60_000,
  });
  const aiConfigured = Boolean(aiConfigQuery.data?.enabled && aiConfigQuery.data?.hasApiKey);

  const aiSuggestionsQuery = useQuery({
    queryKey: ['ticket', ticketId, 'aiSuggestions'],
    queryFn: async () => (await aiApi.getSuggestions(ticketId)).data || [],
    enabled: showAiPanel,
  });
  const aiSuggestions = aiSuggestionsQuery.data ?? [];

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const setTicketTagsCache = (data: TicketTag[]) =>
    queryClient.setQueryData<TicketTag[]>(['ticket', ticketId, 'tags'], data);

  const addTagMutation = useMutation({
    mutationFn: (tagId: string) => ticketsApi.addTagToTicket(ticketId, tagId),
    onSuccess: (res) => setTicketTagsCache(res.data),
    onError: (err) => console.error('Failed to add tag:', err),
  });

  const removeTagMutation = useMutation({
    mutationFn: (tagId: string) => ticketsApi.removeTagFromTicket(ticketId, tagId),
    onSuccess: (res) => setTicketTagsCache(res.data),
    onError: (err) => console.error('Failed to remove tag:', err),
  });

  const createTagMutation = useMutation({
    mutationFn: (name: string) => {
      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      return ticketsApi.createTag({ name, color: randomColor });
    },
    onSuccess: (res) => {
      queryClient.setQueryData<TicketTag[]>(['tickets', 'allTags'], (prev) =>
        prev ? [...prev, res.data] : [res.data]
      );
      addTagMutation.mutate(res.data.id);
    },
    onError: (err) => console.error('Failed to create tag:', err),
  });

  const handleAddTag = (tagId: string) => addTagMutation.mutate(tagId);
  const handleRemoveTag = (tagId: string) => removeTagMutation.mutate(tagId);
  const handleCreateTag = (name: string) => createTagMutation.mutate(name);

  const setTicketCache = (data: TicketWithRelations) =>
    queryClient.setQueryData<TicketWithRelations>(['ticket', ticketId], (prev) =>
      prev ? { ...prev, ...data } : data
    );

  const updateTicketMutation = useMutation({
    mutationFn: (payload: Parameters<typeof ticketsApi.update>[1]) =>
      ticketsApi.update(ticketId, payload),
    onSuccess: (res) => {
      setTicketCache(res.data);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err) => {
      console.error('Failed to update ticket:', err);
      showToast('Fehler beim Speichern des Tickets', 'error');
    },
  });

  const handleSaveEdit = () => {
    if (!ticket) return;

    // Check if we're closing the ticket and need solution
    if (editStatus === 'closed' && ticket.status !== 'closed') {
      setSolutionText(ticket.solution || '');
      setResolutionType(ticket.resolutionType || 'solved');
      setShowSolutionModal(true);
      return;
    }

    updateTicketMutation.mutate(
      {
        title: editTitle,
        description: editDescription,
        status: editStatus,
        priority: editPriority,
      },
      { onSuccess: () => setIsEditing(false) }
    );
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

  const saveSolutionMutation = useMutation({
    mutationFn: () =>
      ticketsApi.update(ticketId, {
        title: editTitle,
        description: editDescription,
        status: 'closed',
        priority: editPriority,
        solution: solutionText.trim(),
        resolutionType: resolutionType,
      }),
    onSuccess: (res) => {
      setTicketCache(res.data);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setIsEditing(false);
      setShowSolutionModal(false);
      setSolutionText('');
    },
    onError: (err) => {
      console.error('Failed to save solution:', err);
      showToast('Fehler beim Speichern der Loesung', 'error');
    },
  });
  const savingSolution = saveSolutionMutation.isPending;

  const handleSaveSolution = () => {
    if (!ticket || !solutionText.trim()) return;
    saveSolutionMutation.mutate();
  };

  const addCommentMutation = useMutation({
    mutationFn: (vars: { content: string; isInternal: boolean; notifyCustomer: boolean; replyViaEmail: boolean }) =>
      ticketsApi.addComment(ticketId, vars.content, {
        isInternal: vars.isInternal,
        notifyCustomer: vars.notifyCustomer,
        replyViaEmail: vars.replyViaEmail,
      }),
    onSuccess: (res, vars) => {
      // Append comment optimistically into the ticket cache so SLA bar / list re-renders instantly
      queryClient.setQueryData<TicketWithRelations>(['ticket', ticketId], (prev) =>
        prev ? { ...prev, comments: [...(prev.comments ?? []), res.data] } : prev
      );
      // For public replies, refetch to pick up first_response_at (SLA tracking)
      if (!vars.isInternal) ticketQuery.refetch();
    },
  });

  const handleAddComment = async (content: string, isInternal: boolean, notifyCustomer: boolean, replyViaEmail: boolean) => {
    await addCommentMutation.mutateAsync({ content, isInternal, notifyCustomer, replyViaEmail });
  };

  const deleteMutation = useMutation({
    mutationFn: () => ticketsApi.delete(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowDeleteConfirm(false);
      onTicketDeleted();
    },
    onError: (err) => {
      console.error('Failed to delete ticket:', err);
      showToast('Fehler beim Loeschen des Tickets', 'error');
      setShowDeleteConfirm(false);
    },
  });
  const deleting = deleteMutation.isPending;
  const handleDelete = () => deleteMutation.mutate();

  const archiveMutation = useMutation({
    mutationFn: (status: 'archived' | 'open') => ticketsApi.update(ticketId, { status }),
    onSuccess: (res, status) => {
      setTicketCache(res.data);
      setEditStatus(status);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      if (status === 'archived') setShowArchiveConfirm(false);
    },
    onError: (err, status) => {
      console.error(`Failed to ${status === 'archived' ? 'archive' : 'restore'} ticket:`, err);
      showToast(status === 'archived' ? 'Fehler beim Archivieren des Tickets' : 'Fehler beim Wiederherstellen des Tickets', 'error');
    },
  });
  const archiving = archiveMutation.isPending;
  const handleArchive = () => archiveMutation.mutate('archived');
  const handleRestore = () => archiveMutation.mutate('open');

  // Quick status change (without entering edit mode)
  const handleQuickStatusChange = (newStatus: TicketStatus) => {
    if (!ticket || newStatus === ticket.status) return;

    // If closing, require solution
    if (newStatus === 'closed' && ticket.status !== 'closed') {
      setSolutionText(ticket.solution || '');
      setResolutionType(ticket.resolutionType || 'solved');
      setShowSolutionModal(true);
      setEditStatus('closed');
      return;
    }

    updateTicketMutation.mutate({ status: newStatus });
  };

  // Quick priority change (without entering edit mode)
  const handleQuickPriorityChange = (newPriority: TicketPriority) => {
    if (!ticket || newPriority === ticket.priority) return;
    updateTicketMutation.mutate({ priority: newPriority });
  };

  // Task handlers — write through setQueryData so the UI stays instant; also
  // invalidate the global ['tasks'] key so TasksOverview picks up changes.
  const tasksKey = ['ticket', ticketId, 'tasks'] as const;
  const writeTasks = (updater: (prev: TicketTask[]) => TicketTask[]) =>
    queryClient.setQueryData<TicketTask[]>(tasksKey, (prev) => updater(prev ?? []));
  const invalidateTasksOverview = () =>
    queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const handleAddTask = async (title: string, visible: boolean) => {
    const response = await ticketsApi.createTask(ticketId, { title, visibleToCustomer: visible });
    writeTasks((prev) => [...prev, response.data]);
    invalidateTasksOverview();
  };

  const handleToggleTask = async (task: TicketTask) => {
    const response = await ticketsApi.updateTask(ticketId, task.id, { completed: !task.completed });
    writeTasks((prev) => prev.map((t) => (t.id === task.id ? response.data : t)));
    invalidateTasksOverview();
  };

  const handleToggleTaskVisibility = async (task: TicketTask) => {
    const response = await ticketsApi.updateTask(ticketId, task.id, {
      visibleToCustomer: !task.visibleToCustomer,
    });
    writeTasks((prev) => prev.map((t) => (t.id === task.id ? response.data : t)));
    invalidateTasksOverview();
  };

  const handleUpdateTask = async (taskId: string, title: string) => {
    const response = await ticketsApi.updateTask(ticketId, taskId, { title });
    writeTasks((prev) => prev.map((t) => (t.id === taskId ? response.data : t)));
    invalidateTasksOverview();
  };

  const handleDeleteTask = async (taskId: string) => {
    await ticketsApi.deleteTask(ticketId, taskId);
    writeTasks((prev) => prev.filter((t) => t.id !== taskId));
    invalidateTasksOverview();
  };

  const handleReorderTasks = async (taskIds: string[]) => {
    await ticketsApi.reorderTasks(ticketId, taskIds);
    queryClient.invalidateQueries({ queryKey: tasksKey });
  };

  // Attachment handlers
  const attachmentsKey = ['ticket', ticketId, 'attachments'] as const;
  const writeAttachments = (updater: (prev: TicketAttachment[]) => TicketAttachment[]) =>
    queryClient.setQueryData<TicketAttachment[]>(attachmentsKey, (prev) => updater(prev ?? []));

  const handleUploadFiles = async (files: FileList) => {
    try {
      setUploadingFiles(true);
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
      const result = await ticketsApi.uploadAttachments(ticketId, formData);
      writeAttachments((prev) => [...prev, ...result.data]);
    } catch (err) {
      console.error('Failed to upload files:', err);
      showToast('Fehler beim Hochladen der Dateien', 'error');
    } finally {
      setUploadingFiles(false);
    }
  };

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => ticketsApi.deleteAttachment(ticketId, attachmentId),
    onSuccess: (_res, attachmentId) => {
      writeAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    },
    onError: (err) => {
      console.error('Failed to delete attachment:', err);
      showToast('Fehler beim Loeschen des Anhangs', 'error');
    },
  });
  const handleDeleteAttachment = async (attachmentId: string) => {
    const ok = await confirm({
      title: 'Anhang loeschen?',
      message: 'Anhang wirklich loeschen?',
      confirmText: 'Loeschen',
      variant: 'danger',
    });
    if (!ok) return;
    await deleteAttachmentMutation.mutateAsync(attachmentId);
  };

  // AI handlers
  const aiSuggestionsKey = ['ticket', ticketId, 'aiSuggestions'] as const;

  const generateAiMutation = useMutation({
    mutationFn: (suggestionType: 'solution' | 'category' | 'priority' | 'response') =>
      aiApi.generateSuggestion(ticketId, suggestionType),
    onMutate: () => setAiError(null),
    onSuccess: (response) => {
      if (response.success && response.data) {
        queryClient.setQueryData<AISuggestion[]>(aiSuggestionsKey, (prev) => [response.data, ...(prev ?? [])]);
      }
    },
    onError: (err: any) => setAiError(err.message || 'Fehler beim Generieren des Vorschlags'),
  });
  const loadingAiSuggestion = generateAiMutation.isPending;
  const generateAiSuggestion = (suggestionType: 'solution' | 'category' | 'priority' | 'response') =>
    generateAiMutation.mutate(suggestionType);

  const feedbackMutation = useMutation({
    mutationFn: (vars: { suggestionId: string; isHelpful: boolean }) =>
      aiApi.markSuggestionFeedback(vars.suggestionId, vars.isHelpful),
    onSuccess: () => aiSuggestionsQuery.refetch(),
    onError: (err) => console.error('Failed to mark feedback:', err),
  });
  const handleSuggestionFeedback = (suggestionId: string, isHelpful: boolean) =>
    feedbackMutation.mutate({ suggestionId, isHelpful });

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
      updateTicketMutation.mutate(
        { priority: detectedPriority },
        { onSuccess: () => setEditPriority(detectedPriority) }
      );
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
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-dark-400">
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
        saving={updateTicketMutation.isPending}
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
        onQuickStatusChange={handleQuickStatusChange}
        onQuickPriorityChange={handleQuickPriorityChange}
      />

      {/* Content - Desktop: Two columns, Mobile: Single column */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 lg:flex lg:gap-6">

          {/* Main Content Column */}
          <div className="lg:flex-1 lg:min-w-0 space-y-6">
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

            {/* Comments */}
            <TicketComments
              ticket={ticket}
              comments={comments}
              customers={customers}
              cannedResponses={cannedResponses}
              onAddComment={handleAddComment}
            />

            {/* Time Entries */}
            <TicketTimeEntries timeEntries={timeEntries} />

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

          {/* Sidebar - Desktop only sticky, Mobile shows at top */}
          <div className="lg:w-80 xl:w-96 lg:flex-shrink-0 space-y-4 mb-6 lg:mb-0 order-first lg:order-last">
            <div className="lg:sticky lg:top-0 space-y-4">
              {/* Metadata (info cards, SLA, timer button) */}
              <TicketMetadata
                ticket={ticket}
                customers={customers}
                timeEntries={timeEntries}
                activeContract={activeContract}
                onStartTimer={onStartTimer}
              />

              {/* AI Assistant Button */}
              {aiConfigured && (
                <button
                  onClick={() => {
                    if (!showAiPanel) {
                      aiSuggestionsQuery.refetch();
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

              {/* Meta Info */}
              <TicketMetaInfo ticket={ticket} />
            </div>
          </div>
        </div>
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
          setTicketCache(mergedTicket);
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
