import { TimeEntry, formatDate, formatDuration } from './types';

interface TicketTimeEntriesProps {
  timeEntries: TimeEntry[];
}

export const TicketTimeEntries = ({ timeEntries }: TicketTimeEntriesProps) => {
  if (timeEntries.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Zeiteintr&auml;ge ({timeEntries.length})
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
  );
};
