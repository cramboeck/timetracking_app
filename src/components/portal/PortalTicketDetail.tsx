import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Send, Clock, AlertCircle, CheckCircle, Pause, X, User,
  Paperclip, Download, Trash2, XCircle, RotateCcw, Star, FileText,
  Image, File, Archive
} from 'lucide-react';
import { customerPortalApi, PortalTicket, PortalComment, getApiBaseUrl } from '../../services/api';

// Helper to convert relative file URLs to absolute URLs
const getAbsoluteFileUrl = (fileUrl: string): string => {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return fileUrl;
  }
  // Remove /api prefix since getApiBaseUrl already includes it
  const apiBase = getApiBaseUrl();
  const relativePath = fileUrl.startsWith('/api') ? fileUrl.substring(4) : fileUrl;
  const absoluteUrl = `${apiBase}${relativePath}`;
  return absoluteUrl;
};

interface Attachment {
  id: string;
  filename: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedByName: string;
  createdAt: string;
}

interface PortalTicketDetailProps {
  ticketId: string;
  onBack: () => void;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Offen', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: AlertCircle },
  in_progress: { label: 'In Bearbeitung', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Clock },
  waiting: { label: 'Wartend', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', icon: Pause },
  resolved: { label: 'Gelöst', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle },
  closed: { label: 'Geschlossen', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: X },
  archived: { label: 'Archiviert', color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: Archive },
};

const priorityConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Niedrig', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-700' },
  normal: { label: 'Normal', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
  high: { label: 'Hoch', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
  critical: { label: 'Kritisch', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/30' },
};

export const PortalTicketDetail = ({ ticketId, onBack }: PortalTicketDetailProps) => {
  const [ticket, setTicket] = useState<PortalTicket | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTicket();
    loadAttachments();
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await customerPortalApi.getTicket(ticketId);
      setTicket(data);
      // Show rating prompt for closed/resolved tickets without rating
      if ((data.status === 'closed' || data.status === 'resolved') && !data.satisfactionRating) {
        setShowRating(true);
      }
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Fehler beim Laden des Tickets');
    } finally {
      setLoading(false);
    }
  };

  const loadAttachments = async () => {
    try {
      const data = await customerPortalApi.getAttachments(ticketId);
      setAttachments(data);
    } catch (err) {
      console.error('Failed to load attachments:', err);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !ticket) return;

    try {
      setUploadingFiles(true);
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const result = await customerPortalApi.uploadAttachments(ticket.id, formData);
      setAttachments(prev => [...prev, ...result.attachments]);

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
    if (!ticket || !confirm('Anhang wirklich löschen?')) return;

    try {
      await customerPortalApi.deleteAttachment(ticket.id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch (err) {
      console.error('Failed to delete attachment:', err);
      alert('Fehler beim Löschen des Anhangs');
    }
  };

  const handleCloseTicket = async () => {
    if (!ticket || !confirm('Ticket wirklich schließen?')) return;

    try {
      setActionLoading(true);
      await customerPortalApi.closeTicket(ticket.id);
      await loadTicket();
      setShowRating(true);
    } catch (err) {
      console.error('Failed to close ticket:', err);
      alert('Fehler beim Schließen des Tickets');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenTicket = async () => {
    if (!ticket || !confirm('Ticket wirklich wiedereröffnen?')) return;

    try {
      setActionLoading(true);
      await customerPortalApi.reopenTicket(ticket.id);
      await loadTicket();
      setShowRating(false);
    } catch (err) {
      console.error('Failed to reopen ticket:', err);
      alert('Fehler beim Wiedereröffnen des Tickets');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!ticket || rating === 0) return;

    try {
      setSubmittingRating(true);
      await customerPortalApi.rateTicket(ticket.id, rating, ratingFeedback);
      setShowRating(false);
      await loadTicket();
    } catch (err) {
      console.error('Failed to submit rating:', err);
      alert('Fehler beim Speichern der Bewertung');
    } finally {
      setSubmittingRating(false);
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType === 'application/pdf') return FileText;
    return File;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
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
  const StatusIcon = status.icon;
  const canComment = ticket.status !== 'closed' && ticket.status !== 'archived';
  const canClose = ticket.status !== 'closed' && ticket.status !== 'archived';
  const canReopen = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                {ticket.ticketNumber}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                <StatusIcon size={12} />
                {status.label}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priority.color} ${priority.bgColor}`}>
                {priority.label}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white break-words">
              {ticket.title}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Erstellt am {formatDate(ticket.createdAt)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {canClose && (
            <button
              onClick={handleCloseTicket}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <XCircle size={16} />
              Ticket schließen
            </button>
          )}
          {canReopen && (
            <button
              onClick={handleReopenTicket}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw size={16} />
              Wiedereröffnen
            </button>
          )}
        </div>
      </div>

      {/* Rating Prompt for closed tickets */}
      {showRating && (ticket.status === 'closed' || ticket.status === 'resolved') && !ticket.satisfactionRating && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-200 dark:border-blue-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Wie zufrieden waren Sie mit unserem Support?
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Ihre Bewertung hilft uns, unseren Service zu verbessern.
          </p>

          <div className="flex items-center gap-2 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`p-1 transition-colors ${
                  star <= rating
                    ? 'text-yellow-400'
                    : 'text-gray-300 dark:text-gray-600 hover:text-yellow-300'
                }`}
              >
                <Star size={32} fill={star <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {rating > 0 && ['', 'Sehr schlecht', 'Schlecht', 'OK', 'Gut', 'Sehr gut'][rating]}
            </span>
          </div>

          <textarea
            value={ratingFeedback}
            onChange={(e) => setRatingFeedback(e.target.value)}
            placeholder="Optionales Feedback..."
            rows={2}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          />

          <div className="flex gap-2">
            <button
              onClick={handleSubmitRating}
              disabled={rating === 0 || submittingRating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
            >
              {submittingRating ? 'Wird gesendet...' : 'Bewertung abgeben'}
            </button>
            <button
              onClick={() => setShowRating(false)}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Später
            </button>
          </div>
        </div>
      )}

      {/* Description */}
      {ticket.description && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Beschreibung
          </h3>
          <p className="text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </p>
        </div>
      )}

      {/* Attachments */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Anhänge ({attachments.length})
          </h3>
          {canComment && (
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg cursor-pointer transition-colors">
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
          )}
        </div>

        {attachments.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            Keine Anhänge vorhanden
          </p>
        ) : (
          <>
            {/* Image attachments with preview */}
            {attachments.filter(a => a.mimeType?.startsWith('image/')).length > 0 && (
              <div className="mb-4">
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
                <div className="grid gap-2">
                  {attachments.filter(a => !a.mimeType?.startsWith('image/')).map((attachment) => {
                    const FileIcon = getFileIcon(attachment.mimeType);
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group"
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
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
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
          </>
        )}
      </div>

      {/* Comments / Communication */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Kommunikation ({(ticket.comments || []).length})
        </h3>

        <div className="space-y-4 mb-6">
          {(ticket.comments || []).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Noch keine Nachrichten vorhanden
            </p>
          ) : (
            (ticket.comments || []).map((comment) => (
              <div
                key={comment.id}
                className={`flex ${comment.isFromCustomer ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-4 rounded-2xl ${
                    comment.isFromCustomer
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
                  }`}
                >
                  <div className={`flex items-center gap-2 mb-1 ${
                    comment.isFromCustomer ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    <User size={12} />
                    <span className="text-xs font-medium">{comment.authorName}</span>
                    <span className="text-xs">•</span>
                    <span className="text-xs">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Comment */}
        {canComment ? (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex gap-3">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Nachricht schreiben..."
                rows={2}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAddComment();
                  }
                }}
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim() || submittingComment}
                className="self-end p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl transition-colors"
                title="Senden (Cmd+Enter)"
              >
                <Send size={20} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Drücken Sie Cmd+Enter zum Senden
            </p>
          </div>
        ) : (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {ticket.status === 'closed'
                ? 'Dieses Ticket ist geschlossen. Öffnen Sie es erneut, um zu antworten.'
                : 'Keine weiteren Nachrichten möglich.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
