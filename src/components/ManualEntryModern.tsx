import { useState, useMemo, useEffect } from 'react';
import { Save, Clock, ArrowRight, Zap } from 'lucide-react';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { calculateDuration, toLocalDateString } from '../utils/time';
import { useAuth } from '../contexts/AuthContext';
import { generateUUID } from '../utils/uuid';
import { ModernDatePicker } from './ModernDatePicker';
import { ModernTimePicker } from './ModernTimePicker';
import { SearchableSelect } from './SearchableSelect';
import { Toast, useToast } from './Toast';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ManualEntryModernProps {
  onSave: (entry: TimeEntry) => void;
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
}

// Format seconds as "Xh Ym"
const formatDurationHuman = (seconds: number): string => {
  if (seconds <= 0) return '0 min';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
};

// Format seconds as "H:MM" for the editable duration input
const formatDurationColon = (seconds: number): string => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
};

// Parse "H:MM" → total minutes, or null if invalid
const parseDurationColon = (input: string): number | null => {
  const match = input.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (minutes >= 60) return null;
  if (hours > 23) return null; // prevent day-overflow when applied to startTime
  return hours * 60 + minutes;
};

export const ManualEntryModern = ({
  onSave,
  projects,
  customers,
  activities,
}: ManualEntryModernProps) => {
  const { currentUser } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const today = toLocalDateString(new Date());

  // Smart defaults
  const now = new Date();
  const minutes = Math.round(now.getMinutes() / 5) * 5;
  now.setMinutes(minutes);
  const currentTime = now.toTimeString().slice(0, 5);

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const startDefault = oneHourAgo.getHours() < 8 ? '08:00' : oneHourAgo.toTimeString().slice(0, 5);

  // Form state
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState(startDefault);
  const [endTime, setEndTime] = useState(currentTime);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [description, setDescription] = useState('');

  // Calculate duration in seconds
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

  // Editable duration input ("H:MM"). Bidirectionally synced with the time pickers:
  // changing start/end updates this field, and typing a valid value here recomputes
  // end time from start time + duration. Invalid input is kept locally so the user
  // can finish typing (e.g. "2:" before adding "30") without losing focus or value.
  const [durationInput, setDurationInput] = useState(() => formatDurationColon(calculatedDuration));
  const [durationInputInvalid, setDurationInputInvalid] = useState(false);

  useEffect(() => {
    setDurationInput(formatDurationColon(calculatedDuration));
    setDurationInputInvalid(false);
  }, [calculatedDuration]);

  // Duration percentage for visual bar (max 10 hours = 100%)
  const durationPercent = Math.min(100, (calculatedDuration / (10 * 3600)) * 100);

  const activeProjects = projects.filter(p => p.isActive);

  // Customers with active projects
  const customersWithProjects = useMemo(() => {
    const customerIds = new Set(activeProjects.map(p => p.customerId));
    return customers
      .filter(c => customerIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, activeProjects]);

  // Filter projects by customer
  const filteredProjects = useMemo(() => {
    if (!selectedCustomerId) return activeProjects;
    return activeProjects.filter(p => p.customerId === selectedCustomerId);
  }, [activeProjects, selectedCustomerId]);

  // Options for SearchableSelect
  const customerOptions = useMemo(() => {
    return customersWithProjects.map(c => ({
      value: c.id,
      label: c.name,
    }));
  }, [customersWithProjects]);

  const projectOptions = useMemo(() => {
    return filteredProjects.map(p => {
      const customer = customers.find(c => c.id === p.customerId);
      return {
        value: p.id,
        label: selectedCustomerId ? p.name : `${customer?.name} - ${p.name}`,
      };
    });
  }, [filteredProjects, customers, selectedCustomerId]);

  // Quick duration presets
  const durationPresets = [
    { label: '30 min', minutes: 30 },
    { label: '1h', minutes: 60 },
    { label: '1h 30', minutes: 90 },
    { label: '2h', minutes: 120 },
    { label: '4h', minutes: 240 },
    { label: '8h', minutes: 480 },
  ];

  const applyDurationPreset = (minutes: number) => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, startHour, startMin);
    startDate.setMinutes(startDate.getMinutes() + minutes);

    const newEndTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
    setEndTime(newEndTime);
  };

  const handleDurationInputChange = (raw: string) => {
    setDurationInput(raw);
    if (raw.trim() === '') {
      setDurationInputInvalid(false);
      return;
    }
    const parsed = parseDurationColon(raw);
    if (parsed === null) {
      setDurationInputInvalid(true);
      return;
    }
    setDurationInputInvalid(false);
    applyDurationPreset(parsed);
  };

  const handleDurationInputBlur = () => {
    // Snap back to the current calculated value if the user left the field
    // empty or with an invalid input — keeps the displayed value in sync
    // with the time pickers (which remain the source of truth on submit).
    if (durationInputInvalid || durationInput.trim() === '') {
      setDurationInput(formatDurationColon(calculatedDuration));
      setDurationInputInvalid(false);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setProjectId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!projectId || !currentUser) {
      showToast('Bitte wähle ein Projekt aus', 'error');
      return;
    }

    const startDateTime = new Date(`${date}T${startTime}`).toISOString();
    const endDateTime = new Date(`${date}T${endTime}`).toISOString();
    const duration = calculateDuration(startDateTime, endDateTime);

    if (duration <= 0) {
      showToast('Die Endzeit muss nach der Startzeit liegen!', 'error');
      return;
    }

    const entry: TimeEntry = {
      id: generateUUID(),
      userId: currentUser.id,
      startTime: startDateTime,
      endTime: endDateTime,
      duration: duration,
      projectId,
      activityId: activityId || undefined,
      description: description || '',
      isRunning: false,
      createdAt: new Date().toISOString(),
    };

    onSave(entry);
    showToast('Zeiteintrag gespeichert', 'success');

    // Reset form
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
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <Clock size={28} className="text-accent-primary dark:text-accent-primary" />
        Zeit erfassen
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Date Selection */}
        <ModernDatePicker
          value={date}
          onChange={setDate}
          label="Datum"
        />

        {/* Time Range */}
        <Card className="rounded-2xl p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Zeitraum
          </label>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ModernTimePicker
                value={startTime}
                onChange={setStartTime}
              />
            </div>

            <div className="flex-shrink-0">
              <ArrowRight size={24} className="text-gray-400" />
            </div>

            <div className="flex-1">
              <ModernTimePicker
                value={endTime}
                onChange={setEndTime}
              />
            </div>
          </div>

          {/* Duration: editable H:MM input, bidirectionally synced with time pickers */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2 gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">Dauer</span>
              <div className="flex items-baseline gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={durationInput}
                  onChange={(e) => handleDurationInputChange(e.target.value)}
                  onBlur={handleDurationInputBlur}
                  placeholder="2:30"
                  aria-label="Dauer in Stunden:Minuten"
                  aria-invalid={durationInputInvalid || undefined}
                  className={`w-20 px-2 py-1 text-right text-lg font-bold rounded-md border focus:outline-none focus:ring-2 focus:ring-accent-primary tabular-nums ${
                    durationInputInvalid
                      ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                      : calculatedDuration > 0
                      ? 'border-gray-300 dark:border-gray-600 text-green-600 dark:text-green-400 bg-white dark:bg-gray-800'
                      : 'border-gray-300 dark:border-gray-600 text-gray-400 bg-white dark:bg-gray-800'
                  }`}
                />
                {!durationInputInvalid && calculatedDuration > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    ({formatDurationHuman(calculatedDuration)})
                  </span>
                )}
              </div>
            </div>
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  calculatedDuration > 0
                    ? 'bg-gradient-to-r from-green-400 to-green-600'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
                style={{ width: `${durationPercent}%` }}
              />
            </div>
          </div>

          {/* Quick Duration Presets */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-amber-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Schnellauswahl</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {durationPresets.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyDurationPreset(preset.minutes)}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Project Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kunde
            </label>
            <SearchableSelect
              options={customerOptions}
              value={selectedCustomerId}
              onChange={handleCustomerChange}
              placeholder="Kunde auswählen oder suchen..."
              emptyMessage="Keine Kunden gefunden"
              allowClear={true}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Projekt *
            </label>
            <SearchableSelect
              options={projectOptions}
              value={projectId}
              onChange={setProjectId}
              placeholder={selectedCustomerId ? 'Projekt auswählen...' : 'Erst Kunde wählen oder alle Projekte durchsuchen...'}
              emptyMessage="Keine Projekte gefunden"
              disabled={filteredProjects.length === 0}
              required={true}
              allowClear={false}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tätigkeit
            </label>
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 transition-all"
            >
              <option value="">Keine Tätigkeit</option>
              {activities.map(activity => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Was wurde gemacht?"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 resize-none transition-all"
            />
          </div>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!projectId || calculatedDuration <= 0}
          fullWidth
          size="lg"
          icon={<Save size={22} />}
          className={projectId && calculatedDuration > 0
            ? 'py-4 text-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40'
            : 'py-4 text-lg'
          }
        >
          Eintrag speichern
        </Button>
      </form>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
};
