import { Trash2, Clock } from 'lucide-react';
import { TimeEntry } from '../types';
import { formatDuration, formatTime, formatDate } from '../utils/time';

interface TimeEntriesListProps {
  entries: TimeEntry[];
  onDelete: (id: string) => void;
}

export const TimeEntriesList = ({ entries, onDelete }: TimeEntriesListProps) => {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const groupedEntries = sortedEntries.reduce((groups, entry) => {
    const date = formatDate(entry.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, TimeEntry[]>);

  const totalHours = entries.reduce((sum, entry) => sum + entry.duration, 0);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col h-full p-6">
        <h1 className="text-2xl font-bold mb-6">Übersicht</h1>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <Clock size={48} className="mx-auto mb-4 opacity-50" />
            <p>Noch keine Zeiteinträge vorhanden</p>
            <p className="text-sm mt-2">Starte die Stoppuhr oder erfasse Zeit manuell</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-white border-b border-gray-200 p-6 pb-4">
        <h1 className="text-2xl font-bold mb-2">Übersicht</h1>
        <div className="text-lg font-semibold text-blue-600">
          Gesamt: {formatDuration(totalHours)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pt-4">
        {Object.entries(groupedEntries).map(([date, dateEntries]) => (
          <div key={date} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-600 mb-3">{date}</h2>
            <div className="space-y-3">
              {dateEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{entry.project}</h3>
                      {entry.description && (
                        <p className="text-sm text-gray-600 mt-1">{entry.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                      aria-label="Löschen"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>
                      {formatTime(entry.startTime)}
                      {entry.endTime && ` - ${formatTime(entry.endTime)}`}
                    </span>
                    <span className="font-semibold text-blue-600">
                      {formatDuration(entry.duration)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
