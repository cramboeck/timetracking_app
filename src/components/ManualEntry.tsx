import { useState, useMemo } from 'react';
import { Save, Clock } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { calculateDuration } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { generateUUID } from '../utils/uuid';
import { TimePicker } from './TimePicker';

// Helper to format duration as H:MM
const formatDurationDisplay = (seconds: number): string => {
  if (seconds <= 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

// Helper to format date as DD.MM.YYYY
const formatDateGerman = (isoDate: string): string => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
};

// Helper to parse German date to ISO
const parseDateGerman = (germanDate: string): string => {
  const match = germanDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return germanDate;
};

interface ManualEntryProps {
  onSave: (entry: TimeEntry) => void;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
}

export const ManualEntry = ({ onSave, projects, customers, activities }: ManualEntryProps) => {
  const { currentUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  // Current time rounded to nearest 5 minutes for end time
  const now = new Date();
  const minutes = Math.round(now.getMinutes() / 5) * 5;
  now.setMinutes(minutes);
  const currentTime = now.toTimeString().slice(0, 5);

  // Start time: 1 hour before current time (or 08:00 if that would be before 08:00)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const startDefault = oneHourAgo.getHours() < 8 ? '08:00' : oneHourAgo.toTimeString().slice(0, 5);

  const [date, setDate] = useState(today);
  const [dateDisplay, setDateDisplay] = useState(formatDateGerman(today));
  const [startTime, setStartTime] = useState(startDefault);
  const [endTime, setEndTime] = useState(currentTime);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [description, setDescription] = useState('');

  // Live duration calculation
  const calculatedDuration = useMemo(() => {
    if (!date || !startTime || !endTime) return 0;
    try {
      const startDateTime = new Date(`${date}T${startTime}`).toISOString();
      const endDateTime = new Date(`${date}T${endTime}`).toISOString();
      return calculateDuration(startDateTime, endDateTime);
    } catch {
      return 0;
    }
  }, [date, startTime, endTime]);

  const activeProjects = projects.filter(p => p.isActive);

  // Get customers that have active projects
  const customersWithProjects = useMemo(() => {
    const customerIds = new Set(activeProjects.map(p => p.customerId));
    return customers
      .filter(c => customerIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, activeProjects]);

  // Filter projects by selected customer
  const filteredProjects = useMemo(() => {
    if (!selectedCustomerId) return activeProjects;
    return activeProjects.filter(p => p.customerId === selectedCustomerId);
  }, [activeProjects, selectedCustomerId]);

  // Reset project when customer changes
  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setProjectId(''); // Reset project selection
  };

  // Handle German date input
  const handleDateChange = (value: string) => {
    setDateDisplay(value);
    // Try to parse as German date
    const isoDate = parseDateGerman(value);
    if (isoDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setDate(isoDate);
    }
  };

  // Handle native date picker change
  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoDate = e.target.value;
    setDate(isoDate);
    setDateDisplay(formatDateGerman(isoDate));
  };

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

    // Reset form with current time
    const resetNow = new Date();
    const resetMinutes = Math.round(resetNow.getMinutes() / 5) * 5;
    resetNow.setMinutes(resetMinutes);
    const resetCurrentTime = resetNow.toTimeString().slice(0, 5);
    const resetOneHourAgo = new Date(resetNow.getTime() - 60 * 60 * 1000);
    const resetStartTime = resetOneHourAgo.getHours() < 8 ? '08:00' : resetOneHourAgo.toTimeString().slice(0, 5);

    setSelectedCustomerId('');
    setProjectId('');
    setActivityId('');
    setDescription('');
    setStartTime(resetStartTime);
    setEndTime(resetCurrentTime);
  };

  return (
    <div className="flex flex-col h-full p-4 sm:p-6">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Manuelle Erfassung</h1>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Datum
            </label>
            <div className="relative">
              <input
                type="text"
                value={dateDisplay}
                onChange={(e) => handleDateChange(e.target.value)}
                placeholder="TT.MM.JJJJ"
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={date}
                onChange={handleNativeDateChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                tabIndex={-1}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Von
              </label>
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bis
              </label>
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                required
              />
            </div>
          </div>

          {/* Live Duration Display */}
          <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg ${
            calculatedDuration > 0
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-gray-400'
          }`}>
            <Clock size={18} />
            <span className="font-medium">
              Dauer: {formatDurationDisplay(calculatedDuration)} h
            </span>
            {calculatedDuration <= 0 && startTime && endTime && (
              <span className="text-sm text-red-500 dark:text-red-400 ml-2">
                (Endzeit muss nach Startzeit liegen)
              </span>
            )}
          </div>

          {/* Customer Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kunde
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Alle Kunden</option>
              {customersWithProjects.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          {/* Project Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Projekt *
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              disabled={filteredProjects.length === 0}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-200 bg-white dark:bg-dark-100 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-dark-200"
            >
              <option value="">
                {filteredProjects.length === 0
                  ? 'Keine Projekte vorhanden'
                  : selectedCustomerId
                    ? 'Projekt wählen...'
                    : 'Erst Kunde wählen oder Projekt suchen...'}
              </option>
              {filteredProjects.map(project => (
                <option key={project.id} value={project.id}>
                  {selectedCustomerId ? project.name : getProjectDisplay(project)}
                </option>
              ))}
            </select>
            {activeProjects.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
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
