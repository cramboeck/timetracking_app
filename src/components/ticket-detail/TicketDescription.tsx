import { Lightbulb } from 'lucide-react';
import { MarkdownEditor } from '../MarkdownEditor';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { Ticket, resolutionTypeConfig } from './types';

interface TicketDescriptionProps {
  ticket: Ticket;
  isEditing: boolean;
  editDescription: string;
  onEditDescriptionChange: (value: string) => void;
}

export const TicketDescription = ({
  ticket,
  isEditing,
  editDescription,
  onEditDescriptionChange,
}: TicketDescriptionProps) => {
  return (
    <>
      {/* Description */}
      {isEditing ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Beschreibung
          </label>
          <MarkdownEditor
            value={editDescription}
            onChange={onEditDescriptionChange}
            placeholder="Beschreibung hinzufügen..."
            rows={4}
          />
        </div>
      ) : ticket.description && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Beschreibung</h2>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <MarkdownRenderer content={ticket.description} />
          </div>
        </div>
      )}

      {/* Solution (shown when ticket is closed) */}
      {(ticket.status === 'closed' || ticket.status === 'resolved') && ticket.solution && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="text-green-600 dark:text-green-400" size={18} />
            <h3 className="text-sm font-medium text-green-800 dark:text-green-300">
              Losung
              {ticket.resolutionType && (
                <span className="ml-2 text-xs font-normal text-green-600 dark:text-green-400">
                  ({resolutionTypeConfig[ticket.resolutionType]?.label || ticket.resolutionType})
                </span>
              )}
            </h3>
          </div>
          <div className="text-green-900 dark:text-green-100">
            <MarkdownRenderer content={ticket.solution} />
          </div>
        </div>
      )}
    </>
  );
};
