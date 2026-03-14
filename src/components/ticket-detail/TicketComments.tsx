import { useState, useRef, useEffect } from 'react';
import { User, Send, MessageSquare, ChevronDown, Mail } from 'lucide-react';
import { Button } from '../ui/Button';
import { MarkdownEditor } from '../MarkdownEditor';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Ticket, TicketComment, CannedResponse, Customer, formatDate, statusConfig, priorityConfig } from './types';

interface TicketCommentsProps {
  ticket: Ticket;
  comments: TicketComment[];
  customers: Customer[];
  cannedResponses: CannedResponse[];
  onAddComment: (content: string, isInternal: boolean, notifyCustomer: boolean, replyViaEmail: boolean) => Promise<void>;
}

export const TicketComments = ({
  ticket,
  comments,
  customers,
  cannedResponses,
  onAddComment,
}: TicketCommentsProps) => {
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [replyViaEmail, setReplyViaEmail] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showCannedDropdown, setShowCannedDropdown] = useState(false);
  const cannedDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cannedDropdownRef.current && !cannedDropdownRef.current.contains(event.target as Node)) {
        setShowCannedDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Process template variables in canned response content
  const processTemplateVariables = (content: string): string => {
    const customer = customers.find(c => c.id === ticket.customerId);
    const now = new Date();
    const createdDate = ticket.createdAt ? new Date(ticket.createdAt) : null;

    const variables: Record<string, string> = {
      // Customer variables
      '{{customer_name}}': customer?.name || 'Kunde',
      '{{customer_email}}': customer?.email || '',
      // Ticket variables
      '{{ticket_number}}': ticket.ticketNumber || '',
      '{{ticket_title}}': ticket.title || '',
      '{{ticket_description}}': ticket.description || '',
      '{{status}}': statusConfig[ticket.status]?.label || ticket.status,
      '{{priority}}': priorityConfig[ticket.priority]?.label || ticket.priority,
      '{{created_date}}': createdDate ? createdDate.toLocaleDateString('de-DE') : '',
      '{{created_time}}': createdDate ? createdDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
      // Current date/time
      '{{current_date}}': now.toLocaleDateString('de-DE'),
      '{{current_time}}': now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      '{{current_datetime}}': now.toLocaleString('de-DE'),
    };

    let processed = content;
    for (const [variable, value] of Object.entries(variables)) {
      processed = processed.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return processed;
  };

  const handleUseCannedResponse = (response: CannedResponse) => {
    const processedContent = processTemplateVariables(response.content);
    setNewComment(prev => prev + (prev ? '\n' : '') + processedContent);
    setShowCannedDropdown(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    try {
      setSubmittingComment(true);
      await onAddComment(
        newComment,
        isInternal,
        !isInternal && notifyCustomer,
        !isInternal && notifyCustomer && replyViaEmail
      );
      setNewComment('');
      setIsInternal(false);
      setNotifyCustomer(true);
      setReplyViaEmail(false);
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
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
            <div className="text-gray-900 dark:text-white">
              <MarkdownRenderer content={comment.content} />
            </div>
          </div>
        ))}

        {/* Add Comment */}
        <div className="space-y-2">
          <MarkdownEditor
            value={newComment}
            onChange={setNewComment}
            placeholder="Kommentar hinzufugen..."
            rows={3}
          />
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded"
                />
                Interne Notiz
              </label>
              {/* Email notification options - show when ticket has contact, email address, or customer */}
              {!isInternal && (ticket.contactId || ticket.emailFrom || ticket.customerId) && (
                <>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={notifyCustomer}
                      onChange={(e) => setNotifyCustomer(e.target.checked)}
                      className="rounded accent-[#F27024]"
                    />
                    <Mail size={14} />
                    Email an Kunden
                  </label>
                  {/* Reply via Email option - only for email-sourced tickets */}
                  {notifyCustomer && ticket.source === 'email' && ticket.emailConversationId && (
                    <label className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                      <input
                        type="checkbox"
                        checked={replyViaEmail}
                        onChange={(e) => setReplyViaEmail(e.target.checked)}
                        className="rounded accent-blue-600"
                      />
                      Im Email-Thread antworten
                    </label>
                  )}
                </>
              )}
              {/* Canned Responses Dropdown */}
              {cannedResponses.length > 0 && (
                <div className="relative" ref={cannedDropdownRef}>
                  <button
                    onClick={() => setShowCannedDropdown(!showCannedDropdown)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    title="Textbaustein einfugen"
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
            <Button
              onClick={handleAddComment}
              disabled={!newComment.trim() || submittingComment}
              loading={submittingComment}
              icon={<Send size={16} />}
            >
              Senden
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
