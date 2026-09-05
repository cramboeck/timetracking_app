import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  Clock, Ticket, Receipt, Users, Play, Plus,
  Calendar, CheckCircle2,
  ArrowRight, FileText, FolderKanban,
} from 'lucide-react';
import { TimeEntry, Project, Customer, Ticket as TicketType, TicketStatus } from '../types';
import { ticketsApi, workSessionsApi } from '../services/api';
import { useFeatures } from '../contexts/FeaturesContext';
import { toLocalDateString } from '../utils/time';
import { QuickAction } from './ui/StatWidget';
import { useAuth } from '../contexts/AuthContext';
import { Area, SubView } from './AreaNavigation';
import { SkeletonCard, SkeletonListItem } from './Skeleton';

// Matches the constant used in Stopwatch.tsx. When a per-user weekly target
// is eventually introduced (Epic 7 / Settings), replace both call sites.
const WEEKLY_GOAL_HOURS = 40;

interface DashboardOverviewProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  tickets?: TicketType[];
  runningEntry?: TimeEntry | null;
  isLoading?: boolean;
  onNavigate: (area: Area, subView: SubView) => void;
  onStartTimer: () => void;
}

// Sum a list of entries' durations in seconds. Prefers the stored `duration`
// field; falls back to (endTime - startTime) when missing. Always non-negative.
function sumDurationSeconds(list: TimeEntry[]): number {
  return list.reduce((sum, e) => {
    if (e.duration && e.duration > 0) return sum + e.duration;
    if (e.startTime && e.endTime) {
      const start = new Date(e.startTime).getTime();
      const end = new Date(e.endTime).getTime();
      if (!isNaN(start) && !isNaN(end) && end > start) {
        return sum + (end - start) / 1000;
      }
    }
    return sum;
  }, 0);
}

