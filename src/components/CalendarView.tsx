import { Calendar, dateFnsLocalizer, View, SlotInfo } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../styles/calendar.css';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { useState, useMemo, useEffect } from 'react';
import { formatDuration } from '../utils/time';
import { Modal } from './Modal';
import { TimePicker } from './TimePicker';
import { maintenanceApi, MaintenanceAnnouncement } from '../services/api';
import { Wrench, Clock, AlertCircle } from 'lucide-react';

const locales = {
  'de': de,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Create DnD Calendar
const DnDCalendar = withDragAndDrop(Calendar);

// Event types for calendar
type EventType = 'timeEntry' | 'maintenance';

interface CalendarViewProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onEditEntry: (entry: TimeEntry) => void;
  onUpdateEntry: (id: string, updates: Partial<TimeEntry>) => void;
  onCreateEntry?: (entry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt'>) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: {
    type: EventType;
    entry?: TimeEntry;
    maintenance?: MaintenanceAnnouncement;
    project?: Project;
    customer?: Customer;
    activity?: Activity;
    color: string;
    isDraggable: boolean;
  };
}

// Event type colors
const EVENT_COLORS = {
  timeEntry: '#3B82F6',      // Blue
  maintenance: '#F59E0B',    // Orange/Amber
  maintenanceDraft: '#9CA3AF', // Gray
  maintenanceInProgress: '#8B5CF6', // Purple
  maintenanceCompleted: '#10B981', // Green
};

