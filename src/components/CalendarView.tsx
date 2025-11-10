import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../styles/calendar.css';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { useState, useMemo } from 'react';
import { formatDuration } from '../utils/time';

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

interface CalendarViewProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
  onEditEntry: (entry: TimeEntry) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    entry: TimeEntry;
    project?: Project;
    customer?: Customer;
    activity?: Activity;
    color: string;
  };
}

export const CalendarView = ({ entries, projects, customers, activities, onEditEntry }: CalendarViewProps) => {
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());

  // Convert time entries to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    console.log('📅 [CALENDAR] Converting entries to events:', entries);

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

        const title = `${duration} | ${customerName} - ${projectName}${activityName}`;

        return {
          id: entry.id,
          title,
          start: startTime,
          end: endTime,
          resource: {
            entry,
            project,
            customer,
            activity,
            color: customer?.color || '#3B82F6',
          },
        };
      });
  }, [entries, projects, customers, activities]);

  console.log('📅 [CALENDAR] Generated events:', events);

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

    const totalSeconds = filtered.reduce((sum, event) => sum + event.resource.entry.duration, 0);
    const hours = totalSeconds / 3600;

    return {
      hours: hours.toFixed(2),
      count: filtered.length,
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

  // Handle event click
  const handleSelectEvent = (event: CalendarEvent) => {
    console.log('📅 [CALENDAR] Event clicked:', event);
    onEditEntry(event.resource.entry);
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
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {visibleHours.count} {visibleHours.count === 1 ? 'Eintrag' : 'Einträge'}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 p-4 sm:p-6 overflow-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 h-full calendar-container">
          <Calendar
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
            onSelectEvent={handleSelectEvent}
            messages={messages}
            culture="de"
            popup
            selectable
          />
        </div>
      </div>
    </div>
  );
};