function formatHoursMinutes(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export const DashboardOverview = ({
  entries,
  projects,
  customers,
  tickets = [],
  runningEntry,
  isLoading = false,
  onNavigate,
  onStartTimer,
}: DashboardOverviewProps) => {
  const { currentUser } = useAuth();

  // Ticks each second so the hero card's today-total reflects the running
  // timer live (instead of jumping forward only when the timer is stopped).
  // Only active while a timer is actually running — otherwise we don't need
  // to re-render every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!runningEntry?.isRunning) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [runningEntry?.isRunning]);

  const todayStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayEntries = entries.filter(e => {
      const entryDate = new Date(e.startTime);
      return entryDate >= today && entryDate < tomorrow;
    });

    let totalSeconds = sumDurationSeconds(todayEntries);
    // Include the currently-running timer's elapsed seconds so the hero
    // ticks live. The stored `duration` on a running entry is whatever was
    // last persisted — we add the unaccounted-for delta.
    if (runningEntry?.isRunning && runningEntry.startTime) {
      const elapsed = Math.max(0, (Date.now() - new Date(runningEntry.startTime).getTime()) / 1000);
      const stored = runningEntry.duration || 0;
      const liveExtra = Math.max(0, elapsed - stored);
      // Only add live extra if the running entry actually started today
      const runStart = new Date(runningEntry.startTime);
      if (runStart >= today && runStart < tomorrow) {
        totalSeconds += liveExtra;
      }
    }

    return {
      totalSeconds,
      formatted: formatHoursMinutes(totalSeconds),
      entryCount: todayEntries.length,
    };
  }, [entries, runningEntry]);

  const weekStats = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const weekEntries = entries.filter(e => {
      const entryDate = new Date(e.startTime);
      return entryDate >= monday && entryDate <= today;
    });

    const totalSeconds = sumDurationSeconds(weekEntries);
    return {
      totalSeconds,
      hours: totalSeconds / 3600,
    };
  }, [entries]);

  const weekProgressPct = Math.min(100, (weekStats.hours / WEEKLY_GOAL_HOURS) * 100);

  const ticketStats = useMemo(() => {
    const openTickets = tickets.filter(t => t.status === 'open');
    const inProgressTickets = tickets.filter(t => t.status === 'in_progress');
    const criticalTickets = tickets.filter(t => t.priority === 'critical' && t.status !== 'resolved');
    return {
      open: openTickets.length,
      inProgress: inProgressTickets.length,
      critical: criticalTickets.length,
      activeTotal: openTickets.length + inProgressTickets.length,
    };
  }, [tickets]);

  const unbilledStats = useMemo(() => {
    const billable = entries.filter(e => e.isBillable);
    const totalSeconds = sumDurationSeconds(billable);
    return {
      count: billable.length,
      hours: Math.floor(totalSeconds / 3600),
    };
  }, [entries]);

  const activeCustomerCount = useMemo(
    () => customers.length,
    [customers],
  );

  const activeProjectCount = useMemo(
    () => projects.filter(p => p.isActive).length,
    [projects],
  );

  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 5)
      .map(entry => {
        const project = projects.find(p => p.id === entry.projectId);
        const customer = customers.find(c => c.id === project?.customerId);
        const entryDate = new Date(entry.startTime);
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

  const formatEntryDuration = (entry: TimeEntry): string => {
    return formatHoursMinutes(sumDurationSeconds([entry]));
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = currentUser?.displayName?.split(' ')[0] || 'User';
    if (hour < 12) return `Guten Morgen, ${name}`;
    if (hour < 18) return `Guten Tag, ${name}`;
    return `Guten Abend, ${name}`;
  }, [currentUser]);

  // ── "Heute im Fokus": handlungsorientierte Chips statt reiner KPIs ──────
  const navigate = useNavigate();
  const { hasFeature } = useFeatures();
  const ticketsEnabled = hasFeature('tickets');

  // Mir zugewiesene, offene Tickets
  const myTicketsQuery = useQuery({
    queryKey: ['tickets', 'focus', 'mine', currentUser?.id],
    queryFn: async () => {
      const res = await ticketsApi.getAll({ assignedTo: currentUser!.id, limit: 200 });
      return (res.data || []).filter(t => ['open', 'in_progress', 'waiting'].includes(t.status));
    },
    enabled: ticketsEnabled && !!currentUser?.id,
    staleTime: 60_000,
  });

  // Unzugewiesene offene Tickets (Triage)
  const unassignedQuery = useQuery({
    queryKey: ['tickets', 'focus', 'unassigned'],
    queryFn: async () => {
      const res = await ticketsApi.getAll({ assignedTo: 'none', status: 'open', limit: 200 });
      return res.data || [];
    },
    enabled: ticketsEnabled,
    staleTime: 60_000,
  });

  // SLA-Risiko (faellig in <2h oder ueberfaellig) aus dem Ticket-Dashboard
  const slaFocusQuery = useQuery({
    queryKey: ['tickets', 'focus', 'sla'],
    queryFn: async () => (await ticketsApi.getDashboard()).data.urgentTickets,
    enabled: ticketsEnabled,
    staleTime: 60_000,
  });

  // Gestern: eingestempelte Zeit ohne zugeordnete Eintraege (>15 min Luecke)
  const yesterdayISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateString(d);
  }, []);
  const yesterdayGapQuery = useQuery({
    queryKey: ['workSessions', 'focus', yesterdayISO],
    queryFn: async () => {
      const res = await workSessionsApi.getCoverage(yesterdayISO, yesterdayISO);
      const day = (res.data || [])[0];
      if (!day || day.attendanceSeconds <= 0) return 0;
      return day.unassignedSeconds > 900 ? day.unassignedSeconds : 0;
    },
    staleTime: 5 * 60_000,
  });

  const focusItems = [
    ticketsEnabled && (myTicketsQuery.data?.length ?? 0) > 0 && {
      key: 'mine',
      count: myTicketsQuery.data!.length,
      label: 'Meine Tickets',
      description: 'dir zugewiesen und offen',
      tone: 'accent' as const,
      onClick: () => onNavigate('support', 'tickets'),
    },
    ticketsEnabled && (slaFocusQuery.data?.length ?? 0) > 0 && {
      key: 'sla',
      count: slaFocusQuery.data!.length,
      label: 'SLA-Risiko',
      description: 'fällig in unter 2 Stunden',
      tone: 'red' as const,
      onClick: () => onNavigate('support', 'tickets'),
    },
    ticketsEnabled && (unassignedQuery.data?.length ?? 0) > 0 && {
      key: 'unassigned',
      count: unassignedQuery.data!.length,
      label: 'Ohne Bearbeiter',
      description: 'offene Tickets ohne Zuweisung',
      tone: 'amber' as const,
      onClick: () => onNavigate('support', 'tickets'),
    },
    (yesterdayGapQuery.data ?? 0) > 0 && {
      key: 'gap',
      // ab 90 min in Stunden anzeigen ("7,5 h" statt "450 min")
      count: Math.round((yesterdayGapQuery.data as number) / 60) >= 90
        ? Number(((yesterdayGapQuery.data as number) / 3600).toFixed(1))
        : Math.round((yesterdayGapQuery.data as number) / 60),
      unit: Math.round((yesterdayGapQuery.data as number) / 60) >= 90 ? 'h' : 'min',
      label: 'Zeiten von gestern',
      description: 'eingestempelt, aber nicht erfasst',
      tone: 'amber' as const,
      onClick: () => navigate(`/arbeiten/zeiten?view=day&date=${yesterdayISO}`),
    },
  ].filter(Boolean) as Array<{
    key: string; count: number; unit?: string; label: string;
    description: string; tone: 'accent' | 'red' | 'amber'; onClick: () => void;
  }>;

  const focusToneClasses: Record<'accent' | 'red' | 'amber', { card: string; badge: string }> = {
    accent: {
      card: 'border-accent-primary/30 hover:border-accent-primary bg-accent-lighter/40 dark:bg-accent-primary/10',
      badge: 'bg-accent-primary text-white',
    },
    red: {
      card: 'border-red-200 dark:border-red-900/50 hover:border-red-400 bg-red-50/60 dark:bg-red-900/10',
      badge: 'bg-red-500 text-white',
    },
    amber: {
      card: 'border-amber-200 dark:border-amber-900/50 hover:border-amber-400 bg-amber-50/60 dark:bg-amber-900/10',
      badge: 'bg-amber-500 text-white',
    },
  };

  // Show skeleton if we're still loading the initial data — otherwise the
  // dashboard renders as a sea of zeros, which is more confusing than empty.
  const showSkeleton = isLoading && entries.length === 0 && customers.length === 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting}
          </h1>
          <p className="text-gray-500 dark:text-dark-400 mt-1">
            {new Date().toLocaleDateString('de-DE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        {runningEntry?.isRunning && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-full border border-green-200 dark:border-green-800">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              Timer aktiv
            </span>
          </div>
        )}
      </div>

      {/* Heute im Fokus — was jetzt Aufmerksamkeit braucht */}
      {focusItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 dark:text-dark-400 mb-2">
            Heute im Fokus
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {focusItems.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`text-left rounded-xl border p-4 transition-colors ${focusToneClasses[item.tone].card}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`min-w-[40px] h-10 px-2 rounded-lg text-lg font-bold inline-flex items-center justify-center tabular-nums ${focusToneClasses[item.tone].badge}`}>
                    {item.count}{item.unit ? ` ${item.unit}` : ''}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white truncate">{item.label}</div>
                    <div className="text-xs text-gray-500 dark:text-dark-400 truncate">{item.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
        <QuickAction
          label="Reports"
          icon={FileText}
          color="green"
          onClick={() => onNavigate('finanzen', 'reports')}
        />
      </div>

      {showSkeleton ? (
        // Initial app boot — skeleton placeholders for the bento grid + lists.
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonListItem key={i} />
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonListItem key={i} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Bento-Grid: Hero (2x2 on lg) + 4 KPIs in an asymmetric layout. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-[7rem] gap-4">
            {/* Hero: Today + live counter + weekly goal progress */}
            <button
              type="button"
              onClick={() => onNavigate('arbeiten', 'list')}
              className="col-span-2 row-span-2 text-left
                relative overflow-hidden rounded-xl p-5
                bg-gradient-to-br from-accent-primary to-accent-dark
                text-white shadow-md hover:shadow-lg
                transition-shadow
              "
              aria-label="Zeitübersicht öffnen"
            >
              <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <Clock size={16} />
                Heute gearbeitet
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-5xl md:text-6xl font-bold tabular-nums">
                  {todayStats.formatted}
                </span>
                <span className="text-2xl font-semibold text-white/80">h</span>
                {runningEntry?.isRunning && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-white animate-pulse" />
                )}
              </div>
              <p className="text-white/70 text-xs mt-1">
                {todayStats.entryCount} Einträge
              </p>

              {/* Weekly goal progress */}
              <div className="absolute bottom-5 left-5 right-5">
                <div className="flex items-center justify-between text-xs text-white/80 mb-1.5">
                  <span>Wochenziel</span>
                  <span className="font-semibold tabular-nums">
                    {weekStats.hours.toFixed(1)}h / {WEEKLY_GOAL_HOURS}h
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${weekProgressPct}%` }}
                  />
                </div>
              </div>
            </button>

            {/* KPI tile: open tickets */}
            <button
              type="button"
              onClick={() => onNavigate('support', 'tickets')}
              className="text-left rounded-xl p-4 bg-white dark:bg-dark-100
                border border-gray-200 dark:border-dark-border
                hover:border-accent-primary dark:hover:border-accent-primary
                transition-colors
              "
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
                ticketStats.critical > 0
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : 'bg-orange-50 dark:bg-orange-900/20'
              }`}>
                <Ticket size={18} className={
                  ticketStats.critical > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-orange-600 dark:text-orange-400'
                } />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {ticketStats.activeTotal}
              </div>
              <div className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                Offene Tickets
                {ticketStats.critical > 0 && (
                  <span className="ml-1 text-red-600 dark:text-red-400 font-medium">
                    · {ticketStats.critical} kritisch
                  </span>
                )}
              </div>
            </button>

            {/* KPI tile: unbilled */}
            <button
              type="button"
              onClick={() => onNavigate('finanzen', 'billing')}
              className="text-left rounded-xl p-4 bg-white dark:bg-dark-100
                border border-gray-200 dark:border-dark-border
                hover:border-accent-primary dark:hover:border-accent-primary
                transition-colors
              "
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-3">
                <Receipt size={18} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {unbilledStats.hours}h
              </div>
              <div className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                Abrechenbar · {unbilledStats.count}
              </div>
            </button>

            {/* KPI tile: active customers */}
            <button
              type="button"
              onClick={() => onNavigate('crm', 'customers')}
              className="text-left rounded-xl p-4 bg-white dark:bg-dark-100
                border border-gray-200 dark:border-dark-border
                hover:border-accent-primary dark:hover:border-accent-primary
                transition-colors
              "
            >
              <div className="w-9 h-9 rounded-lg bg-accent-light dark:bg-accent-primary/20 flex items-center justify-center mb-3">
                <Users size={18} className="text-accent-primary dark:text-accent-primary" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {activeCustomerCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                Aktive Kunden
              </div>
            </button>

            {/* KPI tile: active projects */}
            <button
              type="button"
              onClick={() => onNavigate('crm', 'customers')}
              className="text-left rounded-xl p-4 bg-white dark:bg-dark-100
                border border-gray-200 dark:border-dark-border
                hover:border-accent-primary dark:hover:border-accent-primary
                transition-colors
              "
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-3">
                <FolderKanban size={18} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {activeProjectCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-dark-400 mt-0.5">
                Aktive Projekte
              </div>
            </button>
          </div>

          {/* Two Column Layout: recent entries + open tickets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock size={18} className="text-accent-primary" />
                  Letzte Zeiteinträge
                </h2>
                <button
                  onClick={() => onNavigate('arbeiten', 'list')}
                  className="text-sm text-accent-primary hover:underline flex items-center gap-1"
                >
                  Alle anzeigen
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {recentEntries.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-dark-400">
                    <Clock size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Noch keine Zeiteinträge</p>
                  </div>
                ) : (
                  recentEntries.map(entry => (
                    <div key={entry.id} className="p-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-2 h-10 rounded-full"
                          style={{ backgroundColor: entry.customerColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {entry.description || entry.projectName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            {entry.customerName} • {entry.formattedDate}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatEntryDuration(entry)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-dark-400">
                            {entry.formattedStartTime} - {entry.formattedEndTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-dark-100 rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Ticket size={18} className="text-orange-600 dark:text-orange-400" />
                  Offene Tickets
                </h2>
                <button
                  onClick={() => onNavigate('support', 'tickets')}
                  className="text-sm text-accent-primary hover:underline flex items-center gap-1"
                >
                  Alle anzeigen
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-dark-border">
                {tickets.filter(t => t.status !== 'resolved').length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-dark-400">
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
                        normal: 'bg-accent-lighter text-accent-dark dark:bg-accent-primary/30 dark:text-accent-primary',
                        low: 'bg-gray-100 text-gray-600 dark:bg-dark-200 dark:text-dark-400',
                      };
                      const statusColors: Partial<Record<TicketStatus, string>> = {
                        open: 'bg-blue-500',
                        in_progress: 'bg-yellow-500',
                        waiting: 'bg-purple-500',
                        resolved: 'bg-green-500',
                      };

                      return (
                        <div key={ticket.id} className="p-3 hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-10 rounded-full ${statusColors[ticket.status] ?? 'bg-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {ticket.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-dark-400">
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
        </>
      )}
    </div>
  );
};
