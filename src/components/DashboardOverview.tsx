import { useMemo } from 'react';
import {
  Clock, Ticket, Receipt, Users, Play, Plus,
  Calendar, TrendingUp, AlertCircle, CheckCircle2,
  ArrowRight, FileText, Target
} from 'lucide-react';
import { TimeEntry, Project, Customer, Ticket as TicketType } from '../types';
import { StatWidget, QuickAction } from './ui/StatWidget';
import { Card } from './ui/Card';
import { useAuth } from '../contexts/AuthContext';
import { Area, SubView } from './AreaNavigation';

interface DashboardOverviewProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  tickets?: TicketType[];
  runningEntry?: TimeEntry | null;
  onNavigate: (area: Area, subView: SubView) => void;
  onStartTimer: () => void;
}

export const DashboardOverview = ({
  entries,
  projects,
  customers,
  tickets = [],
  runningEntry,
  onNavigate,
  onStartTimer,
}: DashboardOverviewProps) => {
  const { currentUser } = useAuth();

  // Calculate today's stats
  const todayStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEntries = entries.filter(e => {
      // Handle both ISO timestamp and date string formats
      const entryDate = new Date(e.startTime || e.date);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate.getTime() === today.getTime();
    });

    const totalSeconds = todayEntries.reduce((sum, e) => {
      // Prefer stored duration, otherwise calculate from timestamps
      if (e.duration && e.duration > 0) {
        return sum + e.duration;
      }
      if (e.startTime && e.endTime) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return sum + (end.getTime() - start.getTime()) / 1000;
        }
      }
      return sum;
    }, 0);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    return {
      hours,
      minutes,
      formatted: `${hours}:${String(minutes).padStart(2, '0')}`,
      entryCount: todayEntries.length,
    };
  }, [entries]);

  // Calculate week stats
  const weekStats = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    monday.setHours(0, 0, 0, 0);

    const weekEntries = entries.filter(e => {
      const entryDate = new Date(e.startTime || e.date);
      return entryDate >= monday && entryDate <= today;
    });

    const totalSeconds = weekEntries.reduce((sum, e) => {
      if (e.duration && e.duration > 0) {
        return sum + e.duration;
      }
      if (e.startTime && e.endTime) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return sum + (end.getTime() - start.getTime()) / 1000;
        }
      }
      return sum;
    }, 0);

    const hours = Math.floor(totalSeconds / 3600);

    return {
      hours,
      entryCount: weekEntries.length,
    };
  }, [entries]);

  // Ticket stats
  const ticketStats = useMemo(() => {
    const openTickets = tickets.filter(t => t.status === 'open');
    const inProgressTickets = tickets.filter(t => t.status === 'in_progress');
    const criticalTickets = tickets.filter(t => t.priority === 'critical' && t.status !== 'resolved');

    return {
      open: openTickets.length,
      inProgress: inProgressTickets.length,
      critical: criticalTickets.length,
      total: tickets.length,
    };
  }, [tickets]);

  // Unbilled entries
  const unbilledStats = useMemo(() => {
    const unbilled = entries.filter(e => !e.billed);
    const totalSeconds = unbilled.reduce((sum, e) => {
      if (e.duration && e.duration > 0) {
        return sum + e.duration;
      }
      if (e.startTime && e.endTime) {
        const start = new Date(e.startTime);
        const end = new Date(e.endTime);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          return sum + (end.getTime() - start.getTime()) / 1000;
        }
      }
      return sum;
    }, 0);

    const hours = Math.floor(totalSeconds / 3600);

    return {
      count: unbilled.length,
      hours,
    };
  }, [entries]);

  // Recent activity (last 5 entries)
  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => new Date(b.startTime || b.date).getTime() - new Date(a.startTime || a.date).getTime())
      .slice(0, 5)
      .map(entry => {
        const project = projects.find(p => p.id === entry.projectId);
        const customer = customers.find(c => c.id === project?.customerId);
        const entryDate = new Date(entry.startTime || entry.date);
        return {
          ...entry,
          projectName: project?.name || 'Unbekannt',
          customerName: customer?.name || 'Unbekannt',
          customerColor: customer?.color || '#6366f1',
          formattedDate: !isNaN(entryDate.getTime())
            ? entryDate.toLocaleDateString('de-DE')
            : 'Unbekannt',
          formattedStartTime: entry.startTime
            ? new Date(entry.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            : '',
          formattedEndTime: entry.endTime
            ? new Date(entry.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            : '',
        };
      });
  }, [entries, projects, customers]);

  const formatDuration = (entry: TimeEntry) => {
    // First try to use stored duration
    if (entry.duration && entry.duration > 0) {
      const hours = Math.floor(entry.duration / 3600);
      const minutes = Math.floor((entry.duration % 3600) / 60);
      return `${hours}:${String(minutes).padStart(2, '0')}`;
    }
    // Otherwise calculate from timestamps
    if (entry.startTime && entry.endTime) {
      const start = new Date(entry.startTime);
      const end = new Date(entry.endTime);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const seconds = (end.getTime() - start.getTime()) / 1000;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}:${String(minutes).padStart(2, '0')}`;
      }
    }
    return '0:00';
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = currentUser?.displayName?.split(' ')[0] || 'User';
    if (hour < 12) return `Guten Morgen, ${name}`;
    if (hour < 18) return `Guten Tag, ${name}`;
    return `Guten Abend, ${name}`;
  }, [currentUser]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {new Date().toLocaleDateString('de-DE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        {runningEntry && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-full border border-green-200 dark:border-green-800">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Timer aktiv
            </span>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        <QuickAction
          label="Timer starten"
          icon={Play}
          color="green"
          onClick={onStartTimer}
          disabled={!!runningEntry}
        />
        <QuickAction
          label="Neues Ticket"
          icon={Plus}
          color="orange"
          onClick={() => onNavigate('support', 'tickets')}
        />
        <QuickAction
          label="Zeiterfassung"
          icon={Clock}
          color="blue"
          onClick={() => onNavigate('arbeiten', 'stopwatch')}
        />
        <QuickAction
          label="Kalender"
          icon={Calendar}
          color="purple"
          onClick={() => onNavigate('arbeiten', 'calendar')}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatWidget
          label="Heute gearbeitet"
          value={todayStats.formatted + ' h'}
          icon={Clock}
          color="blue"
          onClick={() => onNavigate('arbeiten', 'list')}
          trend={weekStats.hours > 0 ? {
            value: Math.round((todayStats.hours / (weekStats.hours / 5)) * 100 - 100),
            label: 'vs. Wochenschnitt',
            positive: todayStats.hours >= weekStats.hours / 5,
          } : undefined}
        />
        <StatWidget
          label="Offene Tickets"
          value={ticketStats.open + ticketStats.inProgress}
          icon={Ticket}
          color={ticketStats.critical > 0 ? 'red' : 'orange'}
          onClick={() => onNavigate('support', 'tickets')}
        />
        <StatWidget
          label="Nicht abgerechnet"
          value={unbilledStats.hours + ' h'}
          icon={Receipt}
          color="green"
          onClick={() => onNavigate('finanzen', 'billing')}
        />
        <StatWidget
          label="Aktive Kunden"
          value={customers.filter(c => c.isActive !== false).length}
          icon={Users}
          color="purple"
          onClick={() => onNavigate('crm', 'customers')}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Time Entries */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock size={18} className="text-blue-600 dark:text-blue-400" />
              Letzte Zeiteinträge
            </h2>
            <button
              onClick={() => onNavigate('arbeiten', 'list')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Alle anzeigen
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentEntries.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Clock size={32} className="mx-auto mb-2 opacity-50" />
                <p>Noch keine Zeiteinträge</p>
              </div>
            ) : (
              recentEntries.map(entry => (
                <div key={entry.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2 h-10 rounded-full"
                      style={{ backgroundColor: entry.customerColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {entry.description || entry.projectName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.customerName} • {entry.formattedDate}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatDuration(entry)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.formattedStartTime} - {entry.formattedEndTime}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Open Tickets / Tasks */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Ticket size={18} className="text-orange-600 dark:text-orange-400" />
              Offene Tickets
            </h2>
            <button
              onClick={() => onNavigate('support', 'tickets')}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Alle anzeigen
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {tickets.filter(t => t.status !== 'resolved').length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
                <p>Alle Tickets erledigt!</p>
              </div>
            ) : (
              tickets
                .filter(t => t.status !== 'resolved')
                .sort((a, b) => {
                  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
                  return priorityOrder[a.priority] - priorityOrder[b.priority];
                })
                .slice(0, 5)
                .map(ticket => {
                  const customer = customers.find(c => c.id === ticket.customerId);
                  const priorityColors = {
                    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                    normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                    low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
                  };
                  const statusColors = {
                    open: 'bg-blue-500',
                    in_progress: 'bg-yellow-500',
                    waiting: 'bg-purple-500',
                    resolved: 'bg-green-500',
                  };

                  return (
                    <div key={ticket.id} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-10 rounded-full ${statusColors[ticket.status]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {ticket.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {customer?.name || 'Unbekannt'} • {ticket.ticketNumber}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[ticket.priority]}`}>
                          {ticket.priority === 'critical' ? 'Kritisch' :
                           ticket.priority === 'high' ? 'Hoch' :
                           ticket.priority === 'normal' ? 'Normal' : 'Niedrig'}
                        </span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card interactive className="p-4 rounded-xl" onClick={() => onNavigate('arbeiten', 'tasks')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
              <Target size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{weekStats.hours}h</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Diese Woche</p>
            </div>
          </div>
        </Card>

        <Card interactive className="p-4 rounded-xl" onClick={() => onNavigate('crm', 'leads')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <TrendingUp size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{projects.filter(p => p.isActive).length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Aktive Projekte</p>
            </div>
          </div>
        </Card>

        <Card interactive className="p-4 rounded-xl" onClick={() => onNavigate('finanzen', 'invoices')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <FileText size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{unbilledStats.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Offene Einträge</p>
            </div>
          </div>
        </Card>

        <Card interactive className="p-4 rounded-xl" onClick={() => onNavigate('support', 'tickets')}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              ticketStats.critical > 0
                ? 'bg-red-50 dark:bg-red-900/20'
                : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              <AlertCircle size={20} className={
                ticketStats.critical > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-400'
              } />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{ticketStats.critical}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Kritische Tickets</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
