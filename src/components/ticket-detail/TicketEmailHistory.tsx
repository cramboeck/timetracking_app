import { useState } from 'react';
import { Mail, ChevronRight, Paperclip } from 'lucide-react';
import { TicketEmail, formatEmailDate } from './types';
import { sanitizeEmailHtml } from '../../utils/sanitize';

interface TicketEmailHistoryProps {
  emails: TicketEmail[];
  loading: boolean;
  onLoad: () => void;
}

export const TicketEmailHistory = ({
  emails,
  loading,
  onLoad,
}: TicketEmailHistoryProps) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  const toggleExpanded = () => {
    if (!expanded && emails.length === 0) {
      onLoad();
    }
    setExpanded(!expanded);
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-accent-primary" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            E-Mail-Verlauf
          </span>
          {emails.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-accent-lighter text-accent-dark dark:bg-accent-primary/50 dark:text-accent-primary rounded">
              {emails.length}
            </span>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
            </div>
          ) : emails.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              Keine E-Mails mit diesem Ticket verknupft
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {emails.map((email) => (
                <div key={email.id} className="px-4 py-3">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
                  >
                    <div className={`p-1.5 rounded-full ${
                      email.direction === 'inbound'
                        ? 'bg-accent-lighter dark:bg-accent-primary/30'
                        : 'bg-green-100 dark:bg-green-900/30'
                    }`}>
                      <Mail size={14} className={
                        email.direction === 'inbound'
                          ? 'text-accent-primary dark:text-accent-primary'
                          : 'text-green-600 dark:text-green-400'
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {email.direction === 'inbound' ? email.from_name || email.from_email : 'Gesendet'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          email.direction === 'inbound'
                            ? 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/50 dark:text-accent-primary'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        }`}>
                          {email.direction === 'inbound' ? 'Empfangen' : 'Gesendet'}
                        </span>
                        {email.has_attachments && (
                          <Paperclip size={12} className="text-gray-400" />
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {email.subject}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        {formatEmailDate(email.received_at)}
                      </p>
                    </div>
                    <ChevronRight
                      size={14}
                      className={`text-gray-400 transition-transform flex-shrink-0 ${
                        expandedEmailId === email.id ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                  {expandedEmailId === email.id && (
                    <div className="mt-3 pl-9">
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm">
                        <div className="mb-2 text-xs text-gray-500 dark:text-gray-500">
                          <span className="font-medium">Von:</span> {email.from_name} &lt;{email.from_email}&gt;
                        </div>
                        {email.body_html ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body_html) }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">
                            {email.body_text}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
