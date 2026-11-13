import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, TrendingUp, Calendar, Users, Coffee, Briefcase, History, FolderOpen, ChevronRight } from 'lucide-react';
import { Button } from './ui';
import CustomerAvatar from './ui/CustomerAvatar';
import { ReportAssistant } from './ReportAssistant';
import { authFetch } from '../services/api/base';
import { InternalTimeReport } from './InternalTimeReport';
import { AdminTeamTimeView } from './AdminTeamTimeView';
import { AbsenceCalendar } from './AbsenceCalendar';
import { TeamAbsenceOverview } from './TeamAbsenceOverview';
import { TeamAttendanceView } from './TeamAttendanceView';
import { AbsenceRequestApprovals } from './AbsenceRequestApprovals';
import { InternalExpenses } from './InternalExpenses';
import { TimeEntryChangeLog } from './TimeEntryChangeLog';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { absenceRequestsApi } from '../services/api';

type ReportTab = 'customer' | 'internal' | 'absences' | 'team' | 'team-absences' | 'attendance' | 'requests' | 'changes';

interface ReportsPageProps {
  entries: TimeEntry[];
  projects: Project[];
  customers: Customer[];
  activities: Activity[];
}

export const ReportsPage = ({
  entries,
  projects,
  customers,
  activities
}: ReportsPageProps) => {
  const [reportAssistantOpen, setReportAssistantOpen] = useState(false);
  // Schnellstart-Optionen für den Assistenten (Kunde vorbelegt / Saved-Ansicht)
  const [assistantCustomerId, setAssistantCustomerId] = useState<string | null>(null);
  const [assistantOpenSaved, setAssistantOpenSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>('customer');
  const { currentUser } = useAuth();

  const openAssistant = (opts?: { customerId?: string; openSaved?: boolean }) => {
    setAssistantCustomerId(opts?.customerId ?? null);
    setAssistantOpenSaved(opts?.openSaved ?? false);
    setReportAssistantOpen(true);
  };

  // Check if user is admin
  const isAdmin = currentUser?.role === 'admin';

  // Offene Urlaubsanträge als Badge am „Anträge"-Tab (nur Admins)
  const pendingRequestsQuery = useQuery({
    queryKey: ['absenceRequests', 'team', 'pending'],
    queryFn: async () => (await absenceRequestsApi.listTeam('pending')).data,
    enabled: isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const pendingCount = pendingRequestsQuery.data?.length ?? 0;

  // Calculate some quick stats
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const thisMonthEntries = entries.filter(e => {
    const date = new Date(e.startTime);
    return date >= thisMonth;
  });

  const totalHoursThisMonth = thisMonthEntries.reduce((sum, e) => {
    if (e.duration && e.duration > 0) {
      return sum + e.duration / 3600;
    }
    return sum;
  }, 0);

  const billableHoursThisMonth = thisMonthEntries.reduce((sum, e) => {
    if (e.isBillable && e.duration && e.duration > 0) {
      return sum + e.duration / 3600;
    }
    return sum;
  }, 0);

  // Schnellstart: Kunden mit den meisten Stunden im laufenden Monat
  const projectCustomerMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(p => { if (p.customerId) map.set(p.id, p.customerId); });
    return map;
  }, [projects]);

  const topCustomersThisMonth = useMemo(() => {
    const hoursByCustomer = new Map<string, number>();
    thisMonthEntries.forEach(e => {
      if (!e.projectId || !e.duration || e.duration <= 0) return;
      const customerId = projectCustomerMap.get(e.projectId);
      if (!customerId) return;
      hoursByCustomer.set(customerId, (hoursByCustomer.get(customerId) || 0) + e.duration / 3600);
    });
    return [...hoursByCustomer.entries()]
      .map(([customerId, hours]) => ({ customer: customers.find(c => c.id === customerId), hours }))
      .filter((x): x is { customer: Customer; hours: number } => !!x.customer)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisMonthEntries, projectCustomerMap, customers]);

  const activeCustomersThisMonth = topCustomersThisMonth.length;

  // Zuletzt gespeicherte Reports direkt auf der Seite (statt Feature-Prospekt)
  interface SavedReportRow {
    id: string;
    customer_name: string;
    report_title: string;
    start_date: string;
    end_date: string;
    total_hours: number | string;
    status: 'saved' | 'pending' | 'approved' | 'rejected' | 'revision_requested' | 'superseded';
    created_at: string;
  }
  const savedReportsQuery = useQuery({
    queryKey: ['reports', 'saved', 'overview'],
    queryFn: async (): Promise<SavedReportRow[]> => {
      const data = await authFetch('/report-approvals/saved?status=all');
      return data.reports || [];
    },
    enabled: activeTab === 'customer',
    staleTime: 60_000,
  });
  const savedReports: SavedReportRow[] = savedReportsQuery.data ?? [];

  const SAVED_STATUS_META: Record<SavedReportRow['status'], { label: string; cls: string }> = {
    saved: { label: 'Entwurf', cls: 'bg-gray-100 dark:bg-dark-200 text-gray-600 dark:text-dark-400' },
    pending: { label: 'Wartet auf Freigabe', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    approved: { label: 'Freigegeben', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
    rejected: { label: 'Abgelehnt', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
    revision_requested: { label: 'Korrektur erbeten', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
    superseded: { label: 'Ersetzt', cls: 'bg-gray-100 dark:bg-dark-200 text-gray-500 dark:text-dark-400' },
  };
  const formatDate = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-dark-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-accent-lighter dark:bg-accent-primary/30 rounded-xl">
              <FileText className="w-6 h-6 text-accent-primary dark:text-accent-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Berichte & Reports
              </h1>
              <p className="text-gray-500 dark:text-dark-400">
                Erstelle professionelle Tätigkeitsnachweise und Abrechnungen
              </p>
            </div>
          </div>

          {/* Tab Switcher - horizontal scrollable on mobile */}
          <div className="overflow-x-auto scrollbar-hide -mx-2 px-2 mb-4">
            <div className="flex rounded-xl bg-gray-100 dark:bg-dark-200 p-1 gap-1 min-w-max">
              <button
                onClick={() => setActiveTab('customer')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === 'customer'
                    ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Briefcase size={18} />
                <span className="hidden sm:inline">Kundenberichte</span>
                <span className="sm:hidden">Kunden</span>
              </button>
              <button
                onClick={() => setActiveTab('internal')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === 'internal'
                    ? 'bg-white dark:bg-dark-100 text-gray-700 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Coffee size={18} />
                Intern
              </button>
              <button
                onClick={() => setActiveTab('absences')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === 'absences'
                    ? 'bg-white dark:bg-dark-100 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Calendar size={18} />
                <span className="hidden sm:inline">Abwesenheit</span>
                <span className="sm:hidden">Abwes.</span>
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('team')}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'team'
                        ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                        : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Users size={18} />
                    Team
                  </button>
                  <button
                    onClick={() => setActiveTab('team-absences')}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'team-absences'
                        ? 'bg-white dark:bg-dark-100 text-orange-600 dark:text-orange-400 shadow-sm'
                        : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Calendar size={18} />
                    <span className="hidden sm:inline">Team-Urlaub</span>
                    <span className="sm:hidden">Urlaub</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('attendance')}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'attendance'
                        ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                        : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Users size={18} />
                    <span className="hidden sm:inline">Arbeitszeit</span>
                    <span className="sm:hidden">AZ</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('requests')}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'requests'
                        ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                        : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Calendar size={18} />
                    <span className="hidden sm:inline">Anträge</span>
                    <span className="sm:hidden">Antr.</span>
                    {pendingCount > 0 && (
                      <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-primary text-white text-[11px] font-bold inline-flex items-center justify-center">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('changes')}
                    className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'changes'
                        ? 'bg-white dark:bg-dark-100 text-accent-primary shadow-sm'
                        : 'text-gray-600 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <History size={18} />
                    <span className="hidden sm:inline">Nachträge</span>
                    <span className="sm:hidden">Nachtr.</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {activeTab === 'customer' && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => openAssistant()}
                variant="primary"
                icon={<FileText size={18} />}
              >
                Report erstellen
              </Button>
              <Button
                onClick={() => openAssistant({ openSaved: true })}
                variant="secondary"
                icon={<History size={18} />}
              >
                Gespeicherte Reports{savedReports.length > 0 ? ` (${savedReports.length})` : ''}
              </Button>
            </div>
          )}
        </div>

        {/* Customer Reports Tab Content */}
        {activeTab === 'customer' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <Calendar size={16} />
                  <span className="text-sm truncate">Dieser Monat</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalHoursThisMonth.toFixed(1)} h
                </p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <TrendingUp size={16} />
                  <span className="text-sm truncate">Abrechenbar</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {billableHoursThisMonth.toFixed(1)} h
                </p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <Users size={16} />
                  <span className="text-sm truncate">Kunden mit Zeiten</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {activeCustomersThisMonth}
                </p>
              </div>
            </div>

            {/* Schnellstart: Kunden des Monats direkt in den Assistenten */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 pt-4 pb-2">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Schnellstart
                </h2>
                <p className="text-xs text-gray-500 dark:text-dark-400">
                  Kunden mit Zeiten im laufenden Monat — ein Klick öffnet den Assistenten mit vorausgewähltem Kunden
                </p>
              </div>
              {topCustomersThisMonth.length === 0 ? (
                <p className="px-4 sm:px-6 py-6 text-sm text-gray-500 dark:text-dark-400">
                  Noch keine Projektzeiten in diesem Monat. Sobald Zeiten erfasst sind, erscheinen hier
                  deine Kunden für den direkten Report-Einstieg.
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-dark-border mt-2">
                  {topCustomersThisMonth.map(({ customer, hours }) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => openAssistant({ customerId: customer.id })}
                      className="w-full flex items-center gap-3 px-4 sm:px-6 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
                    >
                      <CustomerAvatar
                        name={customer.name}
                        color={customer.color}
                        logoUrl={customer.logoUrl}
                        size="md"
                      />
                      <span className="flex-1 min-w-0 font-medium text-gray-900 dark:text-white truncate">
                        {customer.name}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-dark-400 tabular-nums">
                        {hours.toFixed(1)} h
                      </span>
                      <ChevronRight size={16} className="text-gray-300 dark:text-dark-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Zuletzt gespeicherte Reports */}
            <div className="bg-white dark:bg-dark-100 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  Letzte Reports
                </h2>
                {savedReports.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openAssistant({ openSaved: true })}
                    className="text-sm text-accent-primary hover:underline"
                  >
                    Alle verwalten
                  </button>
                )}
              </div>
              {savedReports.length === 0 ? (
                <p className="px-4 sm:px-6 py-6 text-sm text-gray-500 dark:text-dark-400">
                  {savedReportsQuery.isLoading
                    ? 'Lade gespeicherte Reports…'
                    : 'Noch keine gespeicherten Reports. Erstellte Reports (auch zur Kundenfreigabe versendete) erscheinen hier mit ihrem Status.'}
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-dark-border mt-2">
                  {savedReports.slice(0, 6).map(report => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => openAssistant({ openSaved: true })}
                      className="w-full flex items-center gap-3 px-4 sm:px-6 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-dark-200/50 transition-colors"
                    >
                      <FolderOpen size={16} className="text-gray-400 dark:text-dark-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-gray-900 dark:text-white truncate">
                          {report.customer_name}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-dark-400 truncate">
                          {formatDate(report.start_date)} – {formatDate(report.end_date)} · {Number(report.total_hours).toFixed(1)} h
                        </span>
                      </span>
                      <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${SAVED_STATUS_META[report.status]?.cls ?? SAVED_STATUS_META.saved.cls}`}>
                        {SAVED_STATUS_META[report.status]?.label ?? report.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Internal Time Report Tab Content */}
        {activeTab === 'internal' && (
          <InternalTimeReport entries={entries} />
        )}

        {activeTab === 'internal' && isAdmin && (
          <InternalExpenses />
        )}

        {/* Absence Calendar Tab Content */}
        {activeTab === 'absences' && (
          <AbsenceCalendar entries={entries} />
        )}

        {/* Team Time Report Tab Content (Admin only) */}
        {activeTab === 'team' && isAdmin && (
          <AdminTeamTimeView />
        )}

        {/* Team Absence Overview Tab Content (Admin only) */}
        {activeTab === 'attendance' && isAdmin && (
          <TeamAttendanceView />
        )}

        {activeTab === 'requests' && isAdmin && (
          <AbsenceRequestApprovals />
        )}

        {activeTab === 'team-absences' && isAdmin && (
          <TeamAbsenceOverview />
        )}

        {activeTab === 'changes' && isAdmin && (
          <TimeEntryChangeLog />
        )}
      </div>

      {/* Report Assistant Modal */}
      <ReportAssistant
        isOpen={reportAssistantOpen}
        onClose={() => {
          setReportAssistantOpen(false);
          setAssistantCustomerId(null);
          setAssistantOpenSaved(false);
        }}
        entries={entries}
        projects={projects}
        customers={customers}
        activities={activities}
        initialCustomerId={assistantCustomerId}
        openSavedOnStart={assistantOpenSaved}
      />
    </div>
  );
};
