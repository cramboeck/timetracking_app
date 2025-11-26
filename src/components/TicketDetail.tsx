import { useState, useEffect } from 'react';
import { ArrowLeft, Send, Clock, User, Building2, Play, Trash2, Edit2 } from 'lucide-react';
import { Ticket, TicketComment, TicketStatus, TicketPriority, Customer, Project, TimeEntry } from '../types';
import { ticketsApi } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

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

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

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
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Fehler beim Laden des Tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!ticket) return;

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

  const handleAddComment = async () => {
    if (!newComment.trim() || !ticket) return;

    try {
      setSubmittingComment(true);
      const response = await ticketsApi.addComment(ticket.id, newComment, isInternal);
      setComments(prev => [...prev, response.data]);
      setNewComment('');
      setIsInternal(false);
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
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            <Edit2 size={20} />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
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
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded"
                  />
                  Interne Notiz
                </label>
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
      </div>

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
    </div>
  );
};
