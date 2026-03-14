import { useState } from 'react';
import { History, ChevronRight, Plus, RotateCcw, ChevronDown, MessageSquare, Tag, Clock } from 'lucide-react';
import { TicketActivity, TicketStatus, TicketPriority, formatDate, statusConfig, priorityConfig } from './types';

interface TicketTimelineProps {
  activities: TicketActivity[];
  loading: boolean;
  onLoad: () => void;
}

export const TicketTimeline = ({
  activities,
  loading,
  onLoad,
}: TicketTimelineProps) => {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    if (!expanded && activities.length === 0) {
      onLoad();
    }
    setExpanded(!expanded);
  };

  const getActivityLabel = (activity: TicketActivity): string => {
    const actor = activity.userName || activity.contactName || 'System';
    switch (activity.actionType) {
      case 'created':
        return `${actor} hat das Ticket erstellt`;
      case 'status_changed':
        return `${actor} hat den Status von "${statusConfig[activity.oldValue as TicketStatus]?.label || activity.oldValue}" auf "${statusConfig[activity.newValue as TicketStatus]?.label || activity.newValue}" geandert`;
      case 'priority_changed':
        return `${actor} hat die Prioritat von "${priorityConfig[activity.oldValue as TicketPriority]?.label || activity.oldValue}" auf "${priorityConfig[activity.newValue as TicketPriority]?.label || activity.newValue}" geandert`;
      case 'assigned':
        return `${actor} hat das Ticket zugewiesen`;
      case 'unassigned':
        return `${actor} hat die Zuweisung entfernt`;
      case 'comment_added':
        return `${actor} hat einen Kommentar hinzugefugt`;
      case 'internal_comment_added':
        return `${actor} hat eine interne Notiz hinzugefugt`;
      case 'attachment_added':
        return `${actor} hat einen Anhang hinzugefugt`;
      case 'tag_added':
        return `${actor} hat den Tag "${activity.newValue}" hinzugefugt`;
      case 'tag_removed':
        return `${actor} hat den Tag "${activity.oldValue}" entfernt`;
      case 'title_changed':
        return `${actor} hat den Titel geandert`;
      case 'description_changed':
        return `${actor} hat die Beschreibung geandert`;
      case 'resolved':
        return `${actor} hat das Ticket als gelost markiert`;
      case 'closed':
        return `${actor} hat das Ticket geschlossen`;
      case 'reopened':
        return `${actor} hat das Ticket wieder geoffnet`;
      case 'archived':
        return `${actor} hat das Ticket archiviert`;
      case 'rating_added':
        return `${actor} hat eine Bewertung abgegeben`;
      case 'time_logged':
        return `${actor} hat ${activity.newValue} Zeit erfasst`;
      default:
        return `${actor} hat eine Aktion durchgefuhrt`;
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

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Aktivitatsverlauf
          </span>
        </div>
        <ChevronRight
          size={16}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              Keine Aktivitaten vorhanden
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
  );
};
