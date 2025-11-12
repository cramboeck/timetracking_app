import { useState } from 'react';
import { Trash2, Clock, Edit2, Download } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { formatDuration, formatTime, formatDate, calculateDuration } from '../utils/time';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';

interface TimeEntriesListProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<TimeEntry>) => void;
}

export const TimeEntriesList = ({ entries, projects, customers, activities, onDelete, onEdit }: TimeEntriesListProps) => {
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editProjectId, setEditProjectId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string; name: string }>({
    isOpen: false,
    id: '',
    name: ''
  });

  const getProjectById = (id: string) => projects.find(p => p.id === id);
  const getCustomerById = (id: string) => customers.find(c => c.id === id);
  const getActivityById = (id: string) => activities.find(a => a.id === id);

  const getProjectDisplay = (entry: TimeEntry) => {
    const project = getProjectById(entry.projectId);
    const customer = project ? getCustomerById(project.customerId) : null;
    return project && customer ? `${customer.name} - ${project.name}` : 'Unbekanntes Projekt';
  };

  const calculateAmount = (entry: TimeEntry): number => {
    const hours = entry.duration / 3600;
    const project = getProjectById(entry.projectId);

    // Check if entry has an activity with flat rate
    if (entry.activityId) {
      const activity = getActivityById(entry.activityId);
      if (activity && activity.pricingType === 'flat' && activity.flatRate) {
        return activity.flatRate;
      }
    }

    // Otherwise use hourly rate
    return project ? hours * project.hourlyRate : 0;
  };
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  const groupedEntries = sortedEntries.reduce((groups, entry) => {
    const date = formatDate(entry.startTime);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {} as Record<string, TimeEntry[]>);

  const totalHours = entries.reduce((sum, entry) => sum + entry.duration, 0);

  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditProjectId(entry.projectId);
    setEditDescription(entry.description);

    // Extract date and times
    const startDate = new Date(entry.startTime);
    const endDate = entry.endTime ? new Date(entry.endTime) : new Date();

    setEditDate(startDate.toISOString().split('T')[0]);
    setEditStartTime(startDate.toTimeString().slice(0, 5)); // HH:MM
    setEditEndTime(endDate.toTimeString().slice(0, 5)); // HH:MM
  };

  const handleSaveEdit = () => {
    if (!editingEntry || !editProjectId || !editDate || !editStartTime || !editEndTime) return;

    const startDateTime = new Date(`${editDate}T${editStartTime}`).toISOString();
    const endDateTime = new Date(`${editDate}T${editEndTime}`).toISOString();
    const duration = calculateDuration(startDateTime, endDateTime);

    if (duration <= 0) {
      alert('Die Endzeit muss nach der Startzeit liegen!');
      return;
    }

    onEdit(editingEntry.id, {
      projectId: editProjectId,
      description: editDescription,
      startTime: startDateTime,
      endTime: endDateTime,
      duration
    });

    setEditingEntry(null);
  };

  const handleDeleteClick = (entry: TimeEntry) => {
    setDeleteConfirm({
      isOpen: true,
      id: entry.id,
      name: getProjectDisplay(entry)
    });
  };

  const confirmDelete = () => {
    onDelete(deleteConfirm.id);
  };

  const exportToCSV = () => {
    const headers = ['Datum', 'Start', 'Ende', 'Dauer (Std)', 'Kunde', 'Projekt', 'Tätigkeit', 'Beschreibung', 'Stundensatz/Pauschale', 'Betrag'];
    const rows = entries.map(entry => {
      const project = getProjectById(entry.projectId);
      const customer = project ? getCustomerById(project.customerId) : null;
      const activity = entry.activityId ? getActivityById(entry.activityId) : null;
      const hours = entry.duration / 3600;
      const amount = calculateAmount(entry);

      // Determine rate display
      let rateDisplay = '-';
      if (activity && activity.pricingType === 'flat' && activity.flatRate) {
        rateDisplay = `Pauschale: ${(activity.flatRate || 0).toFixed(2)}€`;
      } else if (project && project.hourlyRate) {
        rateDisplay = `${(project.hourlyRate || 0).toFixed(2)}€/Std`;
      }

      return [
        formatDate(entry.startTime),
        formatTime(entry.startTime),
        entry.endTime ? formatTime(entry.endTime) : '-',
        hours.toFixed(2),
        customer?.name || '-',
        project?.name || '-',
        activity?.name || '-',
        entry.description || '-',
        rateDisplay,
        amount.toFixed(2)
      ];
    });

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `zeiterfassung_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

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
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold mb-2">Übersicht</h1>
            <div className="text-lg font-semibold text-accent-primary">
              Gesamt: {formatDuration(totalHours)}
            </div>
          </div>
          {entries.length > 0 && (
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download size={18} />
              CSV Export
            </button>
          )}
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
                    <div className="flex items-start gap-3 flex-1">
                      {(() => {
                        const project = getProjectById(entry.projectId);
                        const customer = project ? getCustomerById(project.customerId) : null;
                        return customer ? (
                          <div
                            className="w-10 h-10 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: customer.color }}
                          />
                        ) : null;
                      })()}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{getProjectDisplay(entry)}</h3>
                        {entry.description && (
                          <p className="text-sm text-gray-600 mt-1">{entry.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(entry)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                        aria-label="Bearbeiten"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(entry)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                        aria-label="Löschen"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>
                      {formatTime(entry.startTime)}
                      {entry.endTime && ` - ${formatTime(entry.endTime)}`}
                    </span>
                    <span className="font-semibold text-accent-primary">
                      {formatDuration(entry.duration)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={editingEntry !== null}
        onClose={() => setEditingEntry(null)}
        title="Eintrag bearbeiten"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Projekt *
            </label>
            <select
              value={editProjectId}
              onChange={(e) => setEditProjectId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {projects.filter(p => p.isActive).map(project => {
                const customer = getCustomerById(project.customerId);
                return (
                  <option key={project.id} value={project.id}>
                    {customer?.name} - {project.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Datum *
            </label>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Von *
              </label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bis *
              </label>
              <input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Beschreibung
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setEditingEntry(null)}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={!editProjectId || !editDate || !editStartTime || !editEndTime}
              className="flex-1 px-4 py-2 btn-accent"
            >
              Speichern
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })}
        onConfirm={confirmDelete}
        title="Eintrag löschen?"
        message={`Möchtest du den Eintrag "${deleteConfirm.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        variant="danger"
      />
    </div>
  );
};
