import { useState } from 'react';
import { FileText, PieChart, TrendingUp, Calendar, Users } from 'lucide-react';
import { Button } from './ui';
import { ReportAssistant } from './ReportAssistant';
import { TimeEntry, Project, Customer, Activity } from '../types';

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

  // Calculate some quick stats
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const thisMonthEntries = entries.filter(e => {
    const date = new Date(e.startTime || e.date);
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
    <div className="h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-accent-lighter dark:bg-blue-900/30 rounded-xl">
              <FileText className="w-6 h-6 text-accent-primary dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Berichte & Reports
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Erstelle professionelle Tatigkeitsnachweise und Abrechnungen
              </p>
            </div>
          </div>

          <Button
            onClick={() => setReportAssistantOpen(true)}
            variant="primary"
            size="lg"
            icon={<FileText size={20} />}
            className="w-full sm:w-auto"
          >
            Report-Assistent starten
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <Calendar size={16} />
              <span className="text-sm">Dieser Monat</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {totalHoursThisMonth.toFixed(1)} h
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <TrendingUp size={16} />
              <span className="text-sm">Eintrage</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {thisMonthEntries.length}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <Users size={16} />
              <span className="text-sm">Aktive Projekte</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {activeCustomersThisMonth}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
              <PieChart size={16} />
              <span className="text-sm">Kunden</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {customers.length}
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Report-Funktionen
          </h2>
          <ul className="space-y-3 text-gray-600 dark:text-gray-300">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              PDF-Tatigkeitsnachweise pro Kunde erstellen
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              CSV-Export fur Excel und andere Tabellenkalkulationen
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">&#10003;</span>
              Flexible Zeitraume: Monat, Quartal, Jahr oder benutzerdefiniert
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
              Detaillierte Aufschlusselung nach Projekten und Aktivitaten
            </li>
          </ul>
        </div>
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