export const CalendarView = ({
  entries,
  projects,
  customers,
  activities,
  onEditEntry: _onEditEntry,
  onUpdateEntry,
  onCreateEntry
}: CalendarViewProps) => {
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());

  // Maintenance events state
  const [maintenances, setMaintenances] = useState<MaintenanceAnnouncement[]>([]);
  const [showMaintenances, setShowMaintenances] = useState(true);
  const [showTimeEntries, setShowTimeEntries] = useState(true);

  // Load maintenances
  useEffect(() => {
    maintenanceApi.getAnnouncements()
      .then(data => setMaintenances(data.announcements || []))
      .catch(err => console.error('Failed to load maintenances for calendar:', err));
  }, []);

  // Edit modal state
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editProjectId, setEditProjectId] = useState('');
  const [editActivityId, setEditActivityId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Convert time entries to calendar events
  const timeEntryEvents: CalendarEvent[] = useMemo(() => {
    if (!showTimeEntries) return [];

    return entries
      .filter(entry => !entry.isRunning && entry.endTime) // Only completed entries
      .map(entry => {
        const project = projects.find(p => p.id === entry.projectId);
        const customer = project ? customers.find(c => c.id === project.customerId) : undefined;
        const activity = entry.activityId ? activities.find(a => a.id === entry.activityId) : undefined;

        const startTime = new Date(entry.startTime);
        const endTime = new Date(entry.endTime!);

        // Build title
        const duration = formatDuration(entry.duration);
        const customerName = customer?.name || 'Unbekannt';
        const projectName = project?.name || 'Unbekannt';
        const activityName = activity ? ` - ${activity.name}` : '';

        const title = `⏱️ ${duration} | ${customerName} - ${projectName}${activityName}`;

        return {
          id: entry.id,
          title,
          start: startTime,
          end: endTime,
          resource: {
            type: 'timeEntry' as EventType,
            entry,
            project,
            customer,
            activity,
            color: customer?.color || EVENT_COLORS.timeEntry,
            isDraggable: true,
          },
        };
      });
  }, [entries, projects, customers, activities, showTimeEntries]);

  // Convert maintenances to calendar events
  const maintenanceEvents: CalendarEvent[] = useMemo(() => {
    if (!showMaintenances) return [];

    return maintenances.map(maintenance => {
      const startTime = new Date(maintenance.scheduled_start);
      const endTime = maintenance.scheduled_end
        ? new Date(maintenance.scheduled_end)
        : new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours if no end time

      // Color based on status
      let color = EVENT_COLORS.maintenance;
      if (maintenance.status === 'draft') color = EVENT_COLORS.maintenanceDraft;
      else if (maintenance.status === 'in_progress') color = EVENT_COLORS.maintenanceInProgress;
      else if (maintenance.status === 'completed') color = EVENT_COLORS.maintenanceCompleted;

      const statusEmoji = {
        draft: '📝',
        scheduled: '📅',
        sent: '📧',
        in_progress: '🔧',
        completed: '✅',
        cancelled: '❌'
      }[maintenance.status] || '🔧';

      const title = `${statusEmoji} ${maintenance.title}`;

      return {
        id: `maintenance-${maintenance.id}`,
        title,
        start: startTime,
        end: endTime,
        resource: {
          type: 'maintenance' as EventType,
          maintenance,
          color,
          isDraggable: false,
        },
      };
    });
  }, [maintenances, showMaintenances]);

  // Combine all events
  const events = useMemo(() => {
    return [...timeEntryEvents, ...maintenanceEvents];
  }, [timeEntryEvents, maintenanceEvents]);

  console.log('📅 [CALENDAR] Generated events:', events.length, 'time entries:', timeEntryEvents.length, 'maintenances:', maintenanceEvents.length);

  // Calculate total hours for visible date range
  const visibleHours = useMemo(() => {
    const now = date;
    let start: Date, end: Date;

    if (view === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (view === 'week') {
      start = startOfWeek(now, { locale: de });
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59);
    } else if (view === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else {
      // agenda view - show next 30 days
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 30);
    }

    const filtered = events.filter(event => {
      return event.start >= start && event.start <= end;
    });

    // Only count hours from time entries (not maintenances)
    const timeEntries = filtered.filter(e => e.resource.type === 'timeEntry' && e.resource.entry);
    const maintenanceCount = filtered.filter(e => e.resource.type === 'maintenance').length;
    const totalSeconds = timeEntries.reduce((sum, event) => sum + (event.resource.entry?.duration || 0), 0);
    const hours = totalSeconds / 3600;

    return {
      hours: hours.toFixed(2),
      count: timeEntries.length,
      maintenanceCount,
      startDate: start,
      endDate: end
    };
  }, [events, date, view]);

  // Custom event style
  const eventStyleGetter = (event: CalendarEvent) => {
    const backgroundColor = event.resource.color;

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
        fontSize: '0.875rem',
        padding: '2px 4px',
      },
    };
  };

  // Open edit modal
  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditProjectId(entry.projectId);
    setEditActivityId(entry.activityId || '');
    setEditDescription(entry.description);

    // Extract date and times
    const startDate = new Date(entry.startTime);
    const endDate = entry.endTime ? new Date(entry.endTime) : new Date();

    setEditDate(startDate.toISOString().split('T')[0]);
    setEditStartTime(startDate.toTimeString().slice(0, 5)); // HH:MM
    setEditEndTime(endDate.toTimeString().slice(0, 5)); // HH:MM
  };

  // Save edit
  const handleSaveEdit = () => {
    if (!editingEntry || !editProjectId || !editDate || !editStartTime || !editEndTime) return;

    const startDateTime = new Date(`${editDate}T${editStartTime}`).toISOString();
    const endDateTime = new Date(`${editDate}T${editEndTime}`).toISOString();
    const duration = Math.floor((new Date(endDateTime).getTime() - new Date(startDateTime).getTime()) / 1000);

    if (duration <= 0) {
      alert('Die Endzeit muss nach der Startzeit liegen!');
      return;
    }

    onUpdateEntry(editingEntry.id, {
      projectId: editProjectId,
      activityId: editActivityId || undefined,
      description: editDescription,
      startTime: startDateTime,
      endTime: endDateTime,
      duration
    });

    setEditingEntry(null);
  };

  // Handle event click
  const handleSelectEvent = (event: CalendarEvent) => {
    console.log('📅 [CALENDAR] Event clicked:', event);

    // Only open edit modal for time entries
    if (event.resource.type === 'timeEntry' && event.resource.entry) {
      openEditModal(event.resource.entry);
    }
    // For maintenance events, we could navigate to maintenance view or show info
    // For now, just log it
    if (event.resource.type === 'maintenance') {
      console.log('📅 [CALENDAR] Maintenance clicked:', event.resource.maintenance);
    }
  };

  // Handle event drag & drop (move event to different time)
  const handleEventDrop = ({ event, start, end }: { event: CalendarEvent; start: Date; end: Date }) => {
    console.log('📅 [CALENDAR] Event dropped:', { event, start, end });

    const entry = event.resource.entry;
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

    onUpdateEntry(entry.id, {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration
    });
  };

  // Handle event resize (change duration)
  const handleEventResize = ({ event, start, end }: { event: CalendarEvent; start: Date; end: Date }) => {
    console.log('📅 [CALENDAR] Event resized:', { event, start, end });

    const entry = event.resource.entry;
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

    onUpdateEntry(entry.id, {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration
    });
  };

  // Handle slot selection (create new entry by clicking/dragging on calendar)
  const handleSelectSlot = (slotInfo: SlotInfo) => {
    if (!onCreateEntry) return;

    console.log('📅 [CALENDAR] Slot selected:', slotInfo);

    // Check if user has at least one active project
    const activeProjects = projects.filter(p => p.isActive);
    if (activeProjects.length === 0) {
      alert('Bitte erstelle zuerst ein Projekt in den Einstellungen.');
      return;
    }

    // Use first active project as default
    const defaultProject = activeProjects[0];
    const duration = Math.floor((slotInfo.end.getTime() - slotInfo.start.getTime()) / 1000);

    // Create entry and open edit modal
    const newEntry: Omit<TimeEntry, 'id' | 'userId' | 'createdAt'> = {
      projectId: defaultProject.id,
      activityId: activities.length > 0 ? activities[0].id : undefined,
      startTime: slotInfo.start.toISOString(),
      endTime: slotInfo.end.toISOString(),
      duration,
      description: '',
      isRunning: false
    };

    onCreateEntry(newEntry);
  };

  // Style weekends differently
  const dayPropGetter = (date: Date) => {
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6; // Sunday or Saturday

    if (isWeekend) {
      return {
        className: 'weekend-day',
        style: {
          backgroundColor: '#f8fafc',
        }
      };
    }
    return {};
  };

  // Custom Agenda Date component to fix date display
  const AgendaDateComponent = ({ event }: { event: CalendarEvent }) => {
    const dateStr = format(event.start, 'EEE, dd.MM.yyyy', { locale: de });
    return (
      <div className="agenda-date-cell">
        <span className="font-medium text-gray-900 dark:text-white">{dateStr}</span>
      </div>
    );
  };

  // Custom Agenda Time component
  const AgendaTimeComponent = ({ event }: { event: CalendarEvent }) => {
    const timeStr = `${format(event.start, 'HH:mm')} - ${format(event.end, 'HH:mm')}`;
    return (
      <div className="agenda-time-cell">
        <span className="text-sm text-gray-600 dark:text-gray-400">{timeStr}</span>
      </div>
    );
  };

  // Custom components
  const components = {
    agenda: {
      date: AgendaDateComponent,
      time: AgendaTimeComponent,
    }
  };

  // Custom toolbar messages
  const messages = {
    today: 'Heute',
    previous: 'Zurück',
    next: 'Weiter',
    month: 'Monat',
    week: 'Woche',
    day: 'Tag',
    agenda: 'Agenda',
    date: 'Datum',
    time: 'Zeit',
    event: 'Eintrag',
    noEventsInRange: 'Keine Zeiteinträge in diesem Zeitraum.',
    showMore: (total: number) => `+ ${total} weitere`,
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold dark:text-white">Kalender</h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            {/* Filter toggles */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTimeEntries(!showTimeEntries)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  showTimeEntries
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Zeit ({visibleHours.count})
              </button>
              <button
                onClick={() => setShowMaintenances(!showMaintenances)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  showMaintenances
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                Wartung ({visibleHours.maintenanceCount})
              </button>
            </div>

            {/* Time summary */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                {view === 'day' && 'Heute'}
                {view === 'week' && 'Diese Woche'}
                {view === 'month' && 'Dieser Monat'}
                {view === 'agenda' && 'Nächste 30 Tage'}
              </span>
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                {visibleHours.hours}h
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 p-4 sm:p-6 overflow-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 h-full calendar-container">
          <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%', minHeight: '500px' }}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            eventPropGetter={eventStyleGetter}
            dayPropGetter={dayPropGetter}
            onSelectEvent={handleSelectEvent}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            onSelectSlot={handleSelectSlot}
            messages={messages}
            components={components}
            culture="de"
            popup
            selectable
            resizable
            draggableAccessor={(event: CalendarEvent) => event.resource.isDraggable}
          />
        </div>
      </div>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <Modal isOpen={true} onClose={() => setEditingEntry(null)} title="Zeiteintrag bearbeiten">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Projekt *
              </label>
              <select
                value={editProjectId}
                onChange={(e) => setEditProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                required
              >
                <option value="">Projekt wählen...</option>
                {projects.filter(p => p.isActive).map(project => {
                  const customer = customers.find(c => c.id === project.customerId);
                  return (
                    <option key={project.id} value={project.id}>
                      {customer?.name} - {project.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tätigkeit
              </label>
              <select
                value={editActivityId}
                onChange={(e) => setEditActivityId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Datum *
              </label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Startzeit *
                </label>
                <TimePicker
                  value={editStartTime}
                  onChange={setEditStartTime}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Endzeit *
                </label>
                <TimePicker
                  value={editEndTime}
                  onChange={setEditEndTime}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Beschreibung
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Optional: Details zur Tätigkeit..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setEditingEntry(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
              >
                Speichern
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
