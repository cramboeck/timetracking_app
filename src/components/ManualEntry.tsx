import { useState } from 'react';
import { Save } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { calculateDuration } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { generateUUID } from '../utils/uuid';

interface ManualEntryProps {
  onSave: (entry: TimeEntry) => void;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
}

export const ManualEntry = ({ onSave, projects, customers, activities }: ManualEntryProps) => {
  const { currentUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [description, setDescription] = useState('');

  const activeProjects = projects.filter(p => p.isActive);

  const getProjectDisplay = (project: Project) => {
    const customer = customers.find(c => c.id === project.customerId);
    return `${customer?.name} - ${project.name}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectId || !currentUser) {
      alert('Bitte wähle ein Projekt aus');
      return;
    }

    const startDateTime = new Date(`${date}T${startTime}`).toISOString();
    const endDateTime = new Date(`${date}T${endTime}`).toISOString();
    const duration = calculateDuration(startDateTime, endDateTime);

    if (duration <= 0) {
      alert('Die Endzeit muss nach der Startzeit liegen!');
      return;
    }

    const entry: TimeEntry = {
      id: generateUUID(),
      userId: currentUser.id,
      startTime: startDateTime,
      endTime: endDateTime,
      duration: duration, // Exact duration - rounding happens in reports
      projectId,
      activityId: activityId || undefined,
      description: description || '',
      isRunning: false,
      createdAt: new Date().toISOString(),
    };

    onSave(entry);

    // Reset form
    setProjectId('');
    setActivityId('');
    setDescription('');
    setStartTime('09:00');
    setEndTime('17:00');
  };

  return (
    <div className="flex flex-col h-full p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Manuelle Erfassung</h1>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Von
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bis
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Projekt *
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              disabled={activeProjects.length === 0}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">
                {activeProjects.length === 0 ? 'Keine Projekte vorhanden' : 'Projekt wählen...'}
              </option>
              {activeProjects.map(project => (
                <option key={project.id} value={project.id}>
                  {getProjectDisplay(project)}
                </option>
              ))}
            </select>
            {activeProjects.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                Bitte füge erst Kunden und Projekte in den Einstellungen hinzu
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tätigkeit (optional)
            </label>
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Keine Tätigkeit</option>
              {activities.map(activity => (
                <option key={activity.id} value={activity.id}>
                  {activity.name} {activity.pricingType === 'flat' && activity.flatRate ? `(Pauschale: ${activity.flatRate.toFixed(2)}€)` : ''}
                </option>
              ))}
            </select>
            {activityId && activities.find(a => a.id === activityId)?.description && (
              <p className="text-sm text-gray-500 mt-2">
                {activities.find(a => a.id === activityId)?.description}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Was wurde gemacht?"
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-6 py-4 btn-accent shadow-lg mt-6"
        >
          <Save size={20} />
          Speichern
        </button>
      </form>
    </div>
  );
};
