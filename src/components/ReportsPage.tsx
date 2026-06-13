import { useState } from 'react';
import { FileText, PieChart, TrendingUp, Calendar, Users, Coffee, Briefcase } from 'lucide-react';
import { Button } from './ui';
import { ReportAssistant } from './ReportAssistant';
import { InternalTimeReport } from './InternalTimeReport';
import { AdminTeamTimeView } from './AdminTeamTimeView';
import { AbsenceCalendar } from './AbsenceCalendar';
import { TeamAbsenceOverview } from './TeamAbsenceOverview';
import { TimeEntry, Project, Customer, Activity } from '../types';
import { useAuth } from '../contexts/AuthContext';

type ReportTab = 'customer' | 'internal' | 'absences' | 'team' | 'team-absences';

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
  const [activeTab, setActiveTab] = useState<ReportTab>('customer');
  const { currentUser } = useAuth();

  // Check if user is admin
  const isAdmin = currentUser?.role === 'admin';

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

  const activeCustomersThisMonth = new Set(
    thisMonthEntries.map(e => e.projectId).filter(Boolean)
  ).size;

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
          <div className="overflow-x-auto -mx-2 px-2 mb-4">
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
                </>
              )}
            </div>
          </div>

          {activeTab === 'customer' && (
            <Button
              onClick={() => setReportAssistantOpen(true)}
              variant="primary"
              size="lg"
              icon={<FileText size={20} />}
              className="w-full sm:w-auto"
            >
              Report-Assistent starten
            </Button>
          )}
        </div>

        {/* Customer Reports Tab Content */}
        {activeTab === 'customer' && (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <Calendar size={16} />
                  <span className="text-sm">Dieser Monat</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalHoursThisMonth.toFixed(1)} h
                </p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <TrendingUp size={16} />
                  <span className="text-sm">Einträge</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {thisMonthEntries.length}
                </p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <Users size={16} />
                  <span className="text-sm">Aktive Projekte</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {activeCustomersThisMonth}
                </p>
              </div>

              <div className="bg-white dark:bg-dark-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-dark-400 mb-1">
                  <PieChart size={16} />
                  <span className="text-sm">Kunden</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {customers.length}
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="bg-white dark:bg-dark-100 rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Report-Funktionen
              </h2>
              <ul className="space-y-3 text-gray-600 dark:text-dark-500">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  PDF-Tätigkeitsnachweise pro Kunde erstellen
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  CSV-Export für Excel und andere Tabellenkalkulationen
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  Flexible Zeiträume: Monat, Quartal, Jahr oder benutzerdefiniert
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  Reports per E-Mail zur Genehmigung versenden
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  Gespeicherte Reports verwalten
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">&#10003;</span>
                  Detaillierte Aufschlüsselung nach Projekten und Aktivitäten
                </li>
              </ul>
            </div>
          </>
        )}

        {/* Internal Time Report Tab Content */}
        {activeTab === 'internal' && (
          <InternalTimeReport entries={entries} />
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
        {activeTab === 'team-absences' && isAdmin && (
          <TeamAbsenceOverview />
        )}
      </div>

      {/* Report Assistant Modal */}
      <ReportAssistant
        isOpen={reportAssistantOpen}
        onClose={() => setReportAssistantOpen(false)}
        entries={entries}
        projects={projects}
        customers={customers}
        activities={activities}
      />
    </div>
  );
};
