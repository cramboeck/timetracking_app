import { useState, useEffect } from 'react';
import { ArrowLeft, Send, Clock, AlertCircle, CheckCircle, Pause, X, User } from 'lucide-react';
import { customerPortalApi, PortalTicket, PortalComment } from '../../services/api';

interface PortalTicketDetailProps {
  ticketId: string;
  onBack: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  waiting: { label: 'Wartend', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-500' },
  high: { label: 'Hoch', color: 'text-orange-500' },
  critical: { label: 'Kritisch', color: 'text-red-500' },
};

export const PortalTicketDetail = ({ ticketId, onBack }: PortalTicketDetailProps) => {
  const [ticket, setTicket] = useState<PortalTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    loadTicket();
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerPortalApi.getTicket(ticketId);
      setTicket(data);
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Fehler beim Laden des Tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !ticket) return;

    try {
      setSubmittingComment(true);
      const comment = await customerPortalApi.addComment(ticket.id, newComment);
      setTicket(prev => prev ? {
        ...prev,
        comments: [...(prev.comments || []), comment]
      } : null);
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
      alert('Fehler beim Hinzufügen des Kommentars');
    } finally {
      setSubmittingComment(false);
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-12">
        <AlertCircle className="mx-auto mb-3" size={48} />
        <p className="text-lg font-medium mb-2">{error || 'Ticket nicht gefunden'}</p>
        <button onClick={onBack} className="text-blue-600 hover:underline">
          Zurück zur Liste
        </button>
      </div>
    );
  }

  const status = statusConfig[ticket.status] || statusConfig.open;
  const priority = priorityConfig[ticket.priority] || priorityConfig.normal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
              {ticket.ticketNumber}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
            {ticket.priority !== 'normal' && (
              <span className={`text-xs font-medium ${priority.color}`}>
                {priority.label}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {ticket.title}
          </h1>
        </div>
      </div>

      {/* Ticket Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        {/* Description */}
        {ticket.description && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Beschreibung
            </h3>
            <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
              {ticket.description}
            </p>
          </div>
        )}

        {/* Meta Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Erstellt:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{formatDate(ticket.createdAt)}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Aktualisiert:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{formatDate(ticket.updatedAt)}</span>
          </div>
          {ticket.resolvedAt && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Gelöst:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{formatDate(ticket.resolvedAt)}</span>
            </div>
          )}
          {ticket.closedAt && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Geschlossen:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{formatDate(ticket.closedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Kommunikation ({(ticket.comments || []).length})
        </h3>

        <div className="space-y-4 mb-6">
          {(ticket.comments || []).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              Noch keine Nachrichten
            </p>
          ) : (
            (ticket.comments || []).map((comment) => (
              <div
                key={comment.id}
                className={`p-4 rounded-lg ${
                  comment.isFromCustomer
                    ? 'bg-blue-50 dark:bg-blue-900/30 ml-8'
                    : 'bg-gray-50 dark:bg-gray-700 mr-8'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <User size={14} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {comment.authorName}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(comment.createdAt)}
                  </span>
                </div>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Add Comment */}
        {ticket.status !== 'closed' && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Nachricht schreiben..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim() || submittingComment}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
              >
                <Send size={18} />
                {submittingComment ? 'Senden...' : 'Senden'}
              </button>
            </div>
          </div>
        )}

        {ticket.status === 'closed' && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 text-center text-gray-500 dark:text-gray-400">
            Dieses Ticket ist geschlossen. Keine weiteren Nachrichten möglich.
          </div>
        )}
      </div>
    </div>
  );
};
